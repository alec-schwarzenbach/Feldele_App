import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PushPrompt } from '../components/PushPrompt'
import { Avatar, Icon } from '../components/ui'
import { api } from '../lib/api'
import { formatDay, formatRange, timeAgo, today } from '../lib/dates'
import { buildYearReport, familyLabel, priorityFamilyFor } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin, isOwner } from '../lib/types'

const people = (n: number) => `${n} ${n === 1 ? 'Person' : 'Personen'}`

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
  const staff = user.role === 'car_keeper' || user.role === 'cleaner'

  // Seeing the notifications here counts as having read them.
  const hasUnread = unread.length > 0
  useEffect(() => {
    if (!hasUnread) return
    const timer = setTimeout(() => mutate(() => api.markNotificationsRead()), 2500)
    return () => clearTimeout(timer)
  }, [hasUnread, mutate])
  const waiting = isOwner(user) ? data.profiles.filter((p) => p.role === 'pending') : []
  const report = buildYearReport(Number(t.slice(0, 4)), data.profiles, data.families, data.clans, data.reservations, data.costs)
  const latestCatch = [...data.catches].sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))[0]
  const openShopping = data.shopping.filter((s) => !s.done)

  return (
    <>
      <header className="home-head">
        <div>
          <p className="muted small">{data.settings.lodgeName}</p>
          <h1>Hallo {user.name} 👋</h1>
        </div>
        <button className="icon-btn" onClick={() => nav('/profile')} aria-label="Profil und Einstellungen">
          <Avatar id={user.id} name={user.name} size={38} />
        </button>
      </header>

      <div className="page">
        <PushPrompt important={staff} />

        {waiting.length > 0 && (
          <Link to="/profile" className="card notice">
            <Icon name="user" />
            <div>
              <strong>{waiting.length} {waiting.length === 1 ? 'wartet' : 'warten'} auf Freischaltung</strong>
              <p className="small">{waiting.map((p) => p.name).join(', ')} – unter Mitglieder freischalten.</p>
            </div>
          </Link>
        )}

        {data.notifications.length > 0 && (
          <section className={'card' + (hasUnread ? ' notice' : '')} style={{ flexDirection: 'column' }}>
            <h2><Icon name="bell" size={18} /> Mitteilungen{hasUnread && ` (${unread.length} neu)`}</h2>
            {data.notifications.slice(0, 4).map((n) => (
              <div key={n.id} className={'notif' + (n.read ? '' : ' unread')}>
                <strong>{n.title}</strong>
                <p className="small">{n.body}</p>
                <p className="small muted">{timeAgo(n.createdAt)}</p>
              </div>
            ))}
          </section>
        )}

        {priorityId && !staff && (
          <p className="info small">
            ⭐ {priorityId === user.familyId
              ? <>Deine Familie hat {t.slice(0, 4)} Priorität.</>
              : <>Familie <strong>{familyName(priorityId)}</strong> hat {t.slice(0, 4)} Priorität.</>}
          </p>
        )}

        <section className="card">
          <h2>Jetzt im {data.settings.lodgeName}</h2>
          {hereNow.length === 0 ? (
            <p className="muted">Im Moment ist niemand dort.</p>
          ) : (
            hereNow.map((r) => (
              <Link key={r.id} to={`/stays/${r.id}`} className="row">
                <Avatar id={r.userId} name={name(r.userId)} />
                <div className="grow">
                  <strong>{name(r.userId)}</strong>
                  <p className="small muted">{people(r.people)} · bis {formatDay(r.end)}</p>
                </div>
              </Link>
            ))
          )}
        </section>

        {!staff && (
          <section className="card">
            <h2>Dein nächster Aufenthalt</h2>
            {myNext ? (
              <Link to={`/stays/${myNext.id}`} className="row">
                <Icon name="bed" />
                <div className="grow">
                  <strong>{formatRange(myNext.start, myNext.end)}</strong>
                  <p className="small muted">{people(myNext.people)}{myNext.status === 'tentative' && ' · «Vielleicht»'}</p>
                </div>
              </Link>
            ) : (
              <p className="muted">Kein Aufenthalt geplant.</p>
            )}
            <button className="btn primary" onClick={() => nav('/stays/new')}>Aufenthalt buchen</button>
          </section>
        )}

        <section className="card">
          <h2>Demnächst</h2>
          {upcoming.length === 0 && <p className="muted">Nichts gebucht.</p>}
          {upcoming.slice(0, 4).map((r) => (
            <Link key={r.id} to={`/stays/${r.id}`} className="row">
              <Avatar id={r.userId} name={name(r.userId)} />
              <div className="grow">
                <strong>{name(r.userId)}</strong>
                <p className="small muted">{formatRange(r.start, r.end)} · {people(r.people)}{r.occasion ? ` · 🎉 ${r.occasion}` : ''}</p>
              </div>
            </Link>
          ))}
        </section>

        {openShopping.length > 0 && (
          <Link to="/board?tab=shopping" className="card link-card">
            <h2>🛒 Einkaufsliste ({openShopping.length})</h2>
            <p className="small">{openShopping.slice(0, 4).map((s) => s.text).join(', ')}{openShopping.length > 4 ? ' …' : ''}</p>
          </Link>
        )}

        {!staff && (
          <section className="card">
            <div className="row-head">
              <h2>Wer war da – {report.year}</h2>
              <Icon name="chart" />
            </div>
            {report.families.filter((f) => f.personNights > 0).map((f, i) => (
              <div key={f.family?.id ?? 'none'} className="rank">
                <span className="rank-n">{i + 1}</span>
                <span className="grow">
                  {familyLabel(f.family)}
                  <br /><span className="small muted">{f.members.filter((m) => m.personNights > 0).map((m) => m.user.name).join(', ')}</span>
                </span>
                <span className="muted small">{f.nights} Nächte · {f.personNights} Personennächte</span>
              </div>
            ))}
            {report.totalPersonNights === 0 && <p className="muted small">Dieses Jahr noch keine Nächte.</p>}
            {isAdmin(user) && <Link to="/report" className="small accent">Kosten und wer was bezahlt →</Link>}
          </section>
        )}

        {latestCatch && (
          <Link to="/fishing" className="card link-card">
            <h2>Letzter Fang</h2>
            <p>🎣 <strong>{latestCatch.species}</strong>, {latestCatch.lengthCm} cm – von {name(latestCatch.userId)}</p>
          </Link>
        )}
      </div>
    </>
  )
}
