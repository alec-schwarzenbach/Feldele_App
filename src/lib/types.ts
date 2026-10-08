/**
 * owner: the one person who can hand out roles. admin: sees and edits costs and settings.
 * pending: signed up, but sees nothing until the owner approves them.
 */
export type Role = 'owner' | 'admin' | 'member' | 'car_keeper' | 'pending'

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

/** tentative = "maybe": the rooms are taken; it becomes active if the other stay is cancelled. */
export type ReservationStatus = 'active' | 'tentative' | 'cancelled'

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
  /** Booked by the year's priority user over someone else's stay */
  priorityClaim?: boolean
  /** Last day (YYYY-MM-DD) a priority claim can be cancelled for free */
  claimDeadline?: string
  /** For a "maybe" stay: the reservation that pushed it out */
  bumpedBy?: string
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
  /** car: only ever sent to the car owner. stay: changes to your own stay. */
  kind: 'car' | 'stay'
  title: string
  body: string
  read: boolean
  createdAt: string
}

export type CatchReason = 'starving' | 'injured'

export interface Catch {
  id: string
  userId: string
  species: string
  lengthCm: number
  weightKg?: number
  lat: number
  lng: number
  caughtAt: string
  /** Why the fish was taken out */
  reason: CatchReason
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
  /** Families the members can belong to (chosen on their profile) */
  families: string[]
  /** Priority rotation: priorityOrder[0] has priority in priorityStartYear, the next one the year after, and so on (repeating). */
  priorityOrder: string[]
  priorityStartYear: number
}

export const isAdmin = (p: Pick<Profile, 'role'>) => p.role === 'admin' || p.role === 'owner'
export const isOwner = (p: Pick<Profile, 'role'>) => p.role === 'owner'