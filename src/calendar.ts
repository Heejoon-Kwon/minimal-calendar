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

export function eventTimesInOrder(date: DateKey | null, endDate: DateKey | undefined, startTime?: string | null, endTime?: string | null) {
  if (!endTime) return true
  return Boolean(startTime && ((date && endDate && endDate > date) || compareTimes(endTime, startTime) >= 0))
}

export function sortEvents(items: Item[]): Item[] {
  return [...items].sort((a, b) => compareTimes(a.start_time ?? '', b.start_time ?? '')
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function sortTodos<T extends Item>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
}

export function eventSlots(height: number, header: number, eventHeight: number): number {
  return Math.max(1, Math.floor((height - header - 1) / eventHeight))
}

export function readableDate(key: DateKey): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(fromKey(key))
}

export function twoWeekDates(today: DateKey, weekStart: WeekStart): DateKey[][] {
  const date = fromKey(today)
  const first = offsetDate(date, -((date.getDay() - weekStart + 7) % 7))
  return [0, 1].map(week => Array.from({ length: 7 }, (_, day) => dateKey(offsetDate(first, week * 7 + day))))
}

export function occursOn(item: Item, date: DateKey): boolean {
  return !!item.date && item.date <= date && (item.end_date ?? item.date) >= date
}

export function moveEvent(item: Item, date: DateKey): Item {
  const days = item.date && item.end_date
    ? Math.round((fromKey(item.end_date).getTime() - fromKey(item.date).getTime()) / 86_400_000)
    : 0
  return { ...item, date, end_date: days ? dateKey(offsetDate(fromKey(date), days)) : undefined }
}

export function parseClock(value: string): string | undefined {
  const digits = value.trim()
  let clock = digits
  if (/^\d{3,4}$/.test(digits)) {
    const padded = digits.padStart(4, '0')
    clock = `${padded.slice(0, 2)}:${padded.slice(2)}`
  } else if (/^\d:\d{2}$/.test(digits)) {
    clock = `0${digits}`
  }
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(clock) ? clock : undefined
}

export interface EventBar { item: Item; start: number; end: number; lane: number }

export function eventBars(week: Date[], items: Item[]): EventBar[] {
  const keys = week.map(dateKey)
  const occupied: number[] = []
  return items.filter(item => item.date && item.end_date && item.end_date > item.date
    && item.date <= keys[6] && item.end_date >= keys[0])
    .sort((a, b) => a.date!.localeCompare(b.date!) || b.end_date!.localeCompare(a.end_date!) || a.id.localeCompare(b.id))
    .map(item => {
      const start = item.date! < keys[0] ? 0 : keys.indexOf(item.date!)
      const end = item.end_date! > keys[6] ? 6 : keys.indexOf(item.end_date!)
      let lane = occupied.findIndex(last => last < start)
      if (lane < 0) lane = occupied.length
      occupied[lane] = end
      return { item, start, end, lane }
    })
}
