import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type Modifier,
} from '@dnd-kit/core'
import { CalendarRange, Check, ChevronLeft, ChevronRight, ListTodo, Plus, Settings2, X } from 'lucide-react'
import { dateKey, moveMonth, readableDate, sortEvents, sortTodos } from '../calendar'
import { put, type Change, type DateKey, type Item } from '../data/model'
import type { Repository, RepositoryState } from '../data/repository'
import { CalendarView, tint, type CategoryAnchor } from './calendar-view'
import { Dialog } from './dialog'
import { DeadlineEditor, ItemEditor } from './editors'
import { SettingsPanel } from './settings'
import { DropCancel, TodoPanel } from './todos'
import styles from './ui.module.css'

type Overlay =
  | { kind: 'date'; date: DateKey }
  | { kind: 'item'; date: DateKey | null; itemId?: string; back?: DateKey }
  | { kind: 'deadlines'; ids: string[] }
  | { kind: 'deadline'; start: DateKey; end: DateKey; deadlineId?: string }
  | { kind: 'settings' }

class CalendarMouseSensor extends MouseSensor {
  static activators: typeof MouseSensor.activators = MouseSensor.activators.map(activator => ({
    ...activator,
    handler(event, options) {
      return event.target instanceof Element && Boolean(event.target.closest('[data-move-handle]'))
        && activator.handler(event, options)
    },
  }))
}

function ignoreTodoControls(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button:not([data-move-handle])')
    && !target.closest('[data-todo-title]'))
}

class CalendarTouchSensor extends TouchSensor {
  static activators: typeof TouchSensor.activators = TouchSensor.activators.map(activator => ({
    ...activator,
    handler(event, options) {
      return !ignoreTodoControls(event.target) && activator.handler(event, options)
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
  const [dragging, setDragging] = useState<string>()
  const [clickMoving, setClickMoving] = useState<string>()
  const [landing, setLanding] = useState<{ itemId: string; date: DateKey; color: string }>()
  const [picking, setPicking] = useState(false)
  const [start, setStart] = useState<DateKey>()
  const [end, setEnd] = useState<DateKey>()
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const onRefresh = useRef<() => void>(() => undefined)
  const anchorRef = useRef<HTMLDivElement>(null)
  const releasePoint = useRef<{ x: number; y: number }>(null)
  const sensors = useSensors(
    useSensor(CalendarMouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(CalendarTouchSensor, { activationConstraint: { delay: 420, tolerance: 10 } }),
  )

  const cancelRange = useCallback(() => { setPicking(false); setStart(undefined); setEnd(undefined) }, [])
  function cancelMove() { setDragging(undefined); setClickMoving(undefined) }

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
    document.addEventListener('visibilitychange', visible)
    const retry = window.setInterval(visible, 30_000)
    void refresh()
    return () => {
      active = false
      unwatch()
      window.clearInterval(retry)
      window.removeEventListener('online', connection)
      window.removeEventListener('offline', connection)
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
    const theme = state?.records.settings[0]?.theme ?? 'system'
    const dark = theme === 'dark' || (theme === 'system' && systemDark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191a1d' : '#f8f9fb')
  }, [state?.records.settings, systemDark])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAnchor(undefined)
        setClickMoving(undefined)
        cancelRange()
      }
    }
    const outside = (event: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setAnchor(undefined)
    }
    function captureRelease(event: MouseEvent | TouchEvent) {
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (point) releasePoint.current = { x: point.clientX, y: point.clientY }
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('pointerdown', outside)
    window.addEventListener('mouseup', captureRelease, true)
    window.addEventListener('touchend', captureRelease, true)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('mouseup', captureRelease, true)
      window.removeEventListener('touchend', captureRelease, true)
    }
  }, [cancelRange])

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
  const { items, deadlines, categories } = records
  const settings = records.settings[0]
  const defaultCategory = categories.find(category => category.id === settings.default_category_id) ?? categories[0]
  const category = (id: string) => categories.find(value => value.id === id) ?? defaultCategory
  const todos = sortTodos(items.filter(item => item.date === null))
  const movingItem = todos.find(item => item.id === (dragging ?? clickMoving))

  function schedule(item: Item, date: DateKey) {
    setTodoOpen(false)
    cancelMove()
    void apply([put('items', { ...item, date, start_time: null, end_time: null })])
      .then(() => setLanding({ itemId: item.id, date, color: category(item.category_id).color }))
      .catch(() => setTodoOpen(true))
  }

  function drop(event: DragEndEvent) {
    // Dnd-kit's last highlighted target can lag the actual release by one frame.
    const point = releasePoint.current
    const date = point
      ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-date]')?.dataset.date
      : event.over?.id
    const item = todos.find(value => value.id === event.active.id)
    if (item && typeof date === 'string' && date !== 'cancel') schedule(item, date)
    else cancelMove()
  }

  function selectDate(date: DateKey) {
    if (!start || date < start) { setStart(date); setEnd(date); return }
    setOverlay({ kind: 'deadline', start, end: date })
    cancelRange()
  }

  function editItem(item: Item, back?: DateKey) {
    setOverlay({ kind: 'item', date: item.date, itemId: item.id, back })
  }

  let dialog: ReactNode
  if (overlay?.kind === 'date') {
    const { date } = overlay
    const events = sortEvents(items.filter(item => item.date === date))
    const activeDeadlines = deadlines.filter(value => value.start_date <= date && value.end_date >= date)
    dialog = <Dialog key={date} title={readableDate(date)} close={() => setOverlay(undefined)}>
      <div className={styles.dayList}>
        {events.length === 0 && <p className={styles.empty}>등록된 일정이 없습니다.</p>}
        {events.map(item => <button key={item.id} className={styles.detailRow} style={tint(category(item.category_id).color)}
          onClick={() => editItem(item, date)}><span>{item.title}</span><span>{item.start_time?.slice(0, 5) ?? '하루 종일'}</span></button>)}
        {activeDeadlines.map(value => <button key={value.id} className={styles.detailRow} style={tint(category(value.category_id).color)}
          onClick={() => setOverlay({ kind: 'deadline', start: value.start_date, end: value.end_date, deadlineId: value.id })}>
          <span>{value.title}</span><span>기한</span>
        </button>)}
      </div>
      <button className={styles.primary} data-focus onClick={() => setOverlay({ kind: 'item', date, back: date })}><Plus size={16} /> 일정 추가</button>
    </Dialog>
  }

  if (overlay?.kind === 'item') {
    const { date, back, itemId } = overlay
    const selected = items.find(item => item.id === itemId)
    const close = () => setOverlay(back ? { kind: 'date', date: back } : undefined)
    dialog = <Dialog key={itemId ?? 'new-item'} title={itemId ? '항목 편집' : date ? '일정 추가' : '할 일 추가'} close={close}>
      <ItemEditor item={selected} date={date} defaultCategory={defaultCategory.id} categories={categories}
        save={async item => { await apply([put('items', item)]); close() }}
        remove={() => {
          if (itemId) void apply([{ collection: 'items', id: itemId, value: null }]).then(close).catch(() => undefined)
        }} />
    </Dialog>
  }

  if (overlay?.kind === 'deadlines') {
    dialog = <Dialog key="deadlines" title="기한" close={() => setOverlay(undefined)}>
      <div className={styles.dayList}>
        {deadlines.filter(value => overlay.ids.includes(value.id)).map(value =>
          <button key={value.id} className={styles.detailRow} style={tint(category(value.category_id).color)}
            onClick={() => setOverlay({ kind: 'deadline', start: value.start_date, end: value.end_date, deadlineId: value.id })}>
            <span>{value.title}</span><span>{value.start_date} ~ {value.end_date}</span>
          </button>)}
      </div>
    </Dialog>
  }

  if (overlay?.kind === 'deadline') {
    const { deadlineId, start, end } = overlay
    const close = () => setOverlay(undefined)
    dialog = <Dialog key={deadlineId ?? 'new-deadline'} title={deadlineId ? '기한 편집' : '기한 추가'} close={close}>
      <DeadlineEditor existing={deadlines.find(value => value.id === deadlineId)} initialStart={start} initialEnd={end}
        categories={categories} defaultCategory={defaultCategory.id}
        save={async deadline => { await apply([put('deadlines', deadline)]); close() }}
        remove={() => {
          if (deadlineId) void apply([{ collection: 'deadlines', id: deadlineId, value: null }]).then(close).catch(() => undefined)
        }} />
    </Dialog>
  }

  if (overlay?.kind === 'settings') dialog = <Dialog key="settings" title="설정" close={() => setOverlay(undefined)}>
    <SettingsPanel records={records} settings={{ ...settings, default_category_id: defaultCategory.id }} apply={apply} logout={logout} />
  </Dialog>

  const syncLabel = !logout ? '로컬 모드' : !online ? '오프라인' : syncError ? '동기화 대기 · 재시도' : pending ? '동기화 중' : '동기화 연결됨'

  return <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={false}
    onDragStart={event => {
      releasePoint.current = null
      setDragging(String(event.active.id))
      setAnchor(undefined)
    }} onDragEnd={drop} onDragCancel={cancelMove}
    accessibility={{ screenReaderInstructions: { draggable: '이동 핸들을 누르고 달력의 날짜를 선택하거나 원하는 날짜로 드래그하세요.' } }}>
    <main className={styles.app}>
      <header className={styles.topbar}>
        <Brand />
        <div className={styles.topActions}>
          <button className={styles.status} onClick={() => onRefresh.current()} disabled={!logout}
            data-state={!logout ? 'local' : !online || syncError || pending ? 'waiting' : 'ready'}>{syncLabel}</button>
          <button className={styles.icon} aria-label="설정" onClick={() => setOverlay({ kind: 'settings' })}><Settings2 size={18} /></button>
        </div>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.monthTitle}>
          <h1 aria-live="polite">{month.getFullYear()}년 <strong>{month.getMonth() + 1}월</strong></h1>
        </div>
        <div className={styles.navigation}>
          <button className={styles.today} onClick={() => { setToday(dateKey(new Date())); setMonth(moveMonth(new Date(), 0)) }}>오늘</button>
          <div className={styles.monthButtons}>
            <button className={styles.icon} aria-label="이전 달" onClick={() => setMonth(value => moveMonth(value, -1))}><ChevronLeft size={17} /></button>
            <button className={styles.icon} aria-label="다음 달" onClick={() => setMonth(value => moveMonth(value, 1))}><ChevronRight size={17} /></button>
          </div>
        </div>
      </div>
      <CalendarView month={month} today={today} weekStart={settings.week_start} items={items} deadlines={deadlines}
        category={category} openDate={date => {
          if (clickMoving && movingItem) schedule(movingItem, date)
          else setOverlay({ kind: 'date', date })
        }} openItem={editItem} quickCategory={setAnchor}
        openDeadlines={values => setOverlay({ kind: 'deadlines', ids: values.map(value => value.id) })}
        landing={landing} moving={Boolean(dragging)} picking={picking || Boolean(clickMoving)} rangePicking={picking}
        range={start ? { start, end: end && end >= start ? end : start } : null}
        hoverDate={date => { if (picking && start) setEnd(date) }}
        selectDate={date => {
          if (clickMoving && movingItem) schedule(movingItem, date)
          else selectDate(date)
        }} />
      <footer className={styles.footer}>
        {picking ? <div className={styles.modeHint} role="status">{start ? '종료일을 선택하세요' : '시작일을 선택하세요'}
          <button className={styles.icon} aria-label="기한 선택 취소" onClick={cancelRange}><X size={17} /></button></div>
          : movingItem ? <div className={styles.modeHint} role="status">달력에서 날짜를 선택하세요</div>
            : landing ? <div className={`${styles.modeHint} ${styles.placementStatus}`} role="status">
              <Check size={14} /> {readableDate(landing.date)}에 배치했어요
            </div>
            : <div className={styles.legend}><span className={styles.legendLine} />기한<span className={styles.legendEvent} />일정</div>}
        {actionError && <span className={styles.error} role="alert">{actionError}</span>}
        {movingItem ? <DropCancel cancel={cancelMove} /> : !picking && <div className={styles.floatingActions}>
          <button className={styles.deadlineFab} onClick={() => { setTodoOpen(false); setPicking(true) }} aria-label="기한 추가" title="기한 추가"><CalendarRange size={18} /><span>기한</span></button>
          <button className={styles.todoFab} aria-expanded={todoOpen} onClick={() => setTodoOpen(value => !value)} aria-label="할 일 목록">
            <ListTodo size={19} /><span>할 일</span>{todos.length > 0 && <small>{todos.length}</small>}
          </button>
        </div>}
      </footer>
      {todoOpen && <TodoPanel items={todos} category={category} hidden={Boolean(dragging || clickMoving)}
        close={() => setTodoOpen(false)} add={() => setOverlay({ kind: 'item', date: null })}
        edit={item => editItem(item)} toggle={item => commit([put('items', { ...item, completed: !item.completed })])}
        reorder={(index, offset) => {
          const sorted = [...todos]
          const [item] = sorted.splice(index, 1)
          sorted.splice(index + offset, 0, item)
          commit(sorted.flatMap((value, position) => value.sort_order === position ? [] : [put('items', { ...value, sort_order: position })]))
        }} quickCategory={setAnchor} move={item => setClickMoving(item.id)} />}
      {anchor && <div ref={anchorRef} className={styles.categoryPopover} role="dialog" aria-label="카테고리 변경"
        style={{ left: Math.max(8, Math.min(anchor.x, window.innerWidth - 184)), top: Math.max(8, Math.min(anchor.y, window.innerHeight - 292)) }}>
        {categories.map(value => <button key={value.id} className={styles.categoryChoice}
          style={tint(value.color)} aria-pressed={anchor.item.category_id === value.id} onClick={() => {
            const item = items.find(candidate => candidate.id === anchor.item.id)
            if (item) commit([put('items', { ...item, category_id: value.id })])
            setAnchor(undefined)
          }}>{value.name}</button>)}
      </div>}
      {dialog}
    </main>
    <DragOverlay modifiers={[followPointer]} style={{ width: 'max-content', maxWidth: 180, pointerEvents: 'none' }} dropAnimation={null}>{dragging && movingItem && <div className={styles.dragGhost} data-drag-preview style={tint(category(movingItem.category_id).color)}>
      {movingItem.title}
    </div>}</DragOverlay>
  </DndContext>
}
