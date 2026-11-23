import { expect, test } from '@playwright/test'
import type { Mutation } from '../src/data/repository'

test.use({ baseURL: 'http://localhost:4175/auth-test/' })

test('이메일 로그인, 인증 유지, 캐시의 오프라인 편집과 재전송, 로그아웃', async ({ page, context }) => {
  const user = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'owner@example.test', aud: 'authenticated' }
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, exp: expiresAt, role: 'authenticated' })}.dGVzdA`
  const session = { user, access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt }
  const remote = new Map<string, Mutation>()
  await context.route('http://localhost:55334/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info, x-supabase-api-version',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/auth/v1/token') return route.fulfill({ json: session, headers })
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers })
    if (request.headers().authorization !== `Bearer ${token}`) return route.fulfill({ status: 401, json: {}, headers })
    if (path === '/rest/v1/rpc/calendar_snapshot') return route.fulfill({ json: [...remote.values()], headers })
    if (path === '/rest/v1/rpc/apply_calendar_changes') {
      const { changes } = request.postDataJSON() as { changes: Mutation[] }
      for (const change of changes) remote.set(`${change.collection}/${change.id}`, change)
      return route.fulfill({ body: 'null', contentType: 'application/json', headers })
    }
    return route.fulfill({ status: 404, headers })
  })
  await context.routeWebSocket('ws://localhost:55334/**', ws => ws.close())
  await page.goto('./')
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await expect(page.getByRole('region', { name: '월간 달력' })).toHaveCount(0)
  await page.getByLabel('이메일').fill(user.email)
  await page.getByLabel('비밀번호').fill('fixture-password')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page.getByRole('button', { name: '동기화 연결됨' })).toBeVisible()
  await expect(page.getByText('월간 목표 정리')).toHaveCount(0)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect(page.getByRole('button', { name: '동기화 연결됨' })).toBeVisible()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: '오프라인' })).toBeVisible()
  await page.getByRole('button', { name: '미정 일정 목록' }).click()
  await page.getByRole('button', { name: '미정 일정 추가' }).click()
  await page.getByLabel('제목').fill('비행 중 추가한 일')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('button', { name: '비행 중 추가한 일', exact: true })).toBeVisible()
  expect([...remote.values()].filter(row => row.collection === 'items')).toHaveLength(0)
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: '동기화 연결됨' })).toBeVisible()
  expect([...remote.values()].filter(row => row.collection === 'items')).toMatchObject([{ value: { title: '비행 중 추가한 일', date: null } }])

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await expect(page.getByRole('region', { name: '월간 달력' })).toHaveCount(0)
})
