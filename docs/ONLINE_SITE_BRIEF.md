# Online ordering site — brand and UX brief

Save this file in the repo as `docs/ONLINE_SITE_BRIEF.md`. Every Claude Code prompt for the customer website starts by reading it.

## 1. Who it is for
Ordinary people in a small town, many of whom read little or no English and some of whom barely read at all. Most will use a cheap Android phone on slow, expensive mobile data. They know how to use WhatsApp and call a shop. They do not know what a "login", "dropdown" or "captcha" is, and should never meet one.

**The site's job:** get a hungry person from "I want food" to "order placed, I know what happens next" in under two minutes, with the fewest possible taps and words.

## 2. Brand
- Name: **ZORYX** — "Demo restaurant" — **Zoryx**. (Confirm spelling with the owner. The POS documents say "Zoryx". The website uses the names in `src/brand/brand.config.ts`, overridden by the store settings.)
- Urdu (to be checked by a native speaker): زوریکس — ڈیمو ریسٹورنٹ — زوریکس
- Feel: a warm, premium food-delivery shop: soft cream canvas, white cards, big food photos, forest green and lime, with tomato, sunflower and sky in small doses. Friendly and respectful, never loud.
- **The logo is not final.** Until it exists the site shows a placeholder wordmark. The palette is forest, lime and cream (§3), taken from `brand.config.ts`. Brand changes are made in `src/brand/` only (§7).

## 3. Palette (semantic tokens)
Tokens are roles, not hues. They are defined once in `src/brand/brand.config.ts` (`theme`), generated into `src/brand/theme.css` by `npm run theme` (it runs before dev and build) and used as Tailwind utilities (`bg-action`, `text-ink`, ...). A brand change means editing that one file. No component writes a hex value.

**Brand palette** (`brand.palette`; Tailwind `bg-forest`, `bg-sunflower`, ...). Target balance on a page: about 45% cream, 40% green, 8% lime, 7% accents.

| Colour | Hex | Use |
|---|---|---|
| forest | `#2F6656` | Primary: dark sections, headings on light, button fills on light |
| lime | `#E6FE82` | Buttons and accents **only on forest or ink**, never on cream or white. Text on it is ink |
| cream | `#FEF8E6` | Page background, text on green |
| ink | `#1F3D33` | Body text on light, footer background |
| white | `#FFFFFF` | Card surfaces |
| deep-green | `#03624F` | Accent, small doses: small coloured text and links on light |
| tomato | `#E35635` | Accent, small doses: the accent word of a heading on light (large text only). No white text on tomato below 24px bold |
| sunflower | `#F8E351` | Accent, small doses: the announcement bar, decorative rings on light. Text on it is ink |
| sky | `#9DC3FF` | Accent, small doses. Text on it is ink |

**Roles** (`brand.theme`; what components use: `bg-action`, `text-ink`, ...):

| Token | Value | Use |
|---|---|---|
| `--canvas` | cream | Page background |
| `--band` | `#FEFCF2` | Alternating section band: cream mixed 50/50 with white (derived) |
| `--surface` | white | Cards, sheets, inputs |
| `--action` | forest | Button, badge and icon-circle **fills on light**; text on it is `--on-action` (cream). Hover `#295648` |
| `--on-action` | cream | Text and icons on a forest or ink fill |
| `--accent` | deep-green | Small coloured text and links on light; the eyebrow line |
| `--heading` | forest | Headings on light |
| `--heading-accent` | tomato | The accent word of a two-tone heading on light (large text only) |
| `--promo` | lime | Fills, dots, rings and the heading accent **on forest/ink only** |
| `--ink` | ink | Body text, **prices (bold)**, dark surfaces (footer, dark bars, toasts) |
| `--muted` | `#5E665F` | Secondary text and form-field borders. Never lighter |
| `--success` | `#2E7D4F` | Open / confirmed / paid states (and the "open" dot), always with an icon or word |
| `--error` | `#B3261E` | Errors and the offline banner, always with an icon |
| `--overlay` | ink | Scrim over the phone header-card video and other photo overlays, used at 80-90% |

**Tones.** A dark (forest or ink) surface carries `.tone-dark`; inside it the primary fill, the heading and accent colours and the focus ring switch through CSS variables (`--tone-fill`, `--tone-heading`, `--tone-accent`, `--tone-ring`, ...). A light island inside a dark surface (any `.card`, a dialog, or `.tone-light`) switches back. So the primary button is forest + cream on light and lime + ink on dark without any prop. Forest against ink is only 1.8:1, which is why the dark-surface fill is lime.

**Rules:** lime never touches cream or white (use sunflower for a highlight on light, success green for the "open" dot). Text on sunflower, sky and lime is ink. Never convey meaning by colour alone: pair it with an icon and words.

## 4. Typography
- Urdu: **Noto Nastaliq Urdu**, self-hosted. Body at least 18 px with a line-height of about 2; headings 26–34 px. Nastaliq is tall: check nothing is clipped.
- Latin: two families, self-hosted: **DM Sans** 400/500/700 for body and UI (body 18px, line-height 1.55; buttons 700 at 15px; prices and numbers 700 with tabular figures, the `.num` class) and **Bricolage Grotesque** 800 for headings (letter-spacing -0.02 to -0.03em, line-height 1.05-1.1), with the accent word upright (Bricolage Grotesque has no italic and none is faked). Only these weights are loaded.
- Fluid heading scale (`text-h1`, `text-h2`, `text-h3`, 360px to 1280px): h1 40-88px, h2 30-56px, h3 20-24px. Urdu uses its own smaller h1 (32-56px) and h2 (26-40px), never letter-spacing, and buttons stay at 18px in Urdu.
- All fonts self-hosted (Fontsource), subset, `font-display: swap`. No Google Fonts requests at runtime.
- Prices: always "Rs 1,450", Western digits, large, bold, in `--ink` (never the action colour).

## 5. UX rules (non-negotiable)
1. **Mobile first**, designed at 360 px wide (must still work at 320).
2. **Urdu first** (right-to-left), with a large English/اردو toggle in the header on every page.
3. **Pictures do the talking.** Every item has a photo (or a branded placeholder). Every important button has an icon: cart, phone, WhatsApp, location, check.
4. **Big targets:** at least 48 px. One primary action per screen, in the same place every time (sticky bottom bar).
5. **Few, short, plain words.** Spoken-style Urdu, not literary or formal.
6. **Minimal typing:** numeric keypad for the phone, details remembered on the phone, no accounts, no passwords, no captchas, no dropdowns, no required search.
7. **A phone number to call is always visible.** Many people will prefer to call; the site must make that easy, not hide it.
8. **Confirm visibly.** A big check mark and a large order code. The customer must never wonder whether the order went through.
9. **Errors say what to do next**, in plain words ("Please check your phone number" / "Call us on ...").
10. **Fast on slow data:** landing page JS about 120 KB gzip, menu route about 150 KB gzip, thumbnails about 40 KB, the phone header-card video only on good connections, everything lazy-loaded below the fold.

## 6. Imagery and motion
- Hero (768px and up): text, status chip and real facts beside the transparent rider PNG (`public/media/rider.png`, optional), on the plain green band (forest, `tone-dark`). **No background video, poster, panel or circles there** (removed on purpose). Phone Home (below 768px): a header card with an optional looping, muted drone video (`public/media/drone.mp4` + poster) behind a dark green overlay (`--overlay`); poster first, no video on slow connections, "data saver" or reduced motion.
- Food photos: daylight, plain background, shot from above or slightly angled, the same style for every item.
- Decoration: restraint. A small hand-drawn ring around a deal price (tomato on light, lime on dark) is the only flourish. No stock illustrations, no gradients on every element, no generic template look.

## 7. Logo usage
- **One replaceable file:** `src/brand/logo.svg` (a placeholder mark today). Run `npm run assets` after replacing it: it regenerates the favicon, 192/512 and maskable icons, the web manifest and the 1200x630 og-image from that file and the colours in `brand.config.ts`. `<meta name="theme-color">` is the `--action` colour.
- In the page the `Logo` component (`src/brand/Logo.tsx`) shows a placeholder wordmark: the shop name in the serif with the last word as the accent line. The name comes from the store settings, with `brand.config.ts` as the fallback. `LogoMark` is the round initial used for photo stand-ins.
- When the final logo exists, render it inside `Logo`; callers do not change. Never stretch or recolour a final logo or add shadows.

## 8. Voice
Warm, short, respectful: "آرڈر مل گیا" ("We received your order"), not "Your request has been successfully submitted". Always tell the person what happens next.

## 9. What not to do
No login, no popups asking for notifications or location, no cookie banners (we set no tracking), no autoplaying sound, no carousel libraries, no icon fonts, no third-party scripts or analytics, no stock-photo hero, no invented claims (awards, years, "best in town") unless the owner confirms them.

## 10. Visual language
The look is a warm, premium food-delivery style: a cream canvas, white rounded cards holding food photos, a serif headline with a coloured accent line, and one primary fill (forest on light, lime on dark). It changes how things look, never the rules in §5: Urdu first, big targets, no login, fast on slow data all still apply. Reference screenshots: `docs/design-reference/`. We take colours, type pairing, shapes, spacing and component anatomy from them, never their name, logo, photos or wording, and not their ratings, hearts or time claims (§10.7).

### 10.1 Colour roles
- **Canvas** `--canvas`; **surface** white for cards. Home band rhythm: green hero, cream / white alternating, the green "Why" band, white / cream alternating, ink footer (green, cream, white, green, cream, white, cream, ink with the usual data); the colours follow what is rendered so neighbours never match.
- **Primary fill:** forest with cream text on light, lime with ink text on dark. Dark surfaces (footer, dark bars, toasts, the phone header card) are `--ink` or forest and carry the class `tone-dark`, which switches the fill, heading, accent and focus-ring colours (§3, Tones). WhatsApp buttons are the action colour with the WhatsApp icon.
- **Accent:** `--accent` (deep green) for small coloured text and the eyebrow; `--heading-accent` (tomato) for the accent word of a heading on light. **Promo** (lime) for fills, dots, rings and icons on dark only; never on cream or white.
- **Prices** are `--ink`, bold. **Muted** for secondary text. **Error** and **success** always with an icon or word. No other saturated colour except food photos.

### 10.2 Shape, depth, borders
- Radii are tokens: cards 20px (`rounded-card`), inputs, small things and a photo inside a card 12px (`rounded-inner`), buttons and pills 999px (`rounded-pill`), a multi-line choice pill such as a delivery area 28px (`rounded-tile`), the top of a bottom sheet 24px (`rounded-t-sheet`). Buttons and badges are full pills; "+" buttons and avatars are circles. No other radius, colour or shadow is written inline (no hex, `rounded-[..]`, `shadow-md`).
- Two shadows, both tinted with ink, never grey: `shadow-soft` (resting) and `shadow-raised` (hover lift). White cards on the cream canvas, no borders on cards. The only borders are 1.5px secondary (outline) buttons and **form fields**, which use `border-muted` (5.8:1 on white; WCAG 1.4.11 needs 3:1).

### 10.3 Type
- Headings: Bricolage Grotesque 800 in forest. Section titles are two-tone: the accent word (`--heading-accent`, tomato; lime on dark) stays on the same line when it fits, with no forced break. The hero keeps its accent as a second line. Upright in Latin and Urdu alike: never fake italics or bold.
- Body and UI: DM Sans. Urdu body is Noto Nastaliq Urdu, at least 18px (`text-sm`/`text-xs` are raised to 18px in Urdu), line-height 2.
- The root font size is 18px, so `rem` is not 16px: spacing tokens for this look are in `px`.

### 10.4 Layout
- 1200px container (`max-w-page`; `max-w-page-padded` is the same width plus the gutter, for a container that carries its own `px-gutter`). The gutter is `clamp(16px, 4vw, 40px)` (`px-gutter`). Header, header strip, category chips, section titles, footer and cards all share one left edge. Section padding `clamp(56px, 8vw, 112px)` (`py-section`). A 4px scale (`1x` 4px ... `16x` 64px) is available as `p-4x`, `gap-6x`, ...; Tailwind's own numeric spacing is still 4.5px steps because the root font is 18px. Product grids: 2 columns on phones (1 below 340px), 3 on tablets, 4 on desktop.
- **Phone app shell (below 768px):** the website header and footer are replaced by a fixed app bar (56px + top safe-area inset: back button on inner screens, title, language toggle, call button) and a fixed bottom tab bar (56px + bottom inset): Home, Menu, Cart (count badge, then the total), Orders (the last order, 48 h), More (find us, contact, language, install hint). The routes and pages are the same ones; only the shell changes. Floating WhatsApp, the home sticky Order now bar and the menu cart pill are not shown on phones (the tab bar replaces them). The tab bar hides while a field has the keyboard and while a sheet is open. Safe areas: `viewport-fit=cover` and `env(safe-area-inset-*)`; heights use `dvh`/`svh`, never `vh`. Above 768px nothing changes.
- **Phone Orders and More:** the Orders tab tracks the current order (large status, animated steps, copyable code, collapsible items, sticky Call, pull-to-refresh, numbered payment steps with a screenshot upload) and lists up to 10 past orders from this phone with Reorder; More is a settings-style list (language switch, Call, WhatsApp, Find us, Install, How ordering works, Clear my saved details). The Orders tab carries a dot while an order is in progress.
- **Phone Menu and Cart:** the category pills stick under the app bar; an item with sizes opens a draggable bottom sheet (about 85% high); a floating pill above the tab bar shows the count, the total and View order; the cart and checkout are full-screen pages (swipe a cart row to delete it, with Undo; the checkout summary is a collapsed card on top, fields open the right keyboard and Enter moves on, Place order is always at the bottom). When closed, browsing works but nothing can be added. Deals stay fixed bundles (the API has no choice slots).
- **Phone Home:** instead of the big hero, a 200px header card (drone video with a dark overlay, shop name, tagline, open/closed chip), then round quick actions (Order now, Call, WhatsApp, Directions), a swipeable promo carousel (announcement + deals with photos), round category icons, snap rows for Popular, New and Deals ("See all" opens the Menu narrowed to that list), "Track your order" / "Order again" cards from the saved last order, real testimonials, a small gallery grid, a compact Find us card and a single collapsed "How to order" card. The "Why" block is not shown on phones. Same data, strings and rules as the website's Home.

### 10.5 Motion
Subtle only: a card lifts on hover (devices with hover only), buttons press down, the "+" button pops once when an item is added, each Home section fades and rises 16px once as it scrolls in (500ms, `lib/useRevealOnce`), the floating WhatsApp button pulses once 3s after load. Transitions are 150-250ms on one easing curve (`--ease-out`). All of it is off under `prefers-reduced-motion`.

Motion tokens (phones): presses 150 ms, sheets and full-screen cart/checkout 220 ms, page transitions 300 ms, all off under `prefers-reduced-motion`. Every tappable element has a press state, the cart tab and mini-cart pop when something is added, photos fade in over their placeholder, and a sheet follows the finger when dragged. Snackbars with Undo (cart removals), copy confirmations and errors share one system above the tab bar; an optional tiny vibration on add-to-cart and order placed can be switched off in More > Settings.

Phone shell page transitions: an inner screen (order status) slides in from the reading-end edge (mirrored in right-to-left) in 220 ms, Back reverses it, and moving between tabs is a 150 ms cross-fade. They use the View Transitions API where it exists and a CSS animation otherwise; reduced motion turns them off. The browser's own edge-swipe back is never intercepted and tabs are not swipeable.

### 10.6 Components (`online-frontend/src/components/ui/`): build once, reuse everywhere
| Component | Use |
|---|---|
| `Button` / `ButtonLink` / `ButtonRoute` | `variant="primary\|secondary\|ghost\|icon"`: primary is the surface's fill (forest/cream on light, lime/ink on dark), secondary an outline pill, ghost text only, icon a round primary. 48px minimum (`lg` 56px), DM Sans 700 15px; hover, active (scale 0.98), focus ring and disabled are in `index.css`; `buttonClass()` for markup that must stay a plain element |
| `Chip`, `CategoryChip` | Eyebrow pill: white, a small success-green dot, small bold text (the dot turns grey when closed); category chip with an active state (`aria-current`, not just colour) |
| `Badge` | Popular (sunflower, ink text), New (sky, ink text), Deal (the surface's fill). Always in that order: Popular, New, Deal. Popular uses a sparkle, never a star |
| `CategoryTile` | White card: round thumbnail on the band-colour plate, name, item count |
| `FeatureCard` | For a green band (`tone-dark`): translucent cream (8%) with a hairline cream border (15%, 40% on hover), 20px, cream text; a 48px lime `IconCircle` with an ink icon (turns 6deg on hover), bold title, one line. Equal height per row; staggers in once on scroll (`lib/useRevealOnce` + `.reveal-item`) |
| `IconCircle` | A round icon on the surface's fill (`md` 48px with a 24px icon, `lg` 56px with a 24px icon); children sit on top (the "How to order" number chip: 22px lime, ink digit, forest ring, in the top-start corner clear of the icon) |
| `TestimonialCard` | Cream, 20px, hairline ink border, a large decorative sunflower quotation mark in the top-end corner; sunflower stars with an ink outline only when the testimonial has its own rating (read out as "4 / 5 stars" text); quote in DM Sans 500 18px; a forest circle with the cream initial, name, area |
| `SectionHeader` | Optional uppercase eyebrow, two-tone `text-h2` title (accent word inline), muted subtitle, optional action (`action`, or `seeAll` for the usual "See all" pill). One rule: start-aligned, the action on the same row from 768px, below the title on phones |
| `Card` | White, 20px, resting shadow, optional hover lift with the raised shadow. Always a light surface, even inside `.tone-dark` |
| `ProductCard` | White, 20px, resting shadow, hairline ink border (`border-ink/10`). Full-width 4:3 photo (`object-cover`; a cut-out with `image.hasTransparency` is shown whole) with the badges top-start in the fixed order; no photo or a broken one shows `PhotoPlaceholder`. Name in DM Sans 700 18px, two lines at most; one-line description; price bottom-start (`PriceTag`, tabular figures, small muted "from"); a 44px round forest "+" bottom-end (`aria-label` with the name) that plays a short scale-and-check (`.add-done`, 600ms before the stepper takes its place; the cart is updated at once; `confirmAdd={false}` for a sized item, which opens its sheet instead). Pointer devices: lift 4px, raised shadow, photo to 1.04 inside its frame (off under reduced motion). Keyboard focus inside rings the whole card. On Home the action is a 44px link to the menu, not an add |
| `PriceTag`, `QuantityStepper`, `Skeleton`, `ProductCardSkeleton`, `PhotoPlaceholder`, `HandCircle`, `StatusChip` | Price, stepper, loading block, a ProductCard-shaped loading card, designed photo stand-in (a cream-to-sunflower wash with a faint forest food icon), promo-coloured hand-drawn ring around a word, the open/closed chip shared by Home and Menu |

Buttons are made only with `Button` / `ButtonLink` / `ButtonRoute` (or `buttonClass()` for the rare plain element). The `.btn*` CSS classes exist only for `buttonClass()`; do not write them in markup and do not override a button's colour with `!bg-*`.

### 10.7 Never show what we do not have
No star ratings, review counts, hearts, preparation-time claims or "customers served" numbers on cards or anywhere else, even though the reference screenshots show them. We have no such data and must not invent it (§9). Testimonials the owner types in the POS are real content: a star rating is shown only when the testimonial itself has one.

### 10.8 Contrast, verified
Computed from the token values in `brand.config.ts` (WCAG relative luminance); recomputed 2026-11-16 for the forest / lime / cream palette. Large text needs 3:1, other text 4.5:1, non-text parts 3:1.

| Text / element | On | Ratio | Needs | Result |
|---|---|---|---|---|
| Body text `--ink` | canvas / band / white | 11.2 / 11.5 / 11.8 | 4.5 | pass |
| Headings, forest | canvas / band / white | 6.3 / 6.5 / 6.7 | 3 (large) | pass |
| Heading accent word, tomato (large text only) | canvas / band / white | 3.5 / 3.6 / 3.7 | 3 (large) | pass; never body-size text |
| Muted | canvas / band / white | 5.6 / 5.8 / 5.9 | 4.5 | pass |
| Cream on forest (primary button on light, badge, icon circle) | forest / hover | 6.3 / 7.9 | 4.5 | pass |
| Ink on lime (primary button on dark) | lime / hover | 10.6 / 10.7 | 4.5 | pass |
| Lime (accent word, icons, dots) | forest / ink | 6.0 / 10.6 | 3 | pass |
| Forest fill against ink (why the dark fill is lime) | ink | 1.8 | 3 | **fails**: never a forest button on ink |
| Accent (deep green) small text and links | canvas / band / white | 6.9 / 7.1 / 7.3 | 4.5 | pass |
| Ink on sunflower / sky | sunflower / sky | 9.1 / 6.6 | 4.5 | pass |
| White on tomato | tomato | 3.7 | 4.5 | only 24px+ bold |
| Focus ring: forest on light, lime on dark | cream / white; forest / ink | 6.3 / 6.7; 6.0 / 10.6 | 3 | pass |
| Header-card text over the overlay, worst case (pure white footage, ink overlay at 80%): cream | overlay | 6.0 | 4.5 | pass |
| Header-card accent line, same worst case: lime | overlay | 5.7 | 3 (large) | pass |
| Cream on error (offline banner) | error | 6.2 | 4.5 | pass |
| Error text | white / canvas / band | 6.5 / 6.2 / 6.4 | 4.5 | pass |
| Cream on success | success | 4.8 | 4.5 | pass |
| "Open" dot, success | white | 5.0 | 3 | pass |
| Form-field border `--muted` | white | 5.9 | 3 | pass |
| Cancelled card: accent text / ink text | accent at 10% over canvas | 5.9 / 9.6 | 4.5 | pass |
| Cream text and icons on the footer, dark bars and toasts | ink | 11.2 | 4.5 | pass |
| Current timeline step: ink border and icon | white | 11.8 | 3 | pass (the sunflower ring around it is decoration; the bold label and `aria-current` carry the state) |
| Empty rating star (`--muted` at 40%) | white | 1.8 | n/a | decorative: the rating is in the text alternative |

### 10.9 Accessibility rules in force
- **Contrast** is checked against §10.8 (every text/background pair). Text on action, accent, error and success is white (`text-on-action`); there is no `text-white` or `bg-white` anywhere (cards are `surface`).
- **Focus:** one global 2px ring with a 2px offset on `:focus-visible`: forest on light surfaces, lime inside `.tone-dark`, so it shows on cream and green alike. No component removes it (`outline-none` is banned). Form fields keep their `--muted` border.
- **Names:** every icon-only control has an `aria-label` (cart count included in the cart link's label); decorative icons are `aria-hidden`. An icon's `className` never drops its size: without its own `size-*`/`w-*`/`h-*` an `Icon` keeps `size-6`.
- **Tap targets:** `touch` and `tap` are both 48px: the default for buttons, chips, fields and round icon buttons (language, call, cart, "+", stepper, close). Every button, the small "See all" pill included, is at least 48px.
- **Reduced motion:** `prefers-reduced-motion` removes the card lift, button press, "+" pop and smooth scrolling, and runs any remaining animation (skeleton pulse, spinner) for a single pass instead of flickering.
- **RTL:** directional icons use `mirror` (points forward: flips in right-to-left) or `flip` (the "back" arrow). Logical CSS only (`ms-/me-/ps-/pe-/start-/end-`). The saved language, direction and font are applied to `<html>` **before the first paint** (a layout effect), so English visitors never see a frame of Urdu layout.
- **Urdu text** is never below 18px (`text-sm`/`text-xs` are raised), line-height 2, accent lines upright Nastaliq.
- **Ratings** are information, not decoration: stars appear only when a testimonial has its own rating, filled stars are `--ink` and carry a text alternative ("4 / 5 stars").

### 10.10 Performance rules in force
- Every `<img>` has explicit `width` and `height` (a photo box is always 4:3); images below the first screen are `loading="lazy"`; only the hero poster loads eagerly (the logo is text).
- Content that arrives with the store data must not push the page down: the announcement is an **overlay on the top of the hero** on the home page (the hero leaves room for it), the open/closed chip and card lists have same-size skeletons.
- Layout shift measured on a production build with a mock API: Home 0.000 at 360px, ≤ 0.083 at 1280px; Menu 0.000 at both (it was 0.8 on Home before the language fix and the announcement overlay). Re-measured 2026-11-16 against the dev API in Urdu and English: Home ≤ 0.018 at 768, 1024 and 1440px (the status chip got a fixed slot and the below-fold chunk a screen-high placeholder), 0.000 at 360 and 414px.
- First-screen fonts are preloaded for the saved language only (`early-hints.js` + `<meta name="font-preload-*">`).
- Budgets (gzip JS, shared chunks included), measured after the re-theme and component rebuild:

| Route | Size | Budget |
|---|---|---|
| Home, with the below-fold chunk | 112.9 KB | ~120 KB |
| Menu (checkout loads on demand, +4.9 KB) | 115.0 KB | ~150 KB |
| Order page | 110.8 KB | ~150 KB |
| CSS (all routes) | 8.2 KB | n/a |

Measured as the gzip size of every JS/CSS file a route actually loads (Chrome, 360px, production build). Before the re-theme: Home 112.1, Menu 114.6, Order 110.5, CSS 8.3 KB.

### 10.11 What to look at by hand before launch
1. The Urdu strings flagged **owner must confirm** in `docs/ONLINE_SITE_STRINGS.md` (hero headline, every section's accent line, the four "Why" claims, brand spelling).
2. A real phone on slow data: Home first screen, then Menu, an item sheet, the cart, checkout and the order page, in Urdu and English.
3. The phone header card over the **real** drone footage: the lime accent line is 5.7:1 against the worst possible frame (pure white footage under the 80% overlay); check it on the brightest real frame.
4. A real item with a transparent cut-out photo next to a normal photo in the same grid.
5. Long real values: a 24-character bank account number, a long Urdu item name, a three-line delivery-area name.
