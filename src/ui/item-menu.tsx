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
    if (event.key !== 'Escape') return
    event.stopPropagation()
    close()
    if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus({ preventScroll: true })
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
