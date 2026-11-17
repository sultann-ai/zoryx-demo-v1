import { runToastAction, useToast } from '../../lib/toast'
import { Icon } from '../Icon'

function Snackbar({ className }: { className: string }) {
  const toast = useToast()
  if (!toast) return null
  return (
    <div key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'} className={`toast pointer-events-auto ${className}`}>
      <div className="tone-dark mx-auto flex max-w-sm items-center justify-between gap-3 rounded-full bg-ink px-5 py-1 text-on-action shadow-soft">
        <span className="flex min-w-0 items-center gap-2">
          {toast.kind === 'error' && <Icon name="alert" className="size-5 shrink-0 text-promo" />}
          {toast.kind === 'success' && <Icon name="check" className="size-5 shrink-0 text-promo" />}
          <span className="min-w-0">{toast.message}</span>
        </span>
        {toast.action && (
          <button type="button" onClick={runToastAction} className="min-h-touch shrink-0 px-2 font-bold text-promo underline">
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  )
}

/** The snackbar on the page: above the tab bar and the mini-cart pill. Hidden while a sheet is open (the sheet has its own). */
export function PageToasts() {
  return <Snackbar className="toast-page fixed inset-x-3 bottom-[calc(var(--tabbar-h)+5rem)] z-40" />
}

/** The snackbar inside a sheet or page dialog (a dialog covers the page's), floating just above the sheet's footer. */
export function SheetToasts() {
  return (
    <div className="pointer-events-none relative z-10 h-0">
      <Snackbar className="absolute inset-x-3 bottom-2" />
    </div>
  )
}
