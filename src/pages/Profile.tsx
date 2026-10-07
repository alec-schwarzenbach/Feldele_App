import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { resetDemoData } from '../lib/localApi'
import { useData } from '../lib/store'
import { isAdmin, isOwner, type Profile as Member, type Role } from '../lib/types'

const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', car_keeper: 'Car keeper' }
const ASSIGNABLE: Role[] = ['member', 'admin', 'car_keeper']

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
      !confirm(`${keeper.name} is the car keeper now. Make ${p.name} the car keeper instead? ${keeper.name} becomes a member.`)) return
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
            <label>Family<input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="optional" /></label>
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

        {admin && <AdminSettings />}

        {admin && (
          <section className="card">
            <h2>Members</h2>
            {!owner && <p className="small muted">Only the owner can change roles.</p>}
            {data.profiles.map((p) => (
              <div key={p.id} className="row">
                <Avatar id={p.id} name={p.name} />
                <span className="grow">{p.name}<br /><span className="small muted">{p.email}</span></span>
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
        <p className="small muted center">{api.mode === 'demo' ? 'Demo mode – data stored in this browser only' : 'Connected to Supabase'}</p>
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

  async function save(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.updateSettings({
      lodgeName: lodgeName.trim(), freeCancelMonths: Number(months), currency: currency.trim().toUpperCase(),
      lodgeLat: Number(lat), lodgeLng: Number(lng),
    }))
  }

  async function addRoom(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.saveRoom({ name: roomName.trim(), beds: Number(roomBeds) }))
    setRoomName('')
  }

  return (
    <>
      <section className="card">
        <h2><Icon name="settings" size={18} /> Lodge settings</h2>
        <form className="form" onSubmit={save}>
          <label>Lodge name<input value={lodgeName} onChange={(e) => setLodgeName(e.target.value)} /></label>
          <div className="grid2">
            <label>Free cancel (months)<input type="number" min={0} value={months} onChange={(e) => setMonths(e.target.value)} /></label>
            <label>Currency<input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} /></label>
          </div>
          <div className="grid2">
            <label>Lodge latitude<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
            <label>Lodge longitude<input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></label>
          </div>
          <p className="small muted">Tip: in Google Maps, long-press the lodge and copy the two numbers.</p>
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
    </>
  )
}
