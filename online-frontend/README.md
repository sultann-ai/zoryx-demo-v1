# online-frontend: the customer website

Urdu-first (right-to-left) ordering site for Zoryx (Zoryx). Customers browse the menu, order as guests (no accounts) and follow their order on a private link. It talks only to the backend's public `/api/online/*` endpoints.

Independent package: no workspaces, and it never imports from `../pos-frontend` (the staff POS) or `../backend`. Read `../docs/ONLINE_SITE_BRIEF.md` before changing anything visual; `CLAUDE.md` in this folder lists the rules in short.

Stack: React 19, Vite, TypeScript, react-router-dom, @tanstack/react-query, Tailwind v4, self-hosted fonts (Fontsource + one subset Urdu face). No UI kit, no analytics, no third-party scripts.

## Run it

```bash
cd online-frontend
npm install
cp .env.example .env      # then edit the two values below
npm run dev               # http://localhost:5173
```

The backend must be running at `VITE_API_URL` (default `http://localhost:5000`) and its `CORS_ORIGIN` must list this site's origin (`http://localhost:5173` in development).

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check, then build to `dist/` (no source maps) |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc -b` |
| `npm run assets` | Regenerate logo sizes, favicons, app icons and the share image from `src/assets/logo.png` (outputs are committed) |
| `npm run strings` | Regenerate `../docs/ONLINE_SITE_STRINGS.md` from `src/i18n/ur.ts` and `en.ts` |

## Environment variables

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Backend origin, no trailing slash, e.g. `https://your-api.up.railway.app`. Photos from the API are relative to it. Baked in at build time. |
| `VITE_SITE_URL` | This site's public origin, e.g. `https://zoryx.dev`. Used for the canonical link, share tags, `robots.txt` and `sitemap.xml`. |

The shop phone shown when the API is unreachable (and in the `<noscript>` text) is the constant in `site.config.json`. The same file holds the WhatsApp number and the map link. When the API is up, the values from the POS site settings are used instead.

## The hero rider picture

The home hero shows a transparent PNG of the rider on the bike, standing on its own on the canvas (no video, no background panel). Save it as `public/media/rider.png`: a cut-out with no background, about 900 px tall, under about 200 KB, with the bike's wheels touching the bottom edge. Until the file exists nothing shows there. It floats and slides in; visitors who prefer reduced motion get it standing still.

## Fonts

Latin text uses DM Sans and Bricolage Grotesque from Fontsource. Urdu uses **one weight** of Noto Nastaliq Urdu, cut down to the Urdu alphabet (`src/assets/fonts/`, 100 KB instead of two 157 KB files). To regenerate it: `pip install fonttools brotli`, then `python scripts/subset-urdu-font.py`. Nothing else needs Python.

## Deploy on Vercel

1. In Vercel choose **Add New > Project**, import this repository, and set **Root Directory** to `online-frontend`. Framework preset: Vite (build `npm run build`, output `dist`).
2. Under **Environment Variables** add `VITE_API_URL` and `VITE_SITE_URL` (see above).
3. **Edit `vercel.json`:** the Content-Security-Policy contains the API origin in two places (`img-src` and `connect-src`), written as `https://YOUR-API.up.railway.app`. Replace both with your real backend origin (the same value as `VITE_API_URL`). If they do not match, every API call and photo is blocked by the browser. The build prints a warning when `vercel.json` does not mention the origin in `VITE_API_URL`.
4. **Backend:** on Railway add the site's domain(s) to `CORS_ORIGIN`, comma separated, e.g. `https://zoryx.dev,https://www.zoryx.dev`. Without it browsers block the order `POST`.
5. Add the domain in Vercel and create the DNS records it shows at your registrar. The customer site gets the root domain; the POS stays on its own subdomain.
6. Redeploy after changing any variable (they are baked in at build time).

`vercel.json` also rewrites every path to `index.html` (client-side routing: `/menu`, `/order/...` work when opened directly or from a WhatsApp link), sets long cache lifetimes for hashed assets, and sends these headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` (so an order link never leaks as a referrer).

If you host somewhere other than Vercel, copy those headers into that host's configuration.

### The Content Security Policy

`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: <API>; media-src 'self'; font-src 'self'; connect-src 'self' <API>; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`

No inline scripts or styles are used (the early image-preload script is the external `public/early-hints.js`), so no `'unsafe-inline'` is needed. `wa.me`, `tel:` and Google Maps links are ordinary links, which the policy does not restrict. If you ever add a feature that loads from another origin, add that origin deliberately.

## What the site stores in the browser

Only these `localStorage` keys, and nothing else (no cookies, no analytics, no third-party requests):

| Key | Holds |
|---|---|
| `mc.lang` | `ur` or `en` |
| `mc.cart.v1` | cart lines (ids and quantities, never prices) and the checkout's request id |
| `mc.details.v1` | the customer's saved name, phone, area and address (they can clear it from checkout) |
| `mc.lastOrder` | the last order's code and private link, kept 48 hours |
| `mc.haptics` | `0` when the person switched vibration feedback off in More > Settings (absent = on) |
| `mc.orders.v1` | the last 10 orders placed from this phone: code, private link, time, total, item names and the cart lines for Reorder (never address or phone) |

## The phone Home video (optional)

The phone Home screen shows a short drone loop in its header card. Drop two files into `public/media/` (they are served from `/media/`, cached for a day): `drone.mp4` (H.264, muted, about 720p, 10 to 15 seconds, ideally under 1.5 MB: it downloads after the page has loaded and only on a normal connection) and `drone-poster.jpg` (800 x 400, the first frame, shown while the video loads and wherever it does not autoplay). Neither file is required: without them the card is a plain dark panel with the shop name. Nothing is copied into the repo for you.

## When the API is down, slow or failing

- `/` still renders in full: hero, "why us", how to order, a Call button and the phone from `site.config.json`. Sections that need data (photos, reviews, hours, delivery fees) simply stay out.
- `/menu` shows a friendly message with a retry button and the phone number. A slow connection shows a hint with the phone after 8 seconds; requests give up after 12 seconds.
- `/order/<code>` shows the same message with the phone, or "we could not find this order" for an unknown link.

## Manual QA (before launch)

Backend on Railway with migrations applied, `CORS_ORIGIN` set, settings, delivery areas, a payment account with QR, menu photos and Urdu names filled in, "Show online" switched on for what you sell, and a business day started. Then, **on a real cheap Android phone on mobile data (not Wi-Fi)**:

- [ ] Open the site from a WhatsApp link. The landing page loads quickly and the language toggle works (page flips between right-to-left Urdu and left-to-right English).
- [ ] Order one plain item with cash on delivery.
- [ ] Order one sized item (with an add-on) plus a deal with online payment.
- [ ] On the online order: the account number copies ("Copied" shows), the QR opens large, and the WhatsApp button opens a chat with the order code and amount already typed.
- [ ] In the POS, accept one order and reject another (with a reason). The customer's order page updates within about 20 seconds, and shows the reason for the rejected one.
- [ ] Switch off "Accept online orders" in the POS: the site shows the closed message, the menu stays visible, Add buttons are disabled.
- [ ] Turn on the phone's data-saver mode: the hero video does not play (the poster stays).
- [ ] Open a wrong order link (change a letter): the "could not find this order" page appears with a link to the menu.
- [ ] Turn on airplane mode while on `/menu`: the offline banner appears; the cart still opens.
- [ ] Place an order, then reopen the menu: the "Your last order" banner shows the code; "Clear my saved details" in checkout empties the form.
- [ ] Open the site and the order page with the phone's text size set to large: nothing is cut off.
- [ ] Have a native Urdu speaker proofread `../docs/ONLINE_SITE_STRINGS.md`.

**Phone app shell (below 768 px).** Repeat in Urdu and English, at 320, 360, 390, 412 and 430 px wide and at a short 568 px height, in a normal browser tab and installed to the home screen (standalone):
- [ ] App bar and tab bar are 56 px (plus the notch / home-indicator inset), nothing scrolls sideways, no Urdu tab label is clipped, and the tabs mirror in Urdu.
- [ ] Each tab keeps its scroll position when you leave and come back; tapping the current tab scrolls it to the top.
- [ ] Cart tab: badge, then the total; it opens the cart. Android Back / browser Back closes the cart, checkout, an item sheet and the QR sheet instead of leaving the site. Placing an order, then Back, lands on the menu (not a dead sheet).
- [ ] The tab bar hides while a field has the keyboard and while a sheet is open, and returns afterwards.
- [ ] Inner screens (order status) show a back button and slide in (from the left in Urdu); tabs cross-fade; with "reduce motion" on there is no animation.
- [ ] Installed: no install hint on More and no app-QR card; the status bar takes the app bar colour.
- [ ] The order code and account numbers can be selected and copied; buttons and the bars cannot.
- [ ] From 768 px up the website header, footer and floating WhatsApp button are back and look as before.

**Phone polish** (Urdu and English, 320 and 360 px):
- [ ] Buttons, tabs, rows and cards shrink slightly while pressed; with "reduce motion" on nothing moves (no press scale, no slides, no pops).
- [ ] Sheets rise, the cart and checkout slide in, pages slide between screens; dragging a sheet follows the finger and a quick flick closes it faster than a slow pull.
- [ ] Removing a cart line (swipe, Delete or the stepper at 0) shows a snackbar with Undo above the tab bar (above the cart pill on Home and Menu, above the footer inside the cart); Undo brings the line back. Copying a code or account number shows "copied".
- [ ] On Android, adding to the cart and placing an order give a tiny vibration; More > Settings has the switch (default on) where the phone supports it, and switching it off stops it.
- [ ] With no connection the menu shows a full-screen "You are offline - your order is saved" with Try again; an unknown order link, an empty cart and an empty menu each have their own full-screen message; the brand splash shows while a screen's code loads.
- [ ] On every screen the last card is clear of the tab bar and the cart pill; a link to a section stops below the app bar; opening a field never leaves it hidden, the tab bar hides while typing and comes back after.

**Phone Orders and More** (Urdu and English):
- [ ] After placing an order the Orders tab shows its status as a large headline with a step progress, the code (tap to copy), the items in a collapsed card and a Call button above the tab bar; the tab shows a dot until the order is Delivered or Cancelled. Pulling the page down on a touch phone refreshes it; the status also updates by itself every 20 seconds.
- [ ] An online order waiting for payment shows numbered steps: account numbers with Copy, the QR, the screenshot upload (a non-image or a file over 5 MB is refused with a message) and the WhatsApp button; after a successful upload the steps give way to "we are checking your payment".
- [ ] Past orders (up to 10, on this phone) list under the active one with View and Reorder; with no orders there is a friendly message and an Order now button.
- [ ] More: the language switch changes language and direction at once; Find us expands to address, hours and areas with fees; Install shows the browser's button on Android Chrome, the Share > Add to Home Screen steps on an iPhone, and nothing once installed; Clear my saved details empties the checkout form.

**Phone Menu and Cart** (320 and 360 px, Urdu and English, also with the keyboard open):
- [ ] The category pills stay under the app bar, the active one is filled and stays visible, and tapping one scrolls smoothly to its section.
- [ ] Adding a plain item turns its + into a stepper in place with a small pop; a sized item opens a bottom sheet (about 85% high, drag handle) that closes by pulling it down, by tapping outside, by Back and by Escape.
- [ ] With items in the cart a pill above the tab bar shows the count, total and View order, and pops when something is added; the Cart tab opens the full-screen cart.
- [ ] Swiping a cart row toward the start edge shows Delete (from the other side in Urdu); the stepper at 0 and the Delete button also remove; Undo brings it back.
- [ ] Checkout is a full-screen page with a collapsed summary on top; with the keyboard open the focused field stays visible above the Place order button, Next/Enter moves to the next field, and the phone field opens the phone keypad.
- [ ] When the shop is closed the banner shows, every + and Add is disabled, and Checkout is disabled with the closed hint.

**Phone Home** (same widths and languages):
- [ ] Header card is 200 px with a readable name, tagline and open/closed chip; the video starts after the page has loaded, pauses when scrolled away, and does not start with Data Saver, reduced motion or a slow connection (the play button works).
- [ ] Quick actions: Order now opens the menu; Call, WhatsApp and Directions open their apps.
- [ ] The promo carousel swipes and its dots follow; with no announcement and no deal photos it is gone.
- [ ] A category icon opens that category on the Menu tab; "See all" on Popular / New / Deals opens the Menu narrowed to that list (Show all clears it).
- [ ] After placing an order: the Track card shows its status and opens the order page; Order again lists the items and total and Reorder refills the cart and opens it.
- [ ] Nothing jumps while the sections load (skeletons hold their size).

### Lighthouse (mobile) by hand

Chrome DevTools > Lighthouse, device **Mobile**, categories Performance and Accessibility. (Lighthouse's mobile preset already applies simulated Slow 4G and 4x CPU slowdown; to see it live, use the Performance panel with Network "Slow 4G" and CPU "4x slowdown".) Test on a production build (`npm run build && npm run preview`) with the real API, not the dev server. Targets for `/` and `/menu`: LCP under 2.5 s, no layout shift, initial JavaScript about 150 KB gzip or less.

## Performance notes

- Route chunks are lazy (menu, order, checkout, and everything below the hero on the home page).
- Photos are lazy except the first two on the menu and the hero poster, which is preloaded (and has a 720 px variant for phones).
- Early hints (`public/early-hints.js`) start the first API calls and the poster before the app code has loaded; `index.html` also opens the connection to the API origin.
- Fonts: one Urdu weight (100 KB), three DM Sans weights, three Bricolage Grotesque weights.
