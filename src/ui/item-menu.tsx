import { useEffect, useRef, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import styles from './ui.module.css'

export function ItemMenu({ x, y, label, remove, close, children }: {
  x: number; y: number; label: string; remove: () => void; close: () => void; children?: ReactNode
}) {
  const menu = useRef<HTMLDivElement>(null)
  const previousFocus = useRef(document.activeElement)
  useEffect(() => { menu.current?.querySelector('button')?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [close])

  return <div ref={menu} className={styles.categoryPopover} role="dialog" aria-label={label} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus({ preventScroll: true })
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if (!buttons.length) return
    event.preventDefault()
    const current = buttons.findIndex(button => button === document.activeElement)
    const last = buttons.length - 1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
      : event.key === 'ArrowDown' ? (current + 1) % buttons.length
      : current <= 0 ? last : current - 1
    buttons[next].focus({ preventScroll: true })
    buttons[next].scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }}
    style={{
      left: Math.max(8, Math.min(x, window.innerWidth - 184)),
      top: Math.max(8, Math.min(y, window.innerHeight - (children ? 292 : 56))),
    }}>
    {children && <div className={styles.categoryOptions}>{children}</div>}
    <button className={`${styles.categoryChoice} ${styles.menuDelete}`} onClick={remove}>
      <Trash2 size={14} /> 삭제
    </button>
  </div>
}
