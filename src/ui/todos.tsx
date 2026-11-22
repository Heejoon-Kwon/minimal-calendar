import { useRef, type RefObject } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ArrowDown, ArrowUp, Check, GripVertical, ListTodo, MoreHorizontal, Plus, X } from 'lucide-react'
import type { Item } from '../data/model'
import { tint, type CategoryAnchor, type CategoryLookup } from './calendar-view'
import styles from './ui.module.css'

function TodoRow({ item, category, edit, toggle, reorder, quickCategory, move, first, last }: {
  item: Item; category: CategoryLookup; edit: () => void; toggle: () => void; reorder: (offset: number) => void
  quickCategory: (anchor: CategoryAnchor) => void; move: () => void; first: boolean; last: boolean
}) {
  const { setNodeRef, setActivatorNodeRef, listeners } = useDraggable({ id: item.id })
  const showCategory = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    quickCategory({ item, x: rect.left, y: rect.bottom })
  }
  return <li className={styles.todoRow} ref={setNodeRef} {...listeners}>
    <button className={styles.todoCheck} data-checked={item.completed} aria-pressed={item.completed} onClick={toggle}
      aria-label={`${item.title} 완료`}>{item.completed && <Check size={13} />}</button>
    <button className={styles.todoTitle} data-todo-title data-completed={item.completed} style={tint(category(item.category_id).color)} onClick={edit}>{item.title}</button>
    <button className={styles.rowIcon} aria-label={`${item.title} 위로`} disabled={first} onClick={() => reorder(-1)}><ArrowUp size={13} /></button>
    <button className={styles.rowIcon} aria-label={`${item.title} 아래로`} disabled={last} onClick={() => reorder(1)}><ArrowDown size={13} /></button>
    <button className={styles.rowIcon} aria-label={`${item.title} 카테고리`} onClick={event => showCategory(event.currentTarget)}><MoreHorizontal size={16} /></button>
    <button ref={setActivatorNodeRef} className={styles.moveHandle} data-move-handle aria-label={`${item.title} 달력으로 이동`} onClick={move}><GripVertical size={17} /></button>
  </li>
}

export function TodoTrigger({ buttonRef, count, open, toggle, reveal }: {
  buttonRef: RefObject<HTMLButtonElement | null>; count: number; open: boolean; toggle: () => void; reveal: () => void
}) {
  const start = useRef<{ id: number; x: number; y: number }>(null)
  const swiped = useRef(false)

  return <button ref={buttonRef} className={styles.todoFab} aria-label="할 일 목록" aria-controls="todo-panel"
    aria-expanded={open} aria-keyshortcuts="Alt+J" title="할 일 목록 (Alt+J)"
    onPointerDown={event => {
      swiped.current = false
      if (!event.isPrimary || event.pointerType === 'mouse') return
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerUp={event => {
      const point = start.current
      if (!point || point.id !== event.pointerId) return
      start.current = null
      const distance = point.y - event.clientY
      if (distance < 42 || Math.abs(event.clientX - point.x) > distance * .65) return
      swiped.current = true
      reveal()
    }}
    onLostPointerCapture={() => { start.current = null }}
    onClick={event => {
      if (swiped.current && event.detail > 0) {
        swiped.current = false
        return
      }
      toggle()
    }}>
    <span className={styles.todoGrip} aria-hidden="true" />
    <ListTodo size={15} /><span>할 일</span>{count > 0 && <small>{count}</small>}
    <kbd aria-hidden="true">Alt+J</kbd>
  </button>
}

export function TodoPanel({ items, category, close, add, edit, toggle, reorder, quickCategory, move, open, side }: {
  items: Item[]; category: CategoryLookup; close: () => void; add: () => void; edit: (item: Item) => void
  toggle: (item: Item) => void; reorder: (index: number, offset: number) => void
  quickCategory: (anchor: CategoryAnchor) => void; move: (item: Item) => void; open: boolean; side: 'top' | 'bottom'
}) {
  return <aside id="todo-panel" className={styles.todoPanel} aria-label="할 일"
    aria-hidden={!open} inert={!open} data-open={open} data-side={side}>
    <div className={styles.panelHeading}><h2><ListTodo size={17} /> 할 일 <span>{items.length}</span></h2>
      <button className={styles.icon} aria-label="할 일 닫기" onClick={close}><X size={17} /></button></div>
    <div className={styles.todoBody}>
      {items.length ? <ul className={styles.todoList}>{items.map((item, index) => <TodoRow key={item.id}
        item={item} category={category} edit={() => edit(item)} toggle={() => toggle(item)}
        reorder={offset => reorder(index, offset)} quickCategory={quickCategory} move={() => move(item)}
        first={index === 0} last={index === items.length - 1} />)}</ul> : <p className={styles.empty}>날짜가 지정되지 않은 할 일이 여기에 표시됩니다.</p>}
    </div>
    <button className={styles.todoAdd} onClick={add}><Plus size={16} /> 할 일 추가</button>
  </aside>
}

export function DropCancel({ cancel }: { cancel: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'cancel' })
  return <button ref={setNodeRef} className={styles.dropCancel} data-over={isOver} onClick={cancel}>
    <X size={15} /> 이동 취소
  </button>
}
