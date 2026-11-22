import { useRef, useState } from 'react'
import { Download, Plus, Trash2, Upload } from 'lucide-react'
import { decodeBackup, encodeBackup, replaceChanges } from '../data/backup'
import { entity, put, type Category, type Change, type Records, type Settings, type Theme, type WeekStart } from '../data/model'
import { CategorySelect } from './editors'
import styles from './ui.module.css'

function CategoryRow({ category, save, remove, removable }: {
  category: Category; save: (category: Category) => void; remove: () => void; removable: boolean
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
    <button className={styles.icon} disabled={!removable} aria-label={`${category.name} 삭제`} onClick={remove}><Trash2 size={15} /></button>
  </div>
}

export function SettingsPanel({ records, settings, apply, logout }: {
  records: Records; settings: Settings; apply: (changes: Change[]) => Promise<void>; logout?: () => void
}) {
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [backup, setBackup] = useState<Records>()
  const file = useRef<HTMLInputElement>(null)
  const { categories, items, deadlines } = records
  const sampleChanges = ([['items', items], ['deadlines', deadlines]] as const).flatMap(([collection, rows]) => rows
    .filter(row => row.id.startsWith('demo-')).map(row => ({ collection, id: row.id, value: null } as Change)))

  function save(changes: Change[]) {
    void apply(changes).catch(() => setNotice('설정을 저장하지 못했습니다.'))
  }

  function removeCategory(id: string) {
    const fallback = categories.find(category => category.id === settings.default_category_id && category.id !== id)
      ?? categories.find(category => category.id !== id)
    if (!fallback) return
    save([
      ...items.filter(item => item.category_id === id).map(item => put('items', { ...item, category_id: fallback.id })),
      ...deadlines.filter(deadline => deadline.category_id === id).map(deadline => put('deadlines', { ...deadline, category_id: fallback.id })),
      ...(settings.default_category_id === id ? [put('settings', { ...settings, default_category_id: fallback.id })] : []),
      { collection: 'categories', id, value: null },
    ])
  }

  return <div className={styles.settings}>
    <div className={styles.fieldRow}>
      <label>테마<select value={settings.theme} onChange={event => save([put('settings', { ...settings, theme: event.target.value as Theme })])}>
        <option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option>
      </select></label>
      <label>주 시작 요일<select value={settings.week_start} onChange={event => save([put('settings', { ...settings, week_start: Number(event.target.value) as WeekStart })])}>
        <option value={1}>월요일</option><option value={0}>일요일</option>
      </select></label>
    </div>
    <section><h3>카테고리</h3>
      <label>기본 카테고리<CategorySelect categories={categories} value={settings.default_category_id}
        change={default_category_id => save([put('settings', { ...settings, default_category_id })])} /></label>
      {categories.map(category => <CategoryRow key={category.id} category={category} removable={categories.length > 1}
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
