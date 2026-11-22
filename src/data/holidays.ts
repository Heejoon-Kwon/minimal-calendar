import { dateKey, monthDate, offsetDate } from '../calendar'
import type { DateKey } from './model'

type Holiday = { name: string; dates: Date[]; substitute?: 'weekend' | 'sunday' }

const lunar = new Intl.DateTimeFormat('en-u-ca-dangi', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' })
const years = new Map<number, Map<DateKey, string>>()

// One-off holidays are added when publicly announced.
const designated: Record<DateKey, string> = {
  '2023-10-02': '임시공휴일',
  '2024-04-10': '국회의원 선거',
  '2024-10-01': '임시공휴일',
  '2025-01-27': '임시공휴일',
  '2025-06-03': '대통령 선거',
  '2026-06-03': '전국동시지방선거',
}

function holidaysForYear(year: number) {
  const holidays: Holiday[] = []
  const found = new Map<DateKey, Set<string>>()
  function add(name: string, dates: Date[], substitute?: Holiday['substitute']) {
    holidays.push({ name, dates, substitute })
    for (const date of dates) {
      const key = dateKey(date)
      const names = found.get(key) ?? new Set()
      names.add(name)
      found.set(key, names)
    }
  }
  function fixed(month: number, day: number, name: string, substituteFrom = Infinity) {
    add(name, [monthDate(year, month - 1, day)], year >= substituteFrom ? 'weekend' : undefined)
  }

  // 관공서의 공휴일에 관한 규정 제2조·제3조 and the published KASI calendars.
  fixed(1, 1, '신정')
  fixed(3, 1, '3·1절', 2022)
  if (year >= 2026) fixed(5, 1, '노동절', 2026)
  fixed(5, 5, '어린이날', 2014)
  fixed(6, 6, '현충일')
  if (year <= 2007 || year >= 2026) fixed(7, 17, '제헌절', 2026)
  fixed(8, 15, '광복절', 2021)
  fixed(10, 3, '개천절', 2021)
  if (year >= 2013) fixed(10, 9, '한글날', 2021)
  fixed(12, 25, '성탄절', 2023)
  for (const [key, name] of Object.entries(designated)) {
    const [entryYear, month, day] = key.split('-').map(Number)
    if (entryYear === year) fixed(month, day, name)
  }

  if (lunar.resolvedOptions().calendar === 'dangi') {
    for (let date = monthDate(year, 0); date.getFullYear() === year; date = offsetDate(date, 1)) {
      const parts = lunar.formatToParts(new Date(`${dateKey(date)}T03:00:00Z`))
      const day = parts.find(part => part.type === 'day')?.value
      const month = parts.find(part => part.type === 'month')?.value
      if (month === '4' && day === '8') add('부처님오신날', [date], year >= 2023 ? 'weekend' : undefined)
      if ((month === '1' && day === '1') || (month === '8' && day === '15')) {
        add(month === '1' ? '설날' : '추석', [offsetDate(date, -1), date, offsetDate(date, 1)], year >= 2014 ? 'sunday' : undefined)
      }
    }
  }

  const substitutes = new Map<DateKey, Set<string>>()
  for (const { name, dates, substitute } of holidays) {
    if (!substitute || !dates.some(date => date.getDay() === 0 || (substitute === 'weekend' && date.getDay() === 6)
      || (date.getDay() !== 6 && (found.get(dateKey(date))?.size ?? 0) > 1))) continue
    let next = offsetDate(dates[dates.length - 1], 1)
    while (next.getDay() === 0 || next.getDay() === 6 || found.has(dateKey(next))) next = offsetDate(next, 1)
    const key = dateKey(next)
    const names = substitutes.get(key) ?? new Set()
    names.add(name)
    substitutes.set(key, names)
  }

  const labels = new Map([...found].map(([date, names]) => [date, [...names].join(' · ')]))
  for (const [date, names] of substitutes) labels.set(date, `대체공휴일(${[...names].join(' · ')})`)
  return labels
}

export function koreanHoliday(date: Date): string | undefined {
  const year = date.getFullYear()
  let holidays = years.get(year)
  if (!holidays) {
    holidays = holidaysForYear(year)
    years.set(year, holidays)
  }
  return holidays.get(dateKey(date))
}
