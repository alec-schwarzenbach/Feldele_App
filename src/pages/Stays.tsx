import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MonthCalendar } from '../components/MonthCalendar'
import { Avatar, Empty, Fab, Header, Segmented } from '../components/ui'
import { colorFor } from '../lib/colors'
import { formatDay, formatRange, today } from '../lib/dates'
import { priorityUserFor, stayNights } from '../lib/rules'
import { useData } from '../lib/store'
import type { Reservation } from '../lib/types'

type View = 'upcoming' | 'mine' | 'past'

export function Stays() {
  const { user, data, name } = useData()
  const [view, setView] = useState<View>('upcoming')
  const [day, setDay] = useState<string>()
  const t = today()
  const active = data.reservations.filter((r) => r.status === 'active')
  // The list also shows "maybe" stays; the calendar only confirmed ones.
  const open = data.reservations.filter((r) => r.status !== 'cancelled')
  const priorityId = priorityUserFor(Number(t.slice(0, 4)), data.settings)
  const nextPriorityId = priorityUserFor(Number(t.slice(0, 4)) + 1, data.settings)

  let list: Reservation[]
  if (day) list = open.filter((r) => r.start <= day && day < r.end)
  else if (view === 'upcoming') list = open.filter((r) => r.end > t)
  else if (view === 'past') list = active.filter((r) => r.end <= t).reverse()
  else list = data.reservations.filter((r) => r.userId === user.id).reverse()
  if (view !== 'past' && !day) list.sort((a, b) => a.start.localeCompare(b.start))

  const roomNames = (ids: string[]) => ids.map((id) => data.rooms.find((r) => r.id === id)?.name ?? '?').join(', ')

  return (
    <>
      <Header title="Stays" />
      <div className="page">
        {priorityId && (
          <p className="info small">
            ⭐ Priority {t.slice(0, 4)}: <strong>{name(priorityId)}</strong>
            {nextPriorityId && <> · {Number(t.slice(0, 4)) + 1}: <strong>{name(nextPriorityId)}</strong></>}
          </p>
        )}
        <MonthCalendar
          selected={day}
          onSelect={(d) => setDay(d === day ? undefined : d)}
          events={active.map((r) => ({ id: r.id, start: r.start, end: r.end, color: colorFor(r.userId), label: name(r.userId) }))}
        />

        {day ? (
          <div className="row-head">
            <h2>{formatDay(day, true)}</h2>
            <button className="btn small ghost" onClick={() => setDay(undefined)}>Show all</button>
          </div>
        ) : (
          <Segmented value={view} onChange={setView} options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'mine', label: 'Mine' },
            { value: 'past', label: 'Past' },
          ]} />
        )}

        {list.length === 0 && <Empty>{day ? 'Nobody booked on this day.' : 'No stays here yet.'}</Empty>}
        {list.map((r) => (
          <Link key={r.id} to={`/stays/${r.id}`} className={'card row' + (r.status === 'cancelled' ? ' faded' : '')}>
            <Avatar id={r.userId} name={name(r.userId)} />
            <div className="grow">
              <strong>{formatRange(r.start, r.end)}</strong>
              <p className="small muted">
                {name(r.userId)} · {stayNights(r)} nights · {r.people} people
              </p>
              <p className="small muted">{roomNames(r.roomIds)}</p>
              {r.occasion && <p className="small">🎉 {r.occasion}</p>}
              {r.status === 'tentative' && <span className="tag warn">Maybe</span>}
              {r.priorityClaim && r.status === 'active' && <span className="tag">⭐ Priority</span>}
              {r.status === 'cancelled' && (
                <span className={'tag ' + (r.lateCancel ? 'warn' : '')}>{r.lateCancel ? 'Cancelled late – billed' : 'Cancelled'}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {user.role !== 'car_keeper' && <Fab to="/stays/new" label="Book a stay" />}
    </>
  )
}
