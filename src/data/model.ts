export type DateKey = string
export type Theme = 'light' | 'dark' | 'system'
export type WeekStart = 0 | 1

export interface Entity {
  id: string
  created_at: string
  updated_at: string
}

export interface Item extends Entity {
  title: string
  date: DateKey | null
  start_time: string | null
  end_time: string | null
  category_id: string
  completed: boolean
  sort_order: number
}

export interface Deadline extends Entity {
  title: string
  start_date: DateKey
  end_date: DateKey
  category_id: string
}

export interface Category extends Entity {
  name: string
  color: string
}

export interface Settings extends Entity {
  theme: Theme
  week_start: WeekStart
  default_category_id: string
}

export interface Collections {
  items: Item
  deadlines: Deadline
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

export const collectionNames = ['categories', 'settings', 'items', 'deadlines'] as const

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
  return { categories, items: [], deadlines: [], settings: [
    { id: 'preferences', created_at: seedDate, updated_at: seedDate, theme: 'system', week_start: 1, default_category_id: categories[0].id },
  ] }
}

export function entity(id: string = crypto.randomUUID()): Entity {
  const now = new Date().toISOString()
  return { id, created_at: now, updated_at: now }
}
