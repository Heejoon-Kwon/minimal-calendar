import { expect, type Page } from '@playwright/test'
import { encodeBackup } from '../src/data/backup'
import { entity, initialRecords, type Item, type Records } from '../src/data/model'

export async function openApp(page: Page, clock = '2026-08-18T12:00:00') {
  await page.clock.setFixedTime(new Date(clock))
  await page.goto('./')
  await expect(page.getByRole('region', { name: '월간 달력' })).toBeVisible()
}

export function item(title: string, date: string | null, index = 0): Item {
  return { ...entity(), created_at: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(), title, date, category_id: `category-${index % 9 + 1}`, start_time: null,
    end_time: null, completed: false, sort_order: index }
}

export const cell = (page: Page, date: string) => page.locator(`[data-date="${date}"]`)

export async function restore(page: Page, records: Records) {
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '설정' })
  await settings.locator('input[type=file]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(encodeBackup(records)),
  })
  await settings.getByRole('button', { name: '데이터 복원' }).click()
  await expect(settings.getByText('백업을 복원했습니다.')).toBeVisible()
  await settings.getByRole('button', { name: '닫기' }).click()
}

export function emptyRecords() { return initialRecords() }

export async function center(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected an element with a visible box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function startMouseDrag(page: Page, source: ReturnType<Page['locator']>) {
  await source.hover()
  const { x, y } = await center(source)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 8, y)
  await expect(page.locator('[data-drag-preview]')).toBeVisible()
}
