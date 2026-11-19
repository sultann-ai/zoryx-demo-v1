import type { ReactNode } from 'react'
import { Icon } from '../Icon'

export const inputClass =
  'w-full min-h-touch rounded-inner border bg-surface px-4 text-lg text-ink placeholder:text-muted'

/** Label + control + hint + inline error (icon AND words, never colour alone). */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  /** Text, or a sentence with numbers in it (<Fill>). */
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-bold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-base text-muted">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

export function FieldError({ id, message }: { id?: string; message?: ReactNode }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="flex items-start gap-2 font-bold text-error">
      <Icon name="alert" className="mt-2 size-5" />
      <span>{message}</span>
    </p>
  )
}
