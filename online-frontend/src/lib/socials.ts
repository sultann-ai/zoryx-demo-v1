import type { IconName } from '../components/Icon'
import type { TranslationKey } from '../i18n'

/** Social links the store can set; a link with no URL in the store settings is not shown. */
export const socials: { key: 'facebookUrl' | 'instagramUrl' | 'tiktokUrl'; icon: IconName; label: TranslationKey }[] = [
  { key: 'facebookUrl', icon: 'facebook', label: 'social.facebook' },
  { key: 'instagramUrl', icon: 'instagram', label: 'social.instagram' },
  { key: 'tiktokUrl', icon: 'tiktok', label: 'social.tiktok' },
]
