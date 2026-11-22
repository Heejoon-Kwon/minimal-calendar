import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { decodeBackup, encodeBackup, replaceChanges } from '../src/data/backup'
import { entity, initialRecords, put, type Item } from '../src/data/model'
import { IndexedRepository, recordsToChanges, type Mutation, type Remote } from '../src/data/repository'

const fresh = () => crypto.randomUUID()
const item = (): Item => ({
  ...entity(), title: '할 일', date: null, start_time: null, end_time: null,
  category_id: 'category-1', completed: false, sort_order: 5,
})

class RemoteFixture implements Remote {
  rows = new Map<string, Mutation>()
  available = true
  dropNextResponse = false

  async read() {
    if (!this.available) throw new Error('offline')
    return [...this.rows.values()]
  }

  async apply(changes: Mutation[]) {
    if (!this.available) throw new Error('offline')
    for (const change of changes) {
      const key = `${change.collection}/${change.id}`
      const old = this.rows.get(key)
      if (!old || old.stamp < change.stamp || (old.stamp === change.stamp && old.operation < change.operation)) {
        this.rows.set(key, change)
      }
    }
    if (this.dropNextResponse) { this.dropNextResponse = false; throw new Error('connection lost after commit') }
  }
  watch() { return () => undefined }
}

describe('IndexedDB Repository', () => {
  it('로컬 CRUD, 저장 재시작과 캐시 격리', async () => {
    const name = fresh()
    const first = new IndexedRepository('local', initialRecords, undefined, name)
    const value = item()
    await first.apply([put('items', value)])
    await first.apply([put('items', { ...value, completed: true })])
    const reboot = new IndexedRepository('local', initialRecords, undefined, name)
    expect((await reboot.read()).records.items).toMatchObject([{ completed: true, id: value.id }])
    expect((await new IndexedRepository('other', initialRecords, undefined, name).read()).records.items).toEqual([])
    await first.apply([{ collection: 'items', id: value.id, value: null }])
    expect((await reboot.read()).records.items).toEqual([])
  })

  it('오프라인 대기열, 재연결, 요청 재시도 시 중복 방지 및 기기 간 업데이트', async () => {
    const remote = new RemoteFixture()
    const first = new IndexedRepository('user', initialRecords, remote, fresh())
    const second = new IndexedRepository('user', initialRecords, remote, fresh())
    await first.sync()
    const value = item()
    remote.available = false
    expect((await first.apply([put('items', value)])).pending).toBe(1)
    await expect(first.sync()).rejects.toThrow('offline')
    expect((await first.read()).records.items).toMatchObject([{ id: value.id }])
    remote.available = true
    remote.dropNextResponse = true
    await expect(first.sync()).rejects.toThrow('after commit')
    expect((await first.read()).pending).toBe(1)
    expect((await first.sync()).pending).toBe(0)
    expect((await second.sync()).records.items).toMatchObject([{ id: value.id }])
    await second.apply([put('items', { ...value, title: '수정됨' })])
    await second.sync()
    expect((await first.sync()).records.items).toMatchObject([{ title: '수정됨' }])
    await first.apply([{ collection: 'items', id: value.id, value: null }])
    await first.sync()
    expect((await second.sync()).records.items).toEqual([])
  })

  it('오래된 변경으로 삭제한 항목이 되살아나지 않는다', async () => {
    const remote = new RemoteFixture()
    const first = new IndexedRepository('user', initialRecords, remote, fresh())
    const second = new IndexedRepository('user', initialRecords, remote, fresh())
    const value = item()
    await first.sync()
    await first.apply([put('items', value)])
    await first.sync()
    await second.sync()
    await second.apply([put('items', { ...value, title: '이전 변경' })])
    await new Promise(resolve => setTimeout(resolve, 10))
    await first.apply([{ collection: 'items', id: value.id, value: null }])
    await first.sync()
    expect((await second.sync()).records.items).toEqual([])
  })

  it('JSON 백업으로 데이터를 교체하고 잘못된 참조와 날짜를 거부한다', async () => {
    const repository = new IndexedRepository('local', initialRecords, undefined, fresh())
    const records = initialRecords()
    records.items.push(item())
    await repository.apply(recordsToChanges(records))
    const incoming = initialRecords()
    incoming.items.push({ ...item(), title: '복원된 일정', date: '2024-02-29' })
    const decoded = decodeBackup(encodeBackup(incoming))
    const restored = await repository.apply(replaceChanges(records, decoded))
    expect(restored.records.items).toMatchObject([{ title: '복원된 일정' }])
    expect(() => decodeBackup(encodeBackup({ ...incoming, items: [{ ...incoming.items[0], date: '2026-02-29' }] }))).toThrow()
    expect(() => decodeBackup(encodeBackup({ ...incoming, items: [{ ...incoming.items[0], category_id: 'unknown' }] }))).toThrow()
  })
})

it('이전 백업의 기한을 제외하고 새 화면 설정과 카테고리 순서를 복원한다', async () => {
  const records = initialRecords()
  const category_order = ['category-3', 'category-2']
  records.settings[0] = { ...records.settings[0], calendar_style: 'ivory', calendar_font_size: 8, todo_font_size: 8, category_order }
  const backup = JSON.stringify({ version: 1, records: { ...records, deadlines: [{ id: 'old' }] } })
  const decoded = decodeBackup(backup)
  expect(decoded).not.toHaveProperty('deadlines')
  const repository = new IndexedRepository('local', initialRecords, undefined, fresh())
  const restored = await repository.apply(replaceChanges(initialRecords(), decoded))
  expect(restored.records.settings[0]).toMatchObject({ calendar_style: 'ivory', calendar_font_size: 8, todo_font_size: 8 })
  expect(restored.records.categories.slice(0, 2).map(({ id }) => id)).toEqual(category_order)
})
