import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MonthCalendar } from '../components/MonthCalendar'
import { Avatar, Empty, Fab, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { colorFor } from '../lib/colors'
import { addDays, formatRange, timeAgo, today } from '../lib/dates'
import { carConflicts } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin } from '../lib/types'

export function Car() {
  const { user, data, mutate, name } = useData()
  const [day, setDay] = useState<string>()
  const t = today()
  const isKeeper = user.role === 'car_keeper'
  const unread = data.notifications.some((n) => !n.read)

  // Opening this page counts as having seen the notifications.
  useEffect(() => {
    if (unread) {
      const timer = setTimeout(() => mutate(() => api.markNotificationsRead()), 1500)
      return () => clearTimeout(timer)
    }
  }, [unread, mutate])

  // car end dates are inclusive (last day the car is needed)
  const events = data.carBookings.map((b) => ({
    id: b.id, start: b.start, end: addDays(b.end, 1), color: colorFor(b.userId), label: name(b.userId),
  }))
  const list = data.carBookings
    .filter((b) => (day ? b.start <= day && day <= b.end : b.end >= t))
    .sort((a, b) => a.start.localeCompare(b.start))
  const keepers = data.profiles.filter((p) => p.role === 'car_keeper').map((p) => p.name)

  return (
    <>
      <Header title="Car" />
      <div className="page">
        <p className="muted small">
          {keepers.length ? `${keepers.join(', ')} gets notified about every booking.` : 'No car keeper set yet (Settings → Members).'}
        </p>

        {data.notifications.length > 0 && (
          <section className="card">
            <h2><Icon name="bell" size={18} /> Notifications</h2>
            {data.notifications.slice(0, 6).map((n) => (
              <div key={n.id} className={'notif' + (n.read ? '' : ' unread')}>
                <strong>{n.title}</strong>
                <p className="small">{n.body}</p>
                <p className="small muted">{timeAgo(n.createdAt)}</p>
              </div>
            ))}
          </section>
        )}

        <MonthCalendar events={events} selected={day} onSelect={(d) => setDay(d === day ? undefined : d)} />

        <div className="row-head">
          <h2>{day ? 'On this day' : 'Upcoming bookings'}</h2>
          {day && <button className="btn small ghost" onClick={() => setDay(undefined)}>Show all</button>}
        </div>
        {list.length === 0 && <Empty>The car is free.</Empty>}
        {list.map((b) => (
          <div key={b.id} className="card row">
            <Avatar id={b.userId} name={name(b.userId)} />
            <div className="grow">
              <strong>{formatRange(b.start, b.end)}</strong>
              <p className="small muted">{name(b.userId)}{b.reservationId ? ' · with stay' : ''}</p>
              {b.note && <p className="small">{b.note}</p>}
            </div>
            {(b.userId === user.id || isAdmin(user)) && (
              <button className="icon-btn" aria-label="Delete booking"
                onClick={() => confirm('Remove this car booking?') && mutate(() => api.deleteCarBooking(b.id))}>
                <Icon name="trash" size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!isKeeper && <Fab to="/car/new" label="Book the car" />}
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
    if (end < start) return alert('End must not be before start.')
    if (clash.length && !confirm('The car is already booked in part of this period. Book anyway?')) return
    const ok = await mutate(async () => {
      await api.createCarBooking({ start, end, note: note.trim() || undefined, reservationId: stay?.id })
      return true
    })
    if (ok) nav('/car', { replace: true })
  }

  return (
    <>
      <Header title="Book the car" back />
      <form className="page form" onSubmit={submit}>
        {stay && <p className="info small">For your stay {formatRange(stay.start, stay.end)}</p>}
        <div className="grid2">
          <label>From<input type="date" value={start} onChange={(e) => {
            setStart(e.target.value)
            if (e.target.value > end) setEnd(e.target.value)
          }} required /></label>
          <label>Until (incl.)<input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        {clash.map((b) => (
          <p key={b.id} className="small warn-text">Already booked by {name(b.userId)} ({formatRange(b.start, b.end)})</p>
        ))}
        <label>Note for Günter Kobalt (optional)
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. pick-up at the station at 18:00" />
        </label>
        <button className="btn primary">Book & notify</button>
      </form>
    </>
  )
}
