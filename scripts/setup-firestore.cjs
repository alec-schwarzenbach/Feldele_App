// Fills an empty Firestore with the starting data and one `_example` document
// per collection, so every collection shows up in the Firebase console with
// all its fields. The app ignores documents whose id starts with "_".
//
// Run:  npm run setup:firestore     (uses your `firebase login`)
// Safe to run again: existing settings and rooms are never overwritten.

const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth')
const { requireAuth } = require('firebase-tools/lib/requireAuth')
const { Client } = require('firebase-tools/lib/apiv2')

const PROJECT = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../.firebaserc'), 'utf8')).projects.default
const now = new Date().toISOString()

const SETTINGS = {
  freeCancelMonths: 4, currency: 'EUR', lodgeName: 'Feldele', lodgeLat: 47.505, lodgeLng: 14.0,
  families: [], priorityOrder: [], priorityStartYear: new Date().getFullYear(),
}

const ROOMS = [
  { name: 'Big bedroom', beds: 2 },
  { name: 'Bunk room', beds: 4 },
  { name: 'Attic', beds: 3 },
  { name: 'Living room sofa', beds: 2 },
]

const EXAMPLES = {
  profiles: {
    _about: 'One document per login; the document id is the Firebase Auth user id. role: owner | admin | member | car_keeper (car owner) | pending. family: one of settings/main.families, chosen by the member. New sign-ups are pending until the owner approves them.',
    name: 'Example Person', email: 'example@example.com', role: 'member', family: 'Example family', createdAt: now,
  },
  reservations: {
    _about: 'A stay. start = arrival day, end = departure day (YYYY-MM-DD, end not counted as a night). people includes the member. status: active | tentative ("maybe": rooms taken, waiting) | cancelled. priorityClaim = booked by the priority user of that year over someone else; free to cancel until claimDeadline (4 weeks), then binding. bumpedBy = for a "maybe" stay, the stay that pushed it out. lateCancel = cancelled when it already cost something, still counts in the cost split.',
    userId: '(profile id)', start: '2027-01-15', end: '2027-01-18', people: 4, roomIds: ['(room id)'],
    occasion: 'Birthday party', note: 'Arriving late', status: 'active', priorityClaim: true, claimDeadline: '2026-11-05', createdAt: now,
  },
  carBookings: {
    _about: 'When someone needs the car. end is the last day the car is needed (inclusive). reservationId links it to a stay (optional).',
    userId: '(profile id)', reservationId: '(reservation id)', start: '2027-01-15', end: '2027-01-18',
    note: 'Pick-up at the station at 18:00', createdAt: now,
  },
  notifications: {
    _about: 'Messages for one person. kind: car (only ever to the car owner, Günter Kobalt) or stay (your stay became "maybe" or confirmed). Only the recipient can read them.',
    userId: '(recipient profile id)', kind: 'car', title: 'Car needed: Example Person',
    body: 'Example Person needs the car from 15 Jan 2027 to 18 Jan 2027.', read: false, createdAt: now,
  },
  catches: {
    _about: 'A fish taken out. reason: starving | injured. lat/lng is where it was caught (live GPS or tapped on the map). caughtAt is YYYY-MM-DD. photoUrl points to Storage.',
    userId: '(profile id)', species: 'Pike', lengthCm: 78, weightKg: 4.2, lat: 47.512, lng: 13.995,
    caughtAt: '2026-10-01', reason: 'injured', bait: 'Spinner', note: 'Below the old bridge', photoUrl: '', createdAt: now,
  },
  posts: {
    _about: 'Info board post. category: tip | trip | review | restaurant | other. rating 1–5 for reviews and restaurants.',
    userId: '(profile id)', category: 'restaurant', title: 'Gasthof zur Post', body: 'Great Schnitzel, closed Mondays.',
    rating: 5, photoUrl: '', createdAt: now, updatedAt: now,
  },
  comments: {
    _about: 'A comment on a post.',
    postId: '(post id)', userId: '(profile id)', body: 'Confirmed, we were there last month.', createdAt: now,
  },
  costs: {
    _about: 'Yearly lodge costs, split by person-nights. Only admins can see these. category: rent | electricity | water | supplies | other.',
    year: 2026, category: 'electricity', amount: 960, note: 'Annual bill',
  },
}

function encode(v) {
  if (v === null) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } }
  return { mapValue: { fields: fields(v) } }
}
const fields = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '').map(([k, v]) => [k, encode(v)]))

async function main() {
  const account = getGlobalDefaultAccount()
  if (!account) throw new Error('Not logged in – run: npx firebase-tools login')
  await requireAuth({ user: account.user, tokens: account.tokens })
  const api = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true })
  const docs = `/projects/${PROJECT}/databases/(default)/documents`

  const exists = async (path) => {
    const res = await api.get(`${docs}/${path}`, { resolveOnHTTPError: true })
    return res.status === 200
  }
  const set = (path, data) => api.patch(`${docs}/${path}`, { fields: fields(data) })

  if (await exists('settings/main')) console.log('settings/main already exists – kept')
  else {
    await set('settings/main', SETTINGS)
    console.log('created settings/main')
  }

  const rooms = await api.get(`${docs}/rooms?pageSize=1`)
  if (rooms.body.documents?.length) console.log('rooms already exist – kept')
  else {
    for (const room of ROOMS) await api.post(`${docs}/rooms`, { fields: fields(room) })
    console.log(`created ${ROOMS.length} starter rooms`)
  }

  for (const [collection, data] of Object.entries(EXAMPLES)) {
    await set(`${collection}/_example`, data)
    console.log(`created ${collection}/_example`)
  }
  console.log(`\nDone – see https://console.firebase.google.com/project/${PROJECT}/firestore`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
