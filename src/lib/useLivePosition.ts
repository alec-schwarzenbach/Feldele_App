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
      setError('This device has no location service.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(undefined)
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy })
      },
      (e) =>
        setError(e.code === e.PERMISSION_DENIED
          ? 'Location is blocked – allow it for this site in your browser settings.'
          : 'Waiting for GPS…'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [enabled])

  return { position, error }
}
