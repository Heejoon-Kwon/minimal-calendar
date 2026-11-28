import { dateKey, eventTimesInOrder, fromKey } from '../calendar'
import { backlogShortcutKeys, calendarFontSizes, collectionNames, customStyles, todoFontSizes, type Change, type Records } from './model'
import { recordsToChanges } from './repository'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const date = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && dateKey(fromKey(value)) === value
const time = (value: unknown): value is string => typeof value === 'string'
  && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
const instant = (value: unknown): boolean => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))

export function encodeBackup(records: Records) {
  return JSON.stringify({ version: 1, records }, null, 2)
}

export function decodeBackup(raw: string): Records {
  const backup: unknown = JSON.parse(raw)
  if (!isObject(backup) || backup.version !== 1 || !isObject(backup.records)) throw new Error('지원하지 않는 백업 형식입니다.')
  const { records } = backup
  for (const name of collectionNames) {
    const rows = records[name]
    if (!Array.isArray(rows) || rows.some(row => !isObject(row) || !nonempty(row.id)
      || !instant(row.created_at) || !instant(row.updated_at))
      || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('백업 레코드가 올바르지 않습니다.')
  }
  const { categories, settings, items } = records as Records
  const ids = new Set(categories.map(category => category.id))
  if (!categories.length || categories.some(category => !nonempty(category.name) || !/^#[0-9a-f]{6}$/i.test(category.color))
    || settings.length !== 1 || settings[0].id !== 'preferences' || !['system', 'light', 'dark'].includes(settings[0].theme)
    || ![0, 1].includes(settings[0].week_start) || !ids.has(settings[0].default_category_id)
    || (settings[0].calendar_style !== undefined && !customStyles.includes(settings[0].calendar_style))
    || (settings[0].calendar_font_size !== undefined && !calendarFontSizes.includes(settings[0].calendar_font_size))
    || (settings[0].todo_font_size !== undefined && !todoFontSizes.includes(settings[0].todo_font_size))
    || (settings[0].backlog_shortcut_key !== undefined && !backlogShortcutKeys.includes(settings[0].backlog_shortcut_key))
    || (settings[0].category_order !== undefined && (!Array.isArray(settings[0].category_order)
      || !settings[0].category_order.every(nonempty)
      || new Set(settings[0].category_order).size !== settings[0].category_order.length))
    || items.some(item => !nonempty(item.title) || !ids.has(item.category_id) || typeof item.completed !== 'boolean'
      || !Number.isSafeInteger(item.sort_order) || !(item.date === null || date(item.date))
      || (item.end_date !== undefined && (!date(item.end_date) || !item.date || item.end_date < item.date))
      || (item.planner_todo !== undefined && (item.planner_todo !== true || item.end_date !== undefined
        || item.start_time !== null || item.end_time !== null))
      || (item.weekly_day !== undefined && (item.planner_todo !== true || item.date !== null
        || !Number.isInteger(item.weekly_day) || item.weekly_day < 0 || item.weekly_day > 6))
      || (item.start_time !== null && !time(item.start_time))
      || (item.end_time !== null && !time(item.end_time))
      || !eventTimesInOrder(item.date, item.end_date, item.start_time, item.end_time))) {
    throw new Error('백업의 날짜, 카테고리 또는 설정이 올바르지 않습니다.')
  }
  // Project known collections through a JSON whitelist before they can reach the transport.
  return {
    categories: categories.map(({ id, created_at, updated_at, name, color }) => ({ id, created_at, updated_at, name, color })),
    settings: settings.map(({ id, created_at, updated_at, theme, week_start, default_category_id,
      calendar_style, calendar_font_size, todo_font_size, backlog_shortcut_key, category_order }) => ({
      id, created_at, updated_at, theme, week_start, default_category_id,
      calendar_style, calendar_font_size, todo_font_size, backlog_shortcut_key, category_order: category_order?.filter(id => ids.has(id)),
    })),
    items: items.map(({ id, created_at, updated_at, title, date, end_date, planner_todo, weekly_day, start_time, end_time, category_id, completed, sort_order }) =>
      ({ id, created_at, updated_at, title, date, end_date, planner_todo, weekly_day, start_time, end_time, category_id, completed, sort_order })),
  }
}

export function replaceChanges(current: Records, incoming: Records): Change[] {
  return [
    ...collectionNames.flatMap(collection => current[collection]
      .filter(value => !incoming[collection].some(row => row.id === value.id))
      .map(({ id }) => ({ collection, id, value: null }) as Change)),
    ...recordsToChanges(incoming),
  ]
}
