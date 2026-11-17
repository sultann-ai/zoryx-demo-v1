import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

import { buttonClass, type Size, type Variant } from './buttonClass'

type Own = { variant?: Variant; size?: Size; className?: string; children?: ReactNode }

/** A <button>. */
export function Button({ variant, size, className, children, type = 'button', ...rest }: Own & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

/** An <a> for tel:, wa.me and other external links. */
export function ButtonLink({ variant, size, className, children, ...rest }: Own & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </a>
  )
}

/** A react-router <Link> that looks like a button. */
export function ButtonRoute({ variant, size, className, children, ...rest }: Own & LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  )
}
