import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Icon } from '../components/ui'
import { formatDay, formatRange, today } from '../lib/dates'
import { buildYearReport } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin } from '../lib/types'

export function Home() {
  const { user, data, name } = useData()
  const nav = useNavigate()
  const t = today()
  const active = data.reservations.filter((r) => r.status === 'active')
  const hereNow = active.filter((r) => r.start <= t && t < r.end)
  const upcoming = active.filter((r) => r.start > t).sort((a, b) => a.start.localeCompare(b.start))
  const myNext = upcoming.find((r) => r.userId === user.id)
  const unread = data.notifications.filter((n) => !n.read)
  const report = buildYearReport(Number(t.slice(0, 4)), data.profiles, data.reservations, data.costs)
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
        {unread.length > 0 && (
          <Link to="/car" className="card notice">
            <Icon name="bell" />
            <div>
              <strong>{unread.length} new car request{unread.length > 1 ? 's' : ''}</strong>
              <p className="small">{unread[0].body}</p>
            </div>
          </Link>
        )}

        <section className="card">
          <h2>At the lodge now</h2>
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
                  <p className="small muted">{myNext.people} people</p>
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
          {report.rows.filter((r) => r.personNights > 0).map((r, i) => (
            <div key={r.user.id} className="rank">
              <span className="rank-n">{i + 1}</span>
              <span className="grow">{r.user.name}</span>
              <span className="muted small">{r.nights} nights · {r.personNights} person-nights</span>
            </div>
          ))}
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
