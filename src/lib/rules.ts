import { addDays, addMonths, nightsBetween, nightsInYear, overlaps, today } from './dates'
import type { CarBooking, Clan, CostEntry, Family, Profile, Reservation, Room, Settings } from './types'

/** Days a priority user has to cancel for free after taking over someone else's dates. */
export const CLAIM_FREE_DAYS = 28

/** Last day on which a reservation can still be cancelled for free (if someone else is waiting). */
export function freeCancelDeadline(r: Pick<Reservation, 'start'>, settings: Settings): string {
  return addMonths(r.start, -settings.freeCancelMonths)
}

/** Which family has priority in a year: the rotation repeats once every family had its turn. */
export function priorityFamilyFor(year: number, settings: Settings): string | undefined {
  const order = settings.priorityOrder
  if (!order.length) return undefined
  const n = order.length
  return order[(((year - settings.priorityStartYear) % n) + n) % n]
}

export const stayYear = (r: Pick<Reservation, 'start'>) => Number(r.start.slice(0, 4))

const familyOf = (userId: string, profiles: Profile[]) => profiles.find((p) => p.id === userId)?.familyId

/** Reservations with the given statuses that share a room with the draft in the same period. */
export function roomConflicts(
  all: Reservation[],
  draft: { id?: string; start: string; end: string; roomIds: string[] },
  statuses: Reservation['status'][] = ['active'],
): Reservation[] {
  return all.filter(
    (r) =>
      statuses.includes(r.status) &&
      r.id !== draft.id &&
      overlaps(r.start, r.end, draft.start, draft.end) &&
      r.roomIds.some((id) => draft.roomIds.includes(id)),
  )
}

/** Other people's "maybe" stays that are waiting for this stay's rooms. */
export function waitingFor(r: Reservation, all: Reservation[]): Reservation[] {
  return roomConflicts(all, r, ['tentative']).filter((t) => t.userId !== r.userId)
}

export type BookingPlan =
  | { kind: 'free' }
  /** Priority family takes the dates; other families' stays become "maybe" */
  | { kind: 'claim'; bump: Reservation[] }
  /** Someone else has the rooms: book as "maybe" */
  | { kind: 'maybe'; blockers: Reservation[] }
  /** Clashes with your own stay */
  | { kind: 'own'; conflicts: Reservation[] }

export function planBooking(
  draft: { id?: string; start: string; end: string; roomIds: string[] },
  all: Reservation[],
  settings: Settings,
  userId: string,
  profiles: Profile[],
): BookingPlan {
  const conflicts = roomConflicts(all, draft)
  if (!conflicts.length) return { kind: 'free' }
  const own = conflicts.filter((r) => r.userId === userId)
  if (own.length) return { kind: 'own', conflicts: own }
  // Priority only works against other families, never inside your own family.
  const myFamily = familyOf(userId, profiles)
  const sameFamily = conflicts.some((r) => familyOf(r.userId, profiles) === myFamily)
  if (myFamily && !sameFamily && priorityFamilyFor(stayYear(draft), settings) === myFamily) return { kind: 'claim', bump: conflicts }
  return { kind: 'maybe', blockers: conflicts }
}

export interface CancelTerms {
  charged: boolean
  /** Free until this day (inclusive), if it is free now */
  freeUntil?: string
  why: string
}

/**
 * Cancelling only costs something if someone else is affected:
 *  - "maybe" stays are always free
 *  - a priority claim is free for 4 weeks, then binding
 *  - otherwise: free if nobody is waiting for the rooms, or more than N months before arrival
 */
export function cancelTerms(r: Reservation, all: Reservation[], settings: Settings, on = today()): CancelTerms {
  if (r.status === 'tentative') return { charged: false, why: '«Vielleicht»-Aufenthalte kannst du jederzeit gratis stornieren.' }
  if (r.priorityClaim && r.claimDeadline) {
    return on <= r.claimDeadline
      ? { charged: false, freeUntil: r.claimDeadline, why: 'Du hast für diese Daten deine Priorität genutzt.' }
      : { charged: true, why: `Du hast deine Priorität genutzt und die ${CLAIM_FREE_DAYS / 7} Wochen für eine Gratis-Stornierung sind vorbei.` }
  }
  const waiting = waitingFor(r, all)
  if (!waiting.length) return { charged: false, why: 'Niemand sonst wartet auf diese Daten – Stornieren ist gratis.' }
  const deadline = freeCancelDeadline(r, settings)
  return on <= deadline
    ? { charged: false, freeUntil: deadline, why: `Andere warten auf diese Daten (gratis bis ${settings.freeCancelMonths} Monate vor der Anreise).` }
    : { charged: true, why: `Andere warten auf diese Daten und die Anreise ist weniger als ${settings.freeCancelMonths} Monate entfernt.` }
}

export const claimDeadlineFrom = (day = today()) => addDays(day, CLAIM_FREE_DAYS)

/** After a stay is cancelled: which "maybe" stays can now be confirmed (oldest first). */
export function promotable(cancelled: Reservation, all: Reservation[]): Reservation[] {
  const active = all.filter((r) => r.status === 'active' && r.id !== cancelled.id)
  const promoted: Reservation[] = []
  const waiting = roomConflicts(all, cancelled, ['tentative']).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const t of waiting) {
    if (!roomConflicts([...active, ...promoted], t).length) promoted.push(t)
  }
  return promoted
}

/** Car bookings use inclusive end days (the last day the car is needed). */
export function carConflicts(all: CarBooking[], draft: { id?: string; start: string; end: string }): CarBooking[] {
  return all.filter((b) => b.id !== draft.id && b.start <= draft.end && draft.start <= b.end)
}

/** A reservation counts toward the cost split if it was used or cancelled too late. */
export function isBillable(r: Reservation): boolean {
  return r.status === 'active' || !!r.lateCancel
}

/** The car owner and the cleaner use the app but don't pay. */
export const isPayer = (u: Profile) => u.role !== 'car_keeper' && u.role !== 'cleaner' && u.role !== 'pending'

export interface MemberStats {
  user: Profile
  stays: number
  nights: number
  personNights: number
  lateCancelPersonNights: number
  hosted: number
  share: number
  owed: number
}

interface Totals {
  nights: number
  personNights: number
  share: number
  owed: number
}

export interface FamilyStats extends Totals {
  family: Family | undefined
  members: MemberStats[]
}

/** Who actually pays: a clan (several families), or a family without a clan. */
export interface PayerStats extends Totals {
  key: string
  name: string
  clan: Clan | undefined
  families: FamilyStats[]
}

export interface YearReport {
  year: number
  totalCosts: number
  costsByCategory: Record<string, number>
  totalPersonNights: number
  rows: MemberStats[]
  families: FamilyStats[]
  payers: PayerStats[]
}

const addTotals = (into: Totals, from: Totals) => {
  into.nights += from.nights
  into.personNights += from.personNights
  into.share += from.share
  into.owed += from.owed
}

/**
 * Costs are split by person-nights: every person (member + guests) staying one
 * night counts as 1. A clan pays for all its families together; a family without
 * a clan pays for itself. Late-cancelled stays still count, as if they had been used.
 * Only past nights count — future reservations would distort the bill.
 */
export function buildYearReport(
  year: number,
  users: Profile[],
  families: Family[],
  clans: Clan[],
  reservations: Reservation[],
  costs: CostEntry[],
  upTo = today(),
): YearReport {
  const costsByCategory: Record<string, number> = {}
  let totalCosts = 0
  for (const c of costs.filter((c) => c.year === year)) {
    costsByCategory[c.category] = (costsByCategory[c.category] ?? 0) + c.amount
    totalCosts += c.amount
  }

  const rows: MemberStats[] = users.filter(isPayer).map((user) => {
    const mine = reservations.filter((r) => r.userId === user.id && isBillable(r) && r.start < upTo)
    let nights = 0
    let personNights = 0
    let lateCancelPersonNights = 0
    let stays = 0
    let hosted = 0
    for (const r of mine) {
      const end = r.end < upTo ? r.end : upTo
      const n = nightsInYear(r.start, end, year)
      if (n === 0) continue
      if (r.status === 'cancelled') {
        lateCancelPersonNights += n * r.people
      } else {
        stays++
        nights += n
        if (r.occasion) hosted++
      }
      personNights += n * r.people
    }
    return { user, stays, nights, personNights, lateCancelPersonNights, hosted, share: 0, owed: 0 }
  })

  const totalPersonNights = rows.reduce((s, r) => s + r.personNights, 0)
  for (const row of rows) {
    row.share = totalPersonNights ? row.personNights / totalPersonNights : 0
    row.owed = row.share * totalCosts
  }
  rows.sort((a, b) => b.personNights - a.personNights)

  const byFamily = new Map<string, FamilyStats>()
  for (const row of rows) {
    const key = row.user.familyId ?? ''
    const f = byFamily.get(key) ?? { family: families.find((x) => x.id === key), members: [], nights: 0, personNights: 0, share: 0, owed: 0 }
    f.members.push(row)
    addTotals(f, row)
    byFamily.set(key, f)
  }
  const familyStats = [...byFamily.values()].sort((a, b) => b.personNights - a.personNights)

  const byPayer = new Map<string, PayerStats>()
  for (const f of familyStats) {
    const clan = clans.find((c) => c.id === f.family?.clanId)
    const key = clan ? `clan:${clan.id}` : `family:${f.family?.id ?? ''}`
    const p = byPayer.get(key) ?? {
      key, clan, name: clan ? clan.name : familyLabel(f.family), families: [], nights: 0, personNights: 0, share: 0, owed: 0,
    }
    p.families.push(f)
    addTotals(p, f)
    byPayer.set(key, p)
  }
  const payers = [...byPayer.values()].sort((a, b) => b.owed - a.owed)

  return { year, totalCosts, costsByCategory, totalPersonNights, rows, families: familyStats, payers }
}

export const familyLabel = (f: Family | undefined) => f?.name ?? 'Ohne Familie'

export function stayNights(r: Reservation): number {
  return nightsBetween(r.start, r.end)
}

/** Name of the person who gets the car notifications. */
export function carOwnerName(profiles: Profile[]): string {
  return profiles.find((p) => p.role === 'car_keeper')?.name ?? 'der Autobesitzer'
}

/** "Doppelzimmer (OG)" – the area tells apart rooms with the same name. */
export function roomLabel(room: Room | undefined): string {
  if (!room) return '?'
  return room.area ? `${room.name} (${room.area})` : room.name
}

/** Rooms grouped by area, keeping the order they were added in. */
export function roomsByArea(rooms: Room[]): [string, Room[]][] {
  const groups = new Map<string, Room[]>()
  for (const r of rooms) groups.set(r.area ?? '', [...(groups.get(r.area ?? '') ?? []), r])
  return [...groups]
}
