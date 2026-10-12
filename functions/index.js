// Feldele server functions – they send the push notifications.
//
//  sendPush        every new document in "notifications" becomes a push to that person's phones
//  stayChanged     tells the cleaner(s) when a stay is confirmed or cancelled
//  cleanerReminder every morning: tells the cleaner(s) who arrives tomorrow
//  waldeleHeating  answers the Loxone Miniserver in Waldele: 1 = heat, 0 = nobody booked
//
// Deploy:  npx firebase-tools deploy --only functions

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onRequest } from 'firebase-functions/v2/https'
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
// The Miniserver asks this address every few minutes (Loxone "Virtueller HTTP Eingang")
// and gets "1" = heat (a guest arrives within the preheat time or is there) or "0" = no one booked.
// Nothing connects into the Waldele network; the Miniserver only needs internet.
// Settings and the secret key are in Firestore loxone/config (owner edits them in the app).

/** The moment `hour` o'clock on `day` (YYYY-MM-DD) in Swiss time. */
function swissTime(day, hour) {
  const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`)
  const inZurich = new Date(guess.toLocaleString('en-US', { timeZone: TIME_ZONE }))
  const inUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (inZurich - inUtc))
}

export const waldeleHeating = onRequest({ invoker: 'public', cors: false }, async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const config = (await db.doc('loxone/config').get()).data()
  // Without the right key nobody learns when the house is empty.
  if (!config?.key || req.query.key !== config.key) {
    res.status(403).type('text/plain').send('forbidden')
    return
  }
  const preheat = Number(config.preheatHours ?? 12)
  const arrivalHour = Number(config.arrivalHour ?? 16)
  const departureHour = Number(config.departureHour ?? 11)
  const now = new Date()

  const stays = (await db.collection('reservations').where('house', '==', 'waldele').get()).docs
    .filter((d) => !d.id.startsWith('_') && d.get('status') === 'active')
    .map((d) => {
      const r = d.data()
      const from = new Date(swissTime(r.start, arrivalHour).getTime() - preheat * 3_600_000)
      return { from, to: swissTime(r.end, departureHour), start: r.start, end: r.end }
    })
    .filter((s) => s.to > now)
    .sort((a, b) => a.from - b.from)

  const current = stays.find((s) => s.from <= now && now < s.to)
  const on = current ? 1 : 0
  if (req.query.format === 'json') {
    const next = stays.find((s) => s.from > now)
    res.json({
      heating: on,
      reason: current ? `Aufenthalt ${current.start} – ${current.end}` : 'Kein Aufenthalt',
      on: current ? current.from.toISOString() : next?.from.toISOString() ?? null,
      off: current ? current.to.toISOString() : next?.to.toISOString() ?? null,
      settings: { preheatHours: preheat, arrivalHour, departureHour },
    })
    return
  }
  res.type('text/plain').send(String(on))
})
