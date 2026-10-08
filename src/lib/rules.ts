import { addDays, addMonths, nightsBetween, nightsInYear, overlaps, today } from './dates'
import type { CarBooking, CostEntry, Profile, Reservation, Room, Settings } from './types'

/** Days a priority user has to cancel for free after taking over someone else's dates. */
export const CLAIM_FREE_DAYS = 28

/** Last day on which a reservation can still be cancelled for free (if someone else is waiting). */
export function freeCancelDeadline(r: Pick<Reservation, 'start'>, settings: Settings): string {
  return addMonths(r.start, -settings.freeCancelMonths)
}

/** Who has priority in a year: the rotation order repeats once everyone had their turn. */
export function priorityUserFor(year: number, settings: Settings): string | undefined {
  const order = settings.priorityOrder
  if (!order.length) return undefined
  const n = order.length
  return order[(((year - settings.priorityStartYear) % n) + n) % n]
}

export const stayYear = (r: Pick<Reservation, 'start'>) => Number(r.start.slice(0, 4))

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
  /** Priority user takes the dates; the others become "maybe" */
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
): BookingPlan {
  const conflicts = roomConflicts(all, draft)
  if (!conflicts.length) return { kind: 'free' }
  const own = conflicts.filter((r) => r.userId === userId)
  if (own.length) return { kind: 'own', conflicts: own }
  if (priorityUserFor(stayYear(draft), settings) === userId) return { kind: 'claim', bump: conflicts }
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
  if (r.status === 'tentative') return { charged: false, why: '"Maybe" stays can always be cancelled for free.' }
  if (r.priorityClaim && r.claimDeadline) {
    return on <= r.claimDeadline
      ? { charged: false, freeUntil: r.claimDeadline, why: 'You used your priority on these dates.' }
      : { charged: true, why: `You used your priority and the ${CLAIM_FREE_DAYS / 7} weeks to cancel for free are over.` }
  }
  const waiting = waitingFor(r, all)
  if (!waiting.length) return { charged: false, why: 'Nobody else is waiting for these dates, so cancelling is free.' }
  const deadline = freeCancelDeadline(r, settings)
  return on <= deadline
    ? { charged: false, freeUntil: deadline, why: `Others are waiting for these dates (free until ${settings.freeCancelMonths} months before arrival).` }
    : { charged: true, why: `Others are waiting for these dates and arrival is less than ${settings.freeCancelMonths} months away.` }
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

export interface YearReport {
  year: number
  totalCosts: number
  costsByCategory: Record<string, number>
  totalPersonNights: number
  rows: MemberStats[]
}

/**
 * Costs are split by person-nights: every person (member + guests) staying one
 * night counts as 1. Late-cancelled stays still count, as if they had been used.
 * Only past nights count — future reservations would distort the bill.
 */
export function buildYearReport(
  year: number,
  users: Profile[],
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

  const rows: MemberStats[] = users
    .filter((u) => u.role !== 'car_keeper' && u.role !== 'pending')
    .map((user) => {
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

  return { year, totalCosts, costsByCategory, totalPersonNights, rows }
}

export function reportToCsv(report: YearReport, currency: string): string {
  const header = ['Member', 'Stays', 'Nights', 'Person-nights', 'of which late cancellations', 'Parties hosted', 'Share %', `Owed (${currency})`]
  const lines = report.rows.map((r) => [
    r.user.name,
    r.stays,
    r.nights,
    r.personNights,
    r.lateCancelPersonNights,
    r.hosted,
    (r.share * 100).toFixed(1),
    r.owed.toFixed(2),
  ])
  lines.push(['Total', '', '', report.totalPersonNights, '', '', '100', report.totalCosts.toFixed(2)])
  const esc = (v: unknown) => {
    const s = String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...lines].map((l) => l.map(esc).join(',')).join('\n')
}

export function stayNights(r: Reservation): number {
  return nightsBetween(r.start, r.end)
}

/** Name of the person who gets the car notifications. */
export function carOwnerName(profiles: Profile[]): string {
  return profiles.find((p) => p.role === 'car_keeper')?.name ?? 'the car owner'
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
