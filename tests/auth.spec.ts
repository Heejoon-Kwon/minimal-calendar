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
  let acceptWrites = true
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
      if (!acceptWrites) return route.fulfill({ status: 503, json: {}, headers })
      const { changes } = request.postDataJSON() as { changes: Mutation[] }
      if (changes.some(change => change.collection === 'items' && change.value?.end_time && change.value.start_time
        && change.value.end_time < change.value.start_time)) return route.fulfill({ status: 400, json: {}, headers })
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
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const saved = page.getByRole('button', { name: '비행 중 추가한 일', exact: true })
  await expect(saved).toBeVisible()
  await expect(page.getByRole('button', { name: '오프라인 · 1건 저장됨' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '오프라인 · 1건 저장됨' })).toBeVisible()
  await page.getByRole('button', { name: '미정 일정 목록' }).click()
  await expect(saved).toBeVisible()
  await saved.click()
  await page.getByLabel('제목').fill('기내에서 수정한 일')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('button', { name: '오프라인 · 2건 저장됨' })).toBeVisible()
  expect([...remote.values()].filter(row => row.collection === 'items')).toHaveLength(0)

  acceptWrites = false
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: '동기화 대기 · 2건' })).toBeVisible({ timeout: 25_000 })
  acceptWrites = true
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect(page.getByRole('button', { name: '동기화 연결됨' })).toBeVisible()
  expect([...remote.values()].filter(row => row.collection === 'items')).toMatchObject([{ value: { title: '기내에서 수정한 일', date: null } }])

  await page.clock.setFixedTime(new Date('2026-08-18T12:00:00'))
  await page.getByRole('button', { name: '오늘', exact: true }).click()
  await page.locator('[data-date="2026-08-18"] [data-day-trigger]').click()
  await page.getByRole('button', { name: '이 날짜 일정' }).click()
  await page.getByRole('button', { name: '기간 일정' }).click()
  await page.getByLabel('제목').fill('서버에 저장할 야간 일정')
  await page.getByLabel('종료 날짜').fill('2026-08-19')
  await page.getByLabel('시간 지정').check()
  await page.getByLabel('시작 시간').fill('2300')
  await page.getByLabel('종료 시간').fill('0900')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect.poll(() => [...remote.values()].find(row => row.collection === 'items' && row.value?.title === '서버에 저장할 야간 일정')).toMatchObject({
    value: { date: '2026-08-18', end_date: '2026-08-19', start_time: '23:00', end_time: null, end_time_on_end_date: '09:00' },
  })
  await page.getByRole('dialog').getByRole('button', { name: '닫기' }).click()

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible()
  await expect(page.getByRole('region', { name: '월간 달력' })).toHaveCount(0)
})
