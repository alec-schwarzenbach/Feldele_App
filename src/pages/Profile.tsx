import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PushPrompt } from '../components/PushPrompt'
import { Avatar, Header, Icon } from '../components/ui'
import { api } from '../lib/api'
import { resetDemoData } from '../lib/localApi'
import { priorityFamilyFor, roomLabel } from '../lib/rules'
import { useData } from '../lib/store'
import { isAdmin, isOwner, NO_FAMILY, type Clan, type Family, type Profile as Member, type Role } from '../lib/types'

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Besitzer', admin: 'Admin', member: 'Mitglied', car_keeper: 'Autobesitzer', cleaner: 'Cleaner (Reinigung)',
  pending: 'Wartet auf Freischaltung',
}
const ASSIGNABLE: Role[] = ['pending', 'member', 'admin', 'car_keeper', 'cleaner']

export function Profile() {
  const { user, data, mutate, familyName } = useData()
  const [name, setName] = useState(user.name)
  const admin = isAdmin(user)
  const owner = isOwner(user)
  const famLabel = (id: string | undefined) => (id === NO_FAMILY ? 'keine Familie' : `Familie ${familyName(id)}`)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.updateProfile(user.id, { name: name.trim() }))
  }

  /** Only one car owner: they alone get the car notifications. */
  async function changeRole(p: Member, role: Role) {
    const keeper = data.profiles.find((x) => x.role === 'car_keeper' && x.id !== p.id)
    if (role === 'car_keeper' && keeper &&
      !confirm(`${keeper.name} ist im Moment der Autobesitzer. Stattdessen ${p.name} zum Autobesitzer machen? ${keeper.name} wird Mitglied.`)) return
    await mutate(async () => {
      if (role === 'car_keeper' && keeper) await api.updateProfile(keeper.id, { role: 'member' })
      await api.updateProfile(p.id, { role })
    })
  }

  /** The family decides priority and who pays, so only admins move people between families. */
  async function changeFamily(p: Member, familyId: string) {
    if (!confirm(`${p.name} zu ${famLabel(familyId)} verschieben? Die Aufenthalte zählen dann für diese Familie.`)) return
    await mutate(() => api.updateProfile(p.id, { familyId }))
  }

  return (
    <>
      <Header title="Profil" back />
      <div className="page">
        <section className="card">
          <div className="row">
            <Avatar id={user.id} name={user.name} size={48} />
            <div className="grow">
              <h2>{user.name}</h2>
              <p className="small muted">{user.email} · {ROLE_LABELS[user.role]}</p>
              <p className="small">👨‍👩‍👧 {user.familyId === NO_FAMILY ? 'Keine Familie' : <>Familie <strong>{familyName(user.familyId)}</strong></>}</p>
            </div>
          </div>
          <form className="form" onSubmit={saveProfile}>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <button className="btn">Speichern</button>
          </form>
          {!admin && <p className="small muted">Falsche Familie? Ein Admin kann sie ändern – sie bestimmt Priorität und Kosten.</p>}
        </section>

        <section className="card"><PushPrompt compact /></section>

        {admin && (
          <Link to="/report" className="card row link-card">
            <Icon name="chart" />
            <span className="grow"><strong>Kosten & Nutzung</strong><br /><span className="small muted">Nur für Admins · Excel-Abrechnung</span></span>
            <Icon name="chevR" />
          </Link>
        )}

        {owner && <PrioritySettings />}
        {owner && <ClanSettings />}
        {admin && <FamilySettings />}

        {admin && (
          <section className="card">
            <h2>Mitglieder</h2>
            {!owner && <p className="small muted">Nur der Besitzer kann Rollen ändern.</p>}
            {data.profiles.map((p) => (
              <div key={p.id} className="member-row">
                <div className="row">
                  <Avatar id={p.id} name={p.name} />
                  <span className="grow">{p.name}<br /><span className="small muted">{p.email}</span></span>
                  {owner && p.role !== 'owner' ? (
                    <select value={p.role} onChange={(e) => changeRole(p, e.target.value as Role)} aria-label={`Rolle von ${p.name}`}>
                      {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  ) : (
                    <span className="tag">{ROLE_LABELS[p.role]}</span>
                  )}
                </div>
                <select className="family-select" value={p.familyId ?? ''} onChange={(e) => changeFamily(p, e.target.value)} aria-label={`Familie von ${p.name}`}>
                  {!p.familyId && <option value="">— noch keine Familie —</option>}
                  {data.families.map((f) => <option key={f.id} value={f.id}>Familie {f.name}</option>)}
                  <option value={NO_FAMILY}>Keine Familie (zahlt nicht mit)</option>
                </select>
              </div>
            ))}
            <p className="small muted">
              <strong>Cleaner</strong> bekommt eine Push-Mitteilung bei jeder Buchung oder Stornierung und am Tag vor jeder Anreise.
              Der <strong>Autobesitzer</strong> bekommt die Mitteilungen zum Auto.
            </p>
          </section>
        )}

        {admin && <AdminSettings />}

        <button className="btn ghost" onClick={() => api.signOut().then(() => history.replaceState(null, '', '/'))}>Abmelden</button>
        {api.mode === 'demo' && (
          <button className="btn ghost danger-text" onClick={() => {
            if (confirm('Alle Demo-Daten in diesem Browser zurücksetzen?')) {
              resetDemoData()
              location.href = '/'
            }
          }}>Demo-Daten zurücksetzen</button>
        )}
        <p className="small muted center">{api.mode === 'demo' ? 'Demo-Modus – Daten nur in diesem Browser' : 'Mit Firebase verbunden'}</p>
      </div>
    </>
  )
}

/** Owner only: clans are groups of families that pay the yearly costs together. */
function ClanSettings() {
  const { data, mutate } = useData()
  const [newName, setNewName] = useState('')
  const familiesOf = (c: Clan) => data.families.filter((f) => f.clanId === c.id)

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = newName.trim()
    if (data.clans.some((c) => c.name.toLowerCase() === n.toLowerCase())) return alert(`«${n}» gibt es schon.`)
    await mutate(() => api.addClan(n))
    setNewName('')
  }

  async function rename(c: Clan) {
    const n = prompt('Neuer Name für diesen Clan:', c.name)?.trim()
    if (n && n !== c.name) await mutate(() => api.renameClan(c.id, n))
  }

  async function remove(c: Clan) {
    const fams = familiesOf(c)
    if (!confirm(`Clan «${c.name}» löschen?${fams.length ? ` ${fams.map((f) => f.name).join(', ')} bezahlen danach wieder einzeln.` : ''}`)) return
    await mutate(async () => {
      for (const f of fams) await api.setFamilyClan(f.id, undefined)
      await api.deleteClan(c.id)
    })
  }

  return (
    <section className="card">
      <h2>🏰 Clans</h2>
      <p className="small muted">
        Ein Clan bezahlt für alle seine Familien zusammen. Familien ohne Clan bezahlen selbst.
        So ist die Jahresabrechnung in Excel nach Clans gegliedert.
      </p>
      {data.clans.map((c) => (
        <div key={c.id} className="row-head cost-row">
          <span><strong>{c.name}</strong> <span className="muted small">· {familiesOf(c).map((f) => f.name).join(', ') || 'noch keine Familie'}</span></span>
          <span className="row-end">
            <button className="icon-btn" onClick={() => rename(c)} aria-label={`${c.name} umbenennen`}><Icon name="edit" size={16} /></button>
            <button className="icon-btn" onClick={() => remove(c)} aria-label={`${c.name} löschen`}><Icon name="trash" size={16} /></button>
          </span>
        </div>
      ))}
      <form className="form" onSubmit={add}>
        <label>Neuer Clan<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. Clan Schwarzenbach" required maxLength={60} /></label>
        <button className="btn">Clan hinzufügen</button>
      </form>

      {data.clans.length > 0 && data.families.length > 0 && (
        <>
          <h2 style={{ marginTop: 8 }}>Familien zuordnen</h2>
          {data.families.map((f) => (
            <label key={f.id} className="assign-row">
              <span className="grow">{f.name}</span>
              <select value={f.clanId ?? ''} onChange={(e) => mutate(() => api.setFamilyClan(f.id, e.target.value || undefined))}
                aria-label={`Clan von Familie ${f.name}`}>
                <option value="">Kein Clan (zahlt selbst)</option>
                {data.clans.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          ))}
        </>
      )}
    </section>
  )
}

/** Admins: the list of families. Members add families themselves when they sign up. */
function FamilySettings() {
  const { data, mutate } = useData()
  const [newName, setNewName] = useState('')
  const membersOf = (f: Family) => data.profiles.filter((p) => p.familyId === f.id)
  const clanName = (f: Family) => data.clans.find((c) => c.id === f.clanId)?.name

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = newName.trim()
    if (data.families.some((f) => f.name.toLowerCase() === n.toLowerCase())) return alert(`«${n}» gibt es schon.`)
    await mutate(() => api.addFamily(n))
    setNewName('')
  }

  async function rename(f: Family) {
    const n = prompt('Neuer Name für diese Familie:', f.name)?.trim()
    if (n && n !== f.name) await mutate(() => api.renameFamily(f.id, n))
  }

  async function remove(f: Family) {
    if (membersOf(f).length) return alert(`Verschiebe zuerst die Mitglieder von ${f.name} in eine andere Familie.`)
    if (data.settings.priorityOrder.includes(f.id)) return alert(`Nimm ${f.name} zuerst aus der Prioritäts-Reihenfolge.`)
    if (confirm(`Familie «${f.name}» löschen?`)) await mutate(() => api.deleteFamily(f.id))
  }

  return (
    <section className="card">
      <h2>👨‍👩‍👧 Familien</h2>
      <p className="small muted">Familien teilen sich die Priorität. Neue Mitglieder wählen oder erfassen ihre Familie bei der Registrierung.</p>
      {data.families.map((f) => (
        <div key={f.id} className="row-head cost-row">
          <span>
            <strong>{f.name}</strong>
            <span className="muted small"> · {membersOf(f).map((p) => p.name).join(', ') || 'noch niemand'}{clanName(f) ? ` · 🏰 ${clanName(f)}` : ''}</span>
          </span>
          <span className="row-end">
            <button className="icon-btn" onClick={() => rename(f)} aria-label={`${f.name} umbenennen`}><Icon name="edit" size={16} /></button>
            <button className="icon-btn" onClick={() => remove(f)} aria-label={`${f.name} löschen`}><Icon name="trash" size={16} /></button>
          </span>
        </div>
      ))}
      <form className="form" onSubmit={add}>
        <label>Neue Familie<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. Schwarzenbach" required maxLength={60} /></label>
        <button className="btn">Familie hinzufügen</button>
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
        <h2><Icon name="settings" size={18} /> Haus-Einstellungen</h2>
        <form className="form" onSubmit={save}>
          <label>Name des Hauses<input value={lodgeName} onChange={(e) => setLodgeName(e.target.value)} /></label>
          <div className="grid2">
            <label>Gratis stornieren (Monate)<input type="number" min={0} value={months} onChange={(e) => setMonths(e.target.value)} /></label>
            <label>Währung<input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} /></label>
          </div>
          <div className="grid2">
            <label>Breitengrad Haus<input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
            <label>Längengrad Haus<input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></label>
          </div>
          <p className="small muted">Tipp: In Google Maps lange auf das Haus drücken und die zwei Zahlen kopieren.</p>
          <button className="btn">Einstellungen speichern</button>
        </form>
      </section>

      <section className="card">
        <h2>Zimmer</h2>
        {data.rooms.map((r) => (
          <div key={r.id} className="row-head cost-row">
            <span>{roomLabel(r)} <span className="muted small">· {r.beds} {r.beds === 1 ? 'Bett' : 'Betten'}{r.code ? ` · ${r.code}` : ''}</span></span>
            <button className="icon-btn" aria-label="Zimmer löschen"
              onClick={() => confirm(`Zimmer «${roomLabel(r)}» löschen?`) && mutate(() => api.deleteRoom(r.id))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <form className="form" onSubmit={addRoom}>
          <div className="grid2">
            <label>Neues Zimmer<input value={roomName} onChange={(e) => setRoomName(e.target.value)} required /></label>
            <label>Betten<input type="number" min={1} value={roomBeds} onChange={(e) => setRoomBeds(e.target.value)} /></label>
          </div>
          <div className="grid2">
            <label>Ort (z. B. DG)<input value={roomArea} onChange={(e) => setRoomArea(e.target.value)} list="room-areas" /></label>
            <label>Kurzform<input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="z. B. DG-Az" /></label>
          </div>
          <datalist id="room-areas">{[...new Set(data.rooms.map((r) => r.area).filter(Boolean))].map((a) => <option key={a} value={a} />)}</datalist>
          <button className="btn">Zimmer hinzufügen</button>
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
      <h2>⭐ Jährliche Priorität</h2>
      <p className="small muted">
        Alle Mitglieder der Familie mit Priorität können Daten übernehmen, die eine andere Familie gebucht hat
        (deren Aufenthalt wird «Vielleicht»). Reihenfolge einmal festlegen – nach der letzten Familie beginnt sie von vorne.
      </p>
      <label>Erstes Jahr
        <input type="number" min={2000} max={2100} value={s.priorityStartYear}
          onChange={(e) => e.target.value.length === 4 && save({ priorityStartYear: Number(e.target.value) })} />
      </label>
      {order.map((id, i) => (
        <div key={id} className="row-head cost-row">
          <span><strong>{familyName(id)}</strong> <span className="muted small">· {s.priorityStartYear + i}{order.length > 1 ? `, ${s.priorityStartYear + i + order.length}, …` : ' und jedes Jahr'}</span></span>
          <span className="row-end">
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Nach oben">↑</button>
            <button className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Nach unten">↓</button>
            <button className="icon-btn" onClick={() => save({ priorityOrder: order.filter((x) => x !== id) })} aria-label={`${familyName(id)} entfernen`}>
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      ))}
      {candidates.length > 0 && (
        <label>Zur Reihenfolge hinzufügen
          <select value="" onChange={(e) => e.target.value && save({ priorityOrder: [...order, e.target.value] })}>
            <option value="">— Familie wählen —</option>
            {candidates.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      )}
      {order.length > 0 && (
        <p className="small">
          Nächste Jahre: {Array.from({ length: 6 }, (_, k) => thisYear + k)
            .map((y) => `${y} ${familyName(priorityFamilyFor(y, s))}`).join(' · ')}
        </p>
      )}
    </section>
  )
}
