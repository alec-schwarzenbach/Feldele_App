import type { Clan, Family } from './types'

// The clans and the family names people pick when they sign up, as given by the owner.
// The same list is written to Firebase by scripts/setup-families.cjs.
// Clan ids are neutral on purpose: members can read families, but must not learn the clan names.

const SETUP: { clan: Clan; families: string[] }[] = [
  { clan: { id: 'c1', name: 'Frasi Schwarzenbach' }, families: ['Frasi Schwarzenbach', 'Gioia Weli', 'Alexis Schwarzenbach', 'Céline Schwarzenbach', 'Robin Schwarzenbach'] },
  { clan: { id: 'c2', name: 'Alfred Schwarzenbach' }, families: ['Chrisi Schwarzenbach', 'Michele Puch', 'Annette Gruber'] },
  { clan: { id: 'c3', name: 'Reeli Scott' }, families: ['Reeli Scott', 'Anne Gherzi', 'George Scott', 'Thomas Scott'] },
  { clan: { id: 'c4', name: 'Maria Specker' }, families: ['Maria Specker', 'Ines Specker', 'Nene Specker'] },
]

/** Clan Alfred Schwarzenbach also uses Waldele. */
export const WALDELE_CLAN_IDS = ['c2']

export const familyId = (name: string) =>
  'f-' + name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')

export const CLANS: Clan[] = SETUP.map((s) => s.clan)
export const FAMILIES: Family[] = SETUP.flatMap((s) => s.families.map((name) => ({ id: familyId(name), name, clanId: s.clan.id })))
