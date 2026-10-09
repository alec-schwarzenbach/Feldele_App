import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MonthCalendar } from '../components/MonthCalendar'
import { Avatar, Empty, Fab, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { colorFor } from '../lib/colors'
import { addDays, formatRange, today } from '../lib/dates'
import { carConflicts, carOwnerName } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin } from '../lib/types'

export function Car() {
  const { user, data, mutate, name } = useData()
  const [day, setDay] = useState<string>()
  const t = today()
  const isKeeper = user.role === 'car_keeper'
  // car end dates are inclusive (last day the car is needed)
  const events = data.carBookings.map((b) => ({
    id: b.id, start: b.start, end: addDays(b.end, 1), color: colorFor(b.userId), label: name(b.userId),
  }))
  const list = data.carBookings
    .filter((b) => (day ? b.start <= day && day <= b.end : b.end >= t))
    .sort((a, b) => a.start.localeCompare(b.start))

  return (
    <>
      <Header title="Auto" />
      <div className="page">
        <p className="muted small">
          {data.profiles.some((p) => p.role === 'car_keeper')
            ? `${carOwnerName(data.profiles)} wird bei jeder Buchung benachrichtigt – sonst niemand.`
            : 'Noch kein Autobesitzer festgelegt (Profil → Mitglieder).'}
        </p>

        <MonthCalendar events={events} selected={day} onSelect={(d) => setDay(d === day ? undefined : d)} />

        <div className="row-head">
          <h2>{day ? 'An diesem Tag' : 'Kommende Buchungen'}</h2>
          {day && <button className="btn small ghost" onClick={() => setDay(undefined)}>Alle zeigen</button>}
        </div>
        {list.length === 0 && <Empty>Das Auto ist frei.</Empty>}
        {list.map((b) => (
          <div key={b.id} className="card row">
            <Avatar id={b.userId} name={name(b.userId)} />
            <div className="grow">
              <strong>{formatRange(b.start, b.end)}</strong>
              <p className="small muted">{name(b.userId)}{b.reservationId ? ' · mit Aufenthalt' : ''}</p>
              {b.note && <p className="small">{b.note}</p>}
            </div>
            {(b.userId === user.id || isAdmin(user)) && (
              <button className="icon-btn" aria-label="Buchung löschen"
                onClick={() => confirm('Diese Autobuchung löschen?') && mutate(() => api.deleteCarBooking(b.id))}>
                <Icon name="trash" size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!isKeeper && user.role !== 'cleaner' && <Fab to="/car/new" label="Auto buchen" />}
    </>
  )
}

export function CarForm() {
  const { data, mutate, name } = useData()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const stay = data.reservations.find((r) => r.id === params.get('reservation'))
  const [start, setStart] = useState(stay?.start ?? addDays(today(), 1))
  const [end, setEnd] = useState(stay ? addDays(stay.end, -1) : addDays(today(), 2))
  const [note, setNote] = useState('')
  const clash = carConflicts(data.carBookings, { start, end })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (end < start) return alert('Das Ende darf nicht vor dem Anfang sein.')
    if (clash.length && !confirm('Das Auto ist in dieser Zeit teilweise schon gebucht. Trotzdem buchen?')) return
    const ok = await mutate(async () => {
      await api.createCarBooking({ start, end, note: note.trim() || undefined, reservationId: stay?.id })
      return true
    })
    if (ok) nav('/car', { replace: true })
  }

  return (
    <>
      <Header title="Auto buchen" back />
      <form className="page form" onSubmit={submit}>
        {stay && <p className="info small">Für deinen Aufenthalt {formatRange(stay.start, stay.end)}</p>}
        <div className="grid2">
          <label>Von<input type="date" value={start} onChange={(e) => {
            setStart(e.target.value)
            if (e.target.value > end) setEnd(e.target.value)
          }} required /></label>
          <label>Bis (inkl.)<input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        {clash.map((b) => (
          <p key={b.id} className="small warn-text">Schon gebucht von {name(b.userId)} ({formatRange(b.start, b.end)})</p>
        ))}
        <label>Notiz für {carOwnerName(data.profiles)} (optional)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Abholen am Bahnhof um 18:00" />
        </label>
        <button className="btn primary">Buchen & benachrichtigen</button>
      </form>
    </>
  )
}
