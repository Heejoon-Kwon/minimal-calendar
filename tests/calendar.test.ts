import { describe, expect, it } from 'vitest'
import { dateKey, eventSlots, fromKey, monthWeeks, moveMonth, sortEvents } from '../src/calendar'
import { entity, type Item } from '../src/data/model'

describe('월 계산', () => {
  it.each([
    ['2021-02-01', 1, 4, '2021-02-01', '2021-02-28'],
    ['2021-02-01', 0, 5, '2021-01-31', '2021-03-06'],
    ['2024-02-01', 1, 5, '2024-01-29', '2024-03-03'],
    ['2026-08-01', 1, 6, '2026-07-27', '2026-09-06'],
    ['2026-11-01', 0, 5, '2026-11-01', '2026-12-05'],
  ] as const)('%s, 주 시작 %d', (key, start, count, first, last) => {
    const weeks = monthWeeks(fromKey(key), start)
    expect(weeks).toHaveLength(count)
    expect(dateKey(weeks[0][0])).toBe(first)
    expect(dateKey(weeks[count - 1][6])).toBe(last)
  })

  it('윤일과 연도를 넘기는 이동을 처리한다', () => {
    expect(monthWeeks(fromKey('2024-02-01'), 1).flat().map(dateKey)).toContain('2024-02-29')
    expect(dateKey(moveMonth(fromKey('2026-12-31'), 1))).toBe('2027-01-01')
    expect(dateKey(moveMonth(fromKey('2026-01-31'), -1))).toBe('2025-12-01')
  })

  it('하루 종일, 시작 시간, 생성 시각, ID 순서로 정렬한다', () => {
    const item = (id: string, start_time: string | null): Item => ({
      ...entity(id), created_at: '2026-08-01T00:00:00.000Z', title: id, date: '2026-08-01', start_time,
      end_time: null, completed: false, sort_order: 0, category_id: 'category-1',
    })
    expect(sortEvents([item('c', '11:00'), item('b', '09:00'), item('a', '09:00:00'), item('d', null)]).map(value => value.id))
      .toEqual(['d', 'a', 'b', 'c'])
  })
})

it('글자 크기에 따라 날짜 칸에 들어가는 줄 수를 계산한다', () => {
  expect(eventSlots(94, 18, 12)).toBe(6)
  expect(eventSlots(94, 18, 13)).toBe(5)
  expect(eventSlots(94, 18, 16)).toBe(4)
})
