import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { resetDemoData } from '../lib/localApi'
import { priorityUserFor } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin, isOwner, type Profile as Member, type Role } from '../lib/types'

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner', admin: 'Admin', member: 'Member', car_keeper: 'Car owner', pending: 'Waiting for approval',
}
const ASSIGNABLE: Role[] = ['pending', 'member', 'admin', 'car_keeper']

export function Profile() {
  const { user, data, mutate } = useData()
  const [name, setName] = useState(user.name)
  const [family, setFamily] = useState(user.family ?? '')
  const admin = isAdmin(user)
  const owner = isOwner(user)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.updateProfile(user.id, { name: name.trim(), family: family.trim() || undefined }))
  }

  /** Only one car keeper: they alone get the car notifications. */
  async function changeRole(p: Member, role: Role) {
    const keeper = data.profiles.find((x) => x.role === 'car_keeper' && x.id !== p.id)
    if (role === 'car_keeper' && keeper &&
      !confirm(`${keeper.name} is the car owner now. Make ${p.name} the car owner instead? ${keeper.name} becomes a member.`)) return
    await mutate(async () => {
      if (role === 'car_keeper' && keeper) await api.updateProfile(keeper.id, { role: 'member' })
      await api.updateProfile(p.id, { role })
    })
  }

  return (
    <>
      <Header title="Profile" back />
      <div className="page">
        <section className="card">
          <div className="row">
            <Avatar id={user.id} name={user.name} size={48} />
            <div className="grow">
              <h2>{user.name}</h2>
              <p className="small muted">{user.email} · {ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <form className="form" onSubmit={saveProfile}>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Family
              <select value={family} onChange={(e) => setFamily(e.target.value)}>
                <option value="">— Choose your family —</option>
                {[...new Set([...data.settings.families, ...(family ? [family] : [])])].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            {data.settings.families.length === 0 && <p className="small muted">No families yet – an admin adds them under Families.</p>}
            <button className="btn">Save</button>
          </form>
        </section>

        {admin && (
          <Link to="/report" className="card row link-card">
            <Icon name="chart" />
            <span className="grow"><strong>Costs & usage report</strong><br /><span className="small muted">Admins only</span></span>
            <Icon name="chevR" />
          </Link>
        )}

        {owner && <PrioritySettings />}

        {admin && <AdminSettings />}

        {admin && (
          <section className="card">
            <h2>Members</h2>
            {!owner && <p className="small muted">Only the owner can change roles.</p>}
            {data.profiles.map((p) => (
              <div key={p.id} className="row">
                <Avatar id={p.id} name={p.name} />
                <span className="grow">{p.name}<br /><span className="small muted">{p.family ? `Family ${p.family} · ` : ''}{p.email}</span></span>
                {owner && p.role !== 'owner' ? (
                  <select value={p.role} onChange={(e) => changeRole(p, e.target.value as Role)}>
                    {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : (
                  <span className="tag">{ROLE_LABELS[p.role]}</span>
                )}
              </div>
            ))}
          </section>
        )}

        <button className="btn ghost" onClick={() => api.signOut().then(() => history.replaceState(null, '', '/'))}>Sign out</button>
        {api.mode === 'demo' && (
          <button className="btn ghost danger-text" onClick={() => {
            if (confirm('Reset all demo data in this browser?')) {
              resetDemoData()
              location.href = '/'
            }
          }}>Reset demo data</button>
        )}
        <p className="small muted center">{api.mode === 'demo' ? 'Demo mode – data stored in this browser only' : 'Connected to Firebase'}</p>
      </div>
    </>
  )
}

function AdminSettings() {
  const { data, mutate } = useData()
  const s = data.settings
  const [lodgeName, setLodgeName] = useState(s.lodgeName)
  const [months, setMonths] = useState(String(s.freeCancelMonths))
  const [currency, setCurrency] = useState(s.currency)
  const [lat, setLat] = useState(String(s.lodgeLat))
  const [lng, setLng] = useState(String(s.lodgeLng))
  const [roomName, setRoomName] = useState('')
  const [roomBeds, setRoomBeds] = useState('2')
  const [familyName, setFamilyName] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.updateSettings({
      lodgeName: lodgeName.trim(), freeCancelMonths: Number(months), currency: currency.trim().toUpperCase(),
      lodgeLat: Number(lat), lodgeLng: Number(lng),
    }))
  }

  async function addFamily(e: FormEvent) {
    e.preventDefault()
    const f = familyName.trim()
    if (!f || s.families.includes(f)) return
    await mutate(() => api.updateSettings({ families: [...s.families, f] }))
    setFamilyName('')
  }

  async function addRoom(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.saveRoom({ name: roomName.trim(), beds: Number(roomBeds) }))
    setRoomName('')
  }

  return (
    <>
      <section className="card">
        <h2><Icon name="settings" size={18} /> House settings</h2>
        <form className="form" onSubmit={save}>
          <label>House name<input value={lodgeName} onChange={(e) => setLodgeName(e.target.value)} /></label>
          <div className="grid2">
            <label>Free cancel (months)<input type="number" min={0} value={months} onChange={(e) => setMonths(e.target.value)} /></label>
            <label>Currency<input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} /></label>
          </div>
          <div className="grid2">
            <label>House latitude<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
            <label>House longitude<input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></label>
          </div>
          <p className="small muted">Tip: in Google Maps, long-press the house and copy the two numbers.</p>
          <button className="btn">Save settings</button>
        </form>
      </section>

      <section className="card">
        <h2>Rooms</h2>
        {data.rooms.map((r) => (
          <div key={r.id} className="row-head cost-row">
            <span>{r.name} <span className="muted small">· {r.beds} beds</span></span>
            <button className="icon-btn" aria-label="Delete room"
              onClick={() => confirm(`Delete room "${r.name}"?`) && mutate(() => api.deleteRoom(r.id))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <form className="form" onSubmit={addRoom}>
          <div className="grid2">
            <label>New room<input value={roomName} onChange={(e) => setRoomName(e.target.value)} required /></label>
            <label>Beds<input type="number" min={1} value={roomBeds} onChange={(e) => setRoomBeds(e.target.value)} /></label>
          </div>
          <button className="btn">Add room</button>
        </form>
      </section>

      <section className="card">
        <h2>Families</h2>
        <p className="small muted">Everyone picks their family on their own profile.</p>
        {s.families.map((f) => (
          <div key={f} className="row-head cost-row">
            <span>{f} <span className="muted small">· {data.profiles.filter((p) => p.family === f).map((p) => p.name).join(', ') || 'nobody yet'}</span></span>
            <button className="icon-btn" aria-label={`Delete family ${f}`}
              onClick={() => confirm(`Remove family "${f}" from the list?`) && mutate(() => api.updateSettings({ families: s.families.filter((x) => x !== f) }))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <form className="form" onSubmit={addFamily}>
          <label>New family<input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="e.g. Schwarzenbach" required /></label>
          <button className="btn">Add family</button>
        </form>
      </section>
    </>
  )
}

/** Owner only: who has priority each year. The order repeats once everyone had a turn. */
function PrioritySettings() {
  const { data, mutate, name } = useData()
  const s = data.settings
  const order = s.priorityOrder
  const thisYear = new Date().getFullYear()
  const candidates = data.profiles.filter((p) => !order.includes(p.id) && p.role !== 'pending' && p.role !== 'car_keeper')

  const save = (patch: { priorityOrder?: string[]; priorityStartYear?: number }) => mutate(() => api.updateSettings(patch))
  const move = (i: number, by: number) => {
    const next = [...order]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    save({ priorityOrder: next })
  }

  return (
    <section className="card">
      <h2>⭐ Yearly priority</h2>
      <p className="small muted">
        The priority user can take over dates someone else booked (their stay becomes "maybe").
        Set the order once – after the last person it starts again from the top.
      </p>
      <label>First year
        <input type="number" min={2000} max={2100} value={s.priorityStartYear}
          onChange={(e) => e.target.value.length === 4 && save({ priorityStartYear: Number(e.target.value) })} />
      </label>
      {order.map((id, i) => (
        <div key={id} className="row-head cost-row">
          <span><strong>{name(id)}</strong> <span className="muted small">· {s.priorityStartYear + i}{order.length > 1 ? `, ${s.priorityStartYear + i + order.length}, …` : ' and every year'}</span></span>
          <span className="row-end">
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button className="icon-btn" onClick={() => save({ priorityOrder: order.filter((x) => x !== id) })} aria-label={`Remove ${name(id)}`}>
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      ))}
      {candidates.length > 0 && (
        <label>Add to the rotation
          <select value="" onChange={(e) => e.target.value && save({ priorityOrder: [...order, e.target.value] })}>
            <option value="">— Choose a member —</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}{p.family ? ` (${p.family})` : ''}</option>)}
          </select>
        </label>
      )}
      {order.length > 0 && (
        <p className="small">
          Next years: {Array.from({ length: 6 }, (_, k) => thisYear + k)
            .map((y) => `${y} ${name(priorityUserFor(y, s)!)}`).join(' · ')}
        </p>
      )}
    </section>
  )
}
