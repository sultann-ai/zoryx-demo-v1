import site from '../../site.config.json'

/** Edit in site.config.json (also feeds the noscript text in index.html). */
export const SHOP_PHONE: string = site.phone

/** Digits only, for tel: links. */
export const phoneHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`

export const SHOP_WHATSAPP: string = site.whatsapp
export const SHOP_MAP_URL: string = site.mapUrl

/** wa.me needs the international number: a Pakistani local number (03XXXXXXXXX) becomes 923XXXXXXXXX. */
export const waHref = (number: string): string => {
  const digits = number.replace(/\D/g, '')
  return `https://wa.me/${/^0\d{10}$/.test(digits) ? `92${digits.slice(1)}` : digits}`
}

/** Footer QR code image (a path under public/, e.g. "/app-qr.png"); empty until the owner adds one. */
export const APP_QR: string = site.appQr
