import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type Modifier,
} from '@dnd-kit/core'
import { CalendarRange, Check, ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react'
import { dateKey, eventTimesInOrder, monthWeeks, moveEvent, moveMonth, occursOn, readableDate, sortEvents, sortTodos } from '../calendar'
import { defaultBacklogShortcutKey, isPlannerTodo, put, type Change, type DateKey, type Item } from '../data/model'
import type { Repository, RepositoryState } from '../data/repository'
import { calendarDateAt, CalendarView, tint, type CategoryAnchor } from './calendar-view'
import { Dialog } from './dialog'
import { ItemEditor } from './editors'
import { ItemMenu } from './item-menu'
import { Planner, plannerPlacementChanges, plannerDateAt } from './planner'
import { SettingsPanel } from './settings'
import { DropCancel, DropUnscheduled, isBacklogShortcut, TodoPanel, TodoTrigger } from './todos'
import styles from './ui.module.css'

type Overlay =
  | { kind: 'date'; date: DateKey }
  | { kind: 'item'; date: DateKey | null; itemId?: string; back?: DateKey; rangeEnd?: DateKey; rangeDraft?: boolean }
  | { kind: 'settings' }
type View = 'calendar' | 'planner'
const viewShortcuts = 'Control+Tab Control+Shift+Space'

class ItemMouseSensor extends MouseSensor {
  static activators: typeof MouseSensor.activators = MouseSensor.activators.map(activator => ({
    ...activator,
    handler(event, options) {
      return event.button === 0 && event.target instanceof Element && Boolean(event.target.closest('[data-event], [data-backlog-drag], [data-planner-task]'))
        && activator.handler(event, options)
    },
  }))
}

class CalendarTouchSensor extends TouchSensor {
  static activators: typeof TouchSensor.activators = TouchSensor.activators.map(activator => ({
    ...activator,
    handler(event, options) {
      return event.target instanceof Element && Boolean(event.target.closest('[data-backlog-drag], [data-event], [data-planner-task]'))
        && activator.handler(event, options)
    },
  }))
}

const followPointer: Modifier = ({ activatorEvent, draggingNodeRect, overlayNodeRect, transform, windowRect }) => {
  if (!activatorEvent || !draggingNodeRect || !windowRect) return transform
  const point = 'touches' in activatorEvent
    ? (activatorEvent as TouchEvent).touches[0]
    : activatorEvent as MouseEvent
  if (!point) return transform
  const x = point.clientX + transform.x
  const y = point.clientY + transform.y
  const width = overlayNodeRect?.width ?? 180
  const height = overlayNodeRect?.height ?? 28
  const left = Math.max(5, Math.min(x + 12, windowRect.width - width - 5))
  const top = Math.max(5, y + height + 18 <= windowRect.height ? y + 12 : y - height - 12)
  return { ...transform, x: left - draggingNodeRect.left, y: top - draggingNodeRect.top }
}

export function Brand() {
  return <div className={styles.brand}><span><CalendarRange size={19} strokeWidth={1.85} /></span>Monthline</div>
}

export function App({ repository, logout }: { repository: Repository; logout?: () => void }) {
  const [state, setState] = useState<RepositoryState>()
  const [online, setOnline] = useState(navigator.onLine)
  const [syncError, setSyncError] = useState(false)
  const [actionError, setActionError] = useState('')
  const [today, setToday] = useState(() => dateKey(new Date()))
  const [month, setMonth] = useState(() => moveMonth(new Date(), 0))
  const [overlay, setOverlay] = useState<Overlay>()
  const [anchor, setAnchor] = useState<CategoryAnchor>()
  const [todoOpen, setTodoOpen] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [pull, setPull] = useState(0)
  const [view, setView] = useState<View>('calendar')
  const [scrollRequest, setScrollRequest] = useState(0)
  const [dragging, setDragging] = useState<string>()
  const [clickMoving, setClickMoving] = useState<string>()
  const [landing, setLanding] = useState<{ itemId: string; date: DateKey; color: string }>()
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const onRefresh = useRef<() => void>(() => undefined)
  const todoTriggerRef = useRef<HTMLButtonElement>(null)
  const viewSwitchRef = useRef<HTMLDivElement>(null)
  const shortcutKey = state?.records.settings[0]?.backlog_shortcut_key ?? defaultBacklogShortcutKey
  const dragPoint = useRef<{ x: number; y: number }>(null)
  const releasePoint = useRef<{ x: number; y: number }>(null)
  const canScrollPlanner = useCallback((element: Element) => {
    // The cancel dock is outside the scroll area, even when a date is still highlighted.
    const point = dragPoint.current
    if (!point || !element.hasAttribute('data-planner-scroll')) return false
    const { top, left, right, bottom } = element.getBoundingClientRect()
    return point.x >= left && point.x < right && point.y >= top && point.y < bottom
  }, [])
  const sensors = useSensors(
    useSensor(ItemMouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(CalendarTouchSensor, { activationConstraint: { delay: 420, tolerance: 10 } }),
  )

  function cancelMove() { setDragging(undefined); setClickMoving(undefined) }

  const changeView = useCallback((next: View) => {
    if (next === 'calendar') setPlannerOpen(false)
    else setTodoOpen(false)
    setView(next)
  }, [])

  useEffect(() => {
    let active = true
    let running = false
    let repeat = false
    function update(next: RepositoryState) { if (active) setState(next) }
    async function refresh() {
      if (!active) return
      if (running) { repeat = true; return }
      running = true
      try {
        update(await repository.read())
        if (navigator.onLine) update(await repository.sync())
        if (active) setSyncError(false)
      } catch {
        if (active) setSyncError(true)
      } finally {
        running = false
        if (repeat && active) { repeat = false; void refresh() }
      }
    }
    function connection() {
      setOnline(navigator.onLine)
      void refresh()
    }
    function visible() {
      setToday(dateKey(new Date()))
      if (document.visibilityState === 'visible') connection()
    }
    onRefresh.current = () => void refresh()
    const unwatch = repository.watch(onRefresh.current)
    window.addEventListener('online', connection)
    window.addEventListener('offline', connection)
    window.addEventListener('pageshow', visible)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    const retry = window.setInterval(visible, 30_000)
    void refresh()
    return () => {
      active = false
      unwatch()
      window.clearInterval(retry)
      window.removeEventListener('online', connection)
      window.removeEventListener('offline', connection)
      window.removeEventListener('pageshow', visible)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [repository])

  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const settings = state?.records.settings[0]
    const theme = settings?.theme ?? 'system'
    const style = settings?.calendar_style ?? (theme === 'system' ? (systemDark ? 'dark' : 'light') : theme)
    document.documentElement.dataset.theme = style
    const chrome = getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome)
  }, [state?.records.settings, systemDark])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (view !== 'calendar') return
        if (anchor) setAnchor(undefined)
        else if (clickMoving) setClickMoving(undefined)
        else if (todoOpen && !overlay && !dragging) {
          setTodoOpen(false)
          todoTriggerRef.current?.focus()
        }
        return
      }
      const target = event.target
      if (event.defaultPrevented || event.repeat || event.isComposing || overlay || anchor || dragging || clickMoving
        || (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="dialog"]')))) return
      if (event.ctrlKey && !event.altKey && !event.metaKey && (
        (!event.shiftKey && event.key === 'Tab') || (event.shiftKey && event.code === 'Space')
      )) {
        const next = view === 'calendar' ? 'planner' : 'calendar'
        const button = viewSwitchRef.current?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)
        if (!button) return
        event.preventDefault()
        changeView(next)
        button.focus({ preventScroll: true })
        return
      }
      if (view !== 'calendar') return
      if (isBacklogShortcut(event, shortcutKey)) {
        event.preventDefault()
        setTodoOpen(open => !open)
        todoTriggerRef.current?.focus()
      } else if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        setMonth(value => moveMonth(value, event.key === 'ArrowLeft' ? -1 : 1))
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [anchor, changeView, clickMoving, dragging, overlay, shortcutKey, todoOpen, view])

  useEffect(() => {
    function captureMove(event: MouseEvent | TouchEvent) {
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (point) dragPoint.current = { x: point.clientX, y: point.clientY }
    }
    function captureRelease(event: MouseEvent | TouchEvent) {
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (point) releasePoint.current = { x: point.clientX, y: point.clientY }
    }
    if (view === 'planner') {
      window.addEventListener('mousemove', captureMove, true)
      window.addEventListener('touchmove', captureMove, { capture: true, passive: true })
    }
    window.addEventListener('mouseup', captureRelease, true)
    window.addEventListener('touchend', captureRelease, true)
    return () => {
      window.removeEventListener('mousemove', captureMove, true)
      window.removeEventListener('touchmove', captureMove, true)
      window.removeEventListener('mouseup', captureRelease, true)
      window.removeEventListener('touchend', captureRelease, true)
    }
  }, [view])

  useEffect(() => {
    if (!landing) return
    const timeout = window.setTimeout(() => setLanding(undefined), 2000)
    return () => window.clearTimeout(timeout)
  }, [landing])

  async function apply(changes: Change[]) {
    setActionError('')
    try {
      setState(await repository.apply(changes))
      onRefresh.current()
    } catch (error) {
      setActionError('변경사항을 저장하지 못했습니다.')
      throw error
    }
  }

  function commit(changes: Change[]) { void apply(changes).catch(() => undefined) }

  if (!state?.records.categories.length || !state.records.settings.length) {
    return <main className={styles.center}><Brand /><p>{syncError || !online ? '캘린더를 열려면 연결이 필요합니다.' : '캘린더를 불러오는 중…'}</p>
      {(syncError || !online) && <button className={styles.secondary} onClick={() => onRefresh.current()}>다시 시도</button>}
      {logout && <button className={styles.secondary} onClick={logout}>로그아웃</button>}</main>
  }

  const { records, pending } = state
  const { categories } = records
  const items = records.items.filter(item => !isPlannerTodo(item))
  const plannerTasks = records.items.filter(isPlannerTodo)
  const settings = records.settings[0]
  const defaultCategory = categories.find(category => category.id === settings.default_category_id) ?? categories[0]
  const category = (id: string) => categories.find(value => value.id === id) ?? defaultCategory
  const todos = sortTodos(items.filter(item => item.date === null))
  const movingItem = items.find(item => item.id === (dragging ?? clickMoving))
  const draggedTask = plannerTasks.find(task => task.id === dragging)
  const weeks = monthWeeks(month, settings.week_start)
  const todayRow = weeks.findIndex(week => week.some(day => dateKey(day) === today))
  const todoSide = todayRow >= Math.ceil(weeks.length / 2) ? 'top' : 'bottom'

  function schedule(item: Item, date: DateKey) {
    setTodoOpen(false)
    cancelMove()
    if (item.date === date) return
    void apply([put('items', moveEvent(item, date))])
      .then(() => setLanding({ itemId: item.id, date, color: category(item.category_id).color }))
      .catch(() => { if (!item.date) setTodoOpen(true) })
  }

  function drop(event: DragEndEvent) {
    // Dnd-kit's last highlighted target can lag the actual release by one frame.
    const point = releasePoint.current
    const id = event.active.data.current?.itemId ?? event.active.id
    const unschedule = point ? !!document.elementFromPoint(point.x, point.y)?.closest('[data-unschedule]') : event.over?.id === 'unschedule'
    const task = plannerTasks.find(value => value.id === id)
    if (task) {
      const date = unschedule ? null : point ? plannerDateAt(point.x, point.y) : event.over?.data.current?.date
      if ((typeof date === 'string' || (date === null && task.date)) && date !== task.date) {
        void apply(plannerPlacementChanges(plannerTasks, task, date)).then(() => {
          setPlannerOpen(!date)
          if (date) setLanding({ itemId: task.id, date, color: 'var(--ink)' })
        })
          .catch(() => undefined).finally(cancelMove)
      } else cancelMove()
      return
    }
    const date = point ? calendarDateAt(point.x, point.y) : event.over?.id
    const item = items.find(value => value.id === id)
    if (item?.date && unschedule) {
      const end_time = eventTimesInOrder(null, undefined, item.start_time, item.end_time) ? item.end_time : null
      void apply([put('items', { ...item, date: null, end_date: undefined, end_time })])
        .then(() => setTodoOpen(true)).catch(() => undefined).finally(cancelMove)
    } else if (item && typeof date === 'string' && date !== 'cancel' && date !== 'unschedule') schedule(item, date)
    else cancelMove()
  }

  function editItem(item: Item, back?: DateKey) {
    setOverlay({ kind: 'item', date: item.date, itemId: item.id, back })
  }

  let dialog: ReactNode
  if (overlay?.kind === 'date') {
    const { date } = overlay
    const events = sortEvents(items.filter(item => occursOn(item, date)))
    dialog = <Dialog key={date} title={readableDate(date)} close={() => setOverlay(undefined)}>
      <div className={styles.dayList}>
        {events.length === 0 && <p className={styles.empty}>등록된 일정이 없습니다.</p>}
        {events.map(item => <button key={item.id} className={styles.detailRow} style={tint(category(item.category_id).color)}
          onClick={() => editItem(item, date)}><span>{item.title}</span><span>{item.start_time?.slice(0, 5) ?? '하루 종일'}</span></button>)}
      </div>
      <div className={styles.dateActions}>
        <button className={styles.secondary} onClick={() => setOverlay({ kind: 'item', date, back: date, rangeDraft: true })}>기간 일정</button>
        <button className={styles.primary} data-focus onClick={() => setOverlay({ kind: 'item', date, back: date })}><Plus size={16} /> 일정 추가</button>
      </div>
    </Dialog>
  }

  if (overlay?.kind === 'item') {
    const { date, back, itemId, rangeEnd, rangeDraft } = overlay
    const selected = items.find(item => item.id === itemId)
    const close = () => setOverlay(back ? { kind: 'date', date: back } : undefined)
    dialog = <Dialog key={itemId ?? 'new-item'} title={itemId ? '항목 편집' : date ? '일정 추가' : '미정 일정 추가'} close={close}>
      <ItemEditor item={selected} date={date} rangeEnd={rangeEnd} rangeDraft={rangeDraft} defaultCategory={defaultCategory.id} categories={categories}
        showDate={date && !itemId && !back && !rangeDraft && !rangeEnd ? () => setOverlay({ kind: 'date', date }) : undefined}
        save={async item => { await apply([put('items', item)]); close() }}
        remove={() => {
          if (itemId) void apply([{ collection: 'items', id: itemId, value: null }]).then(close).catch(() => undefined)
        }} />
    </Dialog>
  }

  if (overlay?.kind === 'settings') dialog = <Dialog key="settings" title="설정" close={() => setOverlay(undefined)}>
    <SettingsPanel records={records} settings={{ ...settings, default_category_id: defaultCategory.id }} apply={apply} logout={logout} />
  </Dialog>

  const syncLabel = !logout ? '로컬 모드'
    : !online ? (pending ? `오프라인 · ${pending}건 저장됨` : '오프라인')
    : syncError ? (pending ? `동기화 대기 · ${pending}건` : '동기화 대기 · 재시도')
    : pending ? '동기화 중' : '동기화 연결됨'

  return <DndContext sensors={sensors} collisionDetection={pointerWithin}
    autoScroll={view === 'planner' && { canScroll: canScrollPlanner, threshold: { x: 0.01, y: 0.07 }, acceleration: 7, interval: 12 }}
    onDragStart={event => {
      dragPoint.current = null
      releasePoint.current = null
      setDragging(String(event.active.data.current?.itemId ?? event.active.id))
      setAnchor(undefined)
    }} onDragEnd={drop} onDragCancel={cancelMove}
    accessibility={{ screenReaderInstructions: { draggable: '미정 항목을 길게 눌러 원하는 날짜로 끌어 놓으세요. 키보드에서는 Enter로 이동을 시작하세요.' } }}>
    <main className={styles.app} style={{ '--todo-font': `${settings.todo_font_size ?? 14}px` } as CSSProperties}>
      <header className={styles.masthead}>
        <Brand />
        <div className={styles.monthTitle}>
          {view === 'calendar' ? <h1 aria-live="polite" aria-label={`${month.getFullYear()}년 ${month.getMonth() + 1}월`}>
            <strong>{month.getMonth() + 1}월</strong> <span>{month.getFullYear()}년</span>
          </h1> : <h1><strong>2주 계획</strong></h1>}
          {movingItem && <span className={styles.screenReader} role="status">달력에서 날짜를 선택하세요</span>}
        </div>
        <div className={styles.navigation}>
          <button className={styles.today} onClick={() => {
            const now = new Date()
            setToday(dateKey(now))
            if (view === 'calendar') setMonth(moveMonth(now, 0))
            else setScrollRequest(value => value + 1)
          }}>오늘</button>
          {view === 'calendar' && <div className={styles.monthButtons}>
            <button className={styles.icon} aria-label="이전 달" onClick={() => setMonth(value => moveMonth(value, -1))}><ChevronLeft size={17} /></button>
            <button className={styles.icon} aria-label="다음 달" onClick={() => setMonth(value => moveMonth(value, 1))}><ChevronRight size={17} /></button>
          </div>}
        </div>
        <div className={styles.topActions}>
          <div ref={viewSwitchRef} className={styles.viewSwitch} role="group" aria-label="보기 선택" title="보기 전환 (Ctrl+Tab / Ctrl+Shift+Space)">
            <button data-view="calendar" aria-keyshortcuts={viewShortcuts} aria-pressed={view === 'calendar'} disabled={Boolean(movingItem || draggedTask)} onClick={() => changeView('calendar')}>월간</button>
            <button data-view="planner" aria-keyshortcuts={viewShortcuts} aria-pressed={view === 'planner'} disabled={Boolean(movingItem || draggedTask)} onClick={() => changeView('planner')}>2주</button>
          </div>
          <button className={styles.status} onClick={() => onRefresh.current()} disabled={!logout} aria-label={syncLabel} title={syncLabel}
            data-state={!logout ? 'local' : !online || syncError || pending ? 'waiting' : 'ready'} data-pending={Boolean(pending)}>
            {logout && pending ? <>{!online ? '오프라인' : syncError ? '동기화 대기' : '동기화 중'}<small>{pending}</small></> : syncLabel}
          </button>
          <button className={styles.icon} aria-label="설정" onClick={() => setOverlay({ kind: 'settings' })} disabled={Boolean(movingItem || draggedTask)}><Settings2 size={18} /></button>
        </div>
      </header>
      {view === 'calendar' ? <>
      <CalendarView month={month} today={today} weekStart={settings.week_start} items={items} fontSize={settings.calendar_font_size}
        category={category} openDate={date => {
          if (clickMoving && movingItem) schedule(movingItem, date)
          else setOverlay({ kind: 'item', date })
        }} showDate={date => setOverlay({ kind: 'date', date })} openItem={editItem} quickCategory={setAnchor}
        openRange={(date, rangeEnd) => setOverlay({ kind: 'item', date, rangeEnd })}
        landing={landing} moving={Boolean(dragging)} picking={Boolean(clickMoving)}
        swipeMonth={!overlay && !anchor && !dragging && !clickMoving
          ? offset => setMonth(value => moveMonth(value, offset)) : undefined} />
      <footer className={styles.todoDock}>
        {movingItem ? <div className={styles.dropActions}>
          <DropCancel cancel={cancelMove} />
          {dragging && movingItem.date && <DropUnscheduled label="미정 일정" />}
        </div> :
          <TodoTrigger buttonRef={todoTriggerRef} count={todos.length} open={todoOpen} shortcutKey={shortcutKey}
            toggle={() => setTodoOpen(open => !open)} reveal={() => setTodoOpen(true)} pull={setPull} />}
      </footer>
      <TodoPanel items={todos} category={category} open={todoOpen && !dragging && !clickMoving} side={todoSide} pull={pull}
        close={() => { setTodoOpen(false); todoTriggerRef.current?.focus() }} add={() => setOverlay({ kind: 'item', date: null })}
        edit={item => editItem(item)}
        reorder={(index, offset) => {
          const sorted = [...todos]
          const [item] = sorted.splice(index, 1)
          sorted.splice(index + offset, 0, item)
          commit(sorted.flatMap((value, position) => value.sort_order === position ? [] : [put('items', { ...value, sort_order: position })]))
        }} quickCategory={setAnchor} move={item => setClickMoving(item.id)} />
      </> : <Planner today={today} weekStart={settings.week_start} events={items} tasks={plannerTasks}
        category={category} categoryId={defaultCategory.id} apply={apply} scrollRequest={scrollRequest}
        open={plannerOpen} setOpen={setPlannerOpen} draggedTask={draggedTask} cancelDrag={cancelMove} shortcutKey={shortcutKey} />}
      {landing && <div className={styles.placementStatus} role="status" data-placement><Check size={14} /> {readableDate(landing.date)}에 배치했어요</div>}
      {actionError && <div className={styles.actionError} role="alert">{actionError}</div>}
      {anchor && <ItemMenu x={anchor.x} y={anchor.y} label="카테고리 변경" close={() => setAnchor(undefined)} remove={() => {
        commit([{ collection: 'items', id: anchor.item.id, value: null }])
        setAnchor(undefined)
      }}>
        {categories.map(value => <button key={value.id} className={styles.categoryChoice}
          style={tint(value.color)} aria-pressed={anchor.item.category_id === value.id} onClick={() => {
            const item = items.find(candidate => candidate.id === anchor.item.id)
            if (item) commit([put('items', { ...item, category_id: value.id })])
            setAnchor(undefined)
          }}>{value.name}</button>)}
      </ItemMenu>}
      {dialog}
    </main>
    <DragOverlay modifiers={[followPointer]} style={{ width: 'max-content', maxWidth: 180, pointerEvents: 'none' }} dropAnimation={null}>{dragging && (movingItem || draggedTask) && <div className={styles.dragGhost} data-drag-preview style={tint(movingItem ? category(movingItem.category_id).color : 'var(--ink)')}>
      {movingItem?.title ?? draggedTask?.title}
    </div>}</DragOverlay>
  </DndContext>
}
