/** owner: the one person who can hand out roles. admin: sees and edits costs and settings. */
export type Role = 'owner' | 'admin' | 'member' | 'car_keeper'

export interface Profile {
  id: string
  name: string
  email: string
  role: Role
  family?: string
}

export interface Room {
  id: string
  name: string
  beds: number
}

export type ReservationStatus = 'active' | 'cancelled'

export interface Reservation {
  id: string
  userId: string
  /** Arrival day, YYYY-MM-DD */
  start: string
  /** Departure day, YYYY-MM-DD (not counted as a night) */
  end: string
  /** Total number of people, including the member */
  people: number
  roomIds: string[]
  occasion?: string
  note?: string
  status: ReservationStatus
  cancelledAt?: string
  /** True when cancelled inside the paid window; still counts in the cost split */
  lateCancel?: boolean
  createdAt: string
}

export interface CarBooking {
  id: string
  userId: string
  reservationId?: string
  start: string
  end: string
  note?: string
  createdAt: string
}

export interface AppNotification {
  id: string
  userId: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export interface Catch {
  id: string
  userId: string
  species: string
  lengthCm: number
  weightKg?: number
  lat: number
  lng: number
  caughtAt: string
  bait?: string
  note?: string
  photoUrl?: string
  createdAt: string
}

export type PostCategory = 'tip' | 'trip' | 'review' | 'restaurant' | 'other'

export interface Post {
  id: string
  userId: string
  category: PostCategory
  title: string
  body: string
  rating?: number
  photoUrl?: string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  postId: string
  userId: string
  body: string
  createdAt: string
}

export type CostCategory = 'rent' | 'electricity' | 'water' | 'supplies' | 'other'

export interface CostEntry {
  id: string
  year: number
  category: CostCategory
  amount: number
  note?: string
}

export interface Settings {
  freeCancelMonths: number
  currency: string
  lodgeName: string
  lodgeLat: number
  lodgeLng: number
}

export const isAdmin = (p: Pick<Profile, 'role'>) => p.role === 'admin' || p.role === 'owner'
export const isOwner = (p: Pick<Profile, 'role'>) => p.role === 'owner'