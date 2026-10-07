// Stable color per member, used in calendars and avatars.
const PALETTE = ['#2f7d5b', '#c0662b', '#3b6fb6', '#a3477a', '#7a6a1f', '#4b8a8c', '#8a4b3b', '#5a4fa3']

export function colorFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
