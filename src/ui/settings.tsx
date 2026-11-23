import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, GripVertical, Plus, Trash2, Upload } from 'lucide-react'
import { decodeBackup, encodeBackup, replaceChanges } from '../data/backup'
import { backlogShortcutKeys, calendarFontSizes, defaultBacklogShortcutKey, entity, put, todoFontSizes, type Appearance, type Category, type Change, type Records, type Settings, type WeekStart } from '../data/model'
import { CategorySelect } from './editors'
import styles from './ui.module.css'

const appearances: Array<[Appearance, string]> = [
  ['system', '시스템'], ['light', '라이트'], ['dark', '다크'],
  ['ivory', '아이보리'], ['plum', '자주'], ['charcoal', '차콜'],
]

function CategoryRow({ category, save, remove, removable, moveUp, moveDown, pick, picked, destination }: {
  category: Category; save: (category: Category) => void; remove: () => void; removable: boolean
  moveUp?: () => void; moveDown?: () => void
  pick: () => void; picked: boolean; destination: boolean
}) {
  return <div className={styles.categoryRow}>
    <input type="color" aria-label={`${category.name} 색상`} value={category.color}
      onChange={event => save({ ...category, color: event.target.value })} />
    <input key={category.name} aria-label={`${category.name} 이름`} defaultValue={category.name}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
      onBlur={event => {
        const name = event.currentTarget.value.trim()
        event.currentTarget.value = name || category.name
        if (name && name !== category.name) save({ ...category, name })
      }} />
    <button className={styles.rowIcon} aria-label={destination ? `${category.name} 위치에 놓기` : `${category.name} 순서 이동`}
      aria-pressed={picked} onClick={pick}><GripVertical size={15} /></button>
    <button className={styles.rowIcon} disabled={!moveUp} aria-label={`${category.name} 위로`} onClick={moveUp}><ArrowUp size={15} /></button>
    <button className={styles.rowIcon} disabled={!moveDown} aria-label={`${category.name} 아래로`} onClick={moveDown}><ArrowDown size={15} /></button>
    <button className={styles.rowIcon} disabled={!removable} aria-label={`${category.name} 삭제`} onClick={remove}><Trash2 size={15} /></button>
  </div>
}

export function SettingsPanel({ records, settings, apply, logout }: {
  records: Records; settings: Settings; apply: (changes: Change[]) => Promise<void>; logout?: () => void
}) {
  const [name, setName] = useState('')
  const [movingCategory, setMovingCategory] = useState<string>()
  const [notice, setNotice] = useState('')
  const [backup, setBackup] = useState<Records>()
  const file = useRef<HTMLInputElement>(null)
  const { categories, items } = records
  const sampleChanges = items.filter(row => row.id.startsWith('demo-'))
    .map(({ id }): Change => ({ collection: 'items', id, value: null }))

  function save(changes: Change[]) {
    void apply(changes).catch(() => setNotice('설정을 저장하지 못했습니다.'))
  }

  function removeCategory(id: string) {
    const fallback = categories.find(category => category.id === settings.default_category_id && category.id !== id)
      ?? categories.find(category => category.id !== id)
    if (!fallback) return
    save([
      ...items.filter(item => item.category_id === id).map(item => put('items', { ...item, category_id: fallback.id })),
      ...(settings.default_category_id === id || settings.category_order?.includes(id)
        ? [put('settings', { ...settings,
          default_category_id: settings.default_category_id === id ? fallback.id : settings.default_category_id,
          category_order: settings.category_order?.filter(categoryId => categoryId !== id),
        })] : []),
      { collection: 'categories', id, value: null },
    ])
  }

  function reorderCategory(from: number, to: number) {
    const category_order = categories.map(category => category.id)
    const [id] = category_order.splice(from, 1)
    category_order.splice(to, 0, id)
    save([put('settings', { ...settings, category_order })])
  }

  function setAppearance(value: Appearance) {
    const next: Settings = value === 'system' || value === 'light' || value === 'dark'
      ? { ...settings, theme: value, calendar_style: undefined }
      : { ...settings, theme: value === 'charcoal' ? 'dark' : 'light', calendar_style: value }
    save([put('settings', next)])
  }

  return <div className={styles.settings}>
    <div className={styles.appearance}>
      <h3 id="appearance-title">캘린더 스타일</h3>
      <div className={styles.appearanceOptions} role="group" aria-labelledby="appearance-title">
        {appearances.map(([value, label]) => <button key={value} className={styles.appearanceOption}
          data-palette={value} aria-pressed={(settings.calendar_style ?? settings.theme) === value} onClick={() => setAppearance(value)}>
          <span aria-hidden="true" /><strong>{label}</strong>
        </button>)}
      </div>
    </div>
    <div className={styles.fieldRow}>
      <label>달력 일정 글자 크기<select value={settings.calendar_font_size ?? ''}
        onChange={event => save([put('settings', { ...settings,
          calendar_font_size: (Number(event.target.value) || undefined) as Settings['calendar_font_size'],
        })])}>
        <option value="">자동</option>{calendarFontSizes.map(size => <option key={size} value={size}>{size}px</option>)}
      </select></label>
      <label>할 일 글자 크기<select value={settings.todo_font_size ?? 14}
        onChange={event => save([put('settings', { ...settings, todo_font_size: Number(event.target.value) as Settings['todo_font_size'] })])}>
        {todoFontSizes.map(size => <option key={size} value={size}>{size}px</option>)}
      </select></label>
    </div>
    <label>주 시작 요일<select value={settings.week_start} onChange={event => save([put('settings', { ...settings, week_start: Number(event.target.value) as WeekStart })])}>
      <option value={1}>월요일</option><option value={0}>일요일</option>
    </select></label>
    <label>미정 목록 단축키<select value={settings.backlog_shortcut_key ?? defaultBacklogShortcutKey}
      onChange={event => save([put('settings', { ...settings, backlog_shortcut_key: event.target.value })])}>
      {backlogShortcutKeys.map(key => <option key={key} value={key}>Alt+{key}</option>)}
    </select></label>
    <section><h3>카테고리</h3>
      <label>기본 카테고리<CategorySelect categories={categories} value={settings.default_category_id}
        change={default_category_id => save([put('settings', { ...settings, default_category_id })])} /></label>
      {categories.map((category, index) => <CategoryRow key={category.id} category={category} removable={categories.length > 1}
        picked={movingCategory === category.id} destination={!!movingCategory && movingCategory !== category.id}
        pick={() => {
          if (!movingCategory) { setMovingCategory(category.id); return }
          const from = categories.findIndex(value => value.id === movingCategory)
          if (from >= 0 && from !== index) reorderCategory(from, index)
          setMovingCategory(undefined)
        }}
        moveUp={!movingCategory && index > 0 ? () => reorderCategory(index, index - 1) : undefined}
        moveDown={!movingCategory && index < categories.length - 1 ? () => reorderCategory(index, index + 1) : undefined}
        save={value => save([put('categories', value)])} remove={() => removeCategory(category.id)} />)}
      <form className={styles.categoryRow} onSubmit={event => {
        event.preventDefault()
        if (!name.trim()) return
        save([put('categories', { ...entity(), name: name.trim(), color: '#697588' })])
        setName('')
      }}>
        <input aria-label="새 카테고리 이름" placeholder="새 카테고리 이름" value={name} onChange={event => setName(event.target.value)} required />
        <button className={styles.secondary}><Plus size={15} /> 추가</button>
      </form>
    </section>
    <section><h3>데이터</h3>
      <div className={styles.buttonRow}>
        <button className={styles.secondary} onClick={() => {
          const url = URL.createObjectURL(new Blob([encodeBackup(records)], { type: 'application/json' }))
          const link = document.createElement('a')
          link.href = url
          link.download = 'monthline-backup.json'
          link.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}><Download size={15} /> JSON 내보내기</button>
        <button className={styles.secondary} onClick={() => file.current?.click()}><Upload size={15} /> JSON 가져오기</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={async event => {
        const selected = event.target.files?.[0]
        event.target.value = ''
        setBackup(undefined)
        setNotice('')
        if (!selected) return
        try { setBackup(decodeBackup(await selected.text())) }
        catch { setNotice('백업 파일을 읽을 수 없습니다. Monthline JSON을 선택하세요.') }
      }} />
      {backup && <div className={styles.restore}>
        <p>현재 데이터를 백업 파일의 데이터로 교체할까요?</p>
        <button className={styles.secondary} onClick={() => setBackup(undefined)}>취소</button>
        <button className={styles.danger} onClick={() => {
          void apply(replaceChanges(records, backup)).then(() => {
            setBackup(undefined)
            setNotice('백업을 복원했습니다.')
          }).catch(() => setNotice('복원하지 못했습니다.'))
        }}>데이터 복원</button>
      </div>}
      {notice && <p role="status">{notice}</p>}
      {!logout && sampleChanges.length > 0 && <button className={styles.secondary} onClick={() => save(sampleChanges)}>예시 일정과 할 일 지우기</button>}
      {logout && <button className={styles.secondary} onClick={logout}>로그아웃</button>}
    </section>
  </div>
}
