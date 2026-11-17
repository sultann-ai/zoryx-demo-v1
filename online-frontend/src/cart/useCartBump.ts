import { useEffect, useRef, useState } from 'react'
import { useCart } from './context'

/** A number that goes up each time something is added to the cart: key an element on it to replay its "added" pop. */
export function useCartBump(): number {
  const { count } = useCart()
  const previous = useRef(count)
  const [bump, setBump] = useState(0)
  useEffect(() => {
    if (count > previous.current) setBump((n) => n + 1)
    previous.current = count
  }, [count])
  return bump
}
