export type DateKey = string
export type Theme = 'light' | 'dark' | 'system'
export const customStyles = ['ivory', 'plum', 'charcoal'] as const
export type CalendarStyle = typeof customStyles[number]
export type Appearance = Theme | CalendarStyle
export const calendarFontSizes = [8, 9, 10, 11, 12, 13, 14] as const
export const todoFontSizes = [8, 9, 10, 11, 12, 14, 16, 18] as const
export const backlogShortcutKeys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
export const defaultBacklogShortcutKey = 'E'
export type WeekStart = 0 | 1

export interface Entity {
  id: string
  created_at: string
  updated_at: string
}

export interface Item extends Entity {
  title: string
  date: DateKey | null
  end_date?: DateKey
  planner_todo?: true
  weekly_day?: number
  start_time: string | null
  end_time: string | null
  category_id: string
  completed: boolean
  sort_order: number
}

export type PlannerTodo = Item & { planner_todo: true }

export function isPlannerTodo(item: Item): item is PlannerTodo {
  return item.planner_todo === true
}

export interface Category extends Entity {
  name: string
  color: string
}

export interface Settings extends Entity {
  theme: Theme
  week_start: WeekStart
  default_category_id: string
  calendar_style?: CalendarStyle
  calendar_font_size?: typeof calendarFontSizes[number]
  todo_font_size?: typeof todoFontSizes[number]
  backlog_shortcut_key?: string
  category_order?: string[]
}

export interface Collections {
  items: Item
  categories: Category
  settings: Settings
}

export type Collection = keyof Collections
export type Change = {
  [K in Collection]: { collection: K; id: string; value: Collections[K] | null }
}[Collection]
export type Records = { [K in Collection]: Collections[K][] }

export function put<K extends Collection>(collection: K, value: Collections[K]): Change {
  return { collection, id: value.id, value } as Change
}

export const collectionNames = ['categories', 'settings', 'items'] as const

export const categoryPalette = [
  ['기본', '#697588'], ['공부', '#426ed2'], ['프로젝트', '#7951bc'],
  ['업무', '#347e79'], ['회의', '#a05b26'], ['개인', '#a64778'],
  ['운동', '#42814d'], ['약속', '#b84952'], ['기타', '#586986'],
] as const

export function initialRecords(): Records {
  // Shared defaults use the same creation date even if two devices initialize at once.
  const seedDate = '2000-01-01T00:00:00.000Z'
  const categories = categoryPalette.map(([name, color], index) => ({
    id: `category-${index + 1}`, created_at: seedDate, updated_at: seedDate, name, color,
  }))
  return { categories, items: [], settings: [
    { id: 'preferences', created_at: seedDate, updated_at: seedDate, theme: 'system', week_start: 1, default_category_id: categories[0].id },
  ] }
}

export function entity(id: string = crypto.randomUUID()): Entity {
  const now = new Date().toISOString()
  return { id, created_at: now, updated_at: now }
}
