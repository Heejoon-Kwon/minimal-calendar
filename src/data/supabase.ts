import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { collectionNames } from './model'
import type { Mutation, Remote } from './repository'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

function validUrl(value: string | undefined) {
  if (!value) return false
  try { return ['https:', 'http:'].includes(new URL(value).protocol) }
  catch { return false }
}

export const configError = Boolean(url || key) && (!validUrl(url) || !key?.startsWith('sb_publishable_'))
export const remoteScope = url ? `supabase:${url.replace(/\/$/, '')}` : ''
const storageKey = `monthline-auth:${remoteScope}`
export const supabase = url && key && !configError
  ? createClient(url, key, { auth: { storageKey, persistSession: true, autoRefreshToken: true } })
  : null

export function offlineUserId(): string | undefined {
  if (!supabase || navigator.onLine) return
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return
    const session = JSON.parse(stored)
    if (typeof session?.user?.id === 'string' && session.access_token && session.refresh_token) {
      return session.user.id
    }
  } catch {
    // Storage may be unavailable in the browser.
  }
}

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async read() {
      const { data, error } = await client.rpc('calendar_snapshot')
      if (error) throw error
      return (data ?? []) as Mutation[]
    },
    async apply(changes) {
      const { error } = await client.rpc('apply_calendar_changes', { changes })
      if (error) throw error
    },
    watch(listener) {
      const channel = client.channel(`calendar:${userId}`)
      for (const table of collectionNames) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, listener)
      }
      channel.subscribe(status => { if (status === 'SUBSCRIBED') listener() })
      return () => { void client.removeChannel(channel) }
    },
  }
}
