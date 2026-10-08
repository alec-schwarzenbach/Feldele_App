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
import { createLocalApi } from './localApi'
import { createFirebaseApi } from './firebaseApi'

export type New<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'userId'>

/**
 * Everything the UI needs from a backend. Two implementations exist:
 *  - localApi: demo mode, stores data in the browser (no setup needed)
 *  - firebaseApi: real shared backend, enabled when VITE_FIREBASE_API_KEY is set
 */
export interface Api {
  mode: 'demo' | 'firebase'

  currentUser(): Promise<Profile | null>
  onAuthChange(cb: (user: Profile | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(name: string, email: string, password: string): Promise<void>
  signOut(): Promise<void>

  listProfiles(): Promise<Profile[]>
  updateProfile(id: string, patch: Partial<Pick<Profile, 'name' | 'family' | 'role'>>): Promise<void>

  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<void>

  listRooms(): Promise<Room[]>
  saveRoom(room: Omit<Room, 'id'> & { id?: string }): Promise<void>
  deleteRoom(id: string): Promise<void>

  listReservations(): Promise<Reservation[]>
  createReservation(r: New<Reservation>): Promise<Reservation>
  updateReservation(id: string, patch: Partial<New<Reservation>>): Promise<void>
  cancelReservation(id: string, lateCancel: boolean): Promise<void>
  /** The year's priority user takes the dates: someone else's stay becomes "maybe". */
  bumpReservation(id: string, byReservationId: string): Promise<void>
  /** A "maybe" stay becomes confirmed (the stay blocking it was cancelled). */
  confirmReservation(id: string): Promise<void>

  listCarBookings(): Promise<CarBooking[]>
  createCarBooking(b: New<CarBooking>): Promise<void>
  deleteCarBooking(id: string): Promise<void>

  listNotifications(): Promise<AppNotification[]>
  markNotificationsRead(): Promise<void>
  /** Tell someone about a change to their stay. */
  notifyStay(userId: string, title: string, body: string): Promise<void>

  listCatches(): Promise<Catch[]>
  createCatch(c: New<Catch>): Promise<void>
  deleteCatch(id: string): Promise<void>

  listPosts(): Promise<Post[]>
  createPost(p: New<Post>): Promise<Post>
  updatePost(id: string, patch: Partial<New<Post>>): Promise<void>
  deletePost(id: string): Promise<void>
  listComments(postId?: string): Promise<Comment[]>
  addComment(postId: string, body: string): Promise<void>
  deleteComment(id: string): Promise<void>

  listCosts(): Promise<CostEntry[]>
  addCost(c: Omit<CostEntry, 'id'>): Promise<void>
  deleteCost(id: string): Promise<void>

  /** Uploads a (already resized) image and returns a URL to display it. */
  uploadPhoto(blob: Blob): Promise<string>
}

const env = import.meta.env
const projectId = env.VITE_FIREBASE_PROJECT_ID as string | undefined

export const api: Api = env.VITE_FIREBASE_API_KEY && projectId
  ? createFirebaseApi({
      apiKey: env.VITE_FIREBASE_API_KEY,
      projectId,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
      appId: env.VITE_FIREBASE_APP_ID,
    })
  : createLocalApi()
