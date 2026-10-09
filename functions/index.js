// Feldele server functions – they send the push notifications.
//
//  sendPush        every new document in "notifications" becomes a push to that person's phones
//  stayChanged     tells the cleaner(s) when a stay is confirmed or cancelled
//  cleanerReminder every morning: tells the cleaner(s) who arrives tomorrow
//
// Deploy:  npx firebase-tools deploy --only functions

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

initializeApp()
setGlobalOptions({ region: 'us-central1', maxInstances: 3 })
const db = getFirestore()

const APP_URL = 'https://feldele.web.app/'
const TIME_ZONE = 'Europe/Zurich'

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
async function notifyCleaners(title, body) {
  const cleaners = await db.collection('profiles').where('role', '==', 'cleaner').get()
  const batch = db.batch()
  for (const c of cleaners.docs) {
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
  const { who, text } = await describeStay(stay)
  if (isActive) await notifyCleaners(`Neue Buchung: ${who}`, `${who} kommt ${text}.`)
  else await notifyCleaners(`Buchung storniert: ${who}`, `${who} kommt doch nicht: ${text}.`)
})

export const cleanerReminder = onSchedule({ schedule: '0 8 * * *', timeZone: TIME_ZONE }, async () => {
  // "Tomorrow" in Swiss time, as YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(Date.now() + 86_400_000))
  const arrivals = await db.collection('reservations').where('start', '==', parts).where('status', '==', 'active').get()
  for (const doc of arrivals.docs) {
    if (doc.id.startsWith('_')) continue
    const { who, text } = await describeStay(doc.data())
    await notifyCleaners(`Morgen kommt ${who}`, `Anreise morgen: ${who}, ${text}.`)
  }
})
