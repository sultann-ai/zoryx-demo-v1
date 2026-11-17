import type { SVGProps } from 'react'

// Inline SVG, no icon font. Directional icons mirror in RTL via the `mirror` prop.
export type IconName =
  | 'phone'
  | 'whatsapp'
  | 'cart'
  | 'check'
  | 'home'
  | 'arrow'
  | 'alert'
  | 'wifi-off'
  | 'cup'
  | 'food'
  | 'truck'
  | 'sparkle'
  | 'clock'
  | 'pin'
  | 'star'
  | 'close'
  | 'user'
  | 'cash'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'plus'
  | 'minus'
  | 'store'
  | 'bag'
  | 'mobile'
  | 'list'
  | 'receipt'
  | 'more'
  | 'play'
  | 'pause'
  | 'repeat'
  | 'copy'
  | 'share'
  | 'addhome'
  | 'image'
  | 'trash'
  | 'search'

const iconPaths: Record<IconName, string> = {
  phone:
    'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z',
  whatsapp:
    'M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.35A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.2 1.1-1.7 1.2-.4.1-1 .1-1.6-.1a14 14 0 0 1-5.1-3.2c-1.4-1.4-2.2-3-2.4-3.5-.2-.4-.4-1.6.4-2.5.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.4.6c-.2.2-.3.4-.1.7.5.9 1.4 1.8 2.4 2.4.3.2.5.1.7-.1l.6-.8c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.2.5.4 0 .2 0 .9-.1 1.2z',
  cart: 'M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM1 2v2h2l3.6 7.6-1.4 2.4A2 2 0 0 0 7 17h12v-2H7.4l1.1-2h7.5a2 2 0 0 0 1.75-1l3.6-6.5A1 1 0 0 0 20.5 4H5.2l-.9-2z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  home: 'M12 3 2 12h3v8h5v-6h4v6h5v-8h3z',
  arrow: 'M8.6 4.6 7.2 6l6 6-6 6 1.4 1.4L16 12z',
  alert: 'M12 2 1 21h22zm1 15h-2v-2h2zm0-4h-2V9h2z',
  'wifi-off':
    'M2.8 2.8 1.4 4.2l3 3A15 15 0 0 0 1 9.4l2 2a12.5 12.5 0 0 1 3.5-2.4l2 2A9.5 9.5 0 0 0 5 13.4l2 2a6.5 6.5 0 0 1 3.4-1.8l7.4 7.4 1.4-1.4zM12 20l2-2-2-2-2 2zm10-10.6a15 15 0 0 0-11.6-3.9l2.4 2.4A12.5 12.5 0 0 1 20 11.4z',
  cup: 'M3 5h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zm14 2h2a2.5 2.5 0 0 1 0 5h-2v-2h2a.5.5 0 0 0 0-1h-2zM3 20h16v2H3z',
  food: 'M3 11a9 7 0 0 1 18 0zm0 2h18v2H3zm1 4h16v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z',
  truck:
    'M2 6h12v9H2zm12 3h4l4 3.5V15h-8zM6.5 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm11 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  sparkle: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l3.7 2.2-1 1.7L11 13V7z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  star: 'M12 2l3 6.9 7.5.7-5.7 5 1.7 7.4L12 18l-6.5 4 1.7-7.4-5.7-5 7.5-.7z',
  close:
    'M5.6 4.2 4.2 5.6 10.6 12l-6.4 6.4 1.4 1.4 6.4-6.4 6.4 6.4 1.4-1.4-6.4-6.4 6.4-6.4-1.4-1.4-6.4 6.4z',
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4 0-9 2-9 5v3h18v-3c0-3-5-5-9-5z',
  cash: 'M2 6h20v12H2zm10 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  facebook:
    'M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5V14h2.8v8z',
  instagram:
    'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.5 5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  tiktok:
    'M16.6 2h-3.2v13.2a2.8 2.8 0 1 1-2.8-2.8c.3 0 .6 0 .8.1V9.2a6 6 0 1 0 5.2 5.9V8.6a7 7 0 0 0 4 1.3V6.7a4 4 0 0 1-4-4z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  minus: 'M4 11h16v2H4z',
  store: 'M3 4h18l1 5a3.5 3.5 0 0 1-6 2 3.5 3.5 0 0 1-6 0 3.5 3.5 0 0 1-6-2zm1 9a4.5 4.5 0 0 0 2 .5A4.5 4.5 0 0 0 9 12.8a4.5 4.5 0 0 0 3 .7 4.5 4.5 0 0 0 3-.7 4.5 4.5 0 0 0 3 .7 4.5 4.5 0 0 0 2-.5V21h-6v-5h-4v5H4z',
  bag: 'M5 8h14l1 13H4zm4 0V6a3 3 0 0 1 6 0v2h-2V6a1 1 0 0 0-2 0v2z',
  mobile: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v12h10V5zm5 14a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  list: 'M3 5h3v3H3zm5 .5h13v2H8zM3 10.5h3v3H3zm5 .5h13v2H8zM3 16h3v3H3zm5 .5h13v2H8z',
  receipt: 'M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zm3 5v2h8V7zm0 4v2h8v-2zm0 4v2h5v-2z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
  copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z',
  share: 'M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4zM5 10v11h14V10h-3v2h1v7H7v-7h1v-2z',
  addhome: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5zm6 3h2v3h3v2h-3v3h-2v-3H8v-2h3z',
  image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v10.6l3.5-3.5 3 3 4-4.5L19 14V5zm3 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  trash: 'M9 3h6l1 1h4v2H4V4h4zm-3 5h12l-1 13H7z',
  search: 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  more: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
}

/**
 * `mirror`: a directional icon that points forward (an arrow): it flips in right-to-left pages.
 * `flip`: the same icon used for "back" (it points the other way): flipped in LTR, upright in RTL.
 * A className without its own size (size-*, w-*, h-*) keeps the default size-6, so an icon can never lose its size.
 */
export function Icon({
  name,
  mirror = false,
  flip = false,
  className = '',
  ...rest
}: { name: IconName; mirror?: boolean; flip?: boolean } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const sized = /(^|\s)([a-z-]+:)*(size|w|h)-/.test(className)
  const direction = flip ? '-scale-x-100 rtl:scale-x-100' : mirror ? 'rtl:-scale-x-100' : ''
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={`${sized ? '' : 'size-6'} ${className} shrink-0 ${direction}`}
      {...rest}
    >
      <path fillRule="evenodd" d={iconPaths[name]} />
    </svg>
  )
}
