import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import Home from './routes/Home'

const Menu = lazy(() => import('./routes/Menu'))
const Order = lazy(() => import('./routes/Order'))
const Orders = lazy(() => import('./routes/Orders'))
const More = lazy(() => import('./routes/More'))
const NotFound = lazy(() => import('./routes/NotFound'))

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="menu" element={<Menu />} />
        <Route path="orders" element={<Orders />} />
        <Route path="more" element={<More />} />
        <Route path="order/:publicId" element={<Order />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
