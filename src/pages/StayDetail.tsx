import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Empty, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { formatDay, formatRange, today } from '../lib/dates'
import { freeCancelDeadline, isFreeCancel, stayNights } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin } from '../lib/types'

export function StayDetail() {
  const { id } = useParams()
  const { user, data, mutate, name } = useData()
  const nav = useNavigate()
  const r = data.reservations.find((x) => x.id === id)
  if (!r) return (<><Header title="Stay" back /><Empty>Stay not found.</Empty></>)

  const canEdit = r.userId === user.id || isAdmin(user)
  const free = isFreeCancel(r, data.settings)
  const deadline = freeCancelDeadline(r, data.settings)
  const car = data.carBookings.filter((b) => b.reservationId === r.id)
  const isUpcoming = r.status === 'active' && r.end > today()

  async function cancel() {
    const msg = free
      ? 'Cancel this stay? It is free until ' + formatDay(deadline, true) + '.'
      : `The free cancellation period ended on ${formatDay(deadline, true)}.\n\nIf you cancel now, this stay still counts toward your share of the costs. Cancel anyway?`
    if (!confirm(msg)) return
    await mutate(() => api.cancelReservation(r!.id, !free))
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
          {r.status === 'cancelled' && (
            <p className={'tag ' + (r.lateCancel ? 'warn' : '')}>
              {r.lateCancel ? 'Cancelled after the free period – still billed' : 'Cancelled for free'}
            </p>
          )}
          <dl className="facts">
            <dt>Nights</dt><dd>{stayNights(r)}</dd>
            <dt>People</dt><dd>{r.people}</dd>
            <dt>Person-nights</dt><dd>{stayNights(r) * r.people}</dd>
            <dt>Rooms</dt><dd>{r.roomIds.map((rid) => data.rooms.find((x) => x.id === rid)?.name ?? '?').join(', ')}</dd>
            {r.occasion && (<><dt>Occasion</dt><dd>🎉 {r.occasion}</dd></>)}
            {r.note && (<><dt>Note</dt><dd>{r.note}</dd></>)}
            <dt>Car</dt><dd>{car.length ? car.map((b) => formatRange(b.start, b.end)).join(', ') : '—'}</dd>
          </dl>
        </section>

        {isUpcoming && (
          <section className="card">
            <h2>Cancellation</h2>
            <p className="small">
              {free
                ? <>Free cancellation until <strong>{formatDay(deadline, true)}</strong>.</>
                : <>The free period ended on <strong>{formatDay(deadline, true)}</strong>. Cancelling now still counts toward the cost split.</>}
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
