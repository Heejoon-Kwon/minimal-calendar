import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { decodeCalendarMutation, encodeCalendarMutation } from '../src/data/calendar-wire'
import { initialRecords } from '../src/data/model'
import { recordsToChanges, type Mutation } from '../src/data/repository'

const db = new PGlite()
const alice = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const bob = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${alice}'), ('${bob}');
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create publication supabase_realtime;
  `)
  await db.exec(readFileSync('supabase/migrations/20261122000000_calendar.sql', 'utf8'))
}, 30_000)
afterAll(() => db.close())

it('마이그레이션, 인증, 사용자별 RLS, RPC 멱등성과 기한 제약을 실제 PostgreSQL에서 검증한다', async () => {
  await db.exec('set role anon')
  await expect(db.exec('select * from public.items')).rejects.toThrow(/permission denied/)
  await expect(db.exec('select public.calendar_snapshot()')).rejects.toThrow(/permission denied/)
  await expect(db.exec("select public.apply_calendar_changes('[]')")).rejects.toThrow(/permission denied/)

  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}'`)
  const stamp = '2026-08-01T00:00:00.001Z'
  const changes = recordsToChanges(initialRecords()).map(value => ({ ...value, stamp, operation: crypto.randomUUID() }))
  const send = (rows: unknown) => db.query('select public.apply_calendar_changes($1::jsonb)', [JSON.stringify(rows)])
  await send(changes)
  await send(changes)
  expect((await db.query('select id from public.categories')).rows).toHaveLength(9)
  expect((await db.query("select public.calendar_snapshot() -> 0 ->> 'stamp' as stamp")).rows).toEqual([{ stamp }])
  const deleted = { collection: 'categories', id: 'category-2', value: null, stamp: '2026-08-02T00:00:00.001Z', operation: crypto.randomUUID() }
  await send([deleted])
  await send(changes)
  expect((await db.query("select value from public.categories where id = 'category-2'")).rows).toEqual([{ value: null }])
  await expect(send([{ collection: 'items', id: 'invalid', stamp, operation: crypto.randomUUID(),
    value: { id: 'invalid', created_at: stamp, updated_at: stamp, title: '시간 확인', date: null, category_id: 'category-1',
      start_time: '14:00', end_time: '12:00', completed: false, sort_order: 0 } }]))
    .rejects.toThrow(/check constraint/)
  const overnight: Mutation = { collection: 'items', id: 'overnight', stamp, operation: crypto.randomUUID(),
    value: { id: 'overnight', created_at: stamp, updated_at: stamp, title: '야간 일정', category_id: 'category-1',
      date: '2026-09-01', end_date: '2026-09-02', start_time: '23:00', end_time: '09:00', completed: false, sort_order: 0 } }
  await send([encodeCalendarMutation(overnight)])
  const { rows: [{ result }] } = await db.query<{ result: Mutation[] }>('select public.calendar_snapshot() result')
  expect(result.filter(row => row.id === overnight.id).map(decodeCalendarMutation)).toEqual([overnight])
  await db.exec(`set request.jwt.claim.sub = '${bob}'`)
  expect((await db.query('select * from public.categories')).rows).toEqual([])
  expect((await db.query('select public.calendar_snapshot() result')).rows).toEqual([{ result: [] }])
  await expect(db.query("insert into public.categories (user_id, id, stamp, operation) values ($1, 'x', now(), $2)", [alice, crypto.randomUUID()]))
    .rejects.toThrow(/row-level security/)
  expect((await db.query('update public.categories set value = null returning id')).rows).toEqual([])
  await db.exec('set request.jwt.claim.sub = \'\'')
  await expect(send([])).rejects.toThrow(/Authentication required/)
})
