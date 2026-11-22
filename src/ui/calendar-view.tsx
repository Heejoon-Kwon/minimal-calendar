import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { dateKey, eventSlots, monthWeeks, readableDate, sortEvents } from '../calendar'
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
  openItem: (item: Item) => void
  quickCategory: (anchor: CategoryAnchor) => void
  landing?: { itemId: string; date: DateKey; color: string }
  moving: boolean
  picking: boolean
}

function EventEntry({ item, category, lines, landed, open, quick }: {
  item: Item; category: Category; lines: number; landed: boolean; open: () => void; quick: (anchor: CategoryAnchor) => void
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

  return <button className={styles.event} style={{ ...tint(category.color), '--title-lines': lines } as CSSProperties}
    data-event={item.id} data-landed={landed} data-completed={item.completed}
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

function DayCell({ day, entries, slots, wraps, props }: {
  day: Date; entries: Item[]; slots: number; wraps: (title: string) => boolean; props: CalendarProps
}) {
  const key = dateKey(day)
  const holiday = koreanHoliday(day)
  const landing = props.landing?.date === key ? props.landing : undefined
  const { setNodeRef, isOver } = useDroppable({ id: key })
  const visibleEvents = entries.slice(0, slots)
  const hidden = entries.length - visibleEvents.length
  let spareLines = slots - visibleEvents.length
  const inactive = props.moving || props.picking
  const open = () => props.openDate(key)

  return <div ref={setNodeRef} className={styles.day} data-date={key} style={landing ? tint(landing.color) : undefined}
    data-adjacent={day.getMonth() !== props.month.getMonth()} data-landed={Boolean(landing)}
    data-holiday={Boolean(holiday || day.getDay() === 0)} data-over={props.moving && isOver}
    onClick={event => { if (!props.moving && event.target === event.currentTarget) open() }}>
    <div className={styles.dayHeader}>
      <button className={styles.dayButton} aria-label={[readableDate(key), holiday].filter(Boolean).join(', ')}
        title={holiday} aria-current={key === props.today ? 'date' : undefined}
        disabled={props.moving} onClick={open}>{day.getDate()}</button>
      {hidden > 0 && <button className={styles.headerOverflow} disabled={inactive}
        aria-label={`+${hidden}개`} onClick={open}>+{hidden}</button>}
    </div>
    <div className={styles.events} aria-hidden={inactive} inert={inactive}>
      {visibleEvents.map(item => {
        const lines = spareLines > 0 && wraps(item.title) ? 2 : 1
        spareLines -= lines - 1
        return <EventEntry key={item.id} item={item} lines={lines} landed={item.id === landing?.itemId}
          category={props.category(item.category_id)} open={() => props.openItem(item)} quick={props.quickCategory} />
      })}
    </div>
  </div>
}

export function CalendarView(props: CalendarProps) {
  const [metrics, setMetrics] = useState({ height: 0, width: 0, event: 19, header: 25, compact: false })
  const textMeasure = useRef<CanvasRenderingContext2D | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const weeks = monthWeeks(props.month, props.weekStart)
  const byDay = new Map<DateKey, Item[]>()
  for (const item of props.items) {
    if (!item.date) continue
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

  const measureTitle = textMeasure.current
  const wraps = (title: string) => metrics.compact && !!measureTitle
    && measureTitle.measureText(title).width > metrics.width / 7 - 5
  const slots = eventSlots(metrics.height / weeks.length, metrics.header, metrics.event)

  return <section className={styles.calendar} style={fontSize ? { '--event-font': `${fontSize}px` } as CSSProperties : undefined}
    aria-label="월간 달력" data-picking={props.picking} data-moving={props.moving}>
    <div className={styles.weekdays}>
      {Array.from({ length: 7 }, (_, index) => (index + props.weekStart) % 7).map(day =>
        <div key={day} data-sunday={day === 0}>{labels[day]}<span>요일</span></div>)}
    </div>
    <div ref={gridRef} className={styles.grid} data-weeks={weeks.length} style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
      {weeks.map(week => <div className={styles.week} key={dateKey(week[0])}>
        {week.map(day => <DayCell key={dateKey(day)} day={day} entries={sortEvents(byDay.get(dateKey(day)) ?? [])}
          slots={slots} wraps={wraps} props={props} />)}
      </div>)}
    </div>
  </section>
}
