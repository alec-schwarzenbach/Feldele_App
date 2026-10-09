import type { Api } from './api'
import { addDays, formatDay, formatRange, today } from './dates'
import type {
  AppNotification,
  CarBooking,
  Catch,
  Clan,
  Comment,
  CostEntry,
  Family,
  Post,
  Profile,
  Reservation,
  Room,
  Settings,
  ShoppingItem,
} from './types'
import { isAdmin, isOwner, NO_FAMILY } from './types'
import { priorityFamilyFor, stayYear } from './rules'

// Demo backend: keeps everything in localStorage so the app can be tried
// without any server. Each browser/phone has its own separate copy.

interface DB {
  version: number
  profiles: (Profile & { password: string })[]
  families: Family[]
  clans: Clan[]
  rooms: Room[]
  reservations: Reservation[]
  carBookings: CarBooking[]
  notifications: AppNotification[]
  catches: Catch[]
  posts: Post[]
  comments: Comment[]
  shopping: ShoppingItem[]
  costs: CostEntry[]
  settings: Settings
}

const KEY = 'lodge-demo-db'
const SESSION = 'lodge-demo-session'
const VERSION = 6

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function seed(): DB {
  const t = today()
  const y = Number(t.slice(0, 4))
  const p = (id: string, name: string, email: string, role: Profile['role'], familyId?: string) => ({
    id, name, email, role, familyId, password: 'demo',
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
      p('u-alec', 'Alec', 'alec@lodge.test', 'owner', 'f-schwarzenbach'),
      p('u-maria', 'Maria', 'maria@lodge.test', 'member', 'f-huber'),
      p('u-thomas', 'Thomas', 'thomas@lodge.test', 'member', 'f-gruber'),
      p('u-gunther', 'Günter Kobalt', 'guenther@lodge.test', 'car_keeper', NO_FAMILY),
      p('u-rosa', 'Rosa', 'rosa@lodge.test', 'cleaner', NO_FAMILY),
    ],
    families: [
      { id: 'f-schwarzenbach', name: 'Schwarzenbach' },
      { id: 'f-huber', name: 'Huber', clanId: 'c-tal' },
      { id: 'f-gruber', name: 'Gruber', clanId: 'c-tal' },
    ],
    clans: [{ id: 'c-tal', name: 'Clan Tal' }],
    rooms: [
      { id: 'DG-Az', area: 'DG', name: 'Arvenzimmer', beds: 2, code: 'DG-Az' },
      { id: 'DG-EzS', area: 'DG', name: 'Einzelzimmer Süd', beds: 1, code: 'DG-EzS' },
      { id: 'DG-EzN', area: 'DG', name: 'Einzelzimmer Nord', beds: 1, code: 'DG-EzN' },
      { id: 'DG-DZ', area: 'DG', name: 'Doppelzimmer', beds: 2, code: 'DG-DZ' },
      { id: 'OG-Mz', area: 'OG', name: 'Mariazimmer', beds: 2, code: 'OG-Mz' },
      { id: 'OG-Dz', area: 'OG', name: 'Doppelzimmer', beds: 2, code: 'OG-Dz' },
      { id: 'J-DzO', area: 'Jägerwohnung', name: 'Doppelzimmer Ost', beds: 2, code: 'J-DzO' },
      { id: 'J-DzW', area: 'Jägerwohnung', name: 'Doppelzimmer West', beds: 2, code: 'J-DzW' },
      { id: 'H-DzO', area: 'Harowohnung', name: 'Doppelzimmer Ost', beds: 2, code: 'H-DzO' },
      { id: 'H-DzW', area: 'Harowohnung', name: 'Doppelzimmer West', beds: 2, code: 'H-DzW' },
    ],
    reservations: [
      res('res-1', 'u-maria', -60, 5, 4, ['DG-Az', 'OG-Mz']),
      res('res-2', 'u-alec', -30, 3, 2, ['DG-Az']),
      res('res-3', 'u-thomas', -20, 2, 8, ['DG-Az', 'OG-Mz', 'J-DzO'], { occasion: '40. Geburtstag von Thomas' }),
      res('res-4', 'u-alec', -10, 4, 3, ['J-DzO']),
      res('res-5', 'u-maria', 12, 4, 2, ['DG-Az']),
      res('res-6', 'u-thomas', 150, 7, 5, ['OG-Mz', 'J-DzO']),
    ],
    carBookings: [
      { id: 'car-1', userId: 'u-maria', reservationId: 'res-5', start: addDays(t, 12), end: addDays(t, 16), createdAt: now() },
    ],
    notifications: [
      {
        id: uid(), userId: 'u-gunther', kind: 'car', title: 'Auto benötigt: Maria', read: false, createdAt: now(),
        body: `Maria braucht das Auto vom ${formatDay(addDays(t, 12), true)} bis ${formatDay(addDays(t, 16), true)}.`,
      },
      {
        id: uid(), userId: 'u-rosa', kind: 'cleaner', title: 'Neue Buchung: Maria', read: false, createdAt: now(),
        body: `Maria kommt ${formatRange(addDays(t, 12), addDays(t, 16))} mit 2 Personen (Arvenzimmer).`,
      },
    ],
    catches: [
      { id: uid(), userId: 'u-alec', species: 'Hecht', lengthCm: 78, weightKg: 4.2, lat: 47.512, lng: 13.995, caughtAt: addDays(t, -9), reason: 'starving', bait: 'Spinner', createdAt: now() },
      { id: uid(), userId: 'u-thomas', species: 'Bachforelle', lengthCm: 41, lat: 47.498, lng: 14.012, caughtAt: addDays(t, -19), reason: 'injured', bait: 'Wurm', note: 'Gleich unter der alten Brücke', createdAt: now() },
      { id: uid(), userId: 'u-maria', species: 'Egli', lengthCm: 28, lat: 47.505, lng: 13.981, caughtAt: addDays(t, -58), reason: 'starving', createdAt: now() },
    ],
    posts: [
      {
        id: 'post-1', userId: 'u-maria', category: 'restaurant', title: 'Gasthof zur Post – neue Wirte',
        body: 'Seit dem Frühling wieder offen. Super Schnitzel, faire Preise, Kindermenü. Montags geschlossen.', rating: 5,
        createdAt: now(), updatedAt: now(),
      },
      {
        id: 'post-2', userId: 'u-thomas', category: 'trip', title: 'Wanderung zum oberen See',
        body: 'Ca. 2,5 h ab dem Haus. Start beim Parkplatz hinter der Kirche. Wasser mitnehmen, unterwegs keine Hütte.',
        createdAt: now(), updatedAt: now(),
      },
      {
        id: 'post-3', userId: 'u-alec', category: 'tip', title: 'Boiler',
        body: 'Boiler bei der Ankunft einschalten – er braucht ca. 2 h. Bei der Abreise wieder ausschalten!',
        createdAt: now(), updatedAt: now(),
      },
    ],
    comments: [
      { id: uid(), postId: 'post-1', userId: 'u-alec', body: 'Stimmt, waren letzten Monat dort. Am Wochenende reservieren.', createdAt: now() },
    ],
    shopping: [
      { id: uid(), userId: 'u-maria', text: 'Abwaschmittel', createdAt: now() },
      { id: uid(), userId: 'u-thomas', text: 'Anzündwürfel für den Ofen', createdAt: now() },
      { id: uid(), userId: 'u-alec', text: 'Kaffee', done: true, doneBy: 'u-maria', createdAt: now() },
    ],
    costs: [
      { id: uid(), year: y, category: 'rent', amount: 4800, note: 'Jahresmiete' },
      { id: uid(), year: y, category: 'electricity', amount: 960 },
      { id: uid(), year: y, category: 'water', amount: 210 },
      { id: uid(), year: y, category: 'supplies', amount: 340, note: 'Brennholz, Putzmittel' },
    ],
    settings: {
      freeCancelMonths: 4, currency: 'CHF', lodgeName: 'Feldele', lodgeLat: 47.505, lodgeLng: 14.0,
      priorityOrder: ['f-huber', 'f-gruber', 'f-schwarzenbach'], priorityStartYear: y,
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
    throw new Error('Der Demo-Speicher ist voll – kleinere Fotos verwenden oder Demo-Daten zurücksetzen. ' + String(e))
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
    if (!u) throw new Error('Nicht angemeldet')
    return u
  }
  // Same permission rules the real database enforces (see firestore.rules).
  const requireAdmin = () => {
    if (!isAdmin(me())) throw new Error('Das dürfen nur Admins')
  }
  const requireOwner = () => {
    if (!isOwner(me())) throw new Error('Das darf nur der Besitzer')
  }
  const commit = <T>(fn: () => T): Promise<T> => {
    const result = fn()
    save(db)
    return Promise.resolve(result)
  }
  const change = (fn: () => unknown): Promise<void> => commit(() => void fn())
  const emit = () => listeners.forEach((l) => l(sessionUser()))
  const ok = <T>(v: T) => Promise.resolve(structuredClone(v))
  const nameOf = (id: string) => db.profiles.find((p) => p.id === id)?.name ?? 'Jemand'
  const notify = (role: Profile['role'], kind: AppNotification['kind'], title: string, body: string) => {
    for (const p of db.profiles.filter((x) => x.role === role)) {
      db.notifications.push({ id: uid(), userId: p.id, kind, title, body, read: false, createdAt: now() })
    }
  }
  // In the real app the server sends these (functions/index.js); the demo imitates it.
  const notifyCleaner = (r: Reservation, what: 'new' | 'cancelled') =>
    notify('cleaner', 'cleaner',
      what === 'new' ? `Neue Buchung: ${nameOf(r.userId)}` : `Buchung storniert: ${nameOf(r.userId)}`,
      what === 'new'
        ? `${nameOf(r.userId)} kommt ${formatRange(r.start, r.end)} mit ${r.people} Personen.`
        : `${nameOf(r.userId)} kommt doch nicht (${formatRange(r.start, r.end)}).`)

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
      if (!p || p.password !== password) throw new Error('E-Mail oder Passwort falsch')
      localStorage.setItem(SESSION, p.id)
      emit()
    },
    async signUp(name, email, password) {
      if (db.profiles.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) {
        throw new Error('Mit dieser E-Mail gibt es schon ein Konto')
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
        // You choose your own family once; after that only admins can change it.
        if ('familyId' in patch && id === u.id && u.familyId && !isAdmin(u)) throw new Error('Bitte einen Admin, deine Familie zu ändern')
        if (patch.role) {
          if (!isOwner(u)) throw new Error('Nur der Besitzer kann Rollen ändern')
          if (patch.role === 'owner') throw new Error('Es kann nur einen Besitzer geben')
          if (patch.role === 'car_keeper' && db.profiles.some((p) => p.role === 'car_keeper' && p.id !== id)) {
            throw new Error('Es gibt schon einen Autobesitzer')
          }
        }
        Object.assign(db.profiles.find((p) => p.id === id)!, patch)
      }),

    listFamilies: () => ok([...db.families].sort((a, b) => a.name.localeCompare(b.name))),
    addFamily: (name) =>
      commit(() => {
        const f: Family = { id: uid(), name: name.trim(), createdBy: me().id, createdAt: now() }
        db.families.push(f)
        return structuredClone(f)
      }),
    renameFamily: (id, name) =>
      change(() => {
        requireAdmin()
        db.families.find((f) => f.id === id)!.name = name.trim()
      }),
    deleteFamily: (id) =>
      change(() => {
        requireAdmin()
        db.families = db.families.filter((f) => f.id !== id)
      }),
    setFamilyClan: (familyId, clanId) =>
      change(() => {
        requireOwner()
        const f = db.families.find((x) => x.id === familyId)!
        if (clanId) f.clanId = clanId
        else delete f.clanId
      }),

    listClans: () => ok([...db.clans].sort((a, b) => a.name.localeCompare(b.name))),
    addClan: (name) =>
      change(() => {
        requireOwner()
        db.clans.push({ id: uid(), name: name.trim() })
      }),
    renameClan: (id, name) =>
      change(() => {
        requireOwner()
        db.clans.find((c) => c.id === id)!.name = name.trim()
      }),
    deleteClan: (id) =>
      change(() => {
        requireOwner()
        db.clans = db.clans.filter((c) => c.id !== id)
      }),

    listShopping: () => ok(db.shopping),
    addShopping: (text) => change(() => db.shopping.push({ id: uid(), userId: me().id, text: text.trim(), done: false, createdAt: now() })),
    setShoppingDone: (id, done) =>
      change(() => Object.assign(db.shopping.find((s) => s.id === id)!, { done, doneBy: done ? me().id : undefined })),
    deleteShopping: (id) => change(() => (db.shopping = db.shopping.filter((s) => s.id !== id))),

    // No push in demo mode: notifications only appear inside the app.
    enablePush: () => Promise.resolve('unsupported'),

    getSettings: () => ok(db.settings),
    updateSettings: (patch) => change(() => {
      requireAdmin()
      if (('priorityOrder' in patch || 'priorityStartYear' in patch) && !isOwner(me())) {
        throw new Error('Nur der Besitzer kann die Priorität festlegen')
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
        if (full.status === 'active') notifyCleaner(full, 'new')
        return structuredClone(full)
      }),
    updateReservation: (id, patch) => change(() => Object.assign(db.reservations.find((r) => r.id === id)!, patch)),
    cancelReservation: (id, lateCancel) =>
      change(() => {
        const r = db.reservations.find((x) => x.id === id)!
        if (r.status === 'active') notifyCleaner(r, 'cancelled')
        Object.assign(r, { status: 'cancelled', cancelledAt: now(), lateCancel })
        db.carBookings = db.carBookings.filter((b) => b.reservationId !== id)
      }),
    bumpReservation: (id, byReservationId) =>
      change(() => {
        const r = db.reservations.find((x) => x.id === id)!
        if (priorityFamilyFor(stayYear(r), db.settings) !== me().familyId) throw new Error('Das darf nur die Familie mit Priorität')
        notifyCleaner(r, 'cancelled')
        Object.assign(r, { status: 'tentative', bumpedBy: byReservationId })
      }),
    confirmReservation: (id) =>
      change(() => {
        const r = db.reservations.find((x) => x.id === id)!
        r.status = 'active'
        delete r.bumpedBy
        notifyCleaner(r, 'new')
      }),

    listCarBookings: () => ok(db.carBookings),
    createCarBooking: (b) =>
      change(() => {
        const full: CarBooking = { ...b, id: uid(), userId: me().id, createdAt: now() }
        db.carBookings.push(full)
        notify('car_keeper', 'car', `Auto benötigt: ${nameOf(full.userId)}`,
          `${nameOf(full.userId)} braucht das Auto vom ${formatDay(full.start, true)} bis ${formatDay(full.end, true)}.` +
          (full.note ? ` Notiz: ${full.note}` : ''))
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
