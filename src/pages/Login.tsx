import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'

const DEMO_USERS = [
  { email: 'alec@lodge.test', label: 'Alec (owner)' },
  { email: 'maria@lodge.test', label: 'Maria' },
  { email: 'thomas@lodge.test', label: 'Thomas' },
  { email: 'guenther@lodge.test', label: 'Günther (car)' },
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
        <p>Stays, fishing, tips and the car – for all of us.</p>
      </div>

      <form className="card form" onSubmit={submit}>
        {mode === 'up' && (
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
        )}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'New here? Create an account' : 'I already have an account'}
        </button>
      </form>

      {api.mode === 'demo' && (
        <div className="card demo-box">
          <strong>Demo mode</strong>
          <p className="muted small">Data lives only in this browser. Tap a person to sign in (password: demo).</p>
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
        <h1>Almost there, {name}</h1>
        <p>Your account was created. The owner needs to approve it before you can see stays, catches and the board.</p>
      </div>
      <button className="btn primary" onClick={() => location.reload()}>Check again</button>
      <button className="btn ghost" onClick={() => api.signOut()}>Sign out</button>
    </div>
  )
}
