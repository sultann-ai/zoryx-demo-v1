import { useEffect, useState } from 'react'

const isTypingField = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement &&
  (el.matches('textarea, select') || (el.matches('input') && !/^(checkbox|radio|button|submit|reset|range|file|color)$/.test((el as HTMLInputElement).type)))

/**
 * True while a text field has the keyboard (the phone shells hide their tab bar and mini-cart then). The focused field
 * is brought into the middle of what is left, again whenever the visible area changes (the keyboard finishing its
 * slide, or resizing the visual viewport on iPhone).
 */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const reveal = (el: Element | null) => {
      if (!isTypingField(el)) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ;(el as HTMLElement).scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    }
    let timer = 0
    const onIn = (event: FocusEvent) => {
      setTyping(isTypingField(event.target))
      window.clearTimeout(timer)
      timer = window.setTimeout(() => reveal(event.target as Element), 280)
    }
    const onOut = () => setTyping(false)
    const onViewport = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => reveal(document.activeElement), 60)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    window.visualViewport?.addEventListener('resize', onViewport)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
      window.visualViewport?.removeEventListener('resize', onViewport)
    }
  }, [])
  return typing
}
