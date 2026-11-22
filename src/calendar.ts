import type { DateKey, Item, WeekStart } from './data/model'

export function dateKey(date: Date): DateKey {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-')
}

export function monthDate(year: number, month: number, day = 1): Date {
  const date = new Date(0)
  date.setHours(12, 0, 0, 0)
  date.setFullYear(year, month, day)
  return date
}

export function fromKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number)
  return monthDate(year, month - 1, day)
}

export function offsetDate(date: Date, offset: number): Date {
  return monthDate(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

export function moveMonth(date: Date, offset: number): Date {
  return monthDate(date.getFullYear(), date.getMonth() + offset)
}

export function monthWeeks(month: Date, weekStart: WeekStart): Date[][] {
  const first = moveMonth(month, 0)
  const leading = (first.getDay() - weekStart + 7) % 7
  const last = offsetDate(moveMonth(month, 1), -1)
  const count = Math.ceil((leading + last.getDate()) / 7)
  return Array.from({ length: count }, (_, week) => Array.from({ length: 7 },
    (_, day) => offsetDate(first, week * 7 + day - leading)))
}

export function compareTimes(a: string, b: string) {
  const normalize = (time: string) => time.length === 5 ? `${time}:00` : time
  return normalize(a).localeCompare(normalize(b))
}

export function sortEvents(items: Item[]): Item[] {
  return [...items].sort((a, b) => compareTimes(a.start_time ?? '', b.start_time ?? '')
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function sortTodos(items: Item[]): Item[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
}

export function eventSlots(height: number, header: number, eventHeight: number): number {
  return Math.max(1, Math.floor((height - header - 1) / eventHeight))
}

export function readableDate(key: DateKey): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(fromKey(key))
}
