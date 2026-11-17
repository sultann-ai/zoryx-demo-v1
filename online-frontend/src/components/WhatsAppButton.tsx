import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { waHref } from '../lib/config'
import { useShopWhatsApp } from '../lib/useShopContact'
import { useT } from '../i18n'
import { Icon } from './Icon'

/**
 * Floating WhatsApp shortcut (website layout, 768px and up; the phone shell has its own). The number is the store's (API)
 * or the one in site.config.json; it is hidden only if neither exists, so it is never a dead link. Look, position, the
 * one-time pulse and reduced motion are all in `.wa-float` (index.css). It sits above the bottom bars of the menu and
 * order pages (`wa-lift`) and steps aside while the footer is on screen (`wa-away`): the footer has its own WhatsApp link,
 * and the floating one must never cover the footer's links and buttons.
 */
export function WhatsAppButton() {
  const { t } = useT()
  const number = useShopWhatsApp()
  const { pathname } = useLocation()
  const aboveBar = pathname === '/menu' || pathname.startsWith('/order/')
  const footerInView = useFooterInView()
  if (!number) return null
  return (
    <aside aria-label={t('contact.whatsapp')}>
      <a
        href={waHref(number)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('contact.whatsapp')}
        className={`wa-float ${aboveBar ? 'wa-lift' : ''} ${footerInView ? 'wa-away' : ''}`}
      >
        <Icon name="whatsapp" className="size-8" />
      </a>
    </aside>
  )
}

/** True while any part of the page footer is on screen. */
function useFooterInView(): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])
  return inView
}
