// The values the backend seeds the store settings with until staff fill in the real details
// (SETTINGS_PLACEHOLDERS in backend/src/modules/siteContent/siteContent.service.ts: keep the two lists in step).
const SEEDED = new Set([
  'Address coming soon',
  'پتہ جلد شامل کیا جائے گا',
  'Opening hours coming soon',
  'اوقاتِ کار جلد شامل کیے جائیں گے',
])

/** True when a settings text has no real content yet: missing, blank, or still the seeded "coming soon" value. */
export function isPlaceholderValue(value: string | null | undefined): boolean {
  const text = value?.trim()
  return !text || SEEDED.has(text)
}
