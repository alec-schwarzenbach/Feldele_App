import { useState } from 'react'
import { addDays, addMonths, today, toDate } from '../lib/dates'
import { Icon } from './ui'

export interface CalEvent {
  id: string
  start: string
  /** exclusive */
  end: string
  color: string
  label: string
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Month grid; each day shows a colored bar per event covering it. */
export function MonthCalendar({ events, selected, onSelect }: {
  events: CalEvent[]
  selected?: string
  onSelect?: (day: string) => void
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7) + '-01')
  const first = toDate(month)
  const offset = (first.getUTCDay() + 6) % 7
  const gridStart = addDays(month, -offset)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const t = today()

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon name="chevL" /></button>
        <strong>{monthFmt.format(first)}</strong>
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon name="chevR" /></button>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => <span key={w} className="cal-wd">{w}</span>)}
        {days.map((d) => {
          const evs = events.filter((e) => e.start <= d && d < e.end)
          const cls = ['cal-day']
          if (d.slice(0, 7) !== month.slice(0, 7)) cls.push('other')
          if (d === t) cls.push('today')
          if (d === selected) cls.push('selected')
          return (
            <button key={d} className={cls.join(' ')} onClick={() => onSelect?.(d)}>
              <span>{Number(d.slice(8))}</span>
              <span className="cal-bars">
                {evs.slice(0, 3).map((e) => <i key={e.id} style={{ background: e.color }} />)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
