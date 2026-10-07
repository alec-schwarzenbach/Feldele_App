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
import { createSupabaseApi } from './supabaseApi'

export type New<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'userId'>

/**
 * Everything the UI needs from a backend. Two implementations exist:
 *  - localApi: demo mode, stores data in the browser (no setup needed)
 *  - supabaseApi: real shared backend, enabled when VITE_SUPABASE_URL is set
 */
export interface Api {
  mode: 'demo' | 'supabase'

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
  createReservation(r: Omit<New<Reservation>, 'status'>): Promise<Reservation>
  updateReservation(id: string, patch: Partial<New<Reservation>>): Promise<void>
  cancelReservation(id: string, lateCancel: boolean): Promise<void>

  listCarBookings(): Promise<CarBooking[]>
  createCarBooking(b: New<CarBooking>): Promise<void>
  deleteCarBooking(id: string): Promise<void>

  listNotifications(): Promise<AppNotification[]>
  markNotificationsRead(): Promise<void>

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

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const api: Api = url && key ? createSupabaseApi(url, key) : createLocalApi()
