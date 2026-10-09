import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { NO_FAMILY, type Family } from '../lib/types'

const NEW = '__new__'

/**
 * Second step of signing up (and shown to anyone without a family):
 * pick your family, or add it if it isn't there yet. There's no way past it.
 * People who aren't part of a family (cleaner, car owner) choose "no family".
 */
export function ChooseFamily() {
  const { user, refreshUser } = useStore()
  const [families, setFamilies] = useState<Family[]>()
  const [choice, setChoice] = useState('')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.listFamilies()
      .then((list) => {
        setFamilies(list)
        if (!list.length) setChoice(NEW)
      })
      .catch((e) => setError(e.message))
  }, [])

  const typed = newName.trim()
  const duplicate = families?.find((f) => f.name.toLowerCase() === typed.toLowerCase())

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || !choice) return
    setBusy(true)
    setError('')
    try {
      let familyId = choice
      if (choice === NEW) {
        if (!typed) throw new Error('Gib deinen Familiennamen ein.')
        // Typed a family that already exists? Join it instead of making a copy.
        familyId = duplicate ? duplicate.id : (await api.addFamily(typed)).id
      }
      await api.updateProfile(user.id, { familyId })
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
        <p>Priorität und Kosten laufen über die Familien. Du musst eine wählen, um Feldele zu nutzen.</p>
      </div>

      <form className="card form" onSubmit={submit}>
        <label>Deine Familie
          <select value={choice} onChange={(e) => setChoice(e.target.value)} required disabled={!families}>
            <option value="" disabled>{families ? '— Familie wählen —' : 'Wird geladen…'}</option>
            {families?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value={NEW}>➕ Meine Familie fehlt – hinzufügen</option>
            <option value={NO_FAMILY}>Ich gehöre zu keiner Familie (z. B. Reinigung, Auto)</option>
          </select>
        </label>

        {choice === NEW && (
          <>
            <label>Familienname
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. Schwarzenbach" required autoFocus maxLength={60} />
            </label>
            {duplicate
              ? <p className="small warn-text">«{duplicate.name}» gibt es schon – du wirst dieser Familie zugeordnet.</p>
              : <p className="small muted">Die anderen können sie danach auch auswählen.</p>}
          </>
        )}
        {choice === NO_FAMILY && (
          <p className="small muted">Nur für Personen, die nicht mitbezahlen, z. B. die Reinigungskraft oder den Autobesitzer.</p>
        )}

        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || !choice}>Weiter</button>
        <button type="button" className="btn ghost" onClick={() => api.signOut()}>Abmelden</button>
      </form>
    </div>
  )
}
