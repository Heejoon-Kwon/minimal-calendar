import { expect, test } from '@playwright/test'
import { cell, center, emptyRecords, item, openApp, restore } from './browser-fixtures'

test('하단 스와이프로 할 일 열기, 길게 눌러 날짜에 배치하기', async ({ page, context, browserName, hasTouch }) => {
  test.skip(browserName !== 'chromium' || !hasTouch)
  await openApp(page)
  const records = emptyRecords()
  records.items.push(item('터치 작업', null))
  await restore(page, records)
  const cdp = await context.newCDPSession(page)
  const trigger = page.getByRole('button', { name: '할 일 목록' })
  const grip = await center(trigger)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [grip] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grip.x, y: grip.y - 78 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  const todo = page.getByRole('button', { name: '터치 작업', exact: true })
  const source = await center(todo)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [source] })
  await expect(page.getByRole('button', { name: '이동 취소' })).toBeVisible()
  const selected = cell(page, '2026-08-18')
  const target = await center(selected)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [target] })
  await expect(selected).toHaveAttribute('data-over', 'true')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const event = selected.getByRole('button', { name: '터치 작업' })
  const eventPoint = await center(event)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [eventPoint] })
  await expect(page.getByRole('dialog', { name: '카테고리 변경' })).toBeVisible()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.getByRole('button', { name: '공부', exact: true }).tap()
  await expect(event).toHaveCSS('border-left-color', 'rgb(66, 110, 210)')
})

test('달력 좌우 스와이프로 연도 경계를 넘나들고 일정 탭과 구분한다', async ({ page, context }) => {
  await openApp(page, '2026-12-18T12:00:00')
  const records = emptyRecords()
  records.items.push(item('스와이프 확인', '2026-12-18'))
  await restore(page, records)
  const cdp = await context.newCDPSession(page)
  async function swipe(point: { x: number; y: number }, dx: number, dy = 0) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    for (const step of [1 / 3, 2 / 3, 1]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: point.x + dx * step, y: point.y + dy * step }],
      })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  const event = page.getByRole('button', { name: '스와이프 확인', exact: true })
  await swipe(await center(event), -130)
  await expect(page.getByRole('heading', { name: '2027년 1월' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await swipe(await center(cell(page, '2027-01-06')), 130)
  await expect(page.getByRole('heading', { name: '2026년 12월' })).toBeVisible()
  await swipe(await center(cell(page, '2026-12-16')), 16, 75)
  await expect(page.getByRole('heading', { name: '2026년 12월' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await event.tap()
  await expect(page.getByRole('dialog', { name: '항목 편집' })).toBeVisible()
})
