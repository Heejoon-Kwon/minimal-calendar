import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './ui.module.css'

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    dialog?.querySelector<HTMLElement>('[data-focus]')?.focus()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className={styles.dialog} aria-label={title}
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === ref.current) close() }}>
    <div className={styles.dialogContent}>
      <div className={styles.panelHeading}><h2>{title}</h2><button className={styles.icon} aria-label="닫기" onClick={close}><X size={18} /></button></div>
      {children}
    </div>
  </dialog>
}
