// The ONE file to edit for a brand change: names, tagline and the colours.
// `npm run theme` (runs before dev and build) turns `palette` and `theme` into src/brand/theme.css (Tailwind tokens) and
// `npm run assets` into the favicon, app icons and og-image. The mark itself lives in src/brand/logo.svg.
// Plain data only (no imports): the Node scripts and vite.config.ts read this file directly.
// Shape, type, spacing and shadow tokens are in src/index.css (@theme); this file holds every colour.

// The raw brand palette. Components use the roles in `theme` below; the palette names are for the few places that
// need a specific brand colour (the accent dots, a sunflower bar). Target balance on a page: ~45% cream, ~40% green,
// ~8% lime, ~7% accents.
const palette = {
  forest: '#2F6656', // primary: dark sections, headings on light, button fills on light
  lime: '#E6FE82', // buttons and accents ONLY on forest/ink, never on cream or white. Text on it is ink
  cream: '#FEF8E6', // page background, text on green
  ink: '#1F3D33', // body text on light, footer background
  white: '#FFFFFF', // card surfaces
  // Accents, small doses only. Text on sunflower, sky and lime is ink. No white text on tomato below 24px bold.
  'deep-green': '#03624F',
  tomato: '#E35635',
  sunflower: '#F8E351',
  sky: '#9DC3FF',
} as const

export const brand = {
  nameEn: 'Zoryx',
  nameUr: 'زوریکس',
  ownerEn: 'Zoryx',
  ownerUr: 'زوریکس',
  taglineEn: 'Demo restaurant',
  taglineUr: 'ڈیمو ریسٹورنٹ',
  palette,
  // Semantic colour roles. Names are roles, not hues, so a new brand changes values only.
  // Contrast (WCAG) for every pairing is in docs/ONLINE_SITE_BRIEF.md §10.8.
  theme: {
    canvas: palette.cream, // page background
    band: '#FEFCF2', // alternating section band: cream mixed 50/50 with white (derived, not a brand colour)
    surface: palette.white, // cards, sheets
    action: palette.forest, // button, badge and icon-circle FILLS on light surfaces, always with on-action text (6.3:1)
    'action-hover': '#295648', // forest mixed 60/40 with ink (derived)
    'on-action': palette.cream, // text and icons on a forest/ink fill
    accent: palette['deep-green'], // small coloured text and links on light (6.9:1 on cream)
    'heading-accent': palette.tomato, // the accent word of a two-tone heading on light: large text only (3.5:1)
    promo: palette.lime, // fills, dots, rings and the accent word on forest/ink ONLY (6.0:1 on forest). Never on light
    ink: palette.ink, // body text, prices, dark surfaces (footer)
    heading: palette.forest, // headings on light (6.3:1 on cream)
    muted: '#5E665F', // secondary text, field borders (5.6:1 on cream). Never lighter
    success: '#2E7D4F',
    error: '#B3261E',
    overlay: palette.ink, // dark scrim over a photo/video (used at 80-90% opacity)
  },
} as const

export type Brand = typeof brand
