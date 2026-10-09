import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'

const DEMO_USERS = [
  { email: 'alec@lodge.test', label: 'Alec (Besitzer)' },
  { email: 'maria@lodge.test', label: 'Maria' },
  { email: 'thomas@lodge.test', label: 'Thomas' },
  { email: 'guenther@lodge.test', label: 'Günter (Auto)' },
  { email: 'rosa@lodge.test', label: 'Rosa (Cleaner)' },
]

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'in') await api.signIn(email, password)
      else await api.signUp(name, email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="login-logo">🏕️</div>
        <h1>Feldele</h1>
        <p>Aufenthalte, Fischen, Tipps und das Auto – für uns alle.</p>
      </div>

      <form className="card form" onSubmit={submit}>
        {mode === 'up' && (
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
        )}
        <label>E-Mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Passwort<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        {mode === 'up' && <p className="small muted">Danach wählst du deine Familie (oder fügst sie hinzu).</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Anmelden' : 'Konto erstellen'}</button>
        <button type="button" className="btn ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Neu hier? Konto erstellen' : 'Ich habe schon ein Konto'}
        </button>
      </form>

      {api.mode === 'demo' && (
        <div className="card demo-box">
          <strong>Demo-Modus</strong>
          <p className="muted small">Die Daten sind nur in diesem Browser gespeichert. Tippe auf eine Person zum Anmelden (Passwort: demo).</p>
          <div className="chips">
            {DEMO_USERS.map((u) => (
              <button key={u.email} className="chip" onClick={() => api.signIn(u.email, 'demo')}>{u.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Pending({ name }: { name: string }) {
  return (
    <div className="login">
      <div className="login-hero">
        <div className="login-logo">⏳</div>
        <h1>Fast geschafft, {name}</h1>
        <p>Dein Konto ist erstellt. Der Besitzer muss es noch freischalten, bevor du Aufenthalte, Fänge und die Pinnwand siehst.</p>
      </div>
      <button className="btn primary" onClick={() => location.reload()}>Nochmals prüfen</button>
      <button className="btn ghost" onClick={() => api.signOut()}>Abmelden</button>
    </div>
  )
}
