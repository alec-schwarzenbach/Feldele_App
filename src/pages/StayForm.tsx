import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '../components/ui'
import { api } from '../lib/api'
import { addDays, formatDay, formatRange, nightsBetween, today } from '../lib/dates'
import { carConflicts, freeCancelDeadline, roomConflicts } from '../lib/rules'
import { useData } from '../lib/store'

export function StayForm() {
  const { id } = useParams()
  const { data, mutate, name } = useData()
  const nav = useNavigate()
  const existing = id ? data.reservations.find((r) => r.id === id) : undefined

  const [start, setStart] = useState(existing?.start ?? addDays(today(), 7))
  const [end, setEnd] = useState(existing?.end ?? addDays(today(), 10))
  const [people, setPeople] = useState(existing?.people ?? 2)
  const [roomIds, setRoomIds] = useState<string[]>(existing?.roomIds ?? [])
  const [occasion, setOccasion] = useState(existing?.occasion ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [needCar, setNeedCar] = useState(false)
  const [carStart, setCarStart] = useState('')
  const [carEnd, setCarEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const nights = nightsBetween(start, end)
  const validDates = end > start
  const conflicts = validDates ? roomConflicts(data.reservations, { id, start, end, roomIds }) : []
  const takenRoom = (roomId: string) =>
    validDates && roomConflicts(data.reservations, { id, start, end, roomIds: [roomId] }).length > 0
  const beds = roomIds.reduce((s, rid) => s + (data.rooms.find((r) => r.id === rid)?.beds ?? 0), 0)
  const cs = carStart || start
  const ce = carEnd || end
  const carClash = needCar ? carConflicts(data.carBookings, { start: cs, end: ce }) : []
  const deadline = freeCancelDeadline({ start }, data.settings)

  function toggleRoom(rid: string) {
    setRoomIds((ids) => (ids.includes(rid) ? ids.filter((x) => x !== rid) : [...ids, rid]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validDates) return alert('Departure must be after arrival.')
    if (roomIds.length === 0) return alert('Pick at least one room.')
    if (conflicts.length) return alert('Some rooms are already booked in this period.')
    setSaving(true)
    const fields = { start, end, people, roomIds, occasion: occasion.trim() || undefined, note: note.trim() || undefined }
    const stayId = await mutate(async () => {
      if (existing) {
        await api.updateReservation(existing.id, fields)
        return existing.id
      }
      const r = await api.createReservation(fields)
      if (needCar) await api.createCarBooking({ start: cs, end: ce, reservationId: r.id, note: undefined })
      return r.id
    })
    setSaving(false)
    if (stayId) nav(`/stays/${stayId}`, { replace: true })
  }

  return (
    <>
      <Header title={existing ? 'Edit stay' : 'Book a stay'} back />
      <form className="page form" onSubmit={submit}>
        <div className="grid2">
          <label>Arrival<input type="date" value={start} min={existing ? undefined : today()} onChange={(e) => {
            setStart(e.target.value)
            if (e.target.value >= end) setEnd(addDays(e.target.value, 1))
          }} required /></label>
          <label>Departure<input type="date" value={end} min={addDays(start, 1)} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        {validDates && <p className="small muted">{nights} night{nights === 1 ? '' : 's'}</p>}

        <label>How many people (including you)?
          <div className="stepper">
            <button type="button" onClick={() => setPeople(Math.max(1, people - 1))} aria-label="Fewer">−</button>
            <strong>{people}</strong>
            <button type="button" onClick={() => setPeople(people + 1)} aria-label="More">+</button>
          </div>
        </label>

        <fieldset>
          <legend>Rooms</legend>
          <div className="room-list">
            {data.rooms.map((room) => {
              const taken = takenRoom(room.id)
              const on = roomIds.includes(room.id)
              return (
                <button type="button" key={room.id} disabled={taken && !on}
                  className={'room' + (on ? ' on' : '') + (taken ? ' taken' : '')} onClick={() => toggleRoom(room.id)}>
                  <strong>{room.name}</strong>
                  <span className="small">{taken ? 'Booked' : `${room.beds} beds`}</span>
                </button>
              )
            })}
          </div>
          {roomIds.length > 0 && people > beds && (
            <p className="small warn-text">{people} people but only {beds} beds selected.</p>
          )}
          {conflicts.map((c) => (
            <p key={c.id} className="small error">Conflicts with {name(c.userId)} ({formatRange(c.start, c.end)})</p>
          ))}
        </fieldset>

        <label>Occasion / party (optional)
          <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Birthday, hunting weekend" />
        </label>
        <label>Note (optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></label>

        {!existing && (
          <fieldset>
            <label className="check">
              <input type="checkbox" checked={needCar} onChange={(e) => setNeedCar(e.target.checked)} />
              I need the car (Günther will be notified)
            </label>
            {needCar && (
              <>
                <div className="grid2">
                  <label>From<input type="date" value={cs} onChange={(e) => setCarStart(e.target.value)} /></label>
                  <label>To<input type="date" value={ce} min={cs} onChange={(e) => setCarEnd(e.target.value)} /></label>
                </div>
                {carClash.map((b) => (
                  <p key={b.id} className="small warn-text">Car already booked by {name(b.userId)} ({formatRange(b.start, b.end)})</p>
                ))}
              </>
            )}
          </fieldset>
        )}

        {validDates && (deadline >= today() ? (
          <p className="info small">
            Free cancellation until <strong>{formatDay(deadline, true)}</strong> ({data.settings.freeCancelMonths} months before arrival).
            After that, the stay is billed even if you cancel.
          </p>
        ) : (
          <p className="info small warn-text">
            Arrival is less than {data.settings.freeCancelMonths} months away, so this booking is binding:
            if you cancel, it still counts toward your share of the costs.
          </p>
        ))}

        <button className="btn primary" disabled={saving}>{existing ? 'Save changes' : 'Book stay'}</button>
      </form>
    </>
  )
}
