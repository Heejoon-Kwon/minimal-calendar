import { describe, expect, it } from 'vitest'
import { dateKey, deadlineSegments, eventSlots, fromKey, monthWeeks, moveMonth, sortEvents, weekCapacity } from '../src/calendar'
import { entity, type Deadline, type Item } from '../src/data/model'

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

describe('주간 기한선', () => {
  const deadline = (id: string, start_date: string, end_date: string): Deadline =>
    ({ ...entity(id), title: id, start_date, end_date, category_id: 'category-1' })
  const dates = monthWeeks(fromKey('2026-08-01'), 1).map(week => week.map(dateKey))

  it('인접 월과 주 경계에서 이어지고 같은 주 안에서는 막대 하나를 사용한다', () => {
    const range = deadline('a', '2026-07-25', '2026-08-04')
    expect(deadlineSegments(dates[0], [range])).toMatchObject([{ first: 0, last: 6, starts: false, ends: false }])
    expect(deadlineSegments(dates[1], [range])).toMatchObject([{ first: 0, last: 1, starts: false, ends: true }])
    expect(deadlineSegments(dates[2], [range])).toEqual([])
  })

  it('겹치는 기간을 별개로 두고 서로 겹치지 않는 막대는 행을 재사용한다', () => {
    const ranges = [deadline('a', '2026-08-03', '2026-08-05'),
      deadline('b', '2026-08-05', '2026-08-06'), deadline('c', '2026-08-06', '2026-08-07')]
    expect(deadlineSegments(dates[1], ranges).map(value => value.lane)).toEqual([0, 1, 0])
  })

  it('제한된 높이에서 행 수를 줄여 일반 일정 공간을 보존한다', () => {
    expect(weekCapacity(84, 17).maxLanes).toBe(2)
    expect(eventSlots(84, 25, 2, 17)).toBe(2)
    expect(eventSlots(120, 25, 2, 17)).toBe(4)
    expect(eventSlots(60, 19, 0, 15)).toBe(2)
  })
})
