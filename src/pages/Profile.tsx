import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { resetDemoData } from '../lib/localApi'
import { priorityFamilyFor, roomLabel } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin, isOwner, type Family, type Profile as Member, type Role } from '../lib/types'

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner', admin: 'Admin', member: 'Member', car_keeper: 'Car owner', pending: 'Waiting for approval',
}
const ASSIGNABLE: Role[] = ['pending', 'member', 'admin', 'car_keeper']

export function Profile() {
  const { user, data, mutate, familyName } = useData()
  const [name, setName] = useState(user.name)
  const admin = isAdmin(user)
  const owner = isOwner(user)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.updateProfile(user.id, { name: name.trim() }))
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

  /** The family decides priority and who pays, so only admins move people between families. */
  async function changeFamily(p: Member, familyId: string) {
    if (!confirm(`Move ${p.name} to family ${familyName(familyId)}? Their stays will count for that family.`)) return
    await mutate(() => api.updateProfile(p.id, { familyId }))
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
              <p className="small">👨‍👩‍👧 Family <strong>{familyName(user.familyId)}</strong></p>
            </div>
          </div>
          <form className="form" onSubmit={saveProfile}>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <button className="btn">Save</button>
          </form>
          {!admin && <p className="small muted">Wrong family? Ask an admin to change it – it decides priority and costs.</p>}
        </section>

        {admin && (
          <Link to="/report" className="card row link-card">
            <Icon name="chart" />
            <span className="grow"><strong>Costs & usage report</strong><br /><span className="small muted">Admins only</span></span>
            <Icon name="chevR" />
          </Link>
        )}

        {owner && <PrioritySettings />}

        {admin && <FamilySettings />}

        {admin && (
          <section className="card">
            <h2>Members</h2>
            {!owner && <p className="small muted">Only the owner can change roles.</p>}
            {data.profiles.map((p) => (
              <div key={p.id} className="member-row">
                <div className="row">
                  <Avatar id={p.id} name={p.name} />
                  <span className="grow">{p.name}<br /><span className="small muted">{p.email}</span></span>
                  {owner && p.role !== 'owner' ? (
                    <select value={p.role} onChange={(e) => changeRole(p, e.target.value as Role)} aria-label={`Role of ${p.name}`}>
                      {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  ) : (
                    <span className="tag">{ROLE_LABELS[p.role]}</span>
                  )}
                </div>
                <select className="family-select" value={p.familyId ?? ''} onChange={(e) => changeFamily(p, e.target.value)} aria-label={`Family of ${p.name}`}>
                  {!p.familyId && <option value="">— no family yet —</option>}
                  {data.families.map((f) => <option key={f.id} value={f.id}>Family {f.name}</option>)}
                </select>
              </div>
            ))}
          </section>
        )}

        {admin && <AdminSettings />}

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

/** Admins: the list of families. Members add families themselves when they sign up. */
function FamilySettings() {
  const { data, mutate } = useData()
  const [newName, setNewName] = useState('')
  const membersOf = (f: Family) => data.profiles.filter((p) => p.familyId === f.id)

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = newName.trim()
    if (data.families.some((f) => f.name.toLowerCase() === n.toLowerCase())) return alert(`"${n}" already exists.`)
    await mutate(() => api.addFamily(n))
    setNewName('')
  }

  async function rename(f: Family) {
    const n = prompt('New name for this family:', f.name)?.trim()
    if (n && n !== f.name) await mutate(() => api.renameFamily(f.id, n))
  }

  async function remove(f: Family) {
    if (membersOf(f).length) return alert(`Move the members of ${f.name} to another family first.`)
    if (data.settings.priorityOrder.includes(f.id)) return alert(`Remove ${f.name} from the priority rotation first.`)
    if (confirm(`Delete family "${f.name}"?`)) await mutate(() => api.deleteFamily(f.id))
  }

  return (
    <section className="card">
      <h2>👨‍👩‍👧 Families</h2>
      <p className="small muted">Families share priority and pay together. New members choose or add their family when they sign up.</p>
      {data.families.map((f) => (
        <div key={f.id} className="row-head cost-row">
          <span><strong>{f.name}</strong> <span className="muted small">· {membersOf(f).map((p) => p.name).join(', ') || 'nobody yet'}</span></span>
          <span className="row-end">
            <button className="icon-btn" onClick={() => rename(f)} aria-label={`Rename ${f.name}`}><Icon name="edit" size={16} /></button>
            <button className="icon-btn" onClick={() => remove(f)} aria-label={`Delete ${f.name}`}><Icon name="trash" size={16} /></button>
          </span>
        </div>
      ))}
      <form className="form" onSubmit={add}>
        <label>New family<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Schwarzenbach" required maxLength={60} /></label>
        <button className="btn">Add family</button>
      </form>
    </section>
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
  const [roomArea, setRoomArea] = useState('')
  const [roomCode, setRoomCode] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.updateSettings({
      lodgeName: lodgeName.trim(), freeCancelMonths: Number(months), currency: currency.trim().toUpperCase(),
      lodgeLat: Number(lat), lodgeLng: Number(lng),
    }))
  }

  async function addRoom(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.saveRoom({
      name: roomName.trim(), beds: Number(roomBeds), area: roomArea.trim() || undefined, code: roomCode.trim() || undefined,
    }))
    setRoomName('')
    setRoomCode('')
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
            <span>{roomLabel(r)} <span className="muted small">· {r.beds} bed{r.beds === 1 ? '' : 's'}{r.code ? ` · ${r.code}` : ''}</span></span>
            <button className="icon-btn" aria-label="Delete room"
              onClick={() => confirm(`Delete room "${roomLabel(r)}"?`) && mutate(() => api.deleteRoom(r.id))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <form className="form" onSubmit={addRoom}>
          <div className="grid2">
            <label>New room<input value={roomName} onChange={(e) => setRoomName(e.target.value)} required /></label>
            <label>Beds<input type="number" min={1} value={roomBeds} onChange={(e) => setRoomBeds(e.target.value)} /></label>
          </div>
          <div className="grid2">
            <label>Where (e.g. DG)<input value={roomArea} onChange={(e) => setRoomArea(e.target.value)} list="room-areas" /></label>
            <label>Short form<input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="e.g. DG-Az" /></label>
          </div>
          <datalist id="room-areas">{[...new Set(data.rooms.map((r) => r.area).filter(Boolean))].map((a) => <option key={a} value={a} />)}</datalist>
          <button className="btn">Add room</button>
        </form>
      </section>

    </>
  )
}

/** Owner only: which family has priority each year. The order repeats once every family had a turn. */
function PrioritySettings() {
  const { data, mutate, familyName } = useData()
  const s = data.settings
  const order = s.priorityOrder
  const thisYear = new Date().getFullYear()
  const candidates = data.families.filter((f) => !order.includes(f.id))

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
        Every member of the priority family can take over dates another family booked (their stay becomes "maybe").
        Set the order once – after the last family it starts again from the top.
      </p>
      <label>First year
        <input type="number" min={2000} max={2100} value={s.priorityStartYear}
          onChange={(e) => e.target.value.length === 4 && save({ priorityStartYear: Number(e.target.value) })} />
      </label>
      {order.map((id, i) => (
        <div key={id} className="row-head cost-row">
          <span><strong>{familyName(id)}</strong> <span className="muted small">· {s.priorityStartYear + i}{order.length > 1 ? `, ${s.priorityStartYear + i + order.length}, …` : ' and every year'}</span></span>
          <span className="row-end">
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button className="icon-btn" onClick={() => save({ priorityOrder: order.filter((x) => x !== id) })} aria-label={`Remove ${familyName(id)}`}>
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      ))}
      {candidates.length > 0 && (
        <label>Add to the rotation
          <select value="" onChange={(e) => e.target.value && save({ priorityOrder: [...order, e.target.value] })}>
            <option value="">— Choose a family —</option>
            {candidates.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      )}
      {order.length > 0 && (
        <p className="small">
          Next years: {Array.from({ length: 6 }, (_, k) => thisYear + k)
            .map((y) => `${y} ${familyName(priorityFamilyFor(y, s))}`).join(' · ')}
        </p>
      )}
    </section>
  )
}
