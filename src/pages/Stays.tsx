import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MonthCalendar } from '../components/MonthCalendar'
import { Avatar, Empty, Fab, Header, Segmented } from '../components/ui'
import { colorFor } from '../lib/colors'
import { formatDay, formatRange, today } from '../lib/dates'
import { priorityFamilyFor, roomLabel, stayNights } from '../lib/rules'
import { useData } from '../lib/store'
import type { Reservation } from '../lib/types'

type View = 'upcoming' | 'mine' | 'past'

export function Stays() {
  const { user, data, name, familyName } = useData()
  const [view, setView] = useState<View>('upcoming')
  const [day, setDay] = useState<string>()
  const t = today()
  const active = data.reservations.filter((r) => r.status === 'active')
  // The list also shows "maybe" stays; the calendar only confirmed ones.
  const open = data.reservations.filter((r) => r.status !== 'cancelled')
  const priorityId = priorityFamilyFor(Number(t.slice(0, 4)), data.settings)
  const nextPriorityId = priorityFamilyFor(Number(t.slice(0, 4)) + 1, data.settings)
  const staff = user.role === 'car_keeper' || user.role === 'cleaner'

  let list: Reservation[]
  if (day) list = open.filter((r) => r.start <= day && day < r.end)
  else if (view === 'upcoming') list = open.filter((r) => r.end > t)
  else if (view === 'past') list = active.filter((r) => r.end <= t).reverse()
  else list = data.reservations.filter((r) => r.userId === user.id).reverse()
  if (view !== 'past' && !day) list.sort((a, b) => a.start.localeCompare(b.start))

  const roomNames = (ids: string[]) => ids.map((id) => roomLabel(data.rooms.find((r) => r.id === id))).join(', ')

  return (
    <>
      <Header title="Aufenthalte" />
      <div className="page">
        {priorityId && (
          <p className="info small">
            ⭐ Priorität {t.slice(0, 4)}: <strong>{familyName(priorityId)}</strong>
            {nextPriorityId && <> · {Number(t.slice(0, 4)) + 1}: <strong>{familyName(nextPriorityId)}</strong></>}
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
            <button className="btn small ghost" onClick={() => setDay(undefined)}>Alle zeigen</button>
          </div>
        ) : (
          <Segmented value={view} onChange={setView} options={[
            { value: 'upcoming', label: 'Kommende' },
            { value: 'mine', label: 'Meine' },
            { value: 'past', label: 'Vergangene' },
          ]} />
        )}

        {list.length === 0 && <Empty>{day ? 'An diesem Tag hat niemand gebucht.' : 'Hier gibt es noch keine Aufenthalte.'}</Empty>}
        {list.map((r) => (
          <Link key={r.id} to={`/stays/${r.id}`} className={'card row' + (r.status === 'cancelled' ? ' faded' : '')}>
            <Avatar id={r.userId} name={name(r.userId)} />
            <div className="grow">
              <strong>{formatRange(r.start, r.end)}</strong>
              <p className="small muted">
                {name(r.userId)} · {stayNights(r)} {stayNights(r) === 1 ? 'Nacht' : 'Nächte'} · {r.people} {r.people === 1 ? 'Person' : 'Personen'}
              </p>
              <p className="small muted">{roomNames(r.roomIds)}</p>
              {r.occasion && <p className="small">🎉 {r.occasion}</p>}
              {r.status === 'tentative' && <span className="tag warn">Vielleicht</span>}
              {r.priorityClaim && r.status === 'active' && <span className="tag">⭐ Priorität</span>}
              {r.status === 'cancelled' && (
                <span className={'tag ' + (r.lateCancel ? 'warn' : '')}>{r.lateCancel ? 'Spät storniert – wird verrechnet' : 'Storniert'}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {!staff && <Fab to="/stays/new" label="Aufenthalt buchen" />}
    </>
  )
}
