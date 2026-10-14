// Feldele server functions – they send the push notifications.
//
//  sendPush        every new document in "notifications" becomes a push to that person's phones
//  stayChanged     tells the cleaner(s) when a stay is confirmed or cancelled
//  cleanerReminder every morning: tells the cleaner(s) who arrives tomorrow
//  loxonePush      every 5 min: switches the Waldele heating in Loxone according to the bookings
//  loxoneCheck     owner tests the Loxone connection from the app
//  waldeleHeating  link the Miniserver can poll instead: 1 = heat, 0 = nobody booked
//
// Deploy:  npx firebase-tools deploy --only functions

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'

initializeApp()
setGlobalOptions({ region: 'us-central1', maxInstances: 3 })
const db = getFirestore()

const APP_URL = 'https://feldele.web.app/'
const TIME_ZONE = 'Europe/Zurich'
const HOUSE_NAMES = { feldele: 'Feldele', waldele: 'Waldele' }

const dayFmt = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const formatDay = (day) => dayFmt.format(new Date(`${day}T00:00:00Z`))
const formatRange = (start, end) => `${formatDay(start)} – ${formatDay(end)}`

async function nameOf(userId) {
  const snap = await db.doc(`profiles/${userId}`).get()
  return snap.get('name') ?? 'Jemand'
}

async function roomNames(roomIds) {
  const snaps = await Promise.all((roomIds ?? []).map((id) => db.doc(`rooms/${id}`).get()))
  return snaps
    .filter((s) => s.exists)
    .map((s) => (s.get('area') ? `${s.get('name')} (${s.get('area')})` : s.get('name')))
    .join(', ')
}

/** Creates an in-app notification for every cleaner; sendPush then delivers it. */
/** Each cleaner works in one house (profiles.cleanerHouse, missing = Feldele). */
async function notifyCleaners(house, title, body) {
  const cleaners = await db.collection('profiles').where('role', '==', 'cleaner').get()
  const batch = db.batch()
  for (const c of cleaners.docs.filter((d) => (d.get('cleanerHouse') ?? 'feldele') === house)) {
    batch.create(db.collection('notifications').doc(), {
      userId: c.id, kind: 'cleaner', title, body, read: false, createdAt: new Date().toISOString(),
    })
  }
  await batch.commit()
}

async function describeStay(r) {
  const [who, rooms] = await Promise.all([nameOf(r.userId), roomNames(r.roomIds)])
  return { who, text: `${formatRange(r.start, r.end)}, ${r.people} ${r.people === 1 ? 'Person' : 'Personen'}${rooms ? ` (${rooms})` : ''}` }
}

export const sendPush = onDocumentCreated('notifications/{id}', async (event) => {
  const n = event.data?.data()
  if (!n || event.params.id.startsWith('_')) return
  const tokens = await db.collection('pushTokens').where('userId', '==', n.userId).get()
  if (tokens.empty) return
  const res = await getMessaging().sendEachForMulticast({
    tokens: tokens.docs.map((d) => d.id),
    notification: { title: n.title, body: n.body },
    data: { link: APP_URL, kind: n.kind ?? '' },
    android: { priority: 'high', notification: { sound: 'default' } },
    webpush: { fcmOptions: { link: APP_URL } },
    apns: { payload: { aps: { sound: 'default' } } },
  })
  // Forget phones that uninstalled the app or turned notifications off.
  const dead = res.responses
    .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code ?? '') ? tokens.docs[i].ref : null))
    .filter(Boolean)
  await Promise.all(dead.map((ref) => ref.delete()))
})

export const stayChanged = onDocumentWritten('reservations/{id}', async (event) => {
  if (event.params.id.startsWith('_')) return
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const wasActive = before?.status === 'active'
  const isActive = after?.status === 'active'
  if (wasActive === isActive) return
  const stay = isActive ? after : before
  // Stays that are already over don't matter for cleaning.
  if (stay.end < new Date().toISOString().slice(0, 10)) return
  const house = stay.house ?? 'feldele'
  const { who, text } = await describeStay(stay)
  const where = HOUSE_NAMES[house]
  if (isActive) await notifyCleaners(house, `Neue Buchung ${where}: ${who}`, `${who} kommt ${text}.`)
  else await notifyCleaners(house, `Buchung storniert ${where}: ${who}`, `${who} kommt doch nicht: ${text}.`)
})

export const cleanerReminder = onSchedule({ schedule: '0 8 * * *', timeZone: TIME_ZONE }, async () => {
  // "Tomorrow" in Swiss time, as YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(Date.now() + 86_400_000))
  const arrivals = await db.collection('reservations').where('start', '==', parts).where('status', '==', 'active').get()
  for (const doc of arrivals.docs) {
    if (doc.id.startsWith('_')) continue
    const house = doc.get('house') ?? 'feldele'
    const { who, text } = await describeStay(doc.data())
    await notifyCleaners(house, `Morgen kommt ${who} (${HOUSE_NAMES[house]})`, `Anreise morgen: ${who}, ${text}.`)
  }
})

// ── Waldele heating (Loxone) ─────────────────────────────────────────────
// Two ways to bring the bookings to the Miniserver in Waldele:
//
//  loxonePush     (recommended) every 5 minutes the server switches the existing virtual
//                 inputs in Loxone (e.g. "Blumenzimmer", "Heizung Aus") through the Loxone
//                 Cloud – only when something changed, so manual switching stays possible.
//  waldeleHeating the Miniserver polls a link instead ("Virtueller HTTP Eingang"):
//                 "1"/"0", or per zone with ?zones=1, e.g. ";ALLE=1;AUS=0;BZ=1;H=0;".
//
// Settings: Firestore loxone/config (owner edits them in the app). The Loxone user and
// password are in loxone/secret, which only the server can read.

/** The moment `hour` o'clock on `day` (YYYY-MM-DD) in Swiss time. */
function swissTime(day, hour) {
  const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`)
  const inZurich = new Date(guess.toLocaleString('en-US', { timeZone: TIME_ZONE }))
  const inUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (inZurich - inUtc))
}

/**
 * Which heating zones should be on right now. A stay heats from `preheatHours` before the
 * arrival time until the departure time. A zone is on if a heating stay uses one of its rooms;
 * "always" zones follow any stay; a stay without rooms (whole house) turns every zone on.
 */
async function heatingNow(config, now = new Date()) {
  const preheat = Number(config.preheatHours ?? 12)
  const arrivalHour = Number(config.arrivalHour ?? 16)
  const departureHour = Number(config.departureHour ?? 11)
  const stays = (await db.collection('reservations').where('house', '==', 'waldele').get()).docs
    .filter((d) => !d.id.startsWith('_') && d.get('status') === 'active')
    .map((d) => {
      const r = d.data()
      const from = new Date(swissTime(r.start, arrivalHour).getTime() - preheat * 3_600_000)
      return { from, to: swissTime(r.end, departureHour), start: r.start, end: r.end, roomIds: r.roomIds ?? [] }
    })
    .filter((s) => s.to > now)
    .sort((a, b) => a.from - b.from)

  const heating = stays.filter((s) => s.from <= now && now < s.to)
  const on = heating.length ? 1 : 0
  const usedRooms = new Set(heating.flatMap((s) => s.roomIds))
  const wholeHouse = heating.some((s) => !s.roomIds.length)
  const zones = (config.zones ?? []).map((z) => ({
    code: z.code,
    name: z.name,
    input: z.input || z.name,
    on: on && (z.always || wholeHouse || (z.rooms ?? []).some((id) => usedRooms.has(id))) ? 1 : 0,
  }))
  return {
    on, zones, current: heating[0], next: stays.find((s) => s.from > now),
    settings: { preheatHours: preheat, arrivalHour, departureHour },
  }
}

export const waldeleHeating = onRequest({ invoker: 'public', cors: false }, async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const config = (await db.doc('loxone/config').get()).data()
  // Without the right key nobody learns when the house is empty.
  if (!config?.key || req.query.key !== config.key) {
    res.status(403).type('text/plain').send('forbidden')
    return
  }
  const h = await heatingNow(config)
  if (req.query.format === 'json') {
    res.json({
      heating: h.on,
      reason: h.current ? `Aufenthalt ${h.current.start} – ${h.current.end}` : 'Kein Aufenthalt',
      on: (h.current ?? h.next)?.from.toISOString() ?? null,
      off: (h.current ?? h.next)?.to.toISOString() ?? null,
      zones: h.zones.map(({ code, name, on }) => ({ code, name, on })),
      settings: h.settings,
    })
    return
  }
  // ?zones=1 → ";ALLE=1;AUS=0;BZ=1;" – one Loxone command per zone reads its value (\i;BZ=\i\v).
  // AUS = 1 when nobody is (about to be) in the house – for a central "heating off".
  if (req.query.zones) {
    res.type('text/plain').send(`;${[`ALLE=${h.on}`, `AUS=${h.on ? 0 : 1}`, ...h.zones.map((z) => `${z.code}=${z.on}`)].join(';')};`)
    return
  }
  res.type('text/plain').send(String(h.on))
})

// ── Switching the Miniserver directly through the Loxone Cloud ─────────────

/** Remote Connect forwards connect.loxonecloud.com/<serial> to the Miniserver's own address. */
async function miniserverBase(serial) {
  const res = await fetch(`https://connect.loxonecloud.com/${encodeURIComponent(serial)}/`, { redirect: 'manual' })
  const location = res.headers.get('location')
  if (!location) throw new Error(`Loxone Cloud findet den Miniserver nicht (HTTP ${res.status})`)
  return new URL(location, 'https://connect.loxonecloud.com').origin
}

/** One web-service call, e.g. path "dev/sps/io/Blumenzimmer/On". Returns the value Loxone reports. */
async function miniserver(base, secret, path) {
  const auth = 'Basic ' + Buffer.from(`${secret.user}:${secret.password}`).toString('base64')
  let url = `${base}/${path}`
  for (let hop = 0; hop < 3; hop++) {
    // Follow redirects by hand so the login is sent along (fetch would drop it).
    const res = await fetch(url, { headers: { Authorization: auth }, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).href
      continue
    }
    const text = await res.text()
    if (res.status === 401 || res.status === 403) throw new Error('Benutzer oder Passwort falsch, oder keine Berechtigung')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const code = text.match(/Code="(\d+)"/)?.[1]
    if (code && code !== '200') throw new Error(code === '404' ? 'Schalter mit diesem Namen nicht gefunden' : `Loxone meldet Code ${code}`)
    return text.match(/value="([^"]*)"/)?.[1] ?? ''
  }
  throw new Error('Zu viele Weiterleitungen')
}

/** Switches whatever changed since the last run; with force everything is sent again. */
async function pushHeating({ force = false } = {}) {
  const config = (await db.doc('loxone/config').get()).data()
  const secret = (await db.doc('loxone/secret').get()).data()
  if (!config?.serial || !secret?.user) return { ok: false, log: ['Miniserver oder Loxone-Benutzer fehlt'] }
  const h = await heatingNow(config)
  const offInput = config.offInput || 'Heizung Aus'
  // When heating starts, release "Heizung Aus" first; when it stops, switch the rooms off first.
  const rooms = h.zones.map((z) => [z.input, z.on])
  const plan = h.on ? [[offInput, 0], ...rooms] : [...rooms, [offInput, 1]]

  const stateRef = db.doc('loxone/state')
  const sent = force ? {} : (await stateRef.get()).data()?.sent ?? {}
  const log = []
  let base
  for (const [input, value] of plan) {
    if (sent[input] === value) continue
    try {
      base ??= await miniserverBase(config.serial)
      await miniserver(base, secret, `dev/sps/io/${encodeURIComponent(input)}/${value ? 'On' : 'Off'}`)
      sent[input] = value
      log.push(`${input}: ${value ? 'ein' : 'aus'}`)
    } catch (e) {
      log.push(`${input}: Fehler – ${e.message}`)
    }
  }
  const ok = !log.some((l) => l.includes('Fehler'))
  await stateRef.set({ sent, at: new Date().toISOString(), log: log.length ? log : ['nichts zu ändern'], ok })
  return { ok, log }
}

export const loxonePush = onSchedule({ schedule: 'every 5 minutes', timeZone: TIME_ZONE }, async () => {
  const config = (await db.doc('loxone/config').get()).data()
  if (config?.push) await pushHeating()
})

/** Owner only: test the connection (reads the switches, changes nothing) or send everything now. */
export const loxoneCheck = onCall(async (req) => {
  const uid = req.auth?.uid
  if (!uid || (await db.doc(`profiles/${uid}`).get()).get('role') !== 'owner') {
    throw new HttpsError('permission-denied', 'Nur für den Besitzer')
  }
  if (req.data?.mode === 'sync') return pushHeating({ force: true })

  const config = (await db.doc('loxone/config').get()).data() ?? {}
  const secret = (await db.doc('loxone/secret').get()).data()
  if (!config.serial || !secret?.user) return { ok: false, log: ['Miniserver-Seriennummer, Benutzer oder Passwort fehlt'] }
  const log = []
  let base
  try {
    base = await miniserverBase(config.serial)
    log.push(`Loxone Cloud: Miniserver gefunden`)
  } catch (e) {
    return { ok: false, log: [e.message] }
  }
  const inputs = [...(config.zones ?? []).map((z) => z.input || z.name), config.offInput || 'Heizung Aus']
  for (const input of inputs) {
    try {
      const value = await miniserver(base, secret, `dev/sps/io/${encodeURIComponent(input)}`)
      log.push(`${input}: gefunden (zurzeit ${Number(value) ? 'ein' : 'aus'})`)
    } catch (e) {
      log.push(`${input}: ${e.message}`)
    }
  }
  return { ok: !log.some((l) => !l.includes('gefunden')), log }
})
