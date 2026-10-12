import { useEffect, useState, type FormEvent } from 'react'

import { PushPrompt } from '../components/PushPrompt'
import { Avatar, Header, Icon } from '../components/ui'
import { api, type YearReportFile } from '../lib/api'
import { LOCALE, timeAgo } from '../lib/dates'
import { buildYearWorkbook, COST_LABELS } from '../lib/excel'
import { resetDemoData } from '../lib/localApi'
import { buildYearReport, priorityFamilyFor, roomLabel } from '../lib/rules'
import { useData } from '../lib/store'
import { HOUSES, houseOf, isAdmin, isOwner, NO_FAMILY, type Clan, type CostCategory, type Family, type House, type Profile as Member, type Role } from '../lib/types'

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

        {owner && <YearlyBill />}
        {owner && <PrioritySettings />}
        {owner && <ClanSettings />}

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

/**
 * Owner only: the yearly bill. The Excel is built in the background, stored in
 * Firebase Storage, and only shown as a link (no costs table in the app).
 */
function YearlyBill() {
  const { data, mutate } = useData()
  const thisYear = new Date().getFullYear()
  const years = [...new Set([thisYear, ...data.costs.map((c) => c.year), ...data.reservations.map((r) => Number(r.start.slice(0, 4)))])]
    .filter((y) => y <= thisYear)
    .sort((a, b) => b - a)
  const [year, setYear] = useState(thisYear)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<YearReportFile[]>()
  const [category, setCategory] = useState<CostCategory>('rent')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const cur = data.settings.currency
  const money = (n: number) => n.toLocaleString(LOCALE, { style: 'currency', currency: cur })
  const costs = data.costs.filter((c) => c.year === year)

  useEffect(() => {
    api.listYearReports().then(setFiles).catch(() => setFiles([]))
  }, [])

  async function createExcel() {
    setBusy(true)
    try {
      // Only Feldele stays are billed; Waldele stays go into their own sheet.
      const feldele = data.reservations.filter((r) => houseOf(r) === 'feldele')
      const report = buildYearReport(year, data.profiles, data.families, data.clans, feldele, data.costs)
      const blob = await buildYearWorkbook(report, data.costs, cur, data.settings.lodgeName, {
        stays: data.reservations.filter((r) => houseOf(r) === 'waldele'),
        who: (id) => data.profiles.find((p) => p.id === id)?.name ?? 'Unbekannt',
      })
      const saved = await api.saveYearReport(year, blob)
      setFiles((f) => [saved, ...(f ?? []).filter((x) => x.year !== year)])
    } catch (e) {
      alert('Die Abrechnung konnte nicht erstellt werden: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function addCost(e: FormEvent) {
    e.preventDefault()
    await mutate(() => api.addCost({ year, category, amount: Number(amount), note: note.trim() || undefined }))
    setAmount('')
    setNote('')
  }

  const file = files?.find((f) => f.year === year)
  return (
    <section className="card">
      <h2>📊 Jahresabrechnung</h2>
      <p className="small muted">
        Die Abrechnung nach Clans wird als Excel in Firebase gespeichert. Erfasse hier die Kosten des Jahres
        und erstelle danach die Datei neu.
      </p>
      <div className="chips">
        {years.map((y) => <button key={y} className={'chip' + (y === year ? ' on' : '')} onClick={() => setYear(y)}>{y}</button>)}
      </div>

      {costs.map((c) => (
        <div key={c.id} className="row-head cost-row">
          <span>{COST_LABELS[c.category]}{c.note ? <span className="muted small"> – {c.note}</span> : null}</span>
          <span className="row-end">
            {money(c.amount)}
            <button className="icon-btn" aria-label="Kosten löschen"
              onClick={() => confirm('Diesen Kosteneintrag löschen?') && mutate(() => api.deleteCost(c.id))}>
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      ))}
      {!costs.length && <p className="muted small">Für {year} sind noch keine Kosten erfasst.</p>}
      <form className="form" onSubmit={addCost}>
        <div className="grid2">
          <label>Art
            <select value={category} onChange={(e) => setCategory(e.target.value as CostCategory)}>
              {Object.entries(COST_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Betrag<input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
        </div>
        <label>Notiz<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="freiwillig" /></label>
        <button className="btn">Kosten hinzufügen</button>
      </form>

      <button className="btn primary" onClick={createExcel} disabled={busy}>
        <Icon name="download" size={18} /> {busy ? 'Wird erstellt…' : `Excel ${year} erstellen`}
      </button>
      {file && (
        <a className="btn ghost" href={file.url} target="_blank" rel="noreferrer">
          📄 Feldele-Abrechnung-{file.year}.xlsx öffnen <span className="small muted">({timeAgo(file.createdAt)})</span>
        </a>
      )}
      {files && files.filter((f) => f.year !== year).length > 0 && (
        <p className="small">
          Frühere Jahre: {files.filter((f) => f.year !== year).map((f) => (
            <a key={f.year} href={f.url} target="_blank" rel="noreferrer" className="accent"> {f.year} </a>
          ))}
        </p>
      )}
    </section>
  )
}

/**
 * Owner only: clans and the family names members can pick. Clans pay together and
 * are never shown to members. Some clans may also use Waldele.
 */
function ClanSettings() {
  const { data, mutate } = useData()
  const [newClan, setNewClan] = useState('')
  const [newFamily, setNewFamily] = useState<Record<string, string>>({})
  const familiesOf = (clanId: string | undefined) => data.families.filter((f) => (f.clanId ?? '') === (clanId ?? ''))
  const membersOf = (f: Family) => data.profiles.filter((p) => p.familyId === f.id).map((p) => p.name)
  const waldele = data.settings.waldeleClanIds

  async function addClan(e: FormEvent) {
    e.preventDefault()
    const n = newClan.trim()
    if (data.clans.some((c) => c.name.toLowerCase() === n.toLowerCase())) return alert(`«${n}» gibt es schon.`)
    await mutate(() => api.addClan(n))
    setNewClan('')
  }

  async function addFamily(e: FormEvent, clan: Clan) {
    e.preventDefault()
    const n = (newFamily[clan.id] ?? '').trim()
    if (!n) return
    if (data.families.some((f) => f.name.toLowerCase() === n.toLowerCase())) return alert(`«${n}» gibt es schon.`)
    await mutate(async () => {
      const f = await api.addFamily(n)
      await api.setFamilyClan(f.id, clan.id)
    })
    setNewFamily((s) => ({ ...s, [clan.id]: '' }))
  }

  async function renameClan(c: Clan) {
    const n = prompt('Neuer Name für diesen Clan:', c.name)?.trim()
    if (n && n !== c.name) await mutate(() => api.renameClan(c.id, n))
  }

  async function deleteClan(c: Clan) {
    if (familiesOf(c.id).length) return alert(`Verschiebe oder lösche zuerst die Familien von ${c.name}.`)
    if (confirm(`Clan «${c.name}» löschen?`)) await mutate(() => api.deleteClan(c.id))
  }

  async function renameFamily(f: Family) {
    const n = prompt('Neuer Name:', f.name)?.trim()
    if (n && n !== f.name) await mutate(() => api.renameFamily(f.id, n))
  }

  async function deleteFamily(f: Family) {
    if (membersOf(f).length) return alert(`${f.name} ist noch ausgewählt von: ${membersOf(f).join(', ')}.`)
    if (data.settings.priorityOrder.includes(f.id)) return alert(`Nimm ${f.name} zuerst aus der Prioritäts-Reihenfolge.`)
    if (confirm(`«${f.name}» löschen?`)) await mutate(() => api.deleteFamily(f.id))
  }

  const toggleWaldele = (c: Clan) =>
    mutate(() => api.updateSettings({ waldeleClanIds: waldele.includes(c.id) ? waldele.filter((x) => x !== c.id) : [...waldele, c.id] }))

  return (
    <section className="card">
      <h2>🏰 Clans & Familien</h2>
      <p className="small muted">
        Nur du siehst die Clans. Die Mitglieder wählen bei der Registrierung nur ihre Familie (den Namen darunter).
        Ein Clan bezahlt für alle seine Familien zusammen.
      </p>
      {data.clans.map((c) => (
        <div key={c.id} className="clan-block">
          <div className="row-head">
            <strong>{c.name}</strong>
            <span className="row-end">
              <button className="icon-btn" onClick={() => renameClan(c)} aria-label={`${c.name} umbenennen`}><Icon name="edit" size={16} /></button>
              <button className="icon-btn" onClick={() => deleteClan(c)} aria-label={`${c.name} löschen`}><Icon name="trash" size={16} /></button>
            </span>
          </div>
          <label className="check small">
            <input type="checkbox" checked={waldele.includes(c.id)} onChange={() => toggleWaldele(c)} />
            Darf auch Waldele nutzen (startet in Waldele)
          </label>
          {familiesOf(c.id).map((f) => (
            <div key={f.id} className="row-head cost-row indent">
              <span>{f.name} <span className="muted small">{membersOf(f).length ? `· ${membersOf(f).join(', ')}` : ''}</span></span>
              <span className="row-end">
                <select value={f.clanId ?? ''} onChange={(e) => mutate(() => api.setFamilyClan(f.id, e.target.value || undefined))}
                  aria-label={`Clan von ${f.name}`} className="family-select">
                  {data.clans.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button className="icon-btn" onClick={() => renameFamily(f)} aria-label={`${f.name} umbenennen`}><Icon name="edit" size={16} /></button>
                <button className="icon-btn" onClick={() => deleteFamily(f)} aria-label={`${f.name} löschen`}><Icon name="trash" size={16} /></button>
              </span>
            </div>
          ))}
          <form className="comment-form indent" onSubmit={(e) => addFamily(e, c)}>
            <input value={newFamily[c.id] ?? ''} onChange={(e) => setNewFamily((s) => ({ ...s, [c.id]: e.target.value }))}
              placeholder="Familie hinzufügen…" maxLength={60} />
            <button className="btn small">+</button>
          </form>
        </div>
      ))}
      {familiesOf(undefined).length > 0 && (
        <p className="small warn-text">Ohne Clan: {familiesOf(undefined).map((f) => f.name).join(', ')}</p>
      )}
      <form className="form" onSubmit={addClan}>
        <label>Neuer Clan<input value={newClan} onChange={(e) => setNewClan(e.target.value)} required maxLength={60} /></label>
        <button className="btn">Clan hinzufügen</button>
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
  const [roomHouse, setRoomHouse] = useState<House>('feldele')

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
      name: roomName.trim(), beds: Number(roomBeds), area: roomArea.trim() || undefined, code: roomCode.trim() || undefined, house: roomHouse,
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
        <p className="small muted">Ein Haus ohne Zimmer wird als Ganzes gebucht.</p>
        {data.rooms.map((r) => (
          <div key={r.id} className="row-head cost-row">
            <span>{roomLabel(r)} <span className="muted small">· {HOUSES[houseOf(r)]} · {r.beds} {r.beds === 1 ? 'Bett' : 'Betten'}{r.code ? ` · ${r.code}` : ''}</span></span>
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
            <label>Haus
              <select value={roomHouse} onChange={(e) => setRoomHouse(e.target.value as House)}>
                {Object.entries(HOUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
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
