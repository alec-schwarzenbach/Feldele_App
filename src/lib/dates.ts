// All "day" values are YYYY-MM-DD strings, handled in UTC to avoid DST surprises.

const DAY = 86_400_000

export function toDate(day: string): Date {
  return new Date(day + 'T00:00:00Z')
}

export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function today(): string {
  const d = new Date()
  return toDay(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))
}

export function addDays(day: string, n: number): string {
  return toDay(new Date(toDate(day).getTime() + n * DAY))
}

export function addMonths(day: string, n: number): string {
  const d = toDate(day)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay))
  return toDay(target)
}

export function nightsBetween(start: string, end: string): number {
  return Math.max(0, Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY))
}

/** Nights of [start, end) that fall into the given calendar year. */
export function nightsInYear(start: string, end: string, year: number): number {
  const s = start > `${year}-01-01` ? start : `${year}-01-01`
  const e = end < `${year + 1}-01-01` ? end : `${year + 1}-01-01`
  return nightsBetween(s, e)
}

/** Ranges are [start, end) — departure day is free for the next arrival. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function formatDay(day: string, withYear = false): string {
  return (withYear ? fmtYear : fmt).format(toDate(day))
}

export function formatRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return new Date(iso).toLocaleDateString()
}
