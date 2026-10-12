import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { NO_FAMILY, type Family } from '../lib/types'

/**
 * Shown right after signing up, and to anyone without a family: pick your family
 * from the owner's list. There's no way past it. People who aren't part of a
 * family (cleaner, car owner) choose "no family". Clans are never shown here.
 */
export function ChooseFamily() {
  const { user, refreshUser } = useStore()
  const [families, setFamilies] = useState<Family[]>()
  const [choice, setChoice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.listFamilies().then(setFamilies).catch((e) => setError(e.message))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !choice) return
    setBusy(true)
    setError('')
    try {
      await api.updateProfile(user.id, { familyId: choice })
      await refreshUser()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="login-logo">👨‍👩‍👧‍👦</div>
        <h1>Zu welcher Familie gehörst du?</h1>
        <p>Wähle deinen Namen bzw. deine Familie aus der Liste. Das brauchst du, um Feldele zu nutzen.</p>
      </div>

      <form className="card form" onSubmit={submit}>
        <label>Deine Familie
          <select value={choice} onChange={(e) => setChoice(e.target.value)} required disabled={!families}>
            <option value="" disabled>{families ? '— Familie wählen —' : 'Wird geladen…'}</option>
            {families?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value={NO_FAMILY}>Ich gehöre zu keiner Familie (z. B. Reinigung, Auto)</option>
          </select>
        </label>
        {choice === NO_FAMILY && (
          <p className="small muted">Nur für Personen, die nicht mitbezahlen, z. B. die Reinigungskraft oder den Autobesitzer.</p>
        )}
        <p className="small muted">Dein Name fehlt? Melde dich beim Besitzer der App.</p>

        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || !choice}>Weiter</button>
        <button type="button" className="btn ghost" onClick={() => api.signOut()}>Abmelden</button>
      </form>
    </div>
  )
}
