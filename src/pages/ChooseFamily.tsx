import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import type { Family } from '../lib/types'

const NEW = '__new__'

/**
 * Second step of signing up (and shown to anyone without a family):
 * pick your family, or add it if it isn't there yet. There's no way past it.
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
        if (!typed) throw new Error('Enter your family name.')
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
        <h1>Which family are you from?</h1>
        <p>Priority and costs are shared per family. You need to choose one to use Feldele.</p>
      </div>

      <form className="card form" onSubmit={submit}>
        <label>Your family
          <select value={choice} onChange={(e) => setChoice(e.target.value)} required disabled={!families}>
            <option value="" disabled>{families ? '— Choose your family —' : 'Loading…'}</option>
            {families?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value={NEW}>➕ My family isn't listed – add it</option>
          </select>
        </label>

        {choice === NEW && (
          <>
            <label>Family name
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Schwarzenbach" required autoFocus maxLength={60} />
            </label>
            {duplicate
              ? <p className="small warn-text">"{duplicate.name}" already exists – you'll join that family.</p>
              : <p className="small muted">Others will be able to choose it too.</p>}
          </>
        )}

        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || !choice}>Continue</button>
        <button type="button" className="btn ghost" onClick={() => api.signOut()}>Sign out</button>
      </form>
    </div>
  )
}
