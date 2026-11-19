import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import Home from './routes/Home'

const Menu = lazy(() => import('./routes/Menu'))
const Order = lazy(() => import('./routes/Order'))
const Orders = lazy(() => import('./routes/Orders'))
const More = lazy(() => import('./routes/More'))
const NotFound = lazy(() => import('./routes/NotFound'))
// A table's QR code: its own slim shell (no website header, footer or tab bar), its own cart and menu.
const TableApp = lazy(() => import('./routes/table/TableApp'))
// A table's receipt behind its long link: public, standalone, printable.
const Receipt = lazy(() => import('./routes/Receipt'))

export default function App() {
  return (
    <Routes>
      <Route
        path="t/:qrKey/*"
        element={
          <Suspense fallback={null}>
            <TableApp />
          </Suspense>
        }
      />
      <Route
        path="r/:receiptKey"
        element={
          <Suspense fallback={null}>
            <Receipt />
          </Suspense>
        }
      />
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
