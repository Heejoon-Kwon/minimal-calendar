import { expect, test } from '@playwright/test'
import { demoRecords } from '../src/data/demo'
import { cell, center, emptyRecords, item, openApp, restore } from './browser-fixtures'

test('전체 화면 월간 달력, 스타일과 할 일 배치', async ({ page }, info) => {
  test.skip(info.project.name === 'chromium-touch')
  await openApp(page)
  const viewport = page.viewportSize()!
  const calendar = page.getByRole('region', { name: '월간 달력' })
  const today = cell(page, '2026-08-18')
  const capture = async (name: string) => {
    const frame = await calendar.boundingBox()
    expect(frame!.y + frame!.height).toBeLessThan(viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height)
    const last = await cell(page, '2026-09-06').boundingBox()
    expect(last!.y + last!.height).toBeLessThan(viewport.height)
    await page.screenshot({ path: info.outputPath(`visual/${name}.png`), animations: 'disabled' })
  }

  const holiday = cell(page, '2026-08-17')
  await expect(holiday.getByRole('button', { name: /대체공휴일\(광복절\)/ })).toHaveCSS('color', 'rgb(177, 36, 53)')
  await expect(holiday).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(today).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await capture('04-six-weeks')
  const sparse = emptyRecords()
  sparse.items.push(item('산책', '2026-08-07'), item('프로그래밍 스터디', '2026-08-22', 5))
  await restore(page, sparse)
  if (viewport.width < 760) {
    const longTitle = cell(page, '2026-08-22').getByRole('button', { name: '프로그래밍 스터디' })
    await expect(longTitle).toHaveCSS('font-size', '11px')
    expect((await longTitle.boundingBox())!.height).toBeGreaterThan(20)
  }
  await capture('01-sparse')

  const moderate = demoRecords(new Date('2026-08-18T12:00:00'))
  const titles = ['주간 계획', '스터디', '팀 회의', '프로젝트', '자료 검토', '운동', '서류 제출', '책 읽기', '리뷰', '개인 일정', '디자인', '점심 약속', '영어 공부', '회의 준비']
  moderate.items = moderate.items.filter(value => value.date !== '2026-08-18')
  moderate.items.push(...titles.slice(0, 4).map((title, index) => item(title, '2026-08-18', index)))
  moderate.items.push(...['서류 정리', '운동', '팀 회의', '회고'].map((title, index) => item(title, '2026-08-30', index)))
  await restore(page, moderate)
  await expect(cell(page, '2026-08-30').getByRole('button')).toHaveCount(5)
  await capture('02-four-events')
  await expect(today.getByRole('button', { name: '주간 계획', exact: true })).toBeVisible()

  moderate.items.push(...titles.slice(4).map((title, index) => item(title, '2026-08-18', index + 4)))
  await restore(page, moderate)
  await expect(today.getByRole('button', { name: /^\+\d+개$/ })).toBeVisible()
  if (viewport.width < 760) {
    const more = today.getByRole('button', { name: /^\+\d+개$/ })
    const top = (await today.boundingBox())!.y
    expect((await more.boundingBox())!.y - top).toBeLessThan(18)
    expect(await today.locator('[data-event]').count()).toBeGreaterThanOrEqual(5)
  }
  await capture('03-overflow')
  await today.getByRole('button', { name: /^\+\d+개$/ }).click()
  const dayPanel = page.getByRole('dialog')
  await expect(dayPanel.getByRole('button', { name: /회의 준비/ })).toHaveCount(1)
  await capture('09-day-panel')
  await dayPanel.getByRole('button', { name: '닫기' }).click()

  for (const [name, style] of [['다크', 'dark'], ['아이보리', 'ivory'], ['자주', 'plum'], ['차콜', 'charcoal'], ['라이트', 'light']]) {
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', style)
    if (style === 'ivory') {
      const dialog = page.getByRole('dialog', { name: '설정' })
      expect(await dialog.evaluate(element => element.scrollWidth)).toBe(await dialog.evaluate(element => element.clientWidth))
      await capture('settings-ivory')
    }
    await page.getByRole('button', { name: '닫기' }).click()
    await capture(`style-${style}`)
  }

  await page.getByRole('button', { name: '할 일 목록' }).click()
  const todo = page.getByRole('complementary', { name: '할 일' })
  await expect(todo).toBeVisible()
  await capture('07-todo')
  const handle = await center(todo.getByRole('button', { name: /읽을 책 목록 정리 달력으로 이동/ }))
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  await page.mouse.move(handle.x - 15, handle.y - 15, { steps: 3 })
  const target = await center(today)
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await expect(page.getByRole('button', { name: '이동 취소' })).toBeVisible()
  await expect(today).toHaveAttribute('data-over', 'true')
  await expect(today).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const preview = await page.locator('[data-drag-preview]').boundingBox()
  expect(preview!.x).toBeGreaterThanOrEqual(0)
  expect(preview!.x + preview!.width).toBeLessThanOrEqual(viewport.width)
  await expect(todo).toHaveCount(0)
  await capture('08-todo-drag')
  const cancel = await center(page.getByRole('button', { name: '이동 취소' }))
  await page.mouse.move(cancel.x, cancel.y)
  await page.mouse.up()
  await expect(todo.getByRole('button', { name: '읽을 책 목록 정리', exact: true })).toBeVisible()
  if (viewport.width < 760) {
    await page.setViewportSize({ width: viewport.height, height: viewport.width })
    const last = await cell(page, '2026-09-06').boundingBox()
    expect(last!.y + last!.height).toBeLessThan(viewport.width)
  }
})
