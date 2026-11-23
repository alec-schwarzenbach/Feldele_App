import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { UsageEditor } from '../components/UsageEditor'
import { Avatar, Empty, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { formatDay, formatRange, today } from '../lib/dates'
import { cancelTerms, promotable, roomLabel, stayNights, usageTotals, waitingFor } from '../lib/rules'
import { useData } from '../lib/store'
import { HOUSES, houseOf, isAdmin, type NightUsage } from '../lib/types'

export function StayDetail() {
  const { id } = useParams()
  const { user, data, mutate, name } = useData()
  const nav = useNavigate()
  const r = data.reservations.find((x) => x.id === id)
  const [usage, setUsage] = useState<NightUsage[] | undefined>()
  if (!r) return (<><Header title="Aufenthalt" back /><Empty>Aufenthalt nicht gefunden.</Empty></>)

  const canEdit = r.userId === user.id || isAdmin(user)
  const terms = cancelTerms(r, data.reservations, data.settings)
  const waiting = r.status === 'active' ? waitingFor(r, data.reservations) : []
  const bumpedBy = r.bumpedBy ? data.reservations.find((x) => x.id === r.bumpedBy) : undefined
  const car = data.carBookings.filter((b) => b.reservationId === r.id)
  const isUpcoming = r.status !== 'cancelled' && r.end > today()
  const used = usageTotals(r)
  // From the first night on (and afterwards) you can record what you really used.
  const canRecord = canEdit && r.status === 'active' && r.start <= today()
  const houseRooms = data.rooms.filter((x) => houseOf(x) === houseOf(r))

  async function saveUsage() {
    const next = usage ?? []
    await mutate(() => api.updateReservation(r!.id, { usage: next.length ? next : undefined }))
    setUsage(undefined)
  }

  async function cancel() {
    const msg = terms.charged
      ? `${terms.why}\n\nWenn du jetzt stornierst, zählt dieser Aufenthalt trotzdem zu deinen Kosten. Trotzdem stornieren?`
      : `Aufenthalt stornieren? ${terms.why}`
    if (!confirm(msg)) return
    const stay = r!
    await mutate(async () => {
      await api.cancelReservation(stay.id, terms.charged)
      if (stay.status !== 'active') return
      // Free the rooms: waiting "maybe" stays become confirmed, oldest first.
      for (const t of promotable(stay, data.reservations)) {
        await api.confirmReservation(t.id)
        await api.notifyStay(t.userId, 'Dein Aufenthalt ist bestätigt 🎉',
          `${name(stay.userId)} hat storniert – dein «Vielleicht»-Aufenthalt ${formatRange(t.start, t.end)} ist jetzt bestätigt.`)
      }
    })
  }

  return (
    <>
      <Header title="Aufenthalt" back action={canEdit && isUpcoming ? (
        <button className="icon-btn" onClick={() => nav(`/stays/${r.id}/edit`)} aria-label="Bearbeiten"><Icon name="edit" /></button>
      ) : undefined} />
      <div className="page">
        <section className="card">
          <div className="row">
            <Avatar id={r.userId} name={name(r.userId)} size={44} />
            <div className="grow">
              <h2>{name(r.userId)}</h2>
              <p className="muted">{formatRange(r.start, r.end)}</p>
            </div>
          </div>
          {r.status === 'tentative' && (
            <p className="tag warn">
              Vielleicht{bumpedBy ? ` – ${name(bumpedBy.userId)} hat für diese Daten Priorität` : ' – wartet, bis die Zimmer frei werden'}
            </p>
          )}
          {r.priorityClaim && r.status === 'active' && <p className="tag">⭐ Mit Priorität gebucht</p>}
          {r.status === 'cancelled' && (
            <p className={'tag ' + (r.lateCancel ? 'warn' : '')}>
              {r.lateCancel ? 'Spät storniert – wird trotzdem verrechnet' : 'Gratis storniert'}
            </p>
          )}
          <dl className="facts">
            <dt>Nächte</dt><dd>{stayNights(r)}</dd>
            <dt>Personen</dt><dd>{r.people}</dd>
            <dt>Personennächte</dt><dd>{used.personNights}{r.usage?.length ? ` (gebucht ${stayNights(r) * r.people})` : ''}</dd>
            {r.roomIds.length > 0 && (<><dt>Zimmernächte</dt><dd>{used.roomNights}{r.usage?.length ? ` (gebucht ${stayNights(r) * r.roomIds.length})` : ''}</dd></>)}
            <dt>Haus</dt><dd>{HOUSES[houseOf(r)]}</dd>
            <dt>Zimmer</dt><dd>{r.roomIds.length ? r.roomIds.map((rid) => roomLabel(data.rooms.find((x) => x.id === rid))).join(', ') : 'Ganzes Haus'}</dd>
            {r.occasion && (<><dt>Anlass</dt><dd>🎉 {r.occasion}</dd></>)}
            {r.note && (<><dt>Notiz</dt><dd>{r.note}</dd></>)}
            <dt>Auto</dt><dd>{car.length ? car.map((b) => formatRange(b.start, b.end)).join(', ') : '—'}</dd>
            {waiting.length > 0 && (<><dt>Wartend</dt><dd>{waiting.map((w) => name(w.userId)).join(', ')} («Vielleicht»)</dd></>)}
          </dl>
        </section>

        {canRecord && (
          <section className="card form">
            <UsageEditor start={r.start} end={r.end} people={r.people} roomIds={r.roomIds} rooms={houseRooms}
              value={usage ?? r.usage ?? []} onChange={setUsage} />
            {usage && <button className="btn primary" onClick={saveUsage}>Nutzung speichern</button>}
          </section>
        )}

        {isUpcoming && (
          <section className="card">
            <h2>Stornieren</h2>
            <p className="small">
              {terms.why}
              {terms.freeUntil && <> Gratis bis <strong>{formatDay(terms.freeUntil, true)}</strong>.</>}
              {terms.charged && ' Wenn du jetzt stornierst, zählt es trotzdem zu deinen Kosten.'}
            </p>
            {canEdit && <button className="btn danger" onClick={cancel}>Aufenthalt stornieren</button>}
          </section>
        )}

        {isUpcoming && canEdit && car.length === 0 && houseOf(r) === 'feldele' && (
          <Link className="btn ghost" to={`/car/new?reservation=${r.id}`}>Auto für diesen Aufenthalt anfragen</Link>
        )}
      </div>
    </>
  )
}
