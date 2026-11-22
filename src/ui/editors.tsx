import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { readableDate } from '../calendar'
import { entity, type Category, type DateKey, type Deadline, type Item } from '../data/model'
import styles from './ui.module.css'

export function CategorySelect({ categories, value, change }: { categories: Category[]; value: string; change: (value: string) => void }) {
  return <select aria-label="카테고리" value={value} onChange={event => change(event.target.value)}>
    {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
  </select>
}

export function ItemEditor({ item, date, defaultCategory, categories, save, remove }: {
  item?: Item; date: DateKey | null; defaultCategory: string; categories: Category[]
  save: (item: Item) => Promise<void>; remove: () => void
}) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [hasTime, setHasTime] = useState(Boolean(item?.start_time))
  const [start, setStart] = useState(item?.start_time?.slice(0, 5) ?? '')
  const [end, setEnd] = useState(item?.end_time?.slice(0, 5) ?? '')
  const [day, setDay] = useState(item?.date ?? date ?? '')
  const [category, setCategory] = useState(item?.category_id ?? defaultCategory)
  const [completed, setCompleted] = useState(item?.completed ?? false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!title.trim()) { setError('제목을 입력하세요.'); return }
    if (hasTime && end && (!start || end < start)) { setError('종료 시간은 시작 시간 이후로 지정하세요.'); return }
    setSaving(true)
    try {
      await save({
        ...(item ?? entity()), title: title.trim(), date: day || null,
        start_time: hasTime ? start || null : null, end_time: hasTime ? end || null : null,
        category_id: category, completed, sort_order: item?.sort_order ?? Date.now(),
      })
    } catch {
      setError('저장하지 못했습니다. 다시 시도하세요.')
      setSaving(false)
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <label>제목<input data-focus autoComplete="off" value={title} onChange={event => setTitle(event.target.value)} placeholder="제목을 입력하세요" required /></label>
    {item ? <label>날짜<input type="date" value={day} onChange={event => setDay(event.target.value)} /></label>
      : day && <span className={styles.subtle}>{readableDate(day)}</span>}
    <label>카테고리<CategorySelect categories={categories} value={category} change={setCategory} /></label>
    <label className={styles.check}><input type="checkbox" checked={hasTime} onChange={event => setHasTime(event.target.checked)} /> 시간 지정</label>
    {hasTime && <div className={styles.fieldRow}>
      <label>시작 시간<input type="time" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>종료 시간<input type="time" value={end} onChange={event => setEnd(event.target.value)} /></label>
    </div>}
    {item && <label className={styles.check}><input type="checkbox" checked={completed} onChange={event => setCompleted(event.target.checked)} /> 완료</label>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.formFooter}>
      {item && <button className={styles.danger} type="button" onClick={remove}><Trash2 size={15} /> 삭제</button>}
      <button className={styles.primary} type="submit" disabled={saving}>저장</button>
    </div>
  </form>
}

export function DeadlineEditor({ existing, initialStart, initialEnd, categories, defaultCategory, save, remove }: {
  existing?: Deadline; initialStart: DateKey; initialEnd: DateKey; categories: Category[]; defaultCategory: string
  save: (deadline: Deadline) => Promise<void>; remove: () => void
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [category, setCategory] = useState(existing?.category_id ?? defaultCategory)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault()
    if (saving) return
    if (!start || !end || end < start || !title.trim()) { setError('제목과 올바른 시작일 및 종료일을 입력하세요.'); return }
    setSaving(true)
    try {
      await save({ ...(existing ?? entity()), title: title.trim(), start_date: start, end_date: end, category_id: category })
    } catch {
      setError('기한을 저장하지 못했습니다. 다시 시도하세요.')
      setSaving(false)
    }
  }}>
    <label>제목<input data-focus value={title} onChange={event => setTitle(event.target.value)} required /></label>
    <div className={styles.fieldRow}>
      <label>시작일<input type="date" value={start} onChange={event => setStart(event.target.value)} required /></label>
      <label>종료일<input type="date" min={start} value={end} onChange={event => setEnd(event.target.value)} required /></label>
    </div>
    <label>카테고리<CategorySelect categories={categories} value={category} change={setCategory} /></label>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.formFooter}>
      {existing && <button className={styles.danger} type="button" onClick={remove}><Trash2 size={15} /> 삭제</button>}
      <button className={styles.primary} type="submit" disabled={saving}>저장</button>
    </div>
  </form>
}
