import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type {
  AppNotification,
  CarBooking,
  Catch,
  Clan,
  Comment,
  CostEntry,
  Family,
  Post,
  Profile,
  Reservation,
  Room,
  Settings,
  ShoppingItem,
} from './types'

// The group is small, so we simply load everything once after login and
// reload after each change. Keeps the pages simple.

export interface Data {
  profiles: Profile[]
  families: Family[]
  clans: Clan[]
  settings: Settings
  rooms: Room[]
  reservations: Reservation[]
  carBookings: CarBooking[]
  notifications: AppNotification[]
  catches: Catch[]
  posts: Post[]
  comments: Comment[]
  shopping: ShoppingItem[]
  costs: CostEntry[]
}

interface Store {
  user: Profile | null
  authReady: boolean
  data: Data | null
  reload: () => Promise<void>
  /** Runs a change, then reloads data. Errors are shown as alerts. */
  mutate: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  name: (userId: string) => string
  /** Family name for a family id */
  familyName: (familyId: string | undefined) => string
  /** Call after the signed-in user's own profile changed (e.g. family chosen) */
  refreshUser: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

async function loadAll(): Promise<Data> {
  const [profiles, families, clans, settings, rooms, reservations, carBookings, notifications, catches, posts, comments, shopping, costs] =
    await Promise.all([
      api.listProfiles(),
      api.listFamilies(),
      api.listClans(),
      api.getSettings(),
      api.listRooms(),
      api.listReservations(),
      api.listCarBookings(),
      api.listNotifications(),
      api.listCatches(),
      api.listPosts(),
      api.listComments(),
      api.listShopping(),
      api.listCosts(),
    ])
  return { profiles, families, clans, settings, rooms, reservations, carBookings, notifications, catches, posts, comments, shopping, costs }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    api.currentUser().then((u) => {
      setUser(u)
      setAuthReady(true)
    })
    return api.onAuthChange(setUser)
  }, [])

  const reload = useCallback(async () => {
    setData(await loadAll())
  }, [])

  useEffect(() => {
    // People without a family, or waiting for approval, can't read the data yet.
    if (user && user.familyId && user.role !== 'pending') {
      reload().catch((e) => alert(e.message))
      // Keep this device's push registration fresh (no prompt; that needs a button tap).
      api.enablePush(false).catch(() => {})
    }
    else setData(null)
  }, [user, reload])

  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      try {
        const result = await fn()
        await reload()
        return result
      } catch (e) {
        alert((e as Error).message)
        return undefined
      }
    },
    [reload],
  )

  const name = useCallback(
    (userId: string) => data?.profiles.find((p) => p.id === userId)?.name ?? 'Unbekannt',
    [data],
  )

  const familyName = useCallback(
    (familyId: string | undefined) => data?.families.find((f) => f.id === familyId)?.name ?? 'Ohne Familie',
    [data],
  )

  const refreshUser = useCallback(async () => {
    setUser(await api.currentUser())
  }, [])

  return <Ctx.Provider value={{ user, authReady, data, reload, mutate, name, familyName, refreshUser }}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}

/** For pages behind login: data and user are guaranteed. */
export function useData() {
  const s = useStore()
  return { ...s, data: s.data!, user: s.user! }
}
