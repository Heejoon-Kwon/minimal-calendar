import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { parseClock, readableDate } from '../calendar'
import { entity, type Category, type DateKey, type Item } from '../data/model'
import styles from './ui.module.css'

export function CategorySelect({ categories, value, change }: { categories: Category[]; value: string; change: (value: string) => void }) {
  return <select aria-label="카테고리" value={value} onChange={event => change(event.target.value)}>
    {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
  </select>
}

export function ItemEditor({ item, date, rangeEnd, rangeDraft, defaultCategory, categories, save, remove, showDate }: {
  item?: Item; date: DateKey | null; rangeEnd?: DateKey; rangeDraft?: boolean; defaultCategory: string; categories: Category[]
  save: (item: Item) => Promise<void>; remove: () => void; showDate?: () => void
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [hasTime, setHasTime] = useState(Boolean(item?.start_time))
  const [start, setStart] = useState(item?.start_time?.slice(0, 5) ?? '')
  const [end, setEnd] = useState(item?.end_time?.slice(0, 5) ?? '')
  const [day, setDay] = useState(item?.date ?? date ?? '')
  const [category, setCategory] = useState(item?.category_id ?? defaultCategory)
  const [lastDay, setLastDay] = useState(item?.end_date ?? rangeEnd ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!title.trim()) { setError('제목을 입력하세요.'); return }
    const startTime = hasTime && start.trim() ? parseClock(start) : undefined
    const endTime = hasTime && end.trim() ? parseClock(end) : undefined
    if ((hasTime && start.trim() && !startTime) || (hasTime && end.trim() && !endTime)) {
      setError('시간을 24시간제로 입력하세요. 예: 09:30, 1830')
      return
    }
    if (lastDay && day && lastDay < day) { setError('종료 날짜를 확인하세요.'); return }
    if (endTime && (!startTime || endTime < startTime)) { setError('종료 시간은 시작 시간 이후로 지정하세요.'); return }
    setSaving(true)
    try {
      await save({
        ...(item ?? entity()), title: title.trim(), date: day || null,
        end_date: day && lastDay > day ? lastDay : undefined,
        start_time: startTime ?? null, end_time: endTime ?? null,
        category_id: category, completed: false, sort_order: item?.sort_order ?? Date.now(),
      })
    } catch {
      setError('저장하지 못했습니다. 다시 시도하세요.')
      setSaving(false)
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <label>제목<input data-focus autoComplete="off" value={title} onChange={event => setTitle(event.target.value)} placeholder="제목을 입력하세요" required /></label>
    {item ? <div className={styles.fieldRow}>
      <label>날짜<input type="date" value={day} onChange={event => {
        setDay(event.target.value)
        if (!event.target.value || lastDay < event.target.value) setLastDay('')
      }} /></label>
      {day && <label>종료 날짜<input type="date" value={lastDay} min={day} onChange={event => setLastDay(event.target.value)} /></label>}
    </div> : day && <>
      <span className={styles.subtle}>{readableDate(day)}{!rangeDraft && lastDay > day && ` ~ ${readableDate(lastDay)}`}</span>
      {rangeDraft && <label>종료 날짜<input type="date" value={lastDay} min={day} required onChange={event => setLastDay(event.target.value)} /></label>}
    </>}
    <label>카테고리<CategorySelect categories={categories} value={category} change={setCategory} /></label>
    <label className={styles.check}><input type="checkbox" checked={hasTime} onChange={event => setHasTime(event.target.checked)} /> 시간 지정</label>
    {hasTime && <div className={styles.fieldRow}>
      <label>시작 시간<input inputMode="numeric" placeholder="09:00" maxLength={5} value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>종료 시간<input inputMode="numeric" placeholder="18:00" maxLength={5} value={end} onChange={event => setEnd(event.target.value)} /></label>
    </div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.formFooter}>
      {showDate && <button className={styles.secondary} type="button" onClick={showDate}>이 날짜 일정</button>}
      {item && <button className={styles.danger} type="button" onClick={remove}><Trash2 size={15} /> 삭제</button>}
      <button className={styles.primary} type="submit" disabled={saving}>저장</button>
    </div>
  </form>
}
