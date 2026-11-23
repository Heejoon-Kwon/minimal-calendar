import { useCallback, useEffect, useRef, useState, type Dispatch, type FormEvent, type MouseEventHandler, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { fromKey, occursOn, readableDate, sortEvents, sortTodos, twoWeekDates } from '../calendar'
import { entity, put, type Change, type DateKey, type Item, type PlannerTodo, type WeekStart } from '../data/model'
import { tint, type CategoryLookup } from './calendar-view'
import { ItemMenu } from './item-menu'
import { DropCancel, TodoDrawer, TodoTrigger } from './todos'
import shared from './ui.module.css'
import styles from './planner.module.css'

export function plannerDateAt(x: number, y: number): DateKey | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    const date = element.closest<HTMLElement>('[data-planner-date]')?.dataset.plannerDate
    if (date) return date
  }
}

export function plannerPlacementChanges(tasks: PlannerTodo[], task: PlannerTodo, date: DateKey | null, position?: string): Change[] {
  const list = sortTodos(tasks.filter(candidate => candidate.date === date && candidate.id !== task.id))
  const index = position ? list.findIndex(candidate => candidate.id === position) : list.length
  list.splice(index < 0 ? list.length : index, 0, { ...task, date })
  return list.flatMap((value, index) =>
    value.id === task.id || value.sort_order !== index ? [put('items', { ...value, sort_order: index })] : [])
}

function PlannerDay({ date, today, weekend, todayElement, children }: {
  date: DateKey; today: boolean; weekend: boolean; todayElement: RefObject<HTMLElement | null>; children: ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `planner:${date}`, data: { date } })
  const ref = useCallback((element: HTMLElement | null) => {
    setNodeRef(element)
    if (today) todayElement.current = element
  }, [setNodeRef, today, todayElement])
  return <section ref={ref} data-planner-date={date} data-today={today} data-weekend={weekend} data-over={isOver}
    className={styles.day} aria-label={readableDate(date)}>{children}</section>
}

function TaskTitle({ task, label, click, menu }: {
  task: PlannerTodo; label: string; click: MouseEventHandler<HTMLButtonElement>; menu: (x: number, y: number) => void
}) {
  const { listeners, setNodeRef } = useDraggable({ id: task.id, data: { itemId: task.id }, disabled: !!task.date })
  return <button ref={setNodeRef} {...listeners} className={styles.taskText} data-backlog-drag={task.date ? undefined : ''}
    aria-label={label} onClick={click} onKeyDown={event => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      menu(rect.left, rect.bottom)
    }}>{task.title}</button>
}

function TaskInput({ label, value, submit, cancel, remove }: {
  label: string; value?: string; submit: (text: string) => Promise<void>; cancel: () => void; remove?: () => void
}) {
  const [text, setText] = useState(value ?? '')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await submit(text.trim())
      if (value === undefined) setText('')
    } catch {
      // The application displays the save error and leaves the draft in place.
    } finally {
      setBusy(false)
      if (value === undefined) input.current?.focus()
    }
  }

  return <form className={styles.inlineForm} onSubmit={save} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); cancel() }
  }}>
    <input ref={input} aria-label={label} placeholder="할 일 입력" value={text} required
      autoComplete="off" onChange={event => setText(event.target.value)} />
    <button type="submit" className={shared.secondary} disabled={busy}>저장</button>
    {remove && <button type="button" className={shared.rowIcon} aria-label="할 일 삭제" onClick={remove}><Trash2 size={15} /></button>}
  </form>
}

export function Planner({ today, weekStart, events, tasks, category, categoryId, apply, scrollRequest, open, setOpen, dragging, cancelDrag }: {
  today: DateKey; weekStart: WeekStart; events: Item[]; tasks: PlannerTodo[]; category: CategoryLookup; categoryId: string
  apply: (changes: Change[]) => Promise<void>; scrollRequest: number; open: boolean; setOpen: Dispatch<SetStateAction<boolean>>
  dragging: boolean; cancelDrag: () => void
}) {
  const [pull, setPull] = useState(0)
  const [moving, setMoving] = useState<string>()
  const [adding, setAdding] = useState<DateKey | 'unscheduled'>()
  const [editing, setEditing] = useState<string>()
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>()
  const [completion, setCompletion] = useState<Record<string, boolean>>({})
  const trigger = useRef<HTMLButtonElement>(null)
  const todayElement = useRef<HTMLElement>(null)
  const weeks = twoWeekDates(today, weekStart)
  const pendingTask = tasks.find(task => task.id === moving)

  useEffect(() => {
    if (scrollRequest) todayElement.current?.scrollIntoView({ block: 'nearest' })
  }, [scrollRequest])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || dragging || (event.target instanceof HTMLElement && event.target.closest('dialog'))) return
      if (event.key === 'Escape') {
        if (menu) { setMenu(undefined); return }
        if (moving) { setMoving(undefined); return }
        if (editing) { setEditing(undefined); return }
        if (adding) { setAdding(undefined); return }
        if (open) { setOpen(false); trigger.current?.focus() }
        return
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyJ'
        && !event.repeat && !moving && !(event.target instanceof HTMLElement && event.target.closest('input,textarea,select'))) {
        event.preventDefault()
        setOpen(value => !value)
        trigger.current?.focus()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [adding, dragging, editing, menu, moving, open, setOpen])

  const listFor = (date: DateKey | null) => sortTodos(tasks.filter(task => task.date === date)
    .map(task => task.id in completion ? { ...task, completed: completion[task.id] } : task))

  function toggleTask(task: PlannerTodo, checked: boolean) {
    setCompletion(current => ({ ...current, [task.id]: checked }))
    void apply([put('items', { ...task, completed: checked })]).catch(() => undefined).finally(() => {
      setCompletion(current => {
        const next = { ...current }
        delete next[task.id]
        return next
      })
    })
  }

  function add(date: DateKey | null, title: string) {
    const list = listFor(date)
    return apply([put('items', {
      ...entity(), title, date, planner_todo: true, category_id: categoryId, start_time: null, end_time: null,
      completed: false, sort_order: (list.at(-1)?.sort_order ?? 0) + 1,
    })])
  }

  function place(task: PlannerTodo, date: DateKey | null, position?: string) {
    if (position === task.id) { setMoving(undefined); return }
    const changes = plannerPlacementChanges(listFor(date), task, date, position)
    void apply(changes).then(() => setMoving(undefined)).catch(() => undefined)
  }

  function rows(date: DateKey | null) {
    const list = listFor(date)
    return <ul className={styles.taskList}>{list.map((task, index) => {
      const showMenu = (x: number, y: number) => { if (!moving && !dragging) setMenu({ id: task.id, x, y }) }
      return <li key={task.id} data-done={task.completed} data-moving={task.id === moving} className={styles.taskRow}
        onContextMenu={event => {
          event.preventDefault()
          if (!(event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch')) showMenu(event.clientX, event.clientY)
        }}>
        {editing === task.id ? <TaskInput label="할 일 편집" value={task.title} cancel={() => setEditing(undefined)}
          submit={async title => { await apply([put('items', { ...task, title })]); setEditing(undefined) }}
          remove={() => { void apply([{ collection: 'items', id: task.id, value: null }]).then(() => setEditing(undefined)).catch(() => undefined) }} />
          : <>
            <input type="checkbox" checked={task.completed} aria-label={`${task.title} 완료`} disabled={!!moving || task.id in completion}
              onChange={event => toggleTask(task, event.target.checked)} />
            <TaskTitle task={task} label={pendingTask && moving !== task.id ? (pendingTask.date === date ? `${task.title} 앞에 놓기` : `${task.title} 날짜로 이동`) : task.title}
              menu={showMenu} click={event => {
                if (pendingTask) place(pendingTask, date, pendingTask.date === date ? task.id : undefined)
                else if (!date && event.detail !== 0) { setAdding(undefined); setEditing(task.id) }
                else { setMoving(task.id); setAdding(undefined); if (!date) setOpen(false) }
              }} />
            {!moving && <div className={styles.taskTools}>
              <button className={shared.rowIcon} disabled={index === 0} aria-label={`${task.title} 위로`}
                onClick={() => place(task, date, list[index - 1].id)}><ArrowUp size={13} /></button>
              <button className={shared.rowIcon} disabled={index === list.length - 1} aria-label={`${task.title} 아래로`}
                onClick={() => place(task, date, list[index + 2]?.id)}><ArrowDown size={13} /></button>
              <button className={shared.rowIcon} aria-label={`${task.title} 편집`} onClick={() => setEditing(task.id)}><Pencil size={13} /></button>
            </div>}
          </>}
      </li>
    })}</ul>
  }

  function entry(date: DateKey | null) {
    const key = date ?? 'unscheduled'
    if (pendingTask) return <button className={styles.place} onClick={() => place(pendingTask, date)}>
      <GripVertical size={14} /> {date ? '이 날짜 맨 아래에 놓기' : '날짜 미정으로 이동'}
    </button>
    if (adding === key) return <TaskInput label={date ? `${readableDate(date)} 할 일` : '미정 할 일'} submit={text => add(date, text)} cancel={() => setAdding(undefined)} />
    return <button className={styles.quickAdd} aria-label={date ? `${readableDate(date)} 할 일 추가` : '미정 할 일 추가'}
      onClick={() => { setEditing(undefined); setAdding(key) }}><Plus size={15} /> 할 일 추가</button>
  }

  return <>
    <section className={styles.planner} aria-label="2주 계획" data-planner-scroll>
      {weeks.map((week, index) => <section key={week[0]} className={styles.week} aria-labelledby={`week-${index}`}>
        <div className={styles.weekHeading}>
          <h2 id={`week-${index}`}>{index === 0 ? '이번 주' : '다음 주'}</h2>
          <span>{week[0].slice(5).replace('-', '.')} – {week[6].slice(5).replace('-', '.')}</span>
        </div>
        <div className={styles.days}>{week.map(date => {
          const day = fromKey(date)
          const agenda = sortEvents(events.filter(item => occursOn(item, date)))
          return <PlannerDay key={date} date={date} today={date === today} weekend={day.getDay() === 0 || day.getDay() === 6}
            todayElement={todayElement}>
            <h3>{pendingTask
              ? <button className={styles.dateTarget} aria-label={`${readableDate(date)}에 놓기`} onClick={() => place(pendingTask, date)}>{day.getDate()}일</button>
              : <strong>{day.getDate()}</strong>} {['일', '월', '화', '수', '목', '금', '토'][day.getDay()]}</h3>
            <div className={styles.agenda} aria-label="캘린더 일정">
              {agenda.map(item => <div key={item.id} className={styles.agendaItem} style={tint(category(item.category_id).color)}>
                <span>{item.title}</span>{item.start_time && <time>{item.start_time.slice(0, 5)}{item.end_time && `–${item.end_time.slice(0, 5)}`}</time>}
              </div>)}
            </div>
            <div className={styles.dailyTasks}>{rows(date)}{entry(date)}</div>
          </PlannerDay>
        })}</div>
      </section>)}
    </section>
    <footer className={shared.todoDock}>
      {dragging ? <DropCancel cancel={cancelDrag} /> : pendingTask ? <div className={styles.moving} role="status"><span>{pendingTask.title}</span>
        <button className={shared.secondary} onClick={() => place(pendingTask, null)}>날짜 미정</button>
        <button className={shared.secondary} onClick={() => setMoving(undefined)}>이동 취소</button>
      </div> : <TodoTrigger buttonRef={trigger} count={listFor(null).length} open={open} label="미정 할 일"
        toggle={() => setOpen(value => !value)} reveal={() => setOpen(true)} pull={setPull} />}
    </footer>
    <TodoDrawer open={open && !dragging} side="bottom" pull={pull} label="미정 할 일" count={listFor(null).length}
      close={() => { setOpen(false); trigger.current?.focus() }}>
      <div className={shared.todoBody}>{rows(null)}</div>
      <div className={styles.drawerEntry}>{entry(null)}</div>
    </TodoDrawer>
    {menu && <ItemMenu x={menu.x} y={menu.y} label="할 일 메뉴" close={() => setMenu(undefined)} remove={() => {
      void apply([{ collection: 'items', id: menu.id, value: null }]).then(() => {
        if (editing === menu.id) setEditing(undefined)
      }).catch(() => undefined)
      setMenu(undefined)
    }} />}
  </>
}
