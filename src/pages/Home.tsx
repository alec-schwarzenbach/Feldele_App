import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Icon } from '../components/ui'
import { formatDay, formatRange, timeAgo, today } from '../lib/dates'
import { buildYearReport, familyLabel, priorityFamilyFor } from '../lib/rules'
import { api } from '../lib/api'
import { useData } from '../lib/store'
import { isAdmin, isOwner } from '../lib/types'

export function Home() {
  const { user, data, mutate, name, familyName } = useData()
  const nav = useNavigate()
  const t = today()
  const active = data.reservations.filter((r) => r.status === 'active')
  const hereNow = active.filter((r) => r.start <= t && t < r.end)
  const upcoming = active.filter((r) => r.start > t).sort((a, b) => a.start.localeCompare(b.start))
  const myNext = data.reservations
    .filter((r) => r.userId === user.id && r.status !== 'cancelled' && r.end > t)
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const unread = data.notifications.filter((n) => !n.read)
  const priorityId = priorityFamilyFor(Number(t.slice(0, 4)), data.settings)

  // Seeing the notifications here counts as having read them.
  const hasUnread = unread.length > 0
  useEffect(() => {
    if (!hasUnread) return
    const timer = setTimeout(() => mutate(() => api.markNotificationsRead()), 2500)
    return () => clearTimeout(timer)
  }, [hasUnread, mutate])
  const waiting = isOwner(user) ? data.profiles.filter((p) => p.role === 'pending') : []
  const report = buildYearReport(Number(t.slice(0, 4)), data.profiles, data.families, data.reservations, data.costs)
  const latestCatch = [...data.catches].sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))[0]

  return (
    <>
      <header className="home-head">
        <div>
          <p className="muted small">{data.settings.lodgeName}</p>
          <h1>Hi {user.name} 👋</h1>
        </div>
        <button className="icon-btn" onClick={() => nav('/profile')} aria-label="Profile and settings">
          <Avatar id={user.id} name={user.name} size={38} />
        </button>
      </header>

      <div className="page">
        {waiting.length > 0 && (
          <Link to="/profile" className="card notice">
            <Icon name="user" />
            <div>
              <strong>{waiting.length} waiting for approval</strong>
              <p className="small">{waiting.map((p) => p.name).join(', ')} – tap to approve under Members.</p>
            </div>
          </Link>
        )}

        {data.notifications.length > 0 && (
          <section className={'card' + (hasUnread ? ' notice' : '')} style={{ flexDirection: 'column' }}>
            <h2><Icon name="bell" size={18} /> Notifications{hasUnread && ` (${unread.length} new)`}</h2>
            {data.notifications.slice(0, 4).map((n) => (
              <div key={n.id} className={'notif' + (n.read ? '' : ' unread')}>
                <strong>{n.title}</strong>
                <p className="small">{n.body}</p>
                <p className="small muted">{timeAgo(n.createdAt)}</p>
              </div>
            ))}
          </section>
        )}

        {priorityId && (
          <p className="info small">
            ⭐ {priorityId === user.familyId ? <>Your family has priority in {t.slice(0, 4)}.</> : <>Family <strong>{familyName(priorityId)}</strong> has priority in {t.slice(0, 4)}.</>}
          </p>
        )}

        <section className="card">
          <h2>At {data.settings.lodgeName} now</h2>
          {hereNow.length === 0 ? (
            <p className="muted">Nobody is there right now.</p>
          ) : (
            hereNow.map((r) => (
              <Link key={r.id} to={`/stays/${r.id}`} className="row">
                <Avatar id={r.userId} name={name(r.userId)} />
                <div className="grow">
                  <strong>{name(r.userId)}</strong>
                  <p className="small muted">{r.people} people · until {formatDay(r.end)}</p>
                </div>
              </Link>
            ))
          )}
        </section>

        {user.role !== 'car_keeper' && (
          <section className="card">
            <h2>Your next stay</h2>
            {myNext ? (
              <Link to={`/stays/${myNext.id}`} className="row">
                <Icon name="bed" />
                <div className="grow">
                  <strong>{formatRange(myNext.start, myNext.end)}</strong>
                  <p className="small muted">{myNext.people} people{myNext.status === 'tentative' && ' · "maybe"'}</p>
                </div>
              </Link>
            ) : (
              <p className="muted">No stay planned.</p>
            )}
            <button className="btn primary" onClick={() => nav('/stays/new')}>Book a stay</button>
          </section>
        )}

        <section className="card">
          <h2>Coming up</h2>
          {upcoming.length === 0 && <p className="muted">Nothing booked.</p>}
          {upcoming.slice(0, 4).map((r) => (
            <Link key={r.id} to={`/stays/${r.id}`} className="row">
              <Avatar id={r.userId} name={name(r.userId)} />
              <div className="grow">
                <strong>{name(r.userId)}</strong>
                <p className="small muted">{formatRange(r.start, r.end)} · {r.people} people{r.occasion ? ` · 🎉 ${r.occasion}` : ''}</p>
              </div>
            </Link>
          ))}
        </section>

        <section className="card">
          <div className="row-head">
            <h2>Who's been there – {report.year}</h2>
            <Icon name="chart" />
          </div>
          {report.families.filter((f) => f.personNights > 0).map((f, i) => (
            <div key={f.family?.id ?? 'none'} className="rank">
              <span className="rank-n">{i + 1}</span>
              <span className="grow">
                {familyLabel(f.family)}
                <br /><span className="small muted">{f.members.filter((m) => m.personNights > 0).map((m) => m.user.name).join(', ')}</span>
              </span>
              <span className="muted small">{f.nights} nights · {f.personNights} person-nights</span>
            </div>
          ))}
          {report.totalPersonNights === 0 && <p className="muted small">No nights yet this year.</p>}
          {isAdmin(user) && <Link to="/report" className="small accent">See costs & who pays what →</Link>}
        </section>

        {latestCatch && (
          <Link to="/fishing" className="card link-card">
            <h2>Latest catch</h2>
            <p>🎣 <strong>{latestCatch.species}</strong>, {latestCatch.lengthCm} cm – by {name(latestCatch.userId)}</p>
          </Link>
        )}
      </div>
    </>
  )
}
