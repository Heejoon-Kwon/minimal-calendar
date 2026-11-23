import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ArrowDown, ArrowUp, GripVertical, ListTodo, MoreHorizontal, Plus, X } from 'lucide-react'
import type { Item } from '../data/model'
import { tint, type CategoryAnchor, type CategoryLookup } from './calendar-view'
import styles from './ui.module.css'

function TodoRow({ item, category, edit, reorder, quickCategory, move, first, last }: {
  item: Item; category: CategoryLookup; edit: () => void; reorder: (offset: number) => void
  quickCategory: (anchor: CategoryAnchor) => void; move: () => void; first: boolean; last: boolean
}) {
  const { setNodeRef, setActivatorNodeRef, listeners } = useDraggable({ id: item.id })
  const showCategory = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    quickCategory({ item, x: rect.left, y: rect.bottom })
  }
  return <li className={styles.todoRow} ref={setNodeRef} {...listeners}>
    <button className={styles.todoTitle} data-backlog-drag style={tint(category(item.category_id).color)} onClick={edit}
      onContextMenu={event => {
        event.preventDefault()
        if (!(event.nativeEvent instanceof PointerEvent) || event.nativeEvent.pointerType !== 'touch') {
          quickCategory({ item, x: event.clientX, y: event.clientY })
        }
      }}>{item.title}</button>
    <button className={styles.rowIcon} aria-label={`${item.title} 위로`} disabled={first} onClick={() => reorder(-1)}><ArrowUp size={13} /></button>
    <button className={styles.rowIcon} aria-label={`${item.title} 아래로`} disabled={last} onClick={() => reorder(1)}><ArrowDown size={13} /></button>
    <button className={styles.rowIcon} aria-label={`${item.title} 카테고리`} onClick={event => showCategory(event.currentTarget)}><MoreHorizontal size={16} /></button>
    <button ref={setActivatorNodeRef} className={styles.moveHandle} data-backlog-drag aria-label={`${item.title} 달력으로 이동`} onClick={event => { if (event.detail === 0) move() }}><GripVertical size={17} /></button>
  </li>
}

export function isBacklogShortcut(event: KeyboardEvent, key: string) {
  return !event.repeat && !event.isComposing && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    && event.code === `Key${key}`
}

export function TodoTrigger({ buttonRef, count, open, toggle, reveal, pull, shortcutKey, label = '미정 일정' }: {
  buttonRef: RefObject<HTMLButtonElement | null>; count: number; open: boolean; shortcutKey: string; label?: string
  toggle: () => void; reveal: () => void; pull: (progress: number) => void
}) {
  const start = useRef<{ id: number; x: number; y: number }>(null)
  const swiped = useRef(false)
  const shortcut = `Alt+${shortcutKey}`

  function reset() {
    start.current = null
    pull(0)
  }

  return <div className={styles.dockPullZone} data-dock-pull
    onPointerDown={event => {
      swiped.current = false
      if (!event.isPrimary || event.pointerType === 'mouse' || open) return
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    }}
    onPointerMove={event => {
      const point = start.current
      if (!point || point.id !== event.pointerId) return
      const distance = point.y - event.clientY
      if (distance <= 0 || Math.abs(event.clientX - point.x) > distance * .8) return
      if (distance > 8) {
        swiped.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        pull(Math.min(1, (distance - 8) / 150))
      }
    }}
    onPointerUp={event => {
      const point = start.current
      if (!point || point.id !== event.pointerId) return
      const distance = point.y - event.clientY
      const opened = distance >= 42 && Math.abs(event.clientX - point.x) <= distance * .8
      if (opened) {
        swiped.current = true
        reveal()
      }
      reset()
    }}
    onPointerCancel={reset} onLostPointerCapture={event => {
      if (event.target === event.currentTarget) reset()
    }}>
    <button ref={buttonRef} className={styles.todoFab} aria-label={`${label} 목록`} aria-controls="todo-panel"
      aria-expanded={open} aria-keyshortcuts={shortcut} title={`${label} 목록 (${shortcut})`}
      onClick={event => {
        if (swiped.current && event.detail > 0) return
        toggle()
      }}>
      <span className={styles.todoGrip} aria-hidden="true" />
      <ListTodo size={15} /><span>{label}</span>{count > 0 && <small>{count}</small>}
      <kbd aria-hidden="true">{shortcut}</kbd>
    </button>
  </div>
}

export function TodoDrawer({ open, side, pull, label, count, close, children }: {
  open: boolean; side: 'top' | 'bottom'; pull: number; label: string; count: number
  close: () => void; children: ReactNode
}) {
  return <aside id="todo-panel" className={styles.todoPanel} aria-label={label}
    aria-hidden={!open} inert={!open} data-open={open} data-side={side} data-pulling={pull > 0}
    style={pull > 0 ? { '--pull-offset': `${(1 - pull) * (side === 'top' ? -100 : 100)}%` } as CSSProperties : undefined}>
    <div className={styles.panelHeading}><h2><ListTodo size={17} /> {label} <span>{count}</span></h2>
      <button className={styles.icon} aria-label={`${label} 닫기`} onClick={close}><X size={17} /></button></div>
    {children}
  </aside>
}

export function TodoPanel({ items, category, close, add, edit, reorder, quickCategory, move, open, side, pull }: {
  items: Item[]; category: CategoryLookup; close: () => void; add: () => void; edit: (item: Item) => void
  reorder: (index: number, offset: number) => void
  quickCategory: (anchor: CategoryAnchor) => void; move: (item: Item) => void; open: boolean; side: 'top' | 'bottom'; pull: number
}) {
  return <TodoDrawer label="미정 일정" count={items.length} open={open} side={side} pull={pull} close={close}>
    <div className={styles.todoBody}>
      {items.length ? <ul className={styles.todoList}>{items.map((item, index) => <TodoRow key={item.id}
        item={item} category={category} edit={() => edit(item)}
        reorder={offset => reorder(index, offset)} quickCategory={quickCategory} move={() => move(item)}
        first={index === 0} last={index === items.length - 1} />)}</ul> : <p className={styles.empty}>날짜가 지정되지 않은 할 일이 여기에 표시됩니다.</p>}
    </div>
    <button className={styles.todoAdd} onClick={add}><Plus size={16} /> 미정 일정 추가</button>
  </TodoDrawer>
}

export function DropCancel({ cancel }: { cancel: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'cancel' })
  return <button ref={setNodeRef} className={styles.dropCancel} data-over={isOver} onClick={cancel}>
    <X size={15} /> 이동 취소
  </button>
}

export function DropUnscheduled({ label }: { label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unschedule' })
  return <div ref={setNodeRef} data-unschedule data-over={isOver} className={styles.dropUnscheduled}>
    <ListTodo size={15} /> {label} 목록에 놓기
  </div>
}
