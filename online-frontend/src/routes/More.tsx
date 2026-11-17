import { useState, type ReactNode } from 'react'
import { useStore } from '../api/store'
import { Icon, type IconName } from '../components/Icon'
import { Sheet } from '../components/Sheet'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { phoneHref, waHref } from '../lib/config'
import { formatRs } from '../lib/format'
import { pick } from '../lib/localized'
import { hapticsSupported, setHaptics, useHaptics } from '../lib/haptics'
import { clearDetails } from '../lib/savedDetails'
import { showToast } from '../lib/toast'
import { socials } from '../lib/socials'
import { isIOSDevice, promptInstall, useCanPromptInstall } from '../lib/useInstall'
import { useStandalone } from '../lib/useAppMode'
import { useShopMapUrl, useShopWhatsApp } from '../lib/useShopContact'
import { useShopPhone } from '../lib/useShopPhone'
import { useT, type TranslationKey } from '../i18n'

const rowBase = 'flex min-h-16 w-full items-center gap-3 px-4 py-2 text-start'

function RowIcon({ name }: { name: IconName }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-band text-ink">
      <Icon name={name} />
    </span>
  )
}

/** A settings-style row that is a link (tel:, wa.me, maps): icon, label, optional value, chevron. */
function LinkRow({ icon, label, value, href, external = false }: { icon: IconName; label: string; value?: string; href: string; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={rowBase}>
      <RowIcon name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{label}</span>
        {value && (
          <span dir="ltr" className="block text-start text-muted">
            {value}
          </span>
        )}
      </span>
      <Icon name="arrow" mirror className="size-5 shrink-0 text-muted" />
    </a>
  )
}

/** A settings-style row that opens inline (a <details>): used for Find us and How ordering works. */
function ExpandRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className={`${rowBase} cursor-pointer list-none`}>
        <RowIcon name={icon} />
        <span className="min-w-0 flex-1 font-bold text-ink">{label}</span>
        <Icon name="arrow" className="size-5 shrink-0 rotate-90 text-muted transition-transform group-open:-rotate-90" />
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  )
}

function ButtonRow({ icon, label, value, onClick }: { icon: IconName; label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={rowBase}>
      <RowIcon name={icon} />
      <span className="min-w-0 flex-1 font-bold text-ink">{label}</span>
      {value && <span className="text-muted">{value}</span>}
      <Icon name="arrow" mirror className="size-5 shrink-0 text-muted" />
    </button>
  )
}

/** A settings switch row (role=switch): a label and a sliding knob that mirrors in right-to-left. */
function SwitchRow({ icon, label, on, onChange }: { icon: IconName; label: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={rowBase}>
      <RowIcon name={icon} />
      <span className="min-w-0 flex-1 font-bold text-ink">{label}</span>
      <span aria-hidden="true" className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-[var(--dur-press)] ${on ? 'bg-action' : 'bg-ink/25'}`}>
        <span
          className={`absolute start-1 top-1 size-6 rounded-full bg-surface shadow-soft transition-transform duration-[var(--dur-press)] ${on ? 'translate-x-6 rtl:-translate-x-6' : ''}`}
        />
      </span>
    </button>
  )
}

/** Two big buttons, one per language; the current one is filled. */
function LanguageSwitch() {
  const { t, lang, setLang } = useT()
  const option = (value: 'ur' | 'en', text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={lang === value}
      lang={value}
      onClick={() => setLang(value)}
      className={`flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full text-xl font-bold transition-colors ${
        lang === value ? 'bg-action text-on-action' : 'bg-band text-ink'
      }`}
    >
      {lang === value && <Icon name="check" className="size-6" />}
      <span>{text}</span>
    </button>
  )
  return (
    <div className="space-y-2 p-4">
      <p className="font-bold text-ink">{t('more.language')}</p>
      <div role="radiogroup" aria-label={t('more.language')} className="flex gap-2">
        {option('ur', 'اردو')}
        {option('en', 'English')}
      </div>
    </div>
  )
}

const steps: { icon: IconName; text: TranslationKey }[] = [
  { icon: 'food', text: 'how.1' },
  { icon: 'user', text: 'how.2' },
  { icon: 'cash', text: 'how.3' },
]

/** Share > Add to Home Screen (iPhone) or the browser menu (anywhere that has no install button), with icons. */
function InstallSheet({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const list: { icon: IconName; text: TranslationKey }[] = isIOSDevice()
    ? [
        { icon: 'share', text: 'install.s1' },
        { icon: 'addhome', text: 'install.s2' },
        { icon: 'check', text: 'install.s3' },
      ]
    : [
        { icon: 'more', text: 'install.menu1' },
        { icon: 'addhome', text: 'install.menu2' },
        { icon: 'check', text: 'install.s3' },
      ]
  return (
    <Sheet title={t('install.title')} onClose={onClose} draggable>
      <ol className="space-y-3">
        {list.map((step, i) => (
          <li key={step.text} className="flex items-center gap-3 card p-3">
            <span className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
              <Icon name={step.icon} className="size-7" />
              <span dir="ltr" className="absolute -start-1 -top-1 flex size-6 items-center justify-center rounded-full bg-ink text-sm font-bold text-on-action">
                {i + 1}
              </span>
            </span>
            <span className="text-lg font-bold text-ink">{t(step.text)}</span>
          </li>
        ))}
      </ol>
    </Sheet>
  )
}

/**
 * The More tab as an app settings screen: grouped rows. Language (two big buttons), Call us, WhatsApp, Find us (address,
 * hours, areas and fees), Install the app (the browser's own button where there is one, else step-by-step with icons;
 * hidden once installed), How ordering works, and Clear my saved details.
 */
export default function More() {
  const { t, lang } = useT()
  const phone = useShopPhone()
  const whatsapp = useShopWhatsApp()
  const mapUrl = useShopMapUrl()
  const settings = useStore().data?.settings
  const areas = useStore().data?.deliveryAreas ?? []
  const standalone = useStandalone()
  const canPrompt = useCanPromptInstall()
  const [installOpen, setInstallOpen] = useState(false)
  const [cleared, setCleared] = useState(false)
  const haptics = useHaptics()
  const address = settings && pick(lang, settings.addressEn, settings.addressUr)
  const hours = settings && pick(lang, settings.openingHoursEn, settings.openingHoursUr)
  const activeSocials = socials.filter(({ key }) => settings?.[key])

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-2">
      <h2 className="px-1 text-xl">{t('more.settings')}</h2>
      <Card className="divide-y divide-ink/10 overflow-hidden">
        <LanguageSwitch />
        {/* The Vibration API is missing on iPhones and some browsers: the switch is only offered where it can work. */}
        {hapticsSupported() && <SwitchRow icon="sparkle" label={t('more.haptics')} on={haptics} onChange={setHaptics} />}
      </Card>

      <Card className="divide-y divide-ink/10 overflow-hidden">
        <LinkRow icon="phone" label={t('contact.call')} value={phone} href={phoneHref(phone)} />
        {whatsapp && <LinkRow icon="whatsapp" label={t('footer.whatsapp')} href={waHref(whatsapp)} external />}
        <ExpandRow icon="pin" label={t('nav.find')}>
          {address && (
            <p className="flex items-start gap-3">
              <Icon name="pin" className="mt-2 text-accent" />
              <span className="selectable">{address}</span>
            </p>
          )}
          {hours && (
            <p className="flex items-start gap-3">
              <Icon name="clock" className="mt-2 text-accent" />
              <span className="selectable whitespace-pre-line">{hours}</span>
            </p>
          )}
          {areas.length > 0 && (
            <div>
              <p className="flex items-center gap-2 font-bold text-ink">
                <Icon name="truck" className="text-accent" />
                {t('find.delivery')}
              </p>
              <ul className="divide-y divide-ink/10">
                {areas.map((area) => (
                  <li key={area.id} className="flex items-center justify-between gap-3 py-1">
                    <span>{pick(lang, area.nameEn, area.nameUr)}</span>
                    <span dir="ltr" className="font-bold text-ink">
                      {Number.parseFloat(area.deliveryFee) > 0 ? formatRs(area.deliveryFee) : t('find.free')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mapUrl && (
            <ButtonLink href={mapUrl} target="_blank" rel="noopener noreferrer" variant="secondary" className="w-full text-ink">
              <Icon name="pin" />
              <span>{t('find.map')}</span>
            </ButtonLink>
          )}
          {activeSocials.length > 0 && (
            <ul className="flex gap-3">
              {activeSocials.map(({ key, icon, label }) => (
                <li key={key}>
                  <a
                    href={settings?.[key] ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t(label)}
                    className="flex size-12 items-center justify-center rounded-full border border-ink text-ink"
                  >
                    <Icon name={icon} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </ExpandRow>
      </Card>

      <Card className="divide-y divide-ink/10 overflow-hidden">
        {!standalone &&
          (canPrompt ? (
            <ButtonRow icon="mobile" label={t('more.install')} value={t('more.installBtn')} onClick={() => void promptInstall()} />
          ) : (
            <ButtonRow icon="mobile" label={t('more.install')} onClick={() => setInstallOpen(true)} />
          ))}
        <ExpandRow icon="food" label={`${t('how.title')} ${t('how.accent')}`}>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={step.text} className="flex items-center gap-3">
                <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
                  <Icon name={step.icon} />
                  <span dir="ltr" className="absolute -start-1 -top-1 flex size-6 items-center justify-center rounded-full bg-ink text-sm font-bold text-on-action">
                    {i + 1}
                  </span>
                </span>
                <span className="font-bold text-ink">{t(step.text)}</span>
              </li>
            ))}
          </ol>
        </ExpandRow>
        <ButtonRow
          icon="trash"
          label={t('more.clear')}
          value={cleared ? t('more.cleared') : undefined}
          onClick={() => {
            clearDetails()
            setCleared(true)
            showToast({ message: t('more.cleared'), kind: 'success' })
          }}
        />
      </Card>

      <p role="status" className="sr-only">
        {cleared ? t('more.cleared') : ''}
      </p>
      {installOpen && <InstallSheet onClose={() => setInstallOpen(false)} />}
    </div>
  )
}
