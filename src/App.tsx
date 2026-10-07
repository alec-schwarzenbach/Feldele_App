import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useStore } from './lib/store'
import { isAdmin } from './lib/types'
import { Board, PostDetail, PostForm } from './pages/Board'
import { Car, CarForm } from './pages/Car'
import { CatchForm, Fishing } from './pages/Fishing'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'
import { Report } from './pages/Report'
import { StayDetail } from './pages/StayDetail'
import { StayForm } from './pages/StayForm'
import { Stays } from './pages/Stays'

export default function App() {
  const { user, authReady, data } = useStore()

  if (!authReady) return <div className="splash">🏕️</div>
  if (!user) return <div className="shell"><Login /></div>
  if (!data) return <div className="splash">🏕️</div>

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="stays" element={<Stays />} />
          <Route path="car" element={<Car />} />
          <Route path="fishing" element={<Fishing />} />
          <Route path="board" element={<Board />} />
        </Route>
        <Route element={<div className="shell"><main className="content"><Outlet /></main></div>}>
          <Route path="stays/new" element={<StayForm />} />
          <Route path="stays/:id" element={<StayDetail />} />
          <Route path="stays/:id/edit" element={<StayForm />} />
          <Route path="car/new" element={<CarForm />} />
          <Route path="fishing/new" element={<CatchForm />} />
          <Route path="board/new" element={<PostForm />} />
          <Route path="board/:id" element={<PostDetail />} />
          <Route path="board/:id/edit" element={<PostForm />} />
          {/* Costs and amounts owed are for admins only */}
          <Route path="report" element={isAdmin(user) ? <Report /> : <Navigate to="/" replace />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
