import { useEffect, useState } from 'react'
import { api, type PushState } from '../lib/api'
import { Icon } from './ui'

const DISMISS_KEY = 'feldele-push-later'

/**
 * Asks to turn on push notifications for this phone. The phone's permission
 * prompt may only appear after a tap, so this is a button, not automatic.
 * `compact` is the variant for the profile page (always shows the status).
 */
export function PushPrompt({ compact = false, important = false }: { compact?: boolean; important?: boolean }) {
  const [state, setState] = useState<PushState>()
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    api.enablePush(false).then(setState).catch(() => setState('unsupported'))
  }, [])

  async function enable() {
    setBusy(true)
    try {
      setState(await api.enablePush(true))
    } catch (e) {
      alert('Benachrichtigungen konnten nicht eingeschaltet werden: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!state || api.mode === 'demo') return null
  const iphoneBrowser = /iPhone|iPad/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone

  if (compact) {
    return (
      <div className="push-status">
        <span className="grow">
          <strong>Push-Benachrichtigungen</strong><br />
          <span className="small muted">
            {state === 'on' && 'Auf diesem Gerät eingeschaltet ✓'}
            {state === 'off' && 'Auf diesem Gerät ausgeschaltet'}
            {state === 'denied' && 'Blockiert – in den Einstellungen des Telefons für Feldele erlauben'}
            {state === 'unsupported' && (iphoneBrowser
              ? 'Auf dem iPhone zuerst Feldele über Teilen → «Zum Home-Bildschirm» hinzufügen und von dort öffnen'
              : 'Dieser Browser unterstützt keine Push-Benachrichtigungen')}
          </span>
        </span>
        {state === 'off' && <button className="btn small primary" onClick={enable} disabled={busy}>Einschalten</button>}
      </div>
    )
  }

  if (state !== 'off' || (dismissed && !important)) return null
  return (
    <section className="card notice">
      <Icon name="bell" />
      <div className="grow">
        <strong>Benachrichtigungen einschalten?</strong>
        <p className="small">
          {important
            ? 'Damit du sofort erfährst, wenn jemand bucht oder anreist.'
            : 'Dann erfährst du es sofort, wenn sich bei deinem Aufenthalt etwas ändert.'}
        </p>
        <div className="row-end" style={{ marginTop: 8, gap: 8 }}>
          <button className="btn small primary" onClick={enable} disabled={busy}>Einschalten</button>
          {!important && (
            <button className="btn small ghost" onClick={() => {
              setDismissed(true)
              try {
                localStorage.setItem(DISMISS_KEY, '1')
              } catch {
                /* private mode */
              }
            }}>Später</button>
          )}
        </div>
      </div>
    </section>
  )
}
