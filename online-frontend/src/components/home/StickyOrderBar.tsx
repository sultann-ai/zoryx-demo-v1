import { useEffect, useState, type RefObject } from 'react'
import { useT } from '../../i18n'
import { useIsPhone } from '../../lib/useAppMode'
import { Icon } from '../Icon'
import { ButtonRoute } from '../ui/Button'

/** Phone-only bottom bar with the one primary action, shown once the hero has scrolled out of view. */
export function StickyOrderBar({ heroRef }: { heroRef: RefObject<HTMLElement | null> }) {
  const { t } = useT()
  const [show, setShow] = useState(false)
  const phone = useIsPhone() // the phone app shell's tab bar replaces this bar

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting))
    observer.observe(hero)
    return () => observer.disconnect()
  }, [heroRef])

  if (!show || phone) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 p-2 shadow-soft backdrop-blur md:hidden">
      <ButtonRoute to="/menu" className="w-full">
        <Icon name="cart" className="size-6" />
        <span>{t('nav.orderNow')}</span>
      </ButtonRoute>
    </div>
  )
}
