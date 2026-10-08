import { NavLink, Outlet } from 'react-router-dom'
import { Icon } from './ui'
import { useData } from '../lib/store'

const TABS = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/stays', icon: 'bed', label: 'Stays' },
  { to: '/car', icon: 'car', label: 'Car' },
  { to: '/fishing', icon: 'fish', label: 'Fishing' },
  { to: '/board', icon: 'board', label: 'Board' },
]

export function Layout() {
  const { data } = useData()
  const unread = data.notifications.filter((n) => !n.read).length
  return (
    <div className="shell">
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="tab-icon">
              <Icon name={t.icon} />
              {t.to === '/' && unread > 0 && <b className="badge">{unread}</b>}
            </span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
