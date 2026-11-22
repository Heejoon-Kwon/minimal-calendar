import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { dateKey, deadlineLaneHeight, deadlineSegments, deadlineSpace, eventSlots, monthWeeks, readableDate, sortEvents, weekCapacity } from '../calendar'
import type { Category, DateKey, Deadline, Item, WeekStart } from '../data/model'
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
  deadlines: Deadline[]
  category: CategoryLookup
  openDate: (date: DateKey) => void
  openItem: (item: Item) => void
  quickCategory: (anchor: CategoryAnchor) => void
  openDeadlines: (deadlines: Deadline[]) => void
  moving: boolean
  picking: boolean
  rangePicking: boolean
  range: { start: DateKey; end: DateKey } | null
  hoverDate: (date: DateKey) => void
  selectDate: (date: DateKey) => void
}

function EventEntry({ item, category, open, quick }: {
  item: Item; category: Category; open: () => void; quick: (anchor: CategoryAnchor) => void
}) {
  const timer = useRef<number>(undefined)
  const initial = useRef({ x: 0, y: 0 })
  const held = useRef(false)
  const clear = () => { window.clearTimeout(timer.current) }
  useLayoutEffect(() => () => window.clearTimeout(timer.current), [])

  function context(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (held.current) return
    clear()
    const rect = event.currentTarget.getBoundingClientRect()
    quick({ item, x: event.clientX || rect.left, y: event.clientY || rect.bottom })
  }

  function start(event: PointerEvent<HTMLButtonElement>) {
    held.current = false
    if (event.pointerType !== 'touch') return
    initial.current = { x: event.clientX, y: event.clientY }
    timer.current = window.setTimeout(() => {
      held.current = true
      quick({ item, ...initial.current })
    }, 480)
  }

  return <button className={styles.event} style={tint(category.color)} data-completed={item.completed}
    onPointerDown={start} onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear}
    onPointerMove={event => {
      if (Math.hypot(event.clientX - initial.current.x, event.clientY - initial.current.y) > 9) clear()
    }}
    onContextMenu={context}
    onKeyDown={event => {
      if (event.key === 'F10' && event.shiftKey) {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        quick({ item, x: rect.left, y: rect.bottom })
      }
    }}
    onClick={() => { if (!held.current) open(); held.current = false }}
    title={`${item.start_time ? `${item.start_time.slice(0, 5)} ` : ''}${item.title}`}>
    <span className={styles.eventTitle}>{item.title}</span>
    {item.start_time && <time className={styles.eventTime}>{item.start_time.slice(0, 5)}</time>}
  </button>
}

function DayCell({ day, entries, slots, overflow, props }: {
  day: Date; entries: Item[]; slots: number; overflow?: Deadline[]; props: CalendarProps
}) {
  const key = dateKey(day)
  const today = key === props.today
  const selected = props.range && key >= props.range.start && key <= props.range.end
  const { setNodeRef, isOver } = useDroppable({ id: key })
  const hidden = entries.length > slots ? entries.length - slots + 1 : 0
  const inactive = props.moving || props.picking
  const open = () => props.picking ? props.selectDate(key) : props.openDate(key)

  return <div ref={setNodeRef} className={styles.day} data-date={key}
    data-adjacent={day.getMonth() !== props.month.getMonth()} data-weekend={[0, 6].includes(day.getDay())}
    data-today={today} data-over={props.moving && isOver} data-selected={Boolean(selected)}
    onPointerEnter={() => { if (props.picking) props.hoverDate(key) }}
    onClick={event => { if (event.target === event.currentTarget) open() }}>
    <div className={styles.dayHeader}>
      <button className={styles.dayButton} aria-label={readableDate(key)} aria-current={today ? 'date' : undefined}
        disabled={props.moving} onClick={open}>{day.getDate()}</button>
      {overflow && !inactive && <button className={styles.deadlineOverflow} aria-label={`숨은 기한 ${overflow.length}개`}
        onClick={() => props.openDeadlines(overflow)}>+{overflow.length}</button>}
    </div>
    <div className={styles.events} aria-hidden={inactive} inert={inactive}>
      {entries.slice(0, hidden ? slots - 1 : slots).map(item => <EventEntry key={item.id} item={item}
        category={props.category(item.category_id)} open={() => props.openItem(item)} quick={props.quickCategory} />)}
      {hidden > 0 && <button className={styles.eventOverflow} onClick={() => props.openDate(key)}>+{hidden}개</button>}
    </div>
  </div>
}

export function CalendarView(props: CalendarProps) {
  const [metrics, setMetrics] = useState({ height: 0, event: 19, header: 27 })
  const gridRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ date: DateKey; x: number; y: number; pointer: number } | null>(null)
  const weeks = monthWeeks(props.month, props.weekStart)
  const byDay = new Map<DateKey, Item[]>()
  for (const item of props.items) {
    if (!item.date) continue
    const entries = byDay.get(item.date) ?? []
    entries.push(item)
    byDay.set(item.date, entries)
  }
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => {
      const css = getComputedStyle(grid)
      setMetrics({
        height: grid.clientHeight,
        event: parseFloat(css.getPropertyValue('--event-height')),
        header: parseFloat(css.getPropertyValue('--date-height')),
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    measure()
    return () => observer.disconnect()
  }, [])
  const dayAt = useCallback((x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]')?.dataset.date, [])

  const height = metrics.height / weeks.length
  const capacity = weekCapacity(height, metrics.event)
  return <section className={styles.calendar} style={{ '--line-step': `${deadlineLaneHeight}px` } as CSSProperties} aria-label="월간 달력" data-picking={props.picking} data-moving={props.moving}>
    <div className={styles.weekdays}>
      {Array.from({ length: 7 }, (_, index) => (index + props.weekStart) % 7).map(day =>
        <div key={day} data-weekend={day === 0 || day === 6}>{labels[day]}<span>요일</span></div>)}
    </div>
    <div ref={gridRef} className={styles.grid} data-weeks={weeks.length} style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      onPointerDown={event => {
        if (!props.rangePicking || event.button !== 0) return
        const date = dayAt(event.clientX, event.clientY)
        if (!date) return
        gesture.current = { date, x: event.clientX, y: event.clientY, pointer: event.pointerId }
      }}
      onPointerMove={event => {
        if (!props.rangePicking) return
        const drag = gesture.current
        if (drag && drag.pointer === event.pointerId && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 9) {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.setPointerCapture(event.pointerId)
            if (!props.range) props.selectDate(drag.date)
          }
        }
        const date = dayAt(event.clientX, event.clientY)
        if (date) props.hoverDate(date)
      }}
      onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          const date = dayAt(event.clientX, event.clientY)
          if (date) props.selectDate(date)
        }
        gesture.current = null
      }}
      onPointerCancel={() => { gesture.current = null }}>
      {weeks.map(week => {
        const dates = week.map(dateKey)
        const segments = deadlineSegments(dates, props.deadlines)
        const visible = segments.filter(segment => segment.lane < capacity.maxLanes)
        const overflow = segments.filter(segment => segment.lane >= capacity.maxLanes).map(segment => segment.deadline)
        const lanes = visible.reduce((count, segment) => Math.max(count, segment.lane + 1), 0)
        const slots = eventSlots(height, metrics.header, lanes, capacity.eventHeight)
        return <div className={styles.week} key={dates[0]} style={{ '--line-space': `${deadlineSpace(lanes)}px` } as CSSProperties}>
          {week.map((day, index) => <DayCell key={dates[index]} day={day} entries={sortEvents(byDay.get(dates[index]) ?? [])}
            slots={slots} overflow={index === 6 && overflow.length ? overflow : undefined} props={props} />)}
          <div className={styles.ranges} inert={props.picking || props.moving}>
            {visible.map(({ deadline, first, last, lane, starts, ends }) =>
              <button key={deadline.id} className={styles.range} data-starts={starts} data-ends={ends}
                style={{ ...tint(props.category(deadline.category_id).color), gridColumn: `${first + 1} / ${last + 2}`, gridRow: lane + 1 }}
                aria-label={`기한: ${deadline.title}`} title={deadline.title} onClick={() => props.openDeadlines([deadline])} />)}
          </div>
        </div>
      })}
    </div>
  </section>
}
