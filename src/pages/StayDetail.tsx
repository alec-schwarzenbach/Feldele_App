import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Empty, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { formatDay, formatRange, today } from '../lib/dates'
import { cancelTerms, promotable, roomLabel, stayNights, waitingFor } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin } from '../lib/types'

export function StayDetail() {
  const { id } = useParams()
  const { user, data, mutate, name } = useData()
  const nav = useNavigate()
  const r = data.reservations.find((x) => x.id === id)
  if (!r) return (<><Header title="Stay" back /><Empty>Stay not found.</Empty></>)

  const canEdit = r.userId === user.id || isAdmin(user)
  const terms = cancelTerms(r, data.reservations, data.settings)
  const waiting = r.status === 'active' ? waitingFor(r, data.reservations) : []
  const bumpedBy = r.bumpedBy ? data.reservations.find((x) => x.id === r.bumpedBy) : undefined
  const car = data.carBookings.filter((b) => b.reservationId === r.id)
  const isUpcoming = r.status !== 'cancelled' && r.end > today()

  async function cancel() {
    const msg = terms.charged
      ? `${terms.why}\n\nIf you cancel now, this stay still counts toward your share of the costs. Cancel anyway?`
      : `Cancel this stay? ${terms.why}`
    if (!confirm(msg)) return
    const stay = r!
    await mutate(async () => {
      await api.cancelReservation(stay.id, terms.charged)
      if (stay.status !== 'active') return
      // Free the rooms: waiting "maybe" stays become confirmed, oldest first.
      for (const t of promotable(stay, data.reservations)) {
        await api.confirmReservation(t.id)
        await api.notifyStay(t.userId, 'Your stay is confirmed 🎉',
          `${name(stay.userId)} cancelled, so your "maybe" stay ${formatRange(t.start, t.end)} is now confirmed.`)
      }
    })
  }

  return (
    <>
      <Header title="Stay" back action={canEdit && isUpcoming ? (
        <button className="icon-btn" onClick={() => nav(`/stays/${r.id}/edit`)} aria-label="Edit"><Icon name="edit" /></button>
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
              Maybe{bumpedBy ? ` – ${name(bumpedBy.userId)} has priority on these dates` : ' – waiting for the rooms to free up'}
            </p>
          )}
          {r.priorityClaim && r.status === 'active' && <p className="tag">⭐ Booked with priority</p>}
          {r.status === 'cancelled' && (
            <p className={'tag ' + (r.lateCancel ? 'warn' : '')}>
              {r.lateCancel ? 'Cancelled late – still billed' : 'Cancelled for free'}
            </p>
          )}
          <dl className="facts">
            <dt>Nights</dt><dd>{stayNights(r)}</dd>
            <dt>People</dt><dd>{r.people}</dd>
            <dt>Person-nights</dt><dd>{stayNights(r) * r.people}</dd>
            <dt>Rooms</dt><dd>{r.roomIds.map((rid) => roomLabel(data.rooms.find((x) => x.id === rid))).join(', ')}</dd>
            {r.occasion && (<><dt>Occasion</dt><dd>🎉 {r.occasion}</dd></>)}
            {r.note && (<><dt>Note</dt><dd>{r.note}</dd></>)}
            <dt>Car</dt><dd>{car.length ? car.map((b) => formatRange(b.start, b.end)).join(', ') : '—'}</dd>
            {waiting.length > 0 && (<><dt>Waiting</dt><dd>{waiting.map((w) => name(w.userId)).join(', ')} ("maybe")</dd></>)}
          </dl>
        </section>

        {isUpcoming && (
          <section className="card">
            <h2>Cancellation</h2>
            <p className="small">
              {terms.why}
              {terms.freeUntil && <> Free until <strong>{formatDay(terms.freeUntil, true)}</strong>.</>}
              {terms.charged && ' Cancelling now still counts toward your costs.'}
            </p>
            {canEdit && <button className="btn danger" onClick={cancel}>Cancel stay</button>}
          </section>
        )}

        {isUpcoming && canEdit && car.length === 0 && (
          <Link className="btn ghost" to={`/car/new?reservation=${r.id}`}>Request the car for this stay</Link>
        )}
      </div>
    </>
  )
}
