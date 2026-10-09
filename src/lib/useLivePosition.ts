import { useEffect, useState } from 'react'

export interface LivePosition {
  lat: number
  lng: number
  /** meters */
  accuracy: number
}

/** Follows the phone's GPS position while the component is on screen. */
export function useLivePosition(enabled = true) {
  const [position, setPosition] = useState<LivePosition>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!enabled) return
    if (!('geolocation' in navigator)) {
      setError('Dieses Gerät hat keine Standortfunktion.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(undefined)
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy })
      },
      (e) =>
        setError(e.code === e.PERMISSION_DENIED
          ? 'Der Standort ist blockiert – erlaube ihn in den Einstellungen für Feldele.'
          : 'Warte auf GPS…'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [enabled])

  return { position, error }
}
