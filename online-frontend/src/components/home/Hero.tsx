import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react'
import { useStore } from '../../api/store'
import { phoneHref } from '../../lib/config'
import { pick } from '../../lib/localized'
import { useShopPhone } from '../../lib/useShopPhone'
import { useT } from '../../i18n'
import { Fill } from '../Fill'
import { Icon, type IconName } from '../Icon'
import { ButtonRoute } from '../ui/Button'
import { StatusChip } from '../ui/StatusChip'
import { HeroRider } from './HeroRider'

/**
 * Split hero on the green band (forest + .tone-dark: cream headline with the lime accent line, lime primary pill, cream
 * outline pill, lime icons). Text first (it stacks above the picture on phones): status chip, two-line serif headline with the
 * accent line (text-h1), subtitle, two pills and a row of real facts. The rider cut-out (HeroRider) stands on its own on
 * the other side: no video, no photo, no panel. The headline is the largest paint.
 */
export const Hero = forwardRef<HTMLElement>(function Hero(_props, ref) {
  const local = useRef<HTMLElement>(null)
  useImperativeHandle(ref, () => local.current as HTMLElement)
  const { t, lang } = useT()
  const { data } = useStore()
  const phone = useShopPhone()
  const tagline = pick(lang, data?.settings.taglineEn, data?.settings.taglineUr) ?? t('brand.tagline')

  // Real facts only: each one appears only when the store data has it. The phone is always there.
  const hours = data && pick(lang, data.settings.openingHoursEn, data.settings.openingHoursUr)?.split('\n')[0]
  const areas = data?.deliveryAreas.length ?? 0
  const facts: { icon: IconName; content: ReactNode }[] = []
  if (hours) facts.push({ icon: 'clock', content: hours })
  if (areas > 0) {
    facts.push({
      icon: 'truck',
      content: <Fill text={areas === 1 ? t('hero.facts.areaOne') : t('hero.facts.areas')} values={{ n: String(areas) }} />,
    })
  }
  facts.push({
    icon: 'phone',
    content: (
      <a href={phoneHref(phone)} dir="ltr" className="inline-flex min-h-tap items-center font-bold underline-offset-4 hover:underline">
        {phone}
      </a>
    ),
  })

  return (
    <section ref={local} className="tone-dark bg-forest px-gutter pb-12 pt-20 text-on-action md:pb-16 md:pt-16">
      <div className="mx-auto grid max-w-page items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-start gap-5">
          {/* A fixed 48px slot: the loading placeholder, the Latin chip (32px) and the Nastaliq one (45px) all fit, so the
              headline below never moves when the store data arrives. */}
          <div className="flex h-[48px] items-center">
            <StatusChip />
          </div>
          {/* TODO(owner): placeholder headline, see hero.line1 / hero.line2 in the translation files */}
          <h1 className="text-h1">
            {t('hero.line1')}
            <span className="accent">{t('hero.line2')}</span>
          </h1>
          <p className="max-w-md text-xl text-on-action">{tagline}</p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonRoute to="/menu">
              <Icon name="bag" className="size-6" />
              <span>{t('nav.orderNow')}</span>
            </ButtonRoute>
            <ButtonRoute to="/menu" variant="secondary">
              <Icon name="food" className="size-6" />
              <span>{t('hero.viewMenu')}</span>
            </ButtonRoute>
          </div>
          <ul className="flex flex-col gap-x-8 gap-y-1 text-lg md:flex-row md:flex-wrap">
            {facts.map((fact) => (
              <li key={fact.icon} className="flex items-center gap-2">
                <Icon name={fact.icon} className="size-6 shrink-0 text-promo" />
                <span>{fact.content}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Just the rider cut-out: no panel, no background. The box keeps its size so the page never shifts. */}
        <div className="relative aspect-[4/3]">
          <HeroRider />
        </div>
      </div>
    </section>
  )
})
