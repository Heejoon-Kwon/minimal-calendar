import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { demoRecords } from './data/demo'
import { IndexedRepository } from './data/repository'
import { configError, offlineUserId, remoteScope, supabase, supabaseRemote } from './data/supabase'
import { App, Brand } from './ui/app'
import styles from './ui/ui.module.css'

function AuthenticatedApp({ userId }: { userId: string }) {
  const [error, setError] = useState('')
  const repository = useMemo(() => new IndexedRepository(`${remoteScope}:${userId}`, undefined, supabaseRemote(supabase!, userId)), [userId])
  return <>
    <App repository={repository} logout={() => {
      void supabase!.auth.signOut({ scope: 'local' }).then(({ error }) => {
        if (error) setError('로그아웃하지 못했습니다. 연결을 확인하고 다시 시도하세요.')
      })
    }} />
    {error && <div role="alert" className={styles.logoutError}>{error}</div>}
  </>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  return <main className={styles.center}>
    <Brand />
    <form className={styles.loginForm} onSubmit={async event => {
      event.preventDefault()
      setPending(true)
      setError('')
      try {
        const { error } = await supabase!.auth.signInWithPassword({ email, password })
        if (error) setError('로그인하지 못했습니다. 이메일, 비밀번호 및 연결을 확인하세요.')
      } catch {
        setError('로그인 서버에 연결하지 못했습니다.')
      } finally { setPending(false) }
    }}>
      <label>이메일<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
      <label>비밀번호<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="submit" className={styles.primary} disabled={pending}>로그인</button>
    </form>
  </main>
}

function Root() {
  const [userId, setUserId] = useState<string | null | undefined>(offlineUserId)
  const local = useMemo(() => supabase || configError ? null : new IndexedRepository('local', demoRecords), [])
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUserId(null)
      else setUserId(session?.user.id ?? offlineUserId() ?? null)
    })
    const reconnect = async () => {
      const { data, error } = await client.auth.getSession()
      if (active && !isAuthRetryableFetchError(error)) setUserId(data.session?.user.id ?? null)
    }
    window.addEventListener('online', reconnect)
    return () => {
      active = false
      window.removeEventListener('online', reconnect)
      data.subscription.unsubscribe()
    }
  }, [])
  if (configError) return <main className={styles.center}><Brand /><p role="alert">Supabase URL과 sb_publishable_ 키를 확인하세요.</p></main>
  if (local) return <App repository={local} />
  if (!userId) return userId === undefined ? <main className={styles.center}><Brand /><p>로그인 상태 확인 중…</p></main> : <Login />
  return <AuthenticatedApp key={userId} userId={userId} />
}

createRoot(document.getElementById('root')!).render(<Root />)
