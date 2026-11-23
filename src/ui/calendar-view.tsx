import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { dateKey, eventBars, eventSlots, monthWeeks, readableDate, sortEvents } from '../calendar'
import { koreanHoliday } from '../data/holidays'
import type { Category, DateKey, Item, WeekStart } from '../data/model'
import styles from './ui.module.css'

export type CategoryLookup = (id: string) => Category
export const tint = (color: string): CSSProperties => ({ '--category': color } as CSSProperties)
const labels = ['일', '월', '화', '수', '목', '금', '토']

export interface CategoryAnchor { item: Item; x: number; y: number }

interface CalendarProps {
  month: Date
  today: DateKey
  weekStart: WeekStart
  items: Item[]
  fontSize?: number
  category: CategoryLookup
  openDate: (date: DateKey) => void
  showDate: (date: DateKey) => void
  openItem: (item: Item) => void
  openRange: (start: DateKey, end: DateKey) => void
  quickCategory: (anchor: CategoryAnchor) => void
  landing?: { itemId: string; date: DateKey; color: string }
  moving: boolean
  picking: boolean
  swipeMonth?: (offset: -1 | 1) => void
}

export function calendarDateAt(x: number, y: number): DateKey | undefined {
  return document.elementsFromPoint(x, y).map(node => node.closest<HTMLElement>('[data-date]'))
    .find(node => node?.dataset.date)?.dataset.date
}

function EventEntry({ item, category, lines, landed, open, quick, bar, interactive }: {
  item: Item; category: Category; lines: number; landed: boolean; open: () => void; quick: (anchor: CategoryAnchor) => void
  bar?: { start: number; end: number; lane: number; week: string }
  interactive: boolean
}) {
  const { listeners, setNodeRef } = useDraggable({
    id: bar ? `bar:${bar.week}:${item.id}` : `event:${item.id}`, data: { itemId: item.id },
  })

  const touch = useRef<{ id: number; x: number; y: number; time: number }>(null)
  const touchOpened = useRef(false)

  function context(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch') return
    const rect = event.currentTarget.getBoundingClientRect()
    quick({ item, x: event.clientX || rect.left, y: event.clientY || rect.bottom })
  }

  return <button ref={setNodeRef} {...listeners} className={`${styles.event} ${bar ? styles.eventBar : ''}`} style={{
    ...tint(category.color), '--title-lines': lines,
    ...(bar ? { gridColumn: `${bar.start + 1} / ${bar.end + 2}`, gridRow: bar.lane + 1 } : {}),
  } as CSSProperties}
    data-event={item.id} data-range-event={Boolean(bar)} data-landed={landed}
    onContextMenu={context}
    onKeyDown={event => {
      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        quick({ item, x: rect.left, y: rect.bottom })
      }
    }}
    onPointerDown={event => {
      touchOpened.current = false
      touch.current = event.isPrimary && event.pointerType === 'touch'
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp } : null
    }}
    onPointerMove={event => {
      const point = touch.current
      if (point?.id === event.pointerId && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 9) touch.current = null
    }}
    onPointerCancel={() => { touch.current = null }}
    onPointerUp={event => {
      const point = touch.current
      touch.current = null
      if (!interactive || point?.id !== event.pointerId || event.timeStamp - point.time >= 420
        || Math.hypot(event.clientX - point.x, event.clientY - point.y) > 9) return
      touchOpened.current = true
      open()
    }}
    onClick={event => {
      if (interactive && (!touchOpened.current || event.detail === 0)) open()
    }}
    title={`${item.start_time ? `${item.start_time.slice(0, 5)} ` : ''}${item.title}`}>
    <span className={styles.eventTitle}>{item.title}</span>
    {item.start_time && <time className={styles.eventTime}>{item.start_time.slice(0, 5)}</time>}
  </button>
}

function DayCell({ day, entries, slots, wraps, props, extraHidden, selected }: {
  day: Date; entries: Item[]; slots: number; extraHidden: number; selected: boolean; wraps: (title: string) => boolean; props: CalendarProps
}) {
  const key = dateKey(day)
  const holiday = koreanHoliday(day)
  const landing = props.landing?.date === key ? props.landing : undefined
  const { setNodeRef, isOver } = useDroppable({ id: key })
  const visibleEvents = entries.slice(0, slots)
  const hidden = entries.length - visibleEvents.length + extraHidden
  let spareLines = slots - visibleEvents.length
  const inactive = props.moving || props.picking
  const open = () => props.openDate(key)

  return <div ref={setNodeRef} className={styles.day} data-date={key} style={landing ? tint(landing.color) : undefined}
    data-range-preview={selected} data-adjacent={day.getMonth() !== props.month.getMonth()} data-landed={Boolean(landing)}
    data-weekend={day.getDay() === 0 || day.getDay() === 6} data-holiday={Boolean(holiday)} data-over={props.moving && isOver}
    onClick={event => { if (!props.moving && event.target === event.currentTarget) open() }}>
    <div className={styles.dayHeader}>
      <button className={styles.dayButton} data-day-trigger aria-label={[readableDate(key), holiday].filter(Boolean).join(', ')}
        title={holiday} aria-current={key === props.today ? 'date' : undefined}
        disabled={props.moving} onClick={open}>{day.getDate()}</button>
      {hidden > 0 && <button className={styles.headerOverflow} disabled={inactive}
        aria-label={`+${hidden}개`} onClick={() => props.showDate(key)}>+{hidden}</button>}
    </div>
    <div className={styles.events} aria-hidden={inactive} inert={inactive}>
      {visibleEvents.map(item => {
        const lines = spareLines > 0 && wraps(item.title) ? 2 : 1
        spareLines -= lines - 1
        return <EventEntry key={item.id} item={item} lines={lines} landed={item.id === landing?.itemId}
          category={props.category(item.category_id)} interactive={!inactive} open={() => props.openItem(item)} quick={props.quickCategory} />
      })}
    </div>
  </div>
}

export function CalendarView(props: CalendarProps) {
  const [metrics, setMetrics] = useState({ height: 0, width: 0, event: 19, header: 25, compact: false })
  const textMeasure = useRef<CanvasRenderingContext2D | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: number; x: number; y: number; monthAllowed: boolean; mouseRangeStart?: DateKey }>(null)
  const [selection, setSelection] = useState<{ start: DateKey; end: DateKey }>()
  const selecting = useRef<DateKey>(undefined)
  const rangeTimer = useRef<number>(undefined)
  const suppressClick = useRef(false)
  const slideDirection = useRef<-1 | 1 | null>(null)
  const weeks = monthWeeks(props.month, props.weekStart)
  const byDay = new Map<DateKey, Item[]>()
  for (const item of props.items) {
    if (!item.date || (item.end_date && item.end_date > item.date)) continue
    const entries = byDay.get(item.date) ?? []
    entries.push(item)
    byDay.set(item.date, entries)
  }
  const { fontSize } = props
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    textMeasure.current ??= document.createElement('canvas').getContext('2d')
    const measure = () => {
      const css = getComputedStyle(grid)
      const font = parseFloat(css.getPropertyValue('--event-font'))
      if (textMeasure.current) textMeasure.current.font = `650 ${font}px ${css.fontFamily}`
      setMetrics({
        height: grid.clientHeight,
        width: grid.clientWidth,
        compact: css.getPropertyValue('--compact').trim() === '1',
        event: font + parseFloat(css.getPropertyValue('--event-leading')),
        header: parseFloat(css.getPropertyValue('--date-height')),
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    measure()
    return () => observer.disconnect()
  }, [fontSize])

  useLayoutEffect(() => {
    const direction = slideDirection.current
    slideDirection.current = null
    const grid = gridRef.current
    if (!direction || !grid || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = grid.animate([
      { transform: `translateX(${direction * 28}px)`, opacity: .72 },
      { transform: 'translateX(0)', opacity: 1 },
    ], { duration: 180, easing: 'ease-out' })
    return () => animation.cancel()
  }, [props.month])

  useLayoutEffect(() => () => window.clearTimeout(rangeTimer.current), [])

  function clearRange() {
    window.clearTimeout(rangeTimer.current)
    selecting.current = undefined
    setSelection(undefined)
  }

  function trackMovement(event: PointerEvent<HTMLElement>) {
    const start = gesture.current
    if (!start || event.pointerId !== start.id) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      suppressClick.current = true
      window.clearTimeout(rangeTimer.current)
    }
    return start
  }

  const measureTitle = textMeasure.current
  const wraps = (title: string) => metrics.compact && !!measureTitle
    && measureTitle.measureText(title).width > metrics.width / 7 - 5
  const slots = eventSlots(metrics.height / weeks.length, metrics.header, metrics.event)

  return <section className={styles.calendar} style={fontSize ? { '--event-font': `${fontSize}px` } as CSSProperties : undefined}
    aria-label="월간 달력" data-selecting={!!selection} data-picking={props.picking} data-moving={props.moving}
    onPointerDown={event => {
      if (!event.isPrimary) {
        if (gesture.current) suppressClick.current = true
        gesture.current = null
        clearRange()
        return
      }
      suppressClick.current = false
      const target = event.target as Element
      const date = target.closest<HTMLElement>('[data-date]')?.dataset.date
      const rangeStart = props.swipeMonth && date && (!target.closest('button') || target.closest('[data-day-trigger]')) ? date : undefined
      if (event.button !== 0 || (event.pointerType === 'mouse' && !rangeStart)) return
      const id = event.pointerId
      gesture.current = {
        id, x: event.clientX, y: event.clientY, monthAllowed: Boolean(props.swipeMonth && event.pointerType !== 'mouse'),
        mouseRangeStart: event.pointerType === 'mouse' ? rangeStart : undefined,
      }
      if (rangeStart && event.pointerType !== 'mouse') {
        const owner = event.currentTarget
        rangeTimer.current = window.setTimeout(() => {
          selecting.current = rangeStart
          suppressClick.current = true
          setSelection({ start: rangeStart, end: rangeStart })
          owner.setPointerCapture(id)
        }, 450)
      }
    }}
    onPointerMove={event => {
      const gestureStart = trackMovement(event)
      if (gestureStart?.mouseRangeStart && !selecting.current && event.buttons === 1
        && Math.hypot(event.clientX - gestureStart.x, event.clientY - gestureStart.y) > 5) {
        selecting.current = gestureStart.mouseRangeStart
        suppressClick.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      const start = selecting.current
      if (!start || gesture.current?.id !== event.pointerId) return
      const date = calendarDateAt(event.clientX, event.clientY)
      if (date) setSelection({ start: start < date ? start : date, end: start < date ? date : start })
    }}
    onPointerUp={event => {
      const start = trackMovement(event)
      if (!start) return
      gesture.current = null
      const rangeStart = selecting.current ?? start.mouseRangeStart
      const end = rangeStart && calendarDateAt(event.clientX, event.clientY)
      clearRange()
      if (rangeStart && suppressClick.current) {
        if (end === rangeStart) props.openDate(end)
        else if (end) props.openRange(rangeStart < end ? rangeStart : end, rangeStart < end ? end : rangeStart)
        return
      }
      const horizontal = event.clientX - start.x
      const vertical = Math.abs(event.clientY - start.y)
      if (start.monthAllowed && props.swipeMonth && Math.abs(horizontal) >= 52 && Math.abs(horizontal) > vertical * 1.5) {
        const offset = horizontal < 0 ? 1 : -1
        slideDirection.current = offset
        props.swipeMonth(offset)
      }
    }}
    onPointerLeave={event => {
      if (event.pointerType === 'mouse' && !selecting.current && gesture.current?.id === event.pointerId) {
        gesture.current = null
        clearRange()
      }
    }}
    onPointerCancel={event => {
      if (gesture.current?.id !== event.pointerId) return
      gesture.current = null
      suppressClick.current = true
      clearRange()
    }}
    onClickCapture={event => {
      if (!suppressClick.current || !event.detail) return
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
    }}>
    <div className={styles.weekdays}>
      {Array.from({ length: 7 }, (_, index) => (index + props.weekStart) % 7).map(day =>
        <div key={day} data-weekend={day === 0 || day === 6}>{labels[day]}<span>요일</span></div>)}
    </div>
    <div ref={gridRef} className={styles.grid} data-weeks={weeks.length} style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
      {weeks.map(week => {
        const weekKey = dateKey(week[0])
        const bars = eventBars(week, props.items)
        const limit = Math.max(1, Math.floor(slots / 2))
        const visible = bars.filter(bar => bar.lane < limit)
        const occupied = visible.length ? Math.max(...visible.map(bar => bar.lane)) + 1 : 0
        return <div className={styles.week} key={weekKey} style={{ '--range-lanes': occupied } as CSSProperties}>
          {week.map((day, index) => {
            const key = dateKey(day)
            return <DayCell key={key} day={day} entries={sortEvents(byDay.get(key) ?? [])}
              slots={Math.max(0, slots - occupied)} wraps={wraps} props={props}
              selected={!!selection && key >= selection.start && key <= selection.end}
              extraHidden={bars.filter(bar => bar.lane >= limit && bar.start <= index && index <= bar.end).length} />
          })}
          {visible.length > 0 && <div className={styles.eventBars} inert={props.moving || props.picking}>
            {visible.map(bar => <EventEntry key={bar.item.id} item={bar.item} category={props.category(bar.item.category_id)}
              lines={1} interactive={!props.moving && !props.picking} landed={props.landing?.itemId === bar.item.id} bar={{ ...bar, week: weekKey }}
              open={() => props.openItem(bar.item)} quick={props.quickCategory} />)}
          </div>}
        </div>
      })}
    </div>
  </section>
}
