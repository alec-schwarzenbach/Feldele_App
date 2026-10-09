import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore'
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage'
import type { Api } from './api'
import { formatDay } from './dates'
import type { AppNotification, CarBooking, Family, Post, Profile, Reservation, Room, Settings } from './types'
import { isAdmin } from './types'

// Real backend on Firebase. Documents store the same camelCase fields as the
// types in ./types; the document id becomes `id`. Access rules live in
// firestore.rules and storage.rules.

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  appId?: string
}

const DEFAULT_SETTINGS: Settings = {
  freeCancelMonths: 4, currency: 'EUR', lodgeName: 'Feldele', lodgeLat: 47.505, lodgeLng: 14.0,
  priorityOrder: [], priorityStartYear: new Date().getFullYear(),
}

const now = () => new Date().toISOString()

/** Documents whose id starts with "_" are examples for the console (see scripts/setup-firestore.cjs). */
const real = (snap: QuerySnapshot<DocumentData>) => snap.docs.filter((d) => !d.id.startsWith('_'))

function rows<T>(snap: QuerySnapshot<DocumentData>): T[] {
  return real(snap).map((d) => ({ ...d.data(), id: d.id }) as T)
}

/** Firestore can't store `undefined`; in an update it means "remove this field". */
function patchOf(obj: object): DocumentData {
  const out: DocumentData = {}
  for (const [k, v] of Object.entries(obj)) out[k] = v === undefined || v === '' ? deleteField() : v
  return out
}

export function createFirebaseApi(config: FirebaseConfig): Api {
  const app = initializeApp(config)
  const auth = getAuth(app)
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true })
  const storage = getStorage(app)
  const col = (name: string) => collection(db, name)

  const listeners = new Set<(u: Profile | null) => void>()
  const emit = async () => {
    const p = await profileFor(auth.currentUser?.uid)
    listeners.forEach((l) => l(p))
  }
  onAuthStateChanged(auth, () => void emit())

  async function profileFor(uid: string | undefined): Promise<Profile | null> {
    if (!uid) return null
    const snap = await getDoc(doc(db, 'profiles', uid))
    return snap.exists() ? ({ ...snap.data(), id: snap.id } as Profile) : null
  }
  const myId = () => {
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Not signed in')
    return uid
  }
  const list = async <T>(name: string) => rows<T>(await getDocs(col(name)))
  const remove = (name: string, id: string) => deleteDoc(doc(db, name, id))
  const update = (name: string, id: string, patch: object) => updateDoc(doc(db, name, id), patchOf(patch))

  return {
    mode: 'firebase',

    async currentUser() {
      await auth.authStateReady()
      return profileFor(auth.currentUser?.uid)
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email.trim(), password).catch(friendly)
    },
    async signUp(name, email, password) {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password).catch(friendly)
      // New accounts wait for the owner's approval before they can see anything.
      await setDoc(doc(db, 'profiles', cred.user.uid), {
        name: name.trim(), email: cred.user.email, role: 'pending', createdAt: now(),
      })
      await emit() // the auth listener fired before the profile existed
    },
    async signOut() {
      await signOut(auth)
    },

    listProfiles: () => list('profiles'),
    updateProfile: (id, p) => update('profiles', id, p),

    listFamilies: async () => (await list<Family>('families')).sort((a, b) => a.name.localeCompare(b.name)),
    async addFamily(name) {
      const full = { name: name.trim(), createdBy: myId(), createdAt: now() }
      const created = await addDoc(col('families'), full)
      return { ...full, id: created.id }
    },
    renameFamily: (id, name) => update('families', id, { name: name.trim() }),
    deleteFamily: (id) => remove('families', id),

    async getSettings() {
      const snap = await getDoc(doc(db, 'settings', 'main'))
      return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) }
    },
    updateSettings: (p) => setDoc(doc(db, 'settings', 'main'), p, { merge: true }),

    listRooms: async () => (await list<Room>('rooms')).sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999)),
    async saveRoom({ id, ...room }) {
      if (id) await update('rooms', id, room)
      else await addDoc(col('rooms'), room)
    },
    deleteRoom: (id) => remove('rooms', id),

    listReservations: () => list('reservations'),
    async createReservation(r) {
      const full = { ...r, userId: myId(), createdAt: now() }
      const created = await addDoc(col('reservations'), full)
      return { ...full, id: created.id } as Reservation
    },
    updateReservation: (id, p) => update('reservations', id, p),
    async cancelReservation(id, lateCancel) {
      // The rules reject lateCancel=false once the free period is over.
      await updateDoc(doc(db, 'reservations', id), { status: 'cancelled', cancelledAt: now(), lateCancel })
      const linked = await getDocs(query(col('carBookings'), where('reservationId', '==', id)))
      await Promise.all(linked.docs.map((d) => deleteDoc(d.ref)))
    },
    bumpReservation: (id, byReservationId) => updateDoc(doc(db, 'reservations', id), { status: 'tentative', bumpedBy: byReservationId }),
    confirmReservation: (id) => updateDoc(doc(db, 'reservations', id), { status: 'active', bumpedBy: deleteField() }),

    listCarBookings: () => list('carBookings'),
    async createCarBooking(b) {
      const me = await profileFor(myId())
      const keepers = await getDocs(query(col('profiles'), where('role', '==', 'car_keeper')))
      const booking: Omit<CarBooking, 'id'> = { ...b, userId: myId(), createdAt: now() }
      // Booking and notification are saved together, or not at all.
      const batch = writeBatch(db)
      batch.set(doc(col('carBookings')), booking)
      for (const k of real(keepers)) {
        batch.set(doc(col('notifications')), {
          userId: k.id, kind: 'car', read: false, createdAt: now(),
          title: `Car needed: ${me?.name ?? 'Someone'}`,
          body: `${me?.name ?? 'Someone'} needs the car from ${formatDay(b.start, true)} to ${formatDay(b.end, true)}.`
            + (b.note ? ` Note: ${b.note}` : ''),
        })
      }
      await batch.commit()
    },
    deleteCarBooking: (id) => remove('carBookings', id),

    async listNotifications() {
      const snap = await getDocs(query(col('notifications'), where('userId', '==', myId())))
      return rows<AppNotification>(snap).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async markNotificationsRead() {
      const snap = await getDocs(query(col('notifications'), where('userId', '==', myId()), where('read', '==', false)))
      const batch = writeBatch(db)
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }))
      await batch.commit()
    },
    async notifyStay(userId, title, body) {
      await addDoc(col('notifications'), { userId, kind: 'stay', title, body, read: false, createdAt: now() })
    },

    listCatches: () => list('catches'),
    async createCatch(c) {
      await addDoc(col('catches'), { ...c, userId: myId(), createdAt: now() })
    },
    deleteCatch: (id) => remove('catches', id),

    listPosts: () => list('posts'),
    async createPost(p) {
      const full = { ...p, userId: myId(), createdAt: now(), updatedAt: now() }
      const created = await addDoc(col('posts'), full)
      return { ...full, id: created.id } as Post
    },
    updatePost: (id, p) => update('posts', id, { ...p, updatedAt: now() }),
    deletePost: (id) => remove('posts', id),
    async listComments(postId) {
      return rows(await getDocs(postId ? query(col('comments'), where('postId', '==', postId)) : col('comments')))
    },
    async addComment(postId, body) {
      await addDoc(col('comments'), { postId, body, userId: myId(), createdAt: now() })
    },
    deleteComment: (id) => remove('comments', id),

    async listCosts() {
      // Only admins may read costs; the rules would reject anyone else.
      const me = await profileFor(auth.currentUser?.uid)
      return me && isAdmin(me) ? list('costs') : []
    },
    async addCost(c) {
      await addDoc(col('costs'), c)
    },
    deleteCost: (id) => remove('costs', id),

    async uploadPhoto(blob) {
      const r = ref(storage, `photos/${myId()}/${crypto.randomUUID()}.jpg`)
      await uploadBytes(r, blob, { contentType: 'image/jpeg' })
      return getDownloadURL(r)
    },
  }
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password',
  'auth/invalid-email': 'That email address looks wrong',
  'auth/email-already-in-use': 'An account with this email already exists',
  'auth/weak-password': 'Password must be at least 6 characters',
  'auth/too-many-requests': 'Too many attempts – try again in a few minutes',
}

function friendly(e: { code?: string; message?: string }): never {
  throw new Error(MESSAGES[e.code ?? ''] ?? e.message ?? 'Something went wrong')
}
