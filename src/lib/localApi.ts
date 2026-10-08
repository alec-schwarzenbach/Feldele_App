import type { Api } from './api'
import { addDays, formatDay, today } from './dates'
import type {
  AppNotification,
  CarBooking,
  Catch,
  Comment,
  CostEntry,
  Post,
  Profile,
  Reservation,
  Room,
  Settings,
} from './types'
import { isAdmin, isOwner } from './types'
import { priorityUserFor, stayYear } from './rules'

// Demo backend: keeps everything in localStorage so the app can be tried
// without any server. Each browser/phone has its own separate copy.

interface DB {
  version: number
  profiles: (Profile & { password: string })[]
  rooms: Room[]
  reservations: Reservation[]
  carBookings: CarBooking[]
  notifications: AppNotification[]
  catches: Catch[]
  posts: Post[]
  comments: Comment[]
  costs: CostEntry[]
  settings: Settings
}

const KEY = 'lodge-demo-db'
const SESSION = 'lodge-demo-session'
const VERSION = 3

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function seed(): DB {
  const t = today()
  const y = Number(t.slice(0, 4))
  const p = (id: string, name: string, email: string, role: Profile['role'], family?: string) => ({
    id, name, email, role, family, password: 'demo',
  })
  const res = (
    id: string, userId: string, startOffset: number, nights: number, people: number,
    roomIds: string[], extra: Partial<Reservation> = {},
  ): Reservation => ({
    id, userId, start: addDays(t, startOffset), end: addDays(t, startOffset + nights), people, roomIds,
    status: 'active', createdAt: now(), ...extra,
  })
  return {
    version: VERSION,
    profiles: [
      p('u-alec', 'Alec', 'alec@lodge.test', 'owner', 'Schwarzenbach'),
      p('u-maria', 'Maria', 'maria@lodge.test', 'member', 'Huber'),
      p('u-thomas', 'Thomas', 'thomas@lodge.test', 'member', 'Gruber'),
      p('u-gunther', 'Günter Kobalt', 'guenther@lodge.test', 'car_keeper'),
    ],
    rooms: [
      { id: 'r-1', name: 'Big bedroom', beds: 2 },
      { id: 'r-2', name: 'Bunk room', beds: 4 },
      { id: 'r-3', name: 'Attic', beds: 3 },
      { id: 'r-4', name: 'Living room sofa', beds: 2 },
    ],
    reservations: [
      res('res-1', 'u-maria', -60, 5, 4, ['r-1', 'r-2']),
      res('res-2', 'u-alec', -30, 3, 2, ['r-1']),
      res('res-3', 'u-thomas', -20, 2, 8, ['r-1', 'r-2', 'r-3'], { occasion: "Thomas' 40th birthday" }),
      res('res-4', 'u-alec', -10, 4, 3, ['r-3']),
      res('res-5', 'u-maria', 12, 4, 2, ['r-1']),
      res('res-6', 'u-thomas', 150, 7, 5, ['r-2', 'r-3']),
    ],
    carBookings: [
      { id: 'car-1', userId: 'u-maria', reservationId: 'res-5', start: addDays(t, 12), end: addDays(t, 16), createdAt: now() },
    ],
    notifications: [
      {
        id: uid(), userId: 'u-gunther', kind: 'car', title: 'Car needed: Maria', read: false, createdAt: now(),
        body: `Maria needs the car from ${formatDay(addDays(t, 12), true)} to ${formatDay(addDays(t, 16), true)}.`,
      },
    ],
    catches: [
      { id: uid(), userId: 'u-alec', species: 'Pike', lengthCm: 78, weightKg: 4.2, lat: 47.512, lng: 13.995, caughtAt: addDays(t, -9), reason: 'starving', bait: 'Spinner', createdAt: now() },
      { id: uid(), userId: 'u-thomas', species: 'Brown trout', lengthCm: 41, lat: 47.498, lng: 14.012, caughtAt: addDays(t, -19), reason: 'injured', bait: 'Worm', note: 'Right below the old bridge', createdAt: now() },
      { id: uid(), userId: 'u-maria', species: 'Perch', lengthCm: 28, lat: 47.505, lng: 13.981, caughtAt: addDays(t, -58), reason: 'starving', createdAt: now() },
    ],
    posts: [
      {
        id: 'post-1', userId: 'u-maria', category: 'restaurant', title: 'Gasthof zur Post – new owners',
        body: 'Reopened in spring. Great Schnitzel, fair prices, kids menu. Closed Mondays.', rating: 5,
        createdAt: now(), updatedAt: now(),
      },
      {
        id: 'post-2', userId: 'u-thomas', category: 'trip', title: 'Hike to the upper lake',
        body: 'About 2.5 h from the lodge. Start at the parking lot behind the church. Bring water, no hut on the way.',
        createdAt: now(), updatedAt: now(),
      },
      {
        id: 'post-3', userId: 'u-alec', category: 'tip', title: 'Water heater',
        body: 'Switch on the boiler when you arrive – it needs ~2 h. Switch it off when leaving!',
        createdAt: now(), updatedAt: now(),
      },
    ],
    comments: [
      { id: uid(), postId: 'post-1', userId: 'u-alec', body: 'Confirmed, we were there last month. Book ahead on weekends.', createdAt: now() },
    ],
    costs: [
      { id: uid(), year: y, category: 'rent', amount: 4800, note: 'Annual lease' },
      { id: uid(), year: y, category: 'electricity', amount: 960 },
      { id: uid(), year: y, category: 'supplies', amount: 340, note: 'Firewood, cleaning' },
    ],
    settings: {
      freeCancelMonths: 4, currency: 'EUR', lodgeName: 'Feldele', lodgeLat: 47.505, lodgeLng: 14.0,
      families: ['Schwarzenbach', 'Huber', 'Gruber'],
      priorityOrder: ['u-maria', 'u-thomas', 'u-alec'], priorityStartYear: y,
    },
  }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const db = JSON.parse(raw) as DB
      if (db.version === VERSION) return db
    }
  } catch {
    /* fall through to seed */
  }
  const db = seed()
  save(db)
  return db
}

function save(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch (e) {
    throw new Error('Demo storage is full – try smaller photos or reset demo data. ' + String(e))
  }
}

export function resetDemoData() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(SESSION)
}

export function createLocalApi(): Api {
  let db = load()
  const listeners = new Set<(u: Profile | null) => void>()
  const strip = ({ password: _pw, ...p }: DB['profiles'][number]): Profile => p
  const sessionUser = () => {
    const id = localStorage.getItem(SESSION)
    const p = db.profiles.find((x) => x.id === id)
    return p ? strip(p) : null
  }
  const me = () => {
    const u = sessionUser()
    if (!u) throw new Error('Not signed in')
    return u
  }
  // Same permission rules the real database enforces (see firestore.rules).
  const requireAdmin = () => {
    if (!isAdmin(me())) throw new Error('Only admins can do this')
  }
  const commit = <T>(fn: () => T): Promise<T> => {
    const result = fn()
    save(db)
    return Promise.resolve(result)
  }
  const change = (fn: () => unknown): Promise<void> => commit(() => void fn())
  const emit = () => listeners.forEach((l) => l(sessionUser()))
  const ok = <T>(v: T) => Promise.resolve(structuredClone(v))
  const notifyCarKeepers = (b: CarBooking) => {
    const who = db.profiles.find((p) => p.id === b.userId)?.name ?? 'Someone'
    for (const keeper of db.profiles.filter((p) => p.role === 'car_keeper')) {
      db.notifications.push({
        id: uid(), userId: keeper.id, kind: 'car', read: false, createdAt: now(),
        title: `Car needed: ${who}`,
        body: `${who} needs the car from ${formatDay(b.start, true)} to ${formatDay(b.end, true)}.${b.note ? ' Note: ' + b.note : ''}`,
      })
    }
  }

  return {
    mode: 'demo',

    currentUser: () => ok(sessionUser()),
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signIn(email, password) {
      db = load()
      const p = db.profiles.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
      if (!p || p.password !== password) throw new Error('Wrong email or password')
      localStorage.setItem(SESSION, p.id)
      emit()
    },
    async signUp(name, email, password) {
      if (db.profiles.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) {
        throw new Error('An account with this email already exists')
      }
      const p = { id: uid(), name, email: email.trim(), role: 'member' as const, password }
      await change(() => db.profiles.push(p))
      localStorage.setItem(SESSION, p.id)
      emit()
    },
    async signOut() {
      localStorage.removeItem(SESSION)
      emit()
    },

    listProfiles: () => ok(db.profiles.map(strip)),
    updateProfile: (id, patch) =>
      change(() => {
        const u = me()
        if (id !== u.id) requireAdmin()
        if (patch.role) {
          if (!isOwner(u)) throw new Error('Only the owner can change roles')
          if (patch.role === 'owner') throw new Error('There can only be one owner')
          if (patch.role === 'car_keeper' && db.profiles.some((p) => p.role === 'car_keeper' && p.id !== id)) {
            throw new Error('There is already a car keeper')
          }
        }
        Object.assign(db.profiles.find((p) => p.id === id)!, patch)
      }),

    getSettings: () => ok(db.settings),
    updateSettings: (patch) => change(() => {
        requireAdmin()
        if (('priorityOrder' in patch || 'priorityStartYear' in patch) && !isOwner(me())) {
          throw new Error('Only the owner can set the priority order')
        }
        Object.assign(db.settings, patch)
      }),

    listRooms: () => ok(db.rooms),
    saveRoom: (room) =>
      change(() => {
        requireAdmin()
        const existing = room.id && db.rooms.find((r) => r.id === room.id)
        if (existing) Object.assign(existing, room)
        else db.rooms.push({ ...room, id: uid() })
      }),
    deleteRoom: (id) => change(() => {
        requireAdmin()
        db.rooms = db.rooms.filter((r) => r.id !== id)
      }),

    listReservations: () => ok(db.reservations),
    createReservation: (r) =>
      commit(() => {
        const full: Reservation = { ...r, id: uid(), userId: me().id, createdAt: now() }
        db.reservations.push(full)
        return structuredClone(full)
      }),
    updateReservation: (id, patch) => change(() => Object.assign(db.reservations.find((r) => r.id === id)!, patch)),
    cancelReservation: (id, lateCancel) =>
      change(() => {
        const r = db.reservations.find((x) => x.id === id)!
        Object.assign(r, { status: 'cancelled', cancelledAt: now(), lateCancel })
        db.carBookings = db.carBookings.filter((b) => b.reservationId !== id)
      }),
    bumpReservation: (id, byReservationId) =>
      change(() => {
        const r = db.reservations.find((x) => x.id === id)!
        if (priorityUserFor(stayYear(r), db.settings) !== me().id) throw new Error('Only the priority user can do this')
        Object.assign(r, { status: 'tentative', bumpedBy: byReservationId })
      }),
    confirmReservation: (id) =>
      change(() => {
        const r = db.reservations.find((x) => x.id === id)!
        r.status = 'active'
        delete r.bumpedBy
      }),

    listCarBookings: () => ok(db.carBookings),
    createCarBooking: (b) =>
      change(() => {
        const full: CarBooking = { ...b, id: uid(), userId: me().id, createdAt: now() }
        db.carBookings.push(full)
        notifyCarKeepers(full)
      }),
    deleteCarBooking: (id) => change(() => (db.carBookings = db.carBookings.filter((b) => b.id !== id))),

    listNotifications: () => {
      const id = sessionUser()?.id
      return ok(db.notifications.filter((n) => n.userId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    },
    markNotificationsRead: () =>
      change(() => {
        const id = me().id
        db.notifications.forEach((n) => n.userId === id && (n.read = true))
      }),
    notifyStay: (userId, title, body) =>
      change(() => db.notifications.push({ id: uid(), userId, kind: 'stay', title, body, read: false, createdAt: now() })),

    listCatches: () => ok(db.catches),
    createCatch: (c) => change(() => db.catches.push({ ...c, id: uid(), userId: me().id, createdAt: now() })),
    deleteCatch: (id) => change(() => (db.catches = db.catches.filter((c) => c.id !== id))),

    listPosts: () => ok(db.posts),
    createPost: (p) =>
      commit(() => {
        const full: Post = { ...p, id: uid(), userId: me().id, createdAt: now(), updatedAt: now() }
        db.posts.push(full)
        return structuredClone(full)
      }),
    updatePost: (id, patch) => change(() => Object.assign(db.posts.find((p) => p.id === id)!, patch, { updatedAt: now() })),
    deletePost: (id) =>
      change(() => {
        db.posts = db.posts.filter((p) => p.id !== id)
        db.comments = db.comments.filter((c) => c.postId !== id)
      }),
    listComments: (postId) => ok(postId ? db.comments.filter((c) => c.postId === postId) : db.comments),
    addComment: (postId, body) => change(() => db.comments.push({ id: uid(), postId, body, userId: me().id, createdAt: now() })),
    deleteComment: (id) => change(() => (db.comments = db.comments.filter((c) => c.id !== id))),

    listCosts: () => ok(sessionUser() && isAdmin(sessionUser()!) ? db.costs : []),
    addCost: (c) => change(() => {
        requireAdmin()
        db.costs.push({ ...c, id: uid() })
      }),
    deleteCost: (id) => change(() => {
        requireAdmin()
        db.costs = db.costs.filter((c) => c.id !== id)
      }),

    uploadPhoto: (blob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      }),
  }
}
