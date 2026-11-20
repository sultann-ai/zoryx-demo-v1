import { createContext, useContext } from 'react'
import { isSessionEnded, type TableInfo, type TableSessionPoll } from '../../api/table'
import { ApiError } from '../../api/client'

/** A joined guest's table: the QR key, their token, the latest poll, and the way out when the session ends. */
export interface TableValue {
  qrKey: string
  token: string
  poll: TableSessionPoll
  /** Drop the token and show "your table is closed" (a 401 from any table call). */
  endSession: (receiptKey?: string) => void
  /** Ask for a fresh poll now (after anything the guest did). */
  refresh: () => void
}

export const TableContext = createContext<TableValue | null>(null)

export function useTable(): TableValue {
  const value = useContext(TableContext)
  if (!value) throw new Error('useTable must be used inside the joined table shell')
  return value
}

/** Every table call's error goes through here first: a 401 ends the session, and then there is nothing else to say. */
export function endsSession(error: unknown, table: Pick<TableValue, 'endSession'>): boolean {
  if (!isSessionEnded(error)) return false
  const receiptKey = error instanceof ApiError && typeof error.details.receiptKey === 'string'
    ? error.details.receiptKey
    : undefined
  table.endSession(receiptKey)
  return true
}

/** The base path of this table's pages: /t/<qrKey>. */
export const tablePath = (qrKey: string, page: '' | 'menu' | 'table' | 'bill' = ''): string => `/t/${qrKey}${page ? `/${page}` : ''}`

/** A requested (or paid) bill pauses ordering for the whole table until staff reopen it. */
export const isBillLocked = (poll: TableSessionPoll): boolean => poll.bill?.status === 'REQUESTED' || poll.bill?.status === 'PAID'

/** "Table 5 · Family Hall" */
export const tableLabel = (table: TableInfo): string => (table.area ? `${table.name} · ${table.area}` : table.name)
