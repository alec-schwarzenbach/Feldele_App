// Replaces all families and clans in Firestore with the owner's list
// (same list as src/lib/families.ts) and makes every user choose their family again.
//
// Run:  node scripts/setup-families.cjs        (uses your `firebase login`)
//
// What it does:
//  1. deletes all families and clans (not the _example documents)
//  2. creates the clans c1–c4 and their families
//  3. clan c2 (Alfred Schwarzenbach) may use Waldele
//  4. removes familyId from every profile → everyone sees the "choose your family" screen
//  5. clears the priority rotation (it pointed at the old families)

const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth')
const { requireAuth } = require('firebase-tools/lib/requireAuth')
const { Client } = require('firebase-tools/lib/apiv2')

const SETUP = [
  { id: 'c1', name: 'Frasi Schwarzenbach', families: ['Frasi Schwarzenbach', 'Gioia Weli', 'Alexis Schwarzenbach', 'Céline Schwarzenbach', 'Robin Schwarzenbach'] },
  { id: 'c2', name: 'Alfred Schwarzenbach', families: ['Chrisi Schwarzenbach', 'Michele Puch', 'Annette Gruber'] },
  { id: 'c3', name: 'Reeli Scott', families: ['Reeli Scott', 'Anne Gherzi', 'George Scott', 'Thomas Scott'] },
  { id: 'c4', name: 'Maria Specker', families: ['Maria Specker', 'Ines Specker', 'Nene Specker'] },
]
const WALDELE_CLAN_IDS = ['c2']

const familyId = (name) => 'f-' + name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
const str = (s) => ({ stringValue: s })
const now = new Date().toISOString()

async function main() {
  const account = getGlobalDefaultAccount()
  if (!account) throw new Error('Not logged in – run: npx firebase-tools login')
  await requireAuth({ user: account.user, tokens: account.tokens })
  const api = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true })
  const docs = '/projects/feldele/databases/(default)/documents'
  const listIds = async (c) => ((await api.get(`${docs}/${c}?pageSize=300`)).body.documents ?? [])
    .map((d) => d.name.split('/').pop()).filter((id) => !id.startsWith('_'))

  for (const c of ['families', 'clans']) {
    for (const id of await listIds(c)) {
      await api.delete(`${docs}/${c}/${id}`)
      console.log(`deleted ${c}/${id}`)
    }
  }

  for (const clan of SETUP) {
    await api.patch(`${docs}/clans/${clan.id}`, { fields: { name: str(clan.name), createdAt: str(now) } })
    console.log(`clan ${clan.id}: ${clan.name}`)
    for (const name of clan.families) {
      await api.patch(`${docs}/families/${encodeURIComponent(familyId(name))}`, {
        fields: { name: str(name), clanId: str(clan.id), createdAt: str(now) },
      })
      console.log(`  family ${name}`)
    }
  }

  await api.patch(`${docs}/settings/main?updateMask.fieldPaths=waldeleClanIds&updateMask.fieldPaths=priorityOrder`, {
    fields: { waldeleClanIds: { arrayValue: { values: WALDELE_CLAN_IDS.map(str) } }, priorityOrder: { arrayValue: { values: [] } } },
  })
  console.log('settings: Waldele for', WALDELE_CLAN_IDS.join(', '), '· priority rotation cleared')

  // Leaving familyId out of the update mask's data removes the field.
  for (const id of await listIds('profiles')) {
    await api.patch(`${docs}/profiles/${id}?updateMask.fieldPaths=familyId`, { fields: {} })
    console.log(`profile ${id}: family cleared`)
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
