import { addMonths, nightsBetween, nightsInYear, overlaps, today } from './dates'
import type { CarBooking, CostEntry, Profile, Reservation, Settings } from './types'

/** Last day on which a reservation can still be cancelled for free. */
export function freeCancelDeadline(r: Pick<Reservation, 'start'>, settings: Settings): string {
  return addMonths(r.start, -settings.freeCancelMonths)
}

export function isFreeCancel(r: Reservation, settings: Settings, on = today()): boolean {
  return on <= freeCancelDeadline(r, settings)
}

/** Reservations that occupy at least one of the given rooms in the given period. */
export function roomConflicts(
  all: Reservation[],
  draft: { id?: string; start: string; end: string; roomIds: string[] },
): Reservation[] {
  return all.filter(
    (r) =>
      r.status === 'active' &&
      r.id !== draft.id &&
      overlaps(r.start, r.end, draft.start, draft.end) &&
      r.roomIds.some((id) => draft.roomIds.includes(id)),
  )
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
    .filter((u) => u.role !== 'car_keeper')
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
