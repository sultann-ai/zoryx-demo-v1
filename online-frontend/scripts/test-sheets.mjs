// Sheet layout test: opens every customer-page sheet (Join the table, item with add-ons, a long cart, checkout) on phone-sized
// screens and checks the contract of components/Sheet.tsx: the header and the action button stay on screen, only the body
// scrolls (by real touch events), dragging the body never moves the sheet, dragging the handle closes / snaps back / expands,
// and with the keyboard up the focused field and its error stay visible. Also runs in Urdu (RTL).
//
//   npm run test:sheets
//
// Starts its own Vite dev server and mocks the API in the browser (nothing else needs to run). Drives the Chrome installed on
// this machine (playwright-core downloads no browser); set CHROME_PATH to use another Chromium build.
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const QR = 'AbCdEfGhIjKlMnOpQrStUv' // a valid-looking 22-character table key
const SIZES = [
  [360, 640],
  [384, 832],
  [390, 844],
]

// ---------- Mock API ----------
const addOns = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `ao${n}`, name: `Extra topping ${n}`, price: `${n * 20}.00` }))
const items = Array.from({ length: 24 }, (_, i) => ({
  id: `it${i}`,
  name: i === 0 ? 'Loaded Zinger Burger Meal' : `Menu item ${i}`,
  nameUr: null,
  description: 'A long description of this dish. '.repeat(i === 0 ? 6 : 1),
  descriptionUr: null,
  price: `${300 + i * 10}.00`,
  slug: `item-${i}`,
  categoryId: 'c1',
  imageUrl: null,
  image: null,
  isFeatured: i < 3,
  sortOrder: i,
  orderable: true,
  variants:
    i === 0
      ? [
          { id: 'v1', label: 'Regular', price: '450.00', sortOrder: 0, addOns },
          { id: 'v2', label: 'Large', price: '650.00', sortOrder: 1, addOns },
        ]
      : [],
}))
const menu = { categories: [{ id: 'c1', name: 'Mains', nameUr: null, sortOrder: 0 }], items }
const store = {
  settings: {
    shopNameEn: 'Zoryx', shopNameUr: null, taglineEn: null, taglineUr: null, phone: '03001234567', whatsappNumber: '923001234567',
    addressEn: 'Main road', addressUr: null, mapUrl: null, openingHoursEn: '10am - 11pm', openingHoursUr: null, announcementEn: null,
    announcementUr: null, facebookUrl: null, instagramUrl: null, tiktokUrl: null, deliveryEnabled: true, pickupEnabled: true,
    pickupMinOrderAmount: '0', pickupNoteEn: null, pickupNoteUr: null,
  },
  deliveryAreas: [{ id: 'a1', nameEn: 'Gulberg', nameUr: null, deliveryFee: '100.00', minOrderAmount: '500.00' }],
  paymentAccounts: [{ id: 'p1', label: 'Easypaisa', accountTitle: 'Zoryx', accountNumber: '03001234567', qrUrl: null }],
  gallery: [],
  testimonials: [],
  orderingOpen: true,
  closedReason: null,
}
const CART_LINES = items.slice(1, 19).map((it) => ({ kind: 'item', id: it.id, variantId: null, addOnIds: [], qty: 1 }))

const reply = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

async function newPage(browser, [width, height], { lang = 'en', cart = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await context.addInitScript(
    ({ lang, cart }) => {
      localStorage.setItem('mc.lang', lang)
      if (cart) localStorage.setItem('mc.cart.v1', JSON.stringify(cart))
    },
    { lang, cart: cart ? { v: 1, lines: CART_LINES, rid: null } : null },
  )
  const page = await context.newPage()
  await page.route('http://localhost:5000/**', (route) => {
    const { pathname } = new URL(route.request().url())
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    if (pathname === '/api/online/store') return reply(route, store)
    if (pathname === '/api/online/menu') return reply(route, menu)
    if (pathname === '/api/online/deals') return reply(route, [])
    if (pathname === '/api/online/table/menu') return reply(route, { ...menu, deals: [] })
    if (pathname === `/api/online/table/${QR}`)
      return reply(route, { table: { name: 'Table 7', area: 'Family Hall' }, state: 'OPEN', requiresPin: true, orderingOpen: true, closedReason: null })
    return reply(route, { code: 'NOT_FOUND', error: 'not mocked' }, 404)
  })
  return { context, page, cdp: await context.newCDPSession(page) }
}

// ---------- The four sheets ----------
const OPEN = {
  join: async (page, base) => {
    await page.goto(`${base}/t/${QR}`)
    await page.waitForSelector('dialog[open]')
  },
  item: async (page, base) => {
    await page.goto(`${base}/menu`)
    await page.locator('button[aria-label$="Loaded Zinger Burger Meal"]').click()
    await page.waitForSelector('dialog[open]')
  },
  cart: async (page, base) => {
    await page.goto(`${base}/menu`)
    await page.locator('.tabbar button[aria-haspopup="dialog"]').click()
    await page.waitForSelector('dialog[open]')
  },
  checkout: async (page, base) => {
    await OPEN.cart(page, base)
    await page.locator('dialog[open] [data-sheet-footer] button').last().click()
    await page.waitForSelector('dialog[open] #co-name, dialog[open] input')
  },
}
// Sheets whose content is longer than the screen (the body must scroll); the Join sheet only gets long with the keyboard up.
const LONG = new Set(['item', 'cart', 'checkout'])

// ---------- Helpers ----------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const snapshot = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]')
    if (!dialog) return null
    const rect = (el) => {
      if (!el) return null
      const { top, bottom, height } = el.getBoundingClientRect()
      return { top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) }
    }
    const body = dialog.querySelector('[data-sheet-body]')
    const footer = dialog.querySelector('[data-sheet-footer]')
    const button = footer?.querySelector('button, a')
    let reachable = null
    if (button) {
      const { left, top, width, height } = button.getBoundingClientRect()
      const hit = document.elementFromPoint(left + width / 2, top + height / 2)
      reachable = !!hit && button.contains(hit)
    }
    return {
      innerHeight: innerHeight,
      dir: document.documentElement.dir,
      dialog: rect(dialog),
      header: rect(dialog.querySelector('[data-sheet-header]')),
      body: rect(body),
      scrollTop: Math.round(body.scrollTop),
      overflow: body.scrollHeight - body.clientHeight,
      footer: rect(footer),
      button: rect(button),
      buttonReachable: reachable,
      bodyScrolls: getComputedStyle(body).overflowY === 'auto',
    }
  })

/** A real touch drag (CDP), so the browser decides what scrolls and what does not, as on a phone. */
async function touchDrag(cdp, x, y0, y1, { steps = 12, hold = 0 } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  if (hold) await sleep(hold)
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] })
    await sleep(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(450)
}

let passed = 0
const failures = []
function check(label, ok, detail = '') {
  if (ok) passed += 1
  else failures.push(`${label} ${detail}`)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? `  (${detail})` : ''}`)
}

/** The layout contract, for any open sheet. */
function checkLayout(label, s, { long }) {
  check(`${label}: on screen, header and button visible`, !!s && s.dialog.top >= 0 && s.dialog.bottom <= s.innerHeight + 1 && s.header.top >= 0 && s.header.height > 0 && s.footer && s.button.top >= s.header.bottom && s.button.bottom <= s.innerHeight + 1, JSON.stringify({ dialog: s?.dialog, button: s?.button }))
  check(`${label}: the action button is not covered`, s?.buttonReachable === true)
  check(`${label}: body is a scroll area, never squeezed to nothing`, s.bodyScrolls && s.body.height >= 120, `body ${s.body.height}px of ${s.innerHeight}px`)
  if (long) check(`${label}: long content overflows the body (so it scrolls)`, s.overflow > 40, `overflow ${s.overflow}px`)
}

// ---------- Run ----------
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5290, strictPort: false } })
await server.listen()
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })

try {
  // 1) Every sheet, every phone size: layout contract + body scrolls by touch while the sheet stays put.
  for (const size of SIZES) {
    for (const name of Object.keys(OPEN)) {
      const label = `${size.join('x')} ${name}`
      const { context, page, cdp } = await newPage(browser, size, { cart: name === 'cart' || name === 'checkout' })
      await OPEN[name](page, base)
      await sleep(500)
      const s0 = await snapshot(page)
      checkLayout(label, s0, { long: LONG.has(name) })
      if (LONG.has(name)) {
        const x = Math.round(size[0] / 2)
        await touchDrag(cdp, x, s0.body.bottom - 40, s0.body.top + 40)
        const s1 = await snapshot(page)
        check(`${label}: touch-scrolling the body works`, s1.scrollTop > 40, `scrollTop ${s0.scrollTop} -> ${s1.scrollTop}`)
        check(`${label}: dragging the body did not move or resize the sheet`, s1.dialog.top === s0.dialog.top && s1.dialog.height === s0.dialog.height)
        check(`${label}: the button is still on screen after scrolling`, s1.button.bottom <= s1.innerHeight + 1 && s1.buttonReachable === true)
      }
      await context.close()
    }
  }

  // 2) The draggable item sheet at 360x640: handle drag down (snap back / close) and up (expand).
  {
    const size = [360, 640]
    const x = 180
    const open = async () => {
      const ctx = await newPage(browser, size)
      await OPEN.item(ctx.page, base)
      await sleep(500)
      return ctx
    }
    let { context, page, cdp } = await open()
    let s0 = await snapshot(page)
    await touchDrag(cdp, x, s0.header.top + 30, s0.header.top + 90)
    let s1 = await snapshot(page)
    check('360x640 item: a short pull down snaps back', !!s1 && s1.dialog.top === s0.dialog.top, `top ${s0.dialog.top} -> ${s1?.dialog.top}`)
    await touchDrag(cdp, x, s0.header.top + 30, s0.header.top + 250, { steps: 14 })
    check('360x640 item: a long pull down closes the sheet', (await snapshot(page)) === null)
    await context.close()
    ;({ context, page, cdp } = await open())
    s0 = await snapshot(page)
    await touchDrag(cdp, x, s0.header.top + 30, Math.max(8, s0.header.top - 170), { steps: 14 })
    s1 = await snapshot(page)
    check('360x640 item: a pull up on the handle expands the sheet', !!s1 && s1.dialog.height > s0.dialog.height + 20 && s1.button.bottom <= s1.innerHeight + 1, `height ${s0.dialog.height} -> ${s1?.dialog.height}`)
    await context.close()
    ;({ context, page, cdp } = await open())
    s0 = await snapshot(page)
    await touchDrag(cdp, x, s0.body.bottom - 60, s0.body.top + 60, { hold: 700 })
    s1 = await snapshot(page)
    const selected = await page.evaluate(() => String(getSelection()).length)
    check('360x640 item: long-press then drag on the body scrolls it, no text selection', s1.scrollTop > 20 && selected === 0 && s1.dialog.top === s0.dialog.top, `scrollTop ${s1.scrollTop}, selected ${selected}`)
    await context.close()
  }

  // 3) Keyboard up (the layout viewport shrinks, interactive-widget=resizes-content): the sheet stays usable, the focused
  //    field and its error are visible, the button is above the keyboard.
  for (const [size, keyboard] of [
    [[384, 832], 340],
    [[360, 640], 300],
    [[384, 832], 520], // a very tall keyboard: 312px of screen left
  ]) {
    const label = `${size.join('x')} join, keyboard ${keyboard}px`
    const { context, page } = await newPage(browser, size)
    await OPEN.join(page, base)
    await sleep(400)
    await page.locator('dialog[open] input').first().tap()
    await page.setViewportSize({ width: size[0], height: size[1] - keyboard })
    await sleep(700)
    const s = await snapshot(page)
    checkLayout(label, s, { long: false })
    const within = (el) => `(() => { const b = document.querySelector('dialog[open] [data-sheet-body]').getBoundingClientRect(); const r = ${el}.getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 })()`
    check(`${label}: the focused field is visible`, await page.evaluate(within("document.activeElement")))
    // Enter in the name field moves to the PIN field (which scrolls the name field away), then submit with both empty.
    await page.keyboard.press('Enter')
    await sleep(700)
    check(`${label}: the PIN field it moved to is visible`, await page.evaluate(within("document.activeElement")))
    await page.locator('dialog[open] [data-sheet-footer] button').tap()
    await sleep(700)
    check(`${label}: the name field and its error are visible`, await page.evaluate(`(() => { const b = document.querySelector('dialog[open] [data-sheet-body]').getBoundingClientRect(); const f = document.querySelector('dialog[open] [data-field]'); const e = f.querySelector('[id$="-error"]'); const i = f.querySelector('input'); return !!e && [i, e].every((el) => { const r = el.getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1 }) })()`))
    await context.close()
  }

  // 4) Urdu (right-to-left): the same contract.
  for (const name of ['join', 'item']) {
    const label = `360x640 ${name} (ur, rtl)`
    const { context, page, cdp } = await newPage(browser, [360, 640], { lang: 'ur' })
    await OPEN[name](page, base)
    await sleep(600)
    const s0 = await snapshot(page)
    check(`${label}: page is right-to-left`, s0.dir === 'rtl', s0.dir)
    checkLayout(label, s0, { long: name === 'item' })
    if (name === 'item') {
      await touchDrag(cdp, 180, s0.body.bottom - 40, s0.body.top + 40)
      const s1 = await snapshot(page)
      check(`${label}: touch-scrolling the body works`, s1.scrollTop > 40 && s1.dialog.top === s0.dialog.top)
    }
    await context.close()
  }
} finally {
  await browser.close()
  await server.close()
}

console.log(`\n${passed} passed, ${failures.length} failed`)
for (const failure of failures) console.log(` - ${failure}`)
process.exit(failures.length ? 1 : 0)
