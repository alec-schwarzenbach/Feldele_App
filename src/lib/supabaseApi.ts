import { createClient } from '@supabase/supabase-js'
import type { Api } from './api'
import type { Profile } from './types'

// Real backend. Tables use snake_case columns (see supabase/schema.sql);
// rows are converted to the camelCase types used in the UI.

type Row = Record<string, unknown>

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

function fromRow<T>(row: Row): T {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) if (v !== null) out[toCamel(k)] = v
  return out as T
}

function toRow(obj: object): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[toSnake(k)] = v === '' ? null : v
  return out
}

export function createSupabaseApi(url: string, key: string): Api {
  const sb = createClient(url, key)

  async function run<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data as NonNullable<T>
  }
  const list = async <T>(table: string, order = 'created_at'): Promise<T[]> =>
    (await run(sb.from(table).select('*').order(order))).map((r: Row) => fromRow<T>(r))
  const insert = async <T>(table: string, obj: object): Promise<T> =>
    fromRow<T>(await run(sb.from(table).insert(toRow(obj)).select().single()))
  const update = async (table: string, id: string | number, patch: object) => {
    await run(sb.from(table).update(toRow(patch)).eq('id', id))
  }
  const remove = async (table: string, id: string) => {
    await run(sb.from(table).delete().eq('id', id))
  }

  async function profileFor(userId: string | undefined): Promise<Profile | null> {
    if (!userId) return null
    const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
    return data ? fromRow<Profile>(data) : null
  }
  const myId = async () => {
    const { data } = await sb.auth.getUser()
    if (!data.user) throw new Error('Not signed in')
    return data.user.id
  }

  return {
    mode: 'supabase',

    async currentUser() {
      const { data } = await sb.auth.getSession()
      return profileFor(data.session?.user.id)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        // Defer: calling Supabase inside this callback can deadlock.
        setTimeout(() => profileFor(session?.user.id).then(cb), 0)
      })
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message)
    },
    async signUp(name, email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } })
      if (error) throw new Error(error.message)
      if (!data.session) throw new Error('Check your email to confirm your account, then sign in.')
    },
    async signOut() {
      await sb.auth.signOut()
    },

    listProfiles: () => list('profiles', 'name'),
    updateProfile: (id, patch) => update('profiles', id, patch),

    getSettings: async () => fromRow(await run(sb.from('settings').select('*').eq('id', 1).single())),
    updateSettings: (patch) => update('settings', 1, patch),

    listRooms: () => list('rooms', 'name'),
    saveRoom: async ({ id, ...room }) => {
      if (id) await update('rooms', id, room)
      else await insert('rooms', room)
    },
    deleteRoom: (id) => remove('rooms', id),

    listReservations: () => list('reservations', 'start'),
    createReservation: async (r) => insert('reservations', { ...r, userId: await myId() }),
    updateReservation: (id, patch) => update('reservations', id, patch),
    async cancelReservation(id) {
      // late_cancel and cancelled_at are set by a database trigger, so they can't be faked.
      await update('reservations', id, { status: 'cancelled' })
      await run(sb.from('car_bookings').delete().eq('reservation_id', id))
    },

    listCarBookings: () => list('car_bookings', 'start'),
    // Notifications for the car keeper are created by a database trigger.
    createCarBooking: async (b) => {
      await insert('car_bookings', { ...b, userId: await myId() })
    },
    deleteCarBooking: (id) => remove('car_bookings', id),

    listNotifications: async () =>
      (await run(sb.from('notifications').select('*').order('created_at', { ascending: false }))).map((r: Row) => fromRow(r)),
    markNotificationsRead: async () => {
      await run(sb.from('notifications').update({ read: true }).eq('user_id', await myId()).eq('read', false))
    },

    listCatches: () => list('catches', 'caught_at'),
    createCatch: async (c) => {
      await insert('catches', { ...c, userId: await myId() })
    },
    deleteCatch: (id) => remove('catches', id),

    listPosts: () => list('posts'),
    createPost: async (p) => insert('posts', { ...p, userId: await myId() }),
    updatePost: (id, patch) => update('posts', id, { ...patch, updatedAt: new Date().toISOString() }),
    deletePost: (id) => remove('posts', id),
    listComments: async (postId) => {
      let q = sb.from('comments').select('*').order('created_at')
      if (postId) q = q.eq('post_id', postId)
      return (await run(q)).map((r: Row) => fromRow(r))
    },
    addComment: async (postId, body) => {
      await insert('comments', { postId, body, userId: await myId() })
    },
    deleteComment: (id) => remove('comments', id),

    listCosts: () => list('costs', 'year'),
    addCost: async (c) => {
      await insert('costs', c)
    },
    deleteCost: (id) => remove('costs', id),

    async uploadPhoto(blob) {
      const path = `${await myId()}/${crypto.randomUUID()}.jpg`
      const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw new Error(error.message)
      return sb.storage.from('photos').getPublicUrl(path).data.publicUrl
    },
  }
}
