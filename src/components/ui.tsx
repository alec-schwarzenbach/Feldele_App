import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { colorFor } from '../lib/colors'
import { resizeImage } from '../lib/photo'
import { api } from '../lib/api'

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  bed: 'M3 18V6M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11.5a1.5 1.5 0 1 0 0-.01',
  car: 'M5 16h14M6 16v2M18 16v2M4 16l1.5-6A2 2 0 0 1 7.4 8.5h9.2a2 2 0 0 1 1.9 1.5L20 16M7.5 13h.01M16.5 13h.01',
  fish: 'M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3zM15.5 11h.01',
  board: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
}

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

export function Header({ title, back, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="header">
      {back ? (
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Zurück"><Icon name="back" /></button>
      ) : <span className="header-spacer" />}
      <h1>{title}</h1>
      {action ?? <span className="header-spacer" />}
    </header>
  )
}

export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: colorFor(id), width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Fab({ to, label }: { to: string; label: string }) {
  const nav = useNavigate()
  return (
    <button className="fab" onClick={() => nav(to)} aria-label={label}>
      <Icon name="plus" size={26} />
    </button>
  )
}

export function Stars({ value, onChange }: { value?: number; onChange?: (v: number | undefined) => void }) {
  return (
    <span className={'stars' + (onChange ? ' editable' : '')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} className={n <= (value ?? 0) ? 'on' : ''}
          onClick={() => onChange?.(value === n ? undefined : n)} aria-label={`${n} Sterne`}>★</button>
      ))}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function PhotoPicker({ value, onChange }: { value?: string; onChange: (url: string | undefined) => void }) {
  const [busy, setBusy] = useState(false)
  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const small = await resizeImage(file, api.mode === 'demo' ? 800 : 1600, api.mode === 'demo' ? 0.7 : 0.82)
      onChange(await api.uploadPhoto(small))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="photo-picker">
      {value ? (
        <div className="photo-preview">
          <img src={value} alt="" />
          <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>Foto entfernen</button>
        </div>
      ) : (
        <label className="photo-drop">
          <Icon name="camera" size={28} />
          <span>{busy ? 'Wird hochgeladen…' : 'Foto hinzufügen'}</span>
          <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      )}
    </div>
  )
}
