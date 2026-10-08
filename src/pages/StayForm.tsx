import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '../components/ui'
import { api } from '../lib/api'
import { addDays, formatDay, formatRange, nightsBetween, today } from '../lib/dates'
import { carConflicts, carOwnerName, claimDeadlineFrom, CLAIM_FREE_DAYS, freeCancelDeadline, planBooking, priorityUserFor, roomConflicts } from '../lib/rules'
import { useData } from '../lib/store'

export function StayForm() {
  const { id } = useParams()
  const { user, data, mutate, name } = useData()
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
  const draft = { id, start, end, roomIds }
  const plan = validDates && roomIds.length ? planBooking(draft, data.reservations, data.settings, existing?.userId ?? user.id) : { kind: 'free' as const }
  // Editing a confirmed stay can't take over other rooms; a "maybe" stay stays "maybe".
  const blocked = plan.kind === 'own' || (existing?.status === 'active' && plan.kind !== 'free')
  const conflicts = validDates ? roomConflicts(data.reservations, draft) : []
  const priorityId = priorityUserFor(Number(start.slice(0, 4)), data.settings)
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
    if (blocked) return alert('Some of these rooms are already booked in this period.')
    if (!existing && plan.kind === 'claim' && !confirm(
      `You have priority in ${start.slice(0, 4)}. ${[...new Set(plan.bump.map((b) => name(b.userId)))].join(', ')} ` +
      `will be moved to "maybe" and notified.\n\nYou can cancel for free for ${CLAIM_FREE_DAYS / 7} weeks; after that you pay even if you don't go. Continue?`,
    )) return
    setSaving(true)
    const fields = { start, end, people, roomIds, occasion: occasion.trim() || undefined, note: note.trim() || undefined }
    const stayId = await mutate(async () => {
      if (existing) {
        await api.updateReservation(existing.id, fields)
        return existing.id
      }
      const r = await api.createReservation({
        ...fields,
        status: plan.kind === 'maybe' ? 'tentative' : 'active',
        ...(plan.kind === 'claim' ? { priorityClaim: true, claimDeadline: claimDeadlineFrom() } : {}),
      })
      if (plan.kind === 'claim') {
        for (const b of plan.bump) {
          await api.bumpReservation(b.id, r.id)
          await api.notifyStay(b.userId, 'Your stay is now "maybe"',
            `${user.name} has priority in ${start.slice(0, 4)} and booked ${formatRange(start, end)}. ` +
            `Your stay ${formatRange(b.start, b.end)} is now "maybe" – it becomes confirmed again if ${user.name} cancels.`)
        }
      }
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
                <button type="button" key={room.id}
                  className={'room' + (on ? ' on' : '') + (taken ? ' taken' : '')} onClick={() => toggleRoom(room.id)}>
                  <strong>{room.name}</strong>
                  <span className="small">{taken ? 'Booked by someone' : `${room.beds} beds`}</span>
                </button>
              )
            })}
          </div>
          {roomIds.length > 0 && people > beds && (
            <p className="small warn-text">{people} people but only {beds} beds selected.</p>
          )}
          {conflicts.map((c) => (
            <p key={c.id} className={'small ' + (blocked ? 'error' : 'warn-text')}>
              Taken by {name(c.userId)} ({formatRange(c.start, c.end)})
            </p>
          ))}
        </fieldset>

        {!existing && plan.kind === 'claim' && (
          <p className="info small">
            ⭐ <strong>You have priority in {start.slice(0, 4)}.</strong> Booking moves the stays above to "maybe".
            You then have {CLAIM_FREE_DAYS / 7} weeks to cancel for free – after that you pay even if you don't go.
          </p>
        )}
        {!existing && plan.kind === 'maybe' && (
          <p className="info small warn-text">
            These rooms are taken, so your stay will be <strong>"maybe"</strong>. It becomes confirmed automatically if the
            other stay is cancelled. {priorityId && `(${name(priorityId)} has priority in ${start.slice(0, 4)}.)`}
          </p>
        )}

        <label>Occasion / party (optional)
          <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Birthday, hunting weekend" />
        </label>
        <label>Note (optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></label>

        {!existing && (
          <fieldset>
            <label className="check">
              <input type="checkbox" checked={needCar} onChange={(e) => setNeedCar(e.target.checked)} />
              I need the car ({carOwnerName(data.profiles)} will be notified)
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

        {validDates && !existing && plan.kind === 'free' && (
          <p className="info small">
            Cancelling is free as long as nobody else is waiting for these dates. If someone is, it's free until
            {' '}<strong>{formatDay(deadline, true)}</strong> ({data.settings.freeCancelMonths} months before arrival); after that it counts toward your costs.
          </p>
        )}

        <button className="btn primary" disabled={saving || blocked}>
          {existing ? 'Save changes' : plan.kind === 'maybe' ? 'Book as "maybe"' : plan.kind === 'claim' ? 'Book with priority' : 'Book stay'}
        </button>
      </form>
    </>
  )
}
