import { useState } from 'react'
import { formatNight } from '../lib/dates'
import { stayUsage, usageTotals } from '../lib/rules'
import type { NightUsage, Room } from '../lib/types'

interface Props {
  start: string
  end: string
  people: number
  roomIds: string[]
  rooms: Room[]
  /** Only the nights that differ from the booking. */
  value: NightUsage[]
  onChange: (usage: NightUsage[]) => void
}

/**
 * What was really used per night: fewer rooms or people than booked on some nights.
 * Only the yearly bill uses it; the rooms stay booked for the whole stay.
 */
export function UsageEditor({ start, end, people, roomIds, rooms, value, onChange }: Props) {
  const booking = { start, end, people, roomIds, usage: value }
  const nights = stayUsage(booking)
  const [open, setOpen] = useState(value.length > 0)
  const totals = usageTotals(booking)
  const booked = nights.length * people
  const bookedRooms = nights.length * roomIds.length
  const label = (rid: string) => {
    const r = rooms.find((x) => x.id === rid)
    return r?.code || r?.name || '?'
  }

  function change(night: string, patch: Partial<NightUsage>) {
    const next = nights.map((n) => (n.night === night ? { ...n, ...patch } : n))
    // Keep only the nights that differ from the booking.
    onChange(next.filter((n) => n.people !== people || n.roomIds.length !== roomIds.length || n.roomIds.some((id) => !roomIds.includes(id))))
  }

  if (!nights.length) return null
  return (
    <fieldset>
      <legend>Nutzung pro Nacht</legend>
      <p className="small muted">
        {!value.length
          ? 'Alle Nächte wie gebucht. '
          : `${totals.personNights} statt ${booked} Personennächte${totals.roomNights !== bookedRooms ? `, ${totals.roomNights} statt ${bookedRooms} Zimmernächte` : ''}. `}
        Weniger Zimmer oder Personen in einzelnen Nächten? Das zählt für die Jahresabrechnung.
      </p>
      {!open ? (
        <button type="button" className="btn small ghost" onClick={() => setOpen(true)}>Pro Nacht anpassen</button>
      ) : (
        <div className="usage-list">
          {nights.map((n) => (
            <div key={n.night} className="usage-night">
              <div className="usage-head">
                <strong>{formatNight(n.night)}</strong>
                <div className="stepper small">
                  <button type="button" onClick={() => change(n.night, { people: Math.max(0, n.people - 1) })} aria-label="Weniger Personen">−</button>
                  <strong>{n.people}</strong>
                  <button type="button" onClick={() => change(n.night, { people: n.people + 1 })} aria-label="Mehr Personen">+</button>
                </div>
              </div>
              {roomIds.length > 0 && (
                <div className="chips">
                  {roomIds.map((rid) => (
                    <button type="button" key={rid} className={'chip' + (n.roomIds.includes(rid) ? ' on' : '')}
                      onClick={() => change(n.night, { roomIds: n.roomIds.includes(rid) ? n.roomIds.filter((x) => x !== rid) : [...n.roomIds, rid] })}>
                      {label(rid)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {value.length > 0 && (
            <button type="button" className="btn small ghost" onClick={() => onChange([])}>Alle Nächte wie gebucht</button>
          )}
        </div>
      )}
    </fieldset>
  )
}
