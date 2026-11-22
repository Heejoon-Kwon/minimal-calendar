import { openDB, type DBSchema } from 'idb'
import { collectionNames, initialRecords, put, type Change, type Records } from './model'

export interface RepositoryState {
  records: Records
  pending: number
}

export interface Repository {
  read(): Promise<RepositoryState>
  apply(changes: Change[]): Promise<RepositoryState>
  sync(): Promise<RepositoryState>
  watch(listener: () => void): () => void
}

export type Mutation = Change & { stamp: string; operation: string }
export interface Remote {
  read(): Promise<Mutation[]>
  apply(changes: Mutation[]): Promise<void>
  watch(listener: () => void): () => void
}

interface Cache {
  rows: Record<string, Mutation>
  pending: Mutation[]
  changedAt: number
}

interface CalendarDB extends DBSchema {
  calendars: { key: string; value: Cache }
}

const rowKey = (change: Pick<Change, 'collection' | 'id'>) => `${change.collection}/${change.id}`
const compare = (a: Mutation, b: Mutation) => a.stamp.localeCompare(b.stamp) || a.operation.localeCompare(b.operation)

function merge(cache: Cache, changes: Mutation[]) {
  for (const change of changes) {
    const key = rowKey(change)
    const existing = cache.rows[key]
    if (!existing || compare(existing, change) < 0) cache.rows[key] = change
    cache.changedAt = Math.max(cache.changedAt, Date.parse(change.stamp))
  }
}

function snapshot(cache: Cache): RepositoryState {
  const records: Records = { categories: [], settings: [], items: [], deadlines: [] }
  for (const row of Object.values(cache.rows)) {
    if (!row.value) continue
    switch (row.collection) {
      case 'categories': records.categories.push(row.value); break
      case 'items': records.items.push(row.value); break
      case 'deadlines': records.deadlines.push(row.value); break
      case 'settings': records.settings.push(row.value); break
    }
  }
  records.categories.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const settings = records.settings[0]
  if (settings) {
    // Concurrent offline category edits can leave live records pointing at a tombstone.
    if (!records.categories.length) {
      records.categories.push({ ...initialRecords().categories[0], id: settings.default_category_id })
    }
    const categories = new Set(records.categories.map(category => category.id))
    if (!categories.has(settings.default_category_id)) {
      records.settings[0] = { ...settings, default_category_id: records.categories[0].id }
    }
    const fallback = records.settings[0].default_category_id
    records.items = records.items.map(item => categories.has(item.category_id) ? item : { ...item, category_id: fallback })
    records.deadlines = records.deadlines.map(deadline => categories.has(deadline.category_id)
      ? deadline : { ...deadline, category_id: fallback })
  }
  return { records, pending: cache.pending.length }
}

export function recordsToChanges(records: Records): Change[] {
  return collectionNames.flatMap(collection => records[collection].map(value => put(collection, value)))
}

export class IndexedRepository implements Repository {
  private database
  private channel?: BroadcastChannel
  private syncing?: Promise<RepositoryState>

  constructor(private scope: string, private seed: () => Records = initialRecords, private remote?: Remote,
    databaseName = 'monthline-v1') {
    this.database = openDB<CalendarDB>(databaseName, 1, { upgrade: db => db.createObjectStore('calendars') })
  }

  private async update(transform: (cache: Cache) => void = () => undefined): Promise<Cache> {
    const db = await this.database
    const transaction = db.transaction('calendars', 'readwrite')
    const existing = await transaction.store.get(this.scope)
    const cache = existing ?? { rows: {}, pending: [], changedAt: 0 }
    if (!existing && !this.remote) this.mutate(cache, recordsToChanges(this.seed()))
    transform(cache)
    await transaction.store.put(cache, this.scope)
    await transaction.done
    return cache
  }

  private mutate(cache: Cache, changes: Change[], initializing = false) {
    const stamp = initializing ? '2000-01-01T00:00:00.000Z' : new Date(Math.max(Date.now(), cache.changedAt + 1)).toISOString()
    const mutations = changes.map(change => ({
      ...change,
      value: change.value ? { ...change.value, updated_at: stamp } : null,
      stamp,
      operation: crypto.randomUUID(),
    })) as Mutation[]
    merge(cache, mutations)
    if (this.remote) cache.pending.push(...mutations)
  }

  async read(): Promise<RepositoryState> {
    return snapshot(await this.update())
  }

  async apply(changes: Change[]): Promise<RepositoryState> {
    const cache = await this.update(state => this.mutate(state, changes))
    this.channel?.postMessage('change')
    return snapshot(cache)
  }

  sync(): Promise<RepositoryState> {
    if (!this.remote) return this.read()
    if (!this.syncing) this.syncing = this.syncRemote(this.remote).finally(() => { this.syncing = undefined })
    return this.syncing
  }

  private async syncRemote(remote: Remote): Promise<RepositoryState> {
    let cache = await this.update()
    if (Object.keys(cache.rows).length === 0) {
      const server = await remote.read()
      cache = await this.update(state => {
        merge(state, server)
        if (Object.keys(state.rows).length === 0) this.mutate(state, recordsToChanges(this.seed()), true)
      })
    }

    // Preserve transaction boundaries for writes that change references alongside their targets.
    while (cache.pending.length) {
      const stamp = cache.pending[0].stamp
      const batch = cache.pending.filter(change => change.stamp === stamp)
      await remote.apply(batch)
      const acknowledged = new Set(batch.map(change => change.operation))
      cache = await this.update(state => {
        state.pending = state.pending.filter(change => !acknowledged.has(change.operation))
      })
    }
    const server = await remote.read()
    return snapshot(await this.update(state => merge(state, server)))
  }

  watch(listener: () => void): () => void {
    this.channel = new BroadcastChannel(`monthline:${this.scope}`)
    this.channel.addEventListener('message', listener)
    const unwatch = this.remote?.watch(listener)
    return () => {
      unwatch?.()
      this.channel?.close()
      this.channel = undefined
    }
  }
}
