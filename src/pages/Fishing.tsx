import L from 'leaflet'
import { useMemo, useState, type FormEvent } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { Empty, Fab, Header, Icon, PhotoPicker, Segmented } from '../components/ui'
import { api } from '../lib/api'
import { formatDay, today } from '../lib/dates'
import { useData } from '../lib/store'
import { isAdmin, type Catch } from '../lib/types'

const SPECIES = ['Pike', 'Brown trout', 'Rainbow trout', 'Char', 'Perch', 'Zander', 'Carp', 'Grayling', 'Catfish']

const fishIcon = L.divIcon({ className: 'map-pin', html: '<span>🐟</span>', iconSize: [32, 32], iconAnchor: [16, 30] })
const newIcon = L.divIcon({ className: 'map-pin new', html: '<span>📍</span>', iconSize: [32, 32], iconAnchor: [16, 30] })
const lodgeIcon = L.divIcon({ className: 'map-pin lodge', html: '<span>🏠</span>', iconSize: [32, 32], iconAnchor: [16, 30] })

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTR = '&copy; OpenStreetMap'

export function Fishing() {
  const { data, name } = useData()
  const [view, setView] = useState<'map' | 'list'>('map')
  const [species, setSpecies] = useState('all')
  const [selected, setSelected] = useState<Catch>()
  const s = data.settings

  const allSpecies = useMemo(() => [...new Set(data.catches.map((c) => c.species))].sort(), [data.catches])
  const catches = data.catches
    .filter((c) => species === 'all' || c.species === species)
    .sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))

  return (
    <>
      <Header title="Fishing" />
      <div className="page">
        <Segmented value={view} onChange={setView} options={[{ value: 'map', label: 'Map' }, { value: 'list', label: 'List' }]} />
        <div className="chips scroll">
          <button className={'chip' + (species === 'all' ? ' on' : '')} onClick={() => setSpecies('all')}>All ({data.catches.length})</button>
          {allSpecies.map((sp) => (
            <button key={sp} className={'chip' + (species === sp ? ' on' : '')} onClick={() => setSpecies(sp)}>{sp}</button>
          ))}
        </div>

        {view === 'map' ? (
          <>
            <div className="map-wrap">
              <MapContainer center={[s.lodgeLat, s.lodgeLng]} zoom={13} className="map">
                <TileLayer url={TILES} attribution={ATTR} />
                <Marker position={[s.lodgeLat, s.lodgeLng]} icon={lodgeIcon}><Popup>{s.lodgeName}</Popup></Marker>
                {catches.map((c) => (
                  <Marker key={c.id} position={[c.lat, c.lng]} icon={fishIcon} eventHandlers={{ click: () => setSelected(c) }} />
                ))}
              </MapContainer>
            </div>
            {selected ? <CatchCard c={selected} by={name(selected.userId)} /> : <p className="muted small center">Tap a fish to see the catch.</p>}
          </>
        ) : (
          <>
            {catches.length === 0 && <Empty>No catches yet.</Empty>}
            {catches.map((c) => <CatchCard key={c.id} c={c} by={name(c.userId)} />)}
          </>
        )}
      </div>
      <Fab to="/fishing/new" label="Log a catch" />
    </>
  )
}

function CatchCard({ c, by }: { c: Catch; by: string }) {
  const { user, mutate } = useData()
  return (
    <article className="card catch">
      {c.photoUrl && <img src={c.photoUrl} alt={c.species} />}
      <div className="row-head">
        <h2>{c.species}</h2>
        {(c.userId === user.id || isAdmin(user)) && (
          <button className="icon-btn" aria-label="Delete catch"
            onClick={() => confirm('Delete this catch?') && mutate(() => api.deleteCatch(c.id))}>
            <Icon name="trash" size={18} />
          </button>
        )}
      </div>
      <p><strong>{c.lengthCm} cm</strong>{c.weightKg ? ` · ${c.weightKg} kg` : ''}{c.bait ? ` · bait: ${c.bait}` : ''}</p>
      <p className="small muted">{by} · {formatDay(c.caughtAt, true)}</p>
      {c.note && <p className="small">{c.note}</p>}
    </article>
  )
}

function PickLocation({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

export function CatchForm() {
  const { data, mutate } = useData()
  const nav = useNavigate()
  const s = data.settings
  const [species, setSpecies] = useState('')
  const [lengthCm, setLength] = useState('')
  const [weightKg, setWeight] = useState('')
  const [caughtAt, setCaughtAt] = useState(today())
  const [bait, setBait] = useState('')
  const [note, setNote] = useState('')
  const [photoUrl, setPhoto] = useState<string>()
  const [pos, setPos] = useState<[number, number]>()
  const [map, setMap] = useState<L.Map | null>(null)

  function locate() {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const ll: [number, number] = [p.coords.latitude, p.coords.longitude]
        setPos(ll)
        map?.setView(ll, 15)
      },
      (err) => alert('Could not get your location: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!pos) return alert('Tap the map to mark where you caught it.')
    const ok = await mutate(async () => {
      await api.createCatch({
        species: species.trim(), lengthCm: Number(lengthCm), weightKg: weightKg ? Number(weightKg) : undefined,
        caughtAt, bait: bait.trim() || undefined, note: note.trim() || undefined, photoUrl, lat: pos[0], lng: pos[1],
      })
      return true
    })
    if (ok) nav('/fishing', { replace: true })
  }

  return (
    <>
      <Header title="Log a catch" back />
      <form className="page form" onSubmit={submit}>
        <PhotoPicker value={photoUrl} onChange={setPhoto} />

        <label>Fish
          <input list="species" value={species} onChange={(e) => setSpecies(e.target.value)} required placeholder="e.g. Pike" />
          <datalist id="species">{SPECIES.map((sp) => <option key={sp} value={sp} />)}</datalist>
        </label>
        <div className="grid2">
          <label>Length (cm)<input type="number" inputMode="decimal" min={1} step="0.5" value={lengthCm} onChange={(e) => setLength(e.target.value)} required /></label>
          <label>Weight (kg)<input type="number" inputMode="decimal" min={0} step="0.05" value={weightKg} onChange={(e) => setWeight(e.target.value)} placeholder="optional" /></label>
        </div>
        <div className="grid2">
          <label>Date<input type="date" value={caughtAt} max={today()} onChange={(e) => setCaughtAt(e.target.value)} required /></label>
          <label>Bait<input value={bait} onChange={(e) => setBait(e.target.value)} placeholder="optional" /></label>
        </div>

        <div>
          <div className="row-head">
            <span className="label">Where? Tap the map</span>
            <button type="button" className="btn small ghost" onClick={locate}><Icon name="locate" size={16} /> My location</button>
          </div>
          <div className="map-wrap small">
            <MapContainer center={[s.lodgeLat, s.lodgeLng]} zoom={13} className="map" ref={setMap}>
              <TileLayer url={TILES} attribution={ATTR} />
              <PickLocation onPick={(lat, lng) => setPos([lat, lng])} />
              {pos && <Marker position={pos} icon={newIcon} />}
            </MapContainer>
          </div>
        </div>

        <label>Note<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Weather, depth, spot details…" /></label>
        <button className="btn primary">Save catch</button>
      </form>
    </>
  )
}
