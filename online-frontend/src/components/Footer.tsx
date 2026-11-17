import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../brand/Logo'
import { useStore } from '../api/store'
import { APP_QR, phoneHref, waHref } from '../lib/config'
import { pick } from '../lib/localized'
import { socials } from '../lib/socials'
import { useStandalone } from '../lib/useAppMode'
import { useShopMapUrl, useShopWhatsApp } from '../lib/useShopContact'
import { useShopPhone } from '../lib/useShopPhone'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { ButtonRoute } from './ui/Button'

const YEAR = new Date().getFullYear()

const linkClass =
  'inline-flex min-h-touch items-center gap-3 text-lg text-on-action underline-offset-4 hover:text-promo hover:underline'

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-serif text-xl font-bold">{title}</h3>
      <span aria-hidden="true" className="mt-2 block h-1 w-10 rounded-full bg-promo" />
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** The QR for the app / PWA install page. Shows a placeholder until `appQr` is set in site.config.json. */
function AppCard() {
  const { t } = useT()
  // Already installed: nothing to advertise.
  if (useStandalone()) return null
  return (
    <div className="flex items-center gap-4 rounded-card border border-promo/40 p-4 md:flex-col md:items-start">
      {APP_QR ? (
        <img src={APP_QR} alt={t('footer.qrAlt')} width={112} height={112} loading="lazy" className="size-28 shrink-0 rounded-inner bg-surface p-2" />
      ) : (
        <div
          role="img"
          aria-label={t('footer.appSoon')}
          className="flex size-28 shrink-0 flex-col items-center justify-center gap-1 rounded-inner border-2 border-dashed border-promo text-center text-sm text-on-action"
        >
          <Icon name="mobile" className="size-8 text-promo" />
          <span className="px-1">{t('footer.appSoon')}</span>
        </div>
      )}
      <div>
        <p className="font-serif text-xl font-bold">{t('footer.app')}</p>
        <p className="mt-1 text-base">{t('footer.appBody')}</p>
      </div>
    </div>
  )
}

export function Footer() {
  const { t, lang } = useT()
  const phone = useShopPhone()
  const whatsapp = useShopWhatsApp()
  const mapUrl = useShopMapUrl()
  const settings = useStore().data?.settings
  const address = settings && pick(lang, settings.addressEn, settings.addressUr)
  const hours = settings && pick(lang, settings.openingHoursEn, settings.openingHoursUr)
  const activeSocials = socials.filter(({ key }) => settings?.[key])

  return (
    <footer className="tone-dark mt-auto border-t-4 border-promo bg-ink px-gutter pb-24 pt-12 text-on-action md:pb-8">
      <div className="mx-auto max-w-page">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.3fr_1.2fr]">
          {/* Brand */}
          <div className="space-y-4">
            <Logo className="text-4xl" variant="reversed" />
            <p className="font-serif text-xl font-bold">{t('brand.tagline')}</p>
            <ButtonRoute to="/menu">
              <Icon name="cart" />
              <span>{t('footer.menu')}</span>
            </ButtonRoute>
            {activeSocials.length > 0 && (
              <div>
                <p className="mb-2 text-base font-bold">{t('footer.follow')}</p>
                <ul className="flex gap-3">
                  {activeSocials.map(({ key, icon, label }) => (
                    <li key={key}>
                      <a
                        href={settings?.[key] ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t(label)}
                        className="flex size-12 items-center justify-center rounded-full border border-promo text-promo transition-colors hover:bg-promo hover:text-ink"
                      >
                        <Icon name={icon} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Explore */}
          <Column title={t('footer.explore')}>
            <nav aria-label={t('footer.explore')}>
              <ul>
                <li>
                  <Link to="/" className={linkClass}>
                    {t('nav.home')}
                  </Link>
                </li>
                <li>
                  <Link to="/menu" className={linkClass}>
                    {t('nav.menu')}
                  </Link>
                </li>
                <li>
                  <Link to={{ pathname: '/', hash: '#find' }} className={linkClass}>
                    {t('nav.find')}
                  </Link>
                </li>
              </ul>
            </nav>
          </Column>

          {/* Visit us */}
          <Column title={t('footer.visit')}>
            <ul className="space-y-3 text-lg">
              {address && (
                <li className="flex items-start gap-3">
                  <Icon name="pin" className="mt-2 text-promo" />
                  <span>{address}</span>
                </li>
              )}
              {hours && (
                <li className="flex items-start gap-3">
                  <Icon name="clock" className="mt-2 text-promo" />
                  <span className="whitespace-pre-line">{hours}</span>
                </li>
              )}
              {mapUrl && (
                <li>
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    <Icon name="pin" className="text-promo" />
                    <span>{t('find.map')}</span>
                  </a>
                </li>
              )}
            </ul>
          </Column>

          {/* Contact + app */}
          <div className="space-y-8 md:col-span-2 lg:col-span-1">
            <Column title={t('footer.contact')}>
              <ul>
                <li>
                  <a href={phoneHref(phone)} className={linkClass}>
                    <Icon name="phone" className="text-promo" />
                    <span dir="ltr">{phone}</span>
                  </a>
                </li>
                <li>
                  <a href={waHref(whatsapp)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    <Icon name="whatsapp" className="text-promo" />
                    <span>{t('footer.whatsapp')}</span>
                  </a>
                </li>
              </ul>
            </Column>
            <AppCard />
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-promo/40 pt-6 text-center text-base md:flex-row md:text-start">
          <p>
            © {YEAR} {t('footer.brandPrinted')}. {t('footer.rights')}
          </p>
          <p>{t('footer.owner')}</p>
        </div>
      </div>
    </footer>
  )
}
