import { compareTimes } from '../calendar'
import type { Item } from './model'
import type { Mutation } from './repository'

type WireItem = Item & { end_time_on_end_date?: string }

export function encodeCalendarMutation(mutation: Mutation): Mutation {
  if (mutation.collection !== 'items' || !mutation.value) return mutation
  const item = mutation.value
  if (!item.date || !item.end_date || item.end_date <= item.date || !item.start_time || !item.end_time
    || compareTimes(item.end_time, item.start_time) >= 0) return mutation

  // Deployed databases compare end_time and start_time as same-day clock times.
  const value: WireItem = { ...item, end_time: null, end_time_on_end_date: item.end_time }
  return { ...mutation, value }
}

export function decodeCalendarMutation(mutation: Mutation): Mutation {
  if (mutation.collection !== 'items' || !mutation.value) return mutation
  const { end_time_on_end_date: endTime, ...item } = mutation.value as WireItem
  if (endTime === undefined) return mutation
  if (!item.end_time && item.start_time && item.date && item.end_date && item.end_date > item.date
    && typeof endTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(endTime)) {
    item.end_time = endTime
  }
  return { ...mutation, value: item }
}
