import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Header } from '../components/ui'
import { api } from '../lib/api'
import { addDays, formatDay, formatRange, nightsBetween, today } from '../lib/dates'
import { carConflicts, carOwnerName, claimDeadlineFrom, CLAIM_FREE_DAYS, freeCancelDeadline, planBooking, priorityClanFor, priorityHolders, roomConflicts, roomsByArea } from '../lib/rules'
import { useData } from '../lib/store'
import { HOUSES, houseOf, isOwner } from '../lib/types'

export function StayForm() {
  const { id } = useParams()
  const { user, data, mutate, name, house: selectedHouse } = useData()
  const nav = useNavigate()
  const existing = id ? data.reservations.find((r) => r.id === id) : undefined
  const house = existing ? houseOf(existing) : selectedHouse
  // A house without rooms set up (Waldele for now) is booked as a whole.
  const houseRooms = data.rooms.filter((r) => houseOf(r) === house)
  const wholeHouse = houseRooms.length === 0

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
  const draft = { id, start, end, roomIds, house }
  const plan = validDates && (roomIds.length || wholeHouse) ? planBooking(draft, data.reservations, data.settings, existing?.userId ?? user.id, data.profiles, data.families) : { kind: 'free' as const }
  // Editing a confirmed stay can't take over other rooms; a "maybe" stay stays "maybe".
  const blocked = plan.kind === 'own' || (existing?.status === 'active' && plan.kind !== 'free')
  // Without rooms picked yet nothing clashes (except in a house without rooms, booked as a whole).
  const conflicts = validDates && (roomIds.length || wholeHouse) ? roomConflicts(data.reservations, draft) : []
  const priorityId = priorityClanFor(Number(start.slice(0, 4)), data.settings)
  const takenRoom = (roomId: string) =>
    validDates && roomConflicts(data.reservations, { id, start, end, roomIds: [roomId], house }).length > 0
  const beds = roomIds.reduce((s, rid) => s + (data.rooms.find((r) => r.id === rid)?.beds ?? 0), 0)
  const cs = carStart || start
  const ce = carEnd || end
  const carClash = needCar ? carConflicts(data.carBookings, { start: cs, end: ce }) : []
  const deadline = freeCancelDeadline({ start }, data.settings)
  const weeks = CLAIM_FREE_DAYS / 7

  function toggleRoom(rid: string) {
    setRoomIds((ids) => (ids.includes(rid) ? ids.filter((x) => x !== rid) : [...ids, rid]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validDates) return alert('Die Abreise muss nach der Anreise sein.')
    if (roomIds.length === 0 && !wholeHouse) return alert('Wähle mindestens ein Zimmer.')
    if (blocked) return alert('Einige dieser Zimmer sind in dieser Zeit schon gebucht.')
    if (!existing && plan.kind === 'claim' && !confirm(
      `Du hast ${start.slice(0, 4)} Priorität. ${[...new Set(plan.bump.map((b) => name(b.userId)))].join(', ')} ` +
      `wird auf «Vielleicht» gesetzt und benachrichtigt.\n\nDu kannst ${weeks} Wochen lang gratis stornieren, danach bezahlst du auch, wenn du nicht gehst. Weiter?`,
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
        house,
        status: plan.kind === 'maybe' ? 'tentative' : 'active',
        ...(plan.kind === 'claim' ? { priorityClaim: true, claimDeadline: claimDeadlineFrom() } : {}),
      })
      if (plan.kind === 'claim') {
        for (const b of plan.bump) {
          await api.bumpReservation(b.id, r.id)
          await api.notifyStay(b.userId, 'Dein Aufenthalt ist jetzt «Vielleicht»',
            `${user.name} hat ${start.slice(0, 4)} Priorität und hat ${formatRange(start, end)} gebucht. ` +
            `Dein Aufenthalt ${formatRange(b.start, b.end)} ist jetzt «Vielleicht» – er wird wieder bestätigt, falls ${user.name} storniert.`)
        }
      }
      if (needCar && house === 'feldele') await api.createCarBooking({ start: cs, end: ce, reservationId: r.id, note: undefined })
      return r.id
    })
    setSaving(false)
    if (stayId) nav(`/stays/${stayId}`, { replace: true })
  }

  return (
    <>
      <Header title={`${existing ? 'Aufenthalt bearbeiten' : 'Buchen'} – ${HOUSES[house]}`} back />
      <form className="page form" onSubmit={submit}>
        <div className="grid2">
          <label>Anreise<input type="date" value={start} min={existing ? undefined : today()} onChange={(e) => {
            setStart(e.target.value)
            if (e.target.value >= end) setEnd(addDays(e.target.value, 1))
          }} required /></label>
          <label>Abreise<input type="date" value={end} min={addDays(start, 1)} onChange={(e) => setEnd(e.target.value)} required /></label>
        </div>
        {validDates && <p className="small muted">{nights} {nights === 1 ? 'Nacht' : 'Nächte'}</p>}

        <label>Wie viele Personen (inklusive dir)?
          <div className="stepper">
            <button type="button" onClick={() => setPeople(Math.max(1, people - 1))} aria-label="Weniger">−</button>
            <strong>{people}</strong>
            <button type="button" onClick={() => setPeople(people + 1)} aria-label="Mehr">+</button>
          </div>
        </label>

        <fieldset>
          <legend>Zimmer</legend>
          {wholeHouse && <p className="small muted">Für {HOUSES[house]} sind noch keine Zimmer erfasst – die Buchung gilt für das ganze Haus.</p>}
          {roomsByArea(houseRooms).map(([area, rooms]) => (
            <div key={area}>
              {area && <p className="room-area">{area}</p>}
              <div className="room-list">
                {rooms.map((room) => {
                  const taken = takenRoom(room.id)
                  const on = roomIds.includes(room.id)
                  return (
                    <button type="button" key={room.id}
                      className={'room' + (on ? ' on' : '') + (taken ? ' taken' : '')} onClick={() => toggleRoom(room.id)}>
                      <strong>{room.name}</strong>
                      <span className="small">
                        {taken ? 'Schon gebucht' : `${room.beds} ${room.beds === 1 ? 'Bett' : 'Betten'}`}{room.code ? ` · ${room.code}` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {roomIds.length > 0 && people > beds && (
            <p className="small warn-text">{people} Personen, aber nur {beds} {beds === 1 ? 'Bett' : 'Betten'} gewählt.</p>
          )}
          {conflicts.map((c) => (
            <p key={c.id} className={'small ' + (blocked ? 'error' : 'warn-text')}>
              Belegt von {name(c.userId)} ({formatRange(c.start, c.end)})
            </p>
          ))}
        </fieldset>

        {!existing && plan.kind === 'claim' && (
          <p className="info small">
            ⭐ <strong>Du hast {start.slice(0, 4)} Priorität.</strong> Die Buchungen oben werden auf «Vielleicht» gesetzt.
            Danach kannst du {weeks} Wochen lang gratis stornieren – später bezahlst du auch, wenn du nicht gehst.
          </p>
        )}
        {!existing && plan.kind === 'maybe' && (
          <p className="info small warn-text">
            Diese Zimmer sind belegt, deshalb wird dein Aufenthalt <strong>«Vielleicht»</strong>. Er wird automatisch bestätigt,
            wenn der andere Aufenthalt storniert wird. {priorityId && `(Priorität ${start.slice(0, 4)}: ${priorityHolders(priorityId, data.families, data.clans, isOwner(user))}.)`}
          </p>
        )}

        <label>Anlass / Fest (optional)
          <input value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="z. B. Geburtstag, Jagdwochenende" />
        </label>
        <label>Notiz (optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></label>

        {!existing && house === 'feldele' && (
          <fieldset>
            <label className="check">
              <input type="checkbox" checked={needCar} onChange={(e) => setNeedCar(e.target.checked)} />
              Ich brauche das Auto ({carOwnerName(data.profiles)} wird benachrichtigt)
            </label>
            {needCar && (
              <>
                <div className="grid2">
                  <label>Von<input type="date" value={cs} onChange={(e) => setCarStart(e.target.value)} /></label>
                  <label>Bis<input type="date" value={ce} min={cs} onChange={(e) => setCarEnd(e.target.value)} /></label>
                </div>
                {carClash.map((b) => (
                  <p key={b.id} className="small warn-text">Das Auto ist schon von {name(b.userId)} gebucht ({formatRange(b.start, b.end)})</p>
                ))}
              </>
            )}
          </fieldset>
        )}

        {validDates && !existing && plan.kind === 'free' && (
          <p className="info small">
            Stornieren ist gratis, solange niemand sonst auf diese Daten wartet. Wenn jemand wartet, ist es gratis bis
            {' '}<strong>{formatDay(deadline, true)}</strong> ({data.settings.freeCancelMonths} Monate vor der Anreise); danach zählt es zu deinen Kosten.
          </p>
        )}

        <button className="btn primary" disabled={saving || blocked}>
          {existing ? 'Änderungen speichern' : plan.kind === 'maybe' ? 'Als «Vielleicht» buchen' : plan.kind === 'claim' ? 'Mit Priorität buchen' : 'Aufenthalt buchen'}
        </button>
      </form>
    </>
  )
}
