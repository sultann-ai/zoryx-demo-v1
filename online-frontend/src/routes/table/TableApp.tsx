import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { MenuSourceContext } from '../../api/menuSource'
import {
  forgetSession,
  isSessionEnded,
  QR_MENU_SOURCE,
  refreshSession,
  useTableLookup,
  useTableSession,
  type JoinResult,
  type RoundStatus,
  type TableSessionPoll,
} from '../../api/table'
import { LogoMark } from '../../brand/Logo'
import { useShopName } from '../../brand/useShopName'
import { CartProvider } from '../../cart/CartProvider'
import type { CartStorage } from '../../cart/storage'
import { Icon } from '../../components/Icon'
import { AppState } from '../../components/mobile/AppState'
import { Skeleton } from '../../components/Skeleton'
import { Button, ButtonRoute } from '../../components/ui/Button'
import { setCartPanel } from '../../lib/cartPanel'
import { vibrate } from '../../lib/haptics'
import { queryClient } from '../../lib/queryClient'
import { clearTableToken, readTableToken, saveTableToken, tableCartKey } from '../../lib/tableToken'
import { showToast } from '../../lib/toast'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
import { JoinSheet } from './JoinSheet'
import { MenuSkeleton, QrMenu } from './QrMenu'
import { TableCart } from './TableCart'
import { isBillLocked, tableLabel, TableContext, tablePath, useTable, type TableValue } from './TableContext'
import { TableShell } from './TableShell'
import { ClosedNotice, TableProblem } from './TableStates'
import { CLOSED_TEXT } from './tableErrors'
import { useT } from '../../i18n'

const TableHome = lazy(() => import('./TableHome'))
const TableOrders = lazy(() => import('./TableOrders'))
const TableBillPage = lazy(() => import('./bill/TableBillPage'))

/** The shape of a table's QR key (base64url, 22 characters); anything else is "no such table" without asking. */
const QR_KEY = /^[A-Za-z0-9_-]{22}$/

function usePageTitle(text: string | null) {
  const shop = useShopName()
  useEffect(() => {
    document.title = text ? `${text} · ${shop}` : shop
  }, [text, shop])
}

// ---------- Not joined: the landing ----------

/**
 * GET /:qrKey. A table nobody has seated (or QR off, the day closed, the table out of service) shows a branded notice
 * over the read-only menu, and keeps looking every 10 s, so it turns into Join by itself once staff seat it. An open
 * table opens the join sheet at once; a big Join button at the bottom brings it back if dismissed.
 */
function TableLanding({ qrKey, onJoined }: { qrKey: string; onJoined: (result: JoinResult) => void }) {
  const { t } = useT()
  const lookup = useTableLookup(qrKey, { poll: true })
  const data = lookup.data
  const joinable = data?.state === 'OPEN' && data.orderingOpen
  // The join sheet shows by itself as soon as the table is joinable (on arrival, or when staff seat it while we look)
  // until the guest dismisses it; the Join bar brings it back.
  const [dismissed, setDismissed] = useState(false)
  const joinOpen = joinable && !dismissed
  usePageTitle(data ? data.table.name : null)
  useHistoryLayer(joinOpen, () => setDismissed(true))

  if (lookup.isPending) {
    return (
      <TableShell qrKey={qrKey} table={null}>
        <div className="px-4 pt-3">
          <Skeleton className="h-44 w-full" />
        </div>
        <MenuSkeleton />
      </TableShell>
    )
  }
  if (lookup.isError && !data) {
    const missing = lookup.error instanceof ApiError && lookup.error.status === 404
    return (
      <TableShell qrKey={qrKey} table={null}>
        {missing ? <NotFoundTable /> : <TableProblem error={lookup.error} onRetry={() => void lookup.refetch()} />}
      </TableShell>
    )
  }
  if (!data) return null

  const reason = joinable ? null : (data.closedReason ?? 'not_seated')
  const text = reason ? CLOSED_TEXT[reason] : null

  return (
    <TableShell qrKey={qrKey} table={data.table}>
      <div className={joinable ? 'pb-28' : 'pb-8'}>
        <section
          aria-labelledby="landing-title"
          className="tone-dark mx-4 mt-3 flex flex-col items-center gap-3 rounded-card bg-forest px-5 py-6 text-center text-on-action shadow-soft"
        >
          <LogoMark variant="reversed" className="size-16 text-3xl" />
          <p className="eyebrow">{tableLabel(data.table)}</p>
          <h1 id="landing-title" className="text-h2 leading-tight">
            {text ? t(text.title) : t('table.landing.openTitle')}
          </h1>
          <p className="text-lg">{text ? t(text.body) : t('table.landing.openBody')}</p>
          {reason === 'not_seated' && (
            <p role="status" className="flex items-center gap-2 text-base">
              <Icon name="clock" className="size-5" />
              {t('table.landing.watching')}
            </p>
          )}
        </section>
        <h2 className="px-4 pt-6 text-xl">{t('table.landing.menu')}</h2>
        <QrMenu readOnly />
      </div>

      {joinable && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-soft backdrop-blur">
          <Button size="lg" className="mx-auto flex w-full max-w-xl" onClick={() => setDismissed(false)} aria-haspopup="dialog">
            <Icon name="users" />
            <span>{t('table.join.cta')}</span>
          </Button>
        </div>
      )}
      {joinOpen && (
        <JoinSheet qrKey={qrKey} lookup={data} onJoined={onJoined} onClose={() => setDismissed(true)} onRefused={() => void lookup.refetch()} />
      )}
    </TableShell>
  )
}

function NotFoundTable() {
  const { t } = useT()
  return <AppState icon="alert" tone="warning" title={t('table.notFound')} body={t('table.notFoundBody')} />
}

/** The token stopped working (staff closed the table, removed the guest, or the session ended). */
function SessionEnded({ qrKey, onContinue }: { qrKey: string; onContinue: () => void }) {
  const { t } = useT()
  usePageTitle(t('table.ended.title'))
  return (
    <TableShell qrKey={qrKey} table={null}>
      <AppState icon="cup" title={t('table.ended.title')} body={t('table.ended.body')} role="status">
        <Button onClick={onContinue}>
          <Icon name="list" />
          <span>{t('table.ended.cta')}</span>
        </Button>
      </AppState>
    </TableShell>
  )
}

// ---------- Joined ----------

/** Live news about my own rounds, as they happen: confirmed, ready, or turned down by staff. Not on the first answer. */
function useRoundAlerts(poll: TableSessionPoll | undefined) {
  const { t } = useT()
  const seen = useRef<Map<string, RoundStatus> | null>(null)
  useEffect(() => {
    if (!poll) return
    const before = seen.current
    seen.current = new Map(poll.rounds.filter((r) => r.isMine).map((r) => [r.orderId, r.status]))
    if (!before) return
    for (const round of poll.rounds) {
      const was = before.get(round.orderId)
      if (!round.isMine || !was || was === round.status) continue
      if (round.status === 'READY') {
        vibrate([20, 60, 20])
        showToast({ message: t('table.alert.ready'), kind: 'success' })
      } else if (round.status === 'CANCELLED' && round.cancelReason) {
        vibrate([40, 60, 40])
        showToast({ message: `${t('table.alert.rejected')} ${round.cancelReason}`, kind: 'error', ms: 8000 })
      } else if (was === 'RECEIVED' && round.status !== 'CANCELLED') {
        showToast({ message: t('table.alert.accepted'), kind: 'success' })
      }
    }
  }, [poll, t])
}

function JoinedTable({ qrKey, token, onEnded }: { qrKey: string; token: string; onEnded: () => void }) {
  const session = useTableSession(token)
  const poll = session.data

  const endSession = useCallback(() => {
    forgetSession(token)
    clearTableToken(qrKey)
    setCartPanel('closed')
    onEnded()
  }, [token, qrKey, onEnded])

  useEffect(() => {
    if (isSessionEnded(session.error)) endSession()
  }, [session.error, endSession])
  useRoundAlerts(poll)
  usePageTitle(poll ? poll.table.name : null)

  const value = useMemo<TableValue | null>(
    () => (poll ? { qrKey, token, poll, endSession, refresh: () => void refreshSession(token) } : null),
    [qrKey, token, poll, endSession],
  )

  if (!value) {
    return (
      <TableShell qrKey={qrKey} table={null} joined>
        {session.isError && !isSessionEnded(session.error) ? (
          <TableProblem error={session.error} onRetry={() => void session.refetch()} />
        ) : (
          <div role="status" className="space-y-4 px-4 pt-3">
            <span className="sr-only">…</span>
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        )}
      </TableShell>
    )
  }

  return (
    <TableContext.Provider value={value}>
      <TableShell qrKey={qrKey} table={value.poll.table} joined>
        <Routes>
          <Route index element={<TableHome />} />
          <Route path="menu" element={<JoinedMenu />} />
          <Route path="table" element={<TableOrders />} />
          <Route path="bill" element={<TableBillPage />} />
          <Route path="*" element={<Navigate to={tablePath(qrKey)} replace />} />
        </Routes>
        <TableCart />
      </TableShell>
    </TableContext.Provider>
  )
}

function JoinedMenu() {
  const { poll } = useTable()
  const locked = isBillLocked(poll)
  return (
    <>
      {poll.session.closedReason && <ClosedNotice reason={poll.session.closedReason} />}
      {locked && <BillLockedNotice />}
      <QrMenu closed={!poll.session.orderingOpen || locked} />
    </>
  )
}

/** The bill has been asked for: ordering is paused for the table (the server answers BILL_LOCKED too). */
function BillLockedNotice() {
  const { t } = useT()
  const { qrKey } = useTable()
  return (
    <div role="status" className="card mx-4 mt-3 flex flex-wrap items-center gap-3 p-4 text-ink">
      <Icon name="receipt" className="size-7 shrink-0 text-accent" />
      <p className="min-w-0 flex-1">{t('bill.locked')}</p>
      <ButtonRoute to={tablePath(qrKey, 'bill')} size="sm" variant="secondary" className="text-ink">
        {t('bill.open')}
      </ButtonRoute>
    </div>
  )
}

// ---------- The route ----------

function TableRoot({ qrKey }: { qrKey: string }) {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => readTableToken(qrKey))
  const [ended, setEnded] = useState(false)

  const onEnded = useCallback(() => {
    setToken(null)
    setEnded(true)
  }, [])

  if (token) return <JoinedTable key={token} qrKey={qrKey} token={token} onEnded={onEnded} />
  if (ended) {
    return (
      <SessionEnded
        qrKey={qrKey}
        onContinue={() => {
          void queryClient.invalidateQueries({ queryKey: ['table', qrKey] })
          setEnded(false)
          navigate(tablePath(qrKey), { replace: true })
        }}
      />
    )
  }
  return (
    <TableLanding
      qrKey={qrKey}
      onJoined={(result) => {
        saveTableToken(qrKey, result.token)
        setToken(result.token)
        // Straight to the menu, replacing the join sheet's history entry.
        navigate(tablePath(qrKey, 'menu'), { replace: true })
      }}
    />
  )
}

/**
 * /t/:qrKey/* — the table QR pages. The QR menu feeds every menu hook below (MenuSource), and the guest's cart is the
 * table's own (sessionStorage, keyed by the QR key), so it never mixes with a delivery cart on the same phone.
 */
export default function TableApp() {
  const { qrKey = '' } = useParams()
  const storage = useMemo<CartStorage>(() => ({ key: tableCartKey(qrKey), area: 'session' }), [qrKey])
  if (!QR_KEY.test(qrKey)) {
    return (
      <TableShell qrKey={qrKey} table={null}>
        <NotFoundTable />
      </TableShell>
    )
  }
  return (
    <MenuSourceContext.Provider value={QR_MENU_SOURCE}>
      <CartProvider key={storage.key} storage={storage}>
        <TableRoot key={qrKey} qrKey={qrKey} />
      </CartProvider>
    </MenuSourceContext.Provider>
  )
}
