// Payment proof card test: drives /order/:publicId on phone and tablet screens, in English and Urdu (RTL), against a
// stateful mock of the API (nothing else needs to run). Covers: a normal upload, a 10 MB photo, a non-image, going
// offline mid-upload, a double tap, a reload while waiting, a rejection with a reason, a verification, polling speed, the
// "never a dead end" help (pick another / call the waiter / WhatsApp) and uploading the original when only compression broke.
//
//   npm run test:proof                      (set SHOTS=<folder> to also save a screenshot of every state)
//
// Starts its own Vite dev server; drives the Chrome installed on this machine (CHROME_PATH to use another build).
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { createServer } from 'vite'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/i18n/en.ts'
import { ur } from '../src/i18n/ur.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const ID = 'abcdefghijklmnopqrstuv' // a 22-character status link
const QR = 'AbCdEfGhIjKlMnOpQrStUv'
const SIZES = [
  [360, 640],
  [390, 844],
  [768, 1024],
]
const LANGS = { en, ur }
const MB = 1024 * 1024

// ---------- Pictures ----------
const noise = (width, height, quality) => sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer()
const files = {
  // A real phone-size photo, a couple of MB: gets shrunk.
  photo: { name: 'payment.jpg', mimeType: 'image/jpeg', buffer: await noise(2000, 1500, 90) },
  // Over 10 MB.
  huge: { name: 'IMG_9999.jpg', mimeType: 'image/jpeg', buffer: await noise(4600, 3400, 100) },
  text: { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('this is not a picture') },
  // Looks like a PNG but cannot be decoded: compression breaks. 2 MB fits the limit, 9 MB does not.
  brokenSmall: { name: 'weird.png', mimeType: 'image/png', buffer: randomBytes(2 * MB) },
  brokenBig: { name: 'huge-weird.png', mimeType: 'image/png', buffer: randomBytes(9 * MB) },
}
const thumb = await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 60, g: 120, b: 90 } } }).jpeg().toBuffer()

// ---------- Mock API ----------
const store = {
  settings: {
    shopNameEn: 'Zoryx', shopNameUr: null, taglineEn: null, taglineUr: null, phone: '03001234567', whatsappNumber: '923001234567',
    addressEn: 'Main road', addressUr: null, mapUrl: null, openingHoursEn: '10am - 11pm', openingHoursUr: null, announcementEn: null,
    announcementUr: null, facebookUrl: null, instagramUrl: null, tiktokUrl: null, deliveryEnabled: true, pickupEnabled: true,
    pickupMinOrderAmount: '0', pickupNoteEn: null, pickupNoteUr: null,
  },
  deliveryAreas: [],
  paymentAccounts: [{ id: 'p1', label: 'Easypaisa', accountTitle: 'Zoryx', accountNumber: '03001234567', qrUrl: null }],
  gallery: [],
  testimonials: [],
  orderingOpen: true,
  closedReason: null,
}
const order = (payment) => ({
  publicCode: 'K7P2M',
  orderType: 'DELIVERY',
  status: 'RECEIVED',
  cancelReason: null,
  payment: { method: 'ONLINE', ...payment },
  lines: [{ kind: 'item', name: 'Zinger Burger', nameUr: null, size: null, quantity: 2, lineTotal: '1400.00' }],
  subtotal: '1400.00',
  discount: '0.00',
  deliveryFee: '150.00',
  total: '1550.00',
  createdAt: new Date().toISOString(),
})
const json = (route, body, status = 200, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One test's world: the server's payment state and how the upload endpoint behaves. */
function makeServer() {
  const world = {
    payment: { state: 'WAITING_FOR_PAYMENT', proofSentAt: null, rejectReason: null },
    upload: 'ok', // ok | drop | rate | rejected
    uploadDelay: 700,
    posts: [], // what the upload endpoint received
    gets: [], // timestamps of status reads
    calls: [], // waiter calls
  }
  world.handler = async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (path === '/api/online/store') return json(route, store)
    if (path === '/api/online/menu') return json(route, { categories: [], items: [] })
    if (path === '/api/online/deals') return json(route, [])
    if (path === `/api/online/orders/${ID}/payment-proof` && request.method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: thumb })
    if (path === `/api/online/orders/${ID}` && request.method() === 'GET') {
      world.gets.push(Date.now())
      return json(route, order(world.payment), 200, { 'cache-control': 'no-store' })
    }
    if (path === `/api/online/orders/${ID}/payment-proof` && request.method() === 'POST') {
      const body = request.postDataBuffer() ?? Buffer.alloc(0)
      world.posts.push({ size: body.length, jpeg: body.includes('image/jpeg') })
      await wait(world.uploadDelay)
      if (world.upload === 'drop') return route.abort('connectionfailed')
      if (world.upload === 'rate') return json(route, { code: 'TOO_MANY', error: 'Too many requests, please try again later' }, 429)
      if (world.upload === 'rejected') return json(route, { code: 'BAD_REQUEST', error: 'That image could not be read' }, 400)
      world.payment = { state: 'PROOF_RECEIVED', proofSentAt: new Date().toISOString(), rejectReason: null }
      return json(route, { paymentState: 'PROOF_RECEIVED' })
    }
    if (path === '/api/online/table/calls' && request.method() === 'POST') {
      world.calls.push(request.postDataJSON())
      return json(route, { id: 'call-1', type: 'OTHER', note: 'x', status: 'RAISED', createdAt: new Date().toISOString() }, 201)
    }
    return json(route, { code: 'NOT_FOUND', error: 'not mocked' }, 404)
  }
  return world
}

async function newPage(browser, [width, height], lang, world, { offlineCapable = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 768, hasTouch: true })
  await context.addInitScript((lang) => {
    localStorage.setItem('mc.lang', lang)
    window.__vib = []
    navigator.vibrate = (pattern) => (window.__vib.push(pattern), true)
  }, lang)
  const page = await context.newPage()
  await page.route('http://localhost:5000/**', world.handler)
  void offlineCapable
  return { context, page }
}

// ---------- Harness ----------
let passed = 0
const failures = []
function check(label, ok, detail = '') {
  if (ok) passed += 1
  else failures.push(`${label} ${detail}`)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? `  (${detail})` : ''}`)
}
const state = (page) => page.locator('[data-testid=payment-card]').getAttribute('data-state')
const waitState = async (page, want, timeout = 9000) => {
  try {
    await page.locator(`[data-testid=payment-card][data-state=${want}]`).waitFor({ timeout })
    return true
  } catch {
    return false
  }
}
const shot = async (page, tag, name) => {
  if (!SHOTS) return
  await page.waitForTimeout(350) // let the card finish its swap animation
  // Bring the card (or the open panel) to the top of the screen, below the app bar, so the picture shows the state.
  await page.evaluate(() => document.querySelector('[data-testid=payment-card]')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png` })
}
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
const openStep2 = async (page) => {
  const button = page.locator('#pay-step-2')
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
}
const send = (page) => page.locator('[data-testid=proof-send]')
const pickFile = async (page, file) => {
  await page.locator('input[type=file]').setInputFiles(file)
}
const gotoOrder = async (page, base) => {
  await page.goto(`${base}/order/${ID}`)
  await page.locator('[data-testid=payment-card]').waitFor({ timeout: 15000 })
}

// ---------- Scenarios (each in a fresh page) ----------
async function scenarios(browser, base, size, lang) {
  const T = LANGS[lang]
  const tag = `${size.join('x')}-${lang}`
  const L = (label) => `${tag} ${label}`
  const fresh = async (setup) => {
    const world = makeServer()
    setup?.(world)
    const { context, page } = await newPage(browser, size, lang, world)
    await gotoOrder(page, base)
    return { world, context, page }
  }

  // 1. needs payment + normal upload (+ checking state, toast, haptic, thumbnail, time, aria-live) + reload while waiting
  {
    const { world, context, page } = await fresh()
    check(L('needs payment: steps and upload are offered'), (await state(page)) === 'NEEDS_PAYMENT' && (await page.locator('#pay-step-2').isVisible()))
    check(L('page direction'), (await page.evaluate(() => document.documentElement.dir)) === (lang === 'ur' ? 'rtl' : 'ltr'))
    await shot(page, tag, '1-needs-payment')
    await openStep2(page)
    await pickFile(page, files.photo)
    await send(page).waitFor({ timeout: 8000 })
    check(L('thumbnail preview of the chosen picture'), await page.locator('[data-testid=proof-panel] img').first().isVisible())
    await shot(page, tag, '2-picked')
    await send(page).click()
    check(L('uploading: card says UPLOADING'), await waitState(page, 'UPLOADING', 3000))
    check(L('uploading: progress bar shown'), await page.locator('[role=progressbar]').isVisible())
    check(L('uploading: send and choose are disabled, cancel is offered'),
      (await send(page).isDisabled()) && (await page.locator('[data-testid=proof-choose]').isDisabled()) && (await page.locator('[data-testid=proof-cancel]').isVisible()))
    await shot(page, tag, '3-uploading')
    check(L('upload ends in the WAITING card (from the server state)'), await waitState(page, 'WAITING', 8000))
    const toastSeen = await page.getByText(T['proof.toast.sent'], { exact: true }).first().isVisible()
    const buzzed = await page.evaluate(() => window.__vib.some((p) => Array.isArray(p) && p.length === 3))
    check(L('toast and haptic at the moment of success'), toastSeen && buzzed, `toast ${toastSeen}, haptic ${buzzed}`)
    await page.waitForTimeout(500)
    const post = world.posts[0]
    check(L('the picture was shrunk before sending (a few MB -> under 1.5 MB, JPEG)'), world.posts.length === 1 && post.size < 1.6 * MB && post.jpeg, JSON.stringify(post))
    const card = page.locator('[data-testid=payment-card]')
    check(L('waiting: success text'), (await card.innerText()).includes(T['proof.waiting.title']) && (await card.innerText()).includes(T['proof.waiting.body']))
    await page.locator('[data-testid=proof-thumb]').waitFor({ timeout: 5000 })
    check(L('waiting: time sent, thumbnail, checking indicator, replace option'),
      (await card.innerText()).match(/\d{1,2}:\d{2}/) !== null && (await page.locator('[data-testid=proof-thumb]').isVisible()) &&
        (await page.locator('[data-testid=proof-checking]').isVisible()) && (await page.locator('[data-testid=proof-replace]').isVisible()))
    check(L('aria-live announces the new state'), (await card.locator('[role=status][aria-live=polite]').first().innerText()).includes(T['proof.waiting.title']))
    check(L('no horizontal overflow'), (await overflowX(page)) <= 0, String(await overflowX(page)))
    if (lang === 'ur') {
      const thumbBox = await page.locator('[data-testid=proof-thumb]').boundingBox()
      check(L('RTL: the thumbnail sits at the reading start (right) side of its row'), !!thumbBox && thumbBox.x + thumbBox.width > size[0] / 2, JSON.stringify(thumbBox))
    }
    await shot(page, tag, '4-waiting')
    // reload while waiting: the server state is all it needs
    await page.reload()
    await page.locator('[data-testid=payment-card]').waitFor({ timeout: 15000 })
    check(L('reload while waiting: still WAITING, with time and thumbnail'), (await state(page)) === 'WAITING' && (await page.locator('[data-testid=proof-thumb]').isVisible()))
    await shot(page, tag, '5-waiting-after-reload')

    // polling: fast (5 s) in the first minute of waiting
    const before = world.gets.length
    await page.waitForTimeout(11500)
    const polls = world.gets.length - before
    check(L('polls about every 5 s while waiting (first minute)'), polls >= 2 && polls <= 3, `${polls} reads in 11.5 s`)

    // 2. rejected with a reason, then a new screenshot
    world.payment = { state: 'PAYMENT_PROBLEM', proofSentAt: world.payment.proofSentAt, rejectReason: 'The amount does not match your total.' }
    check(L('rejected: card moves by itself (polling)'), await waitState(page, 'REJECTED', 9000))
    const rejected = page.locator('[data-testid=payment-card]')
    check(L('rejected: reason shown prominently, with an "upload a new screenshot" button'),
      (await page.locator('[data-testid=proof-reject-reason]').innerText()).includes('The amount does not match') &&
        (await page.locator('[data-testid=proof-choose]').innerText()).includes(T['proof.rejected.cta']))
    check(L('rejected: announced to screen readers'), (await rejected.locator('[role=status][aria-live=polite]').first().innerText()).includes(T['proof.rejected.title']))
    await shot(page, tag, '6-rejected')
    await pickFile(page, files.photo)
    await send(page).waitFor({ timeout: 8000 })
    await send(page).click()
    check(L('rejected -> new proof -> WAITING again'), await waitState(page, 'WAITING', 8000))

    // 3. verified
    world.payment = { state: 'PAYMENT_CONFIRMED', proofSentAt: world.payment.proofSentAt, rejectReason: null }
    check(L('verified: card moves by itself'), await waitState(page, 'VERIFIED', 9000))
    check(L('verified: green confirmation text'), (await page.locator('[data-testid=payment-card]').innerText()).includes(T['proof.verified.title']))
    check(L('verified: haptic'), await page.evaluate(() => window.__vib.some((p) => Array.isArray(p) && p[0] === 20)))
    await shot(page, tag, '7-verified')
    await context.close()
  }

  // 4. a 10 MB photo
  {
    const { world, context, page } = await fresh()
    check(L('the test photo really is over 10 MB'), files.huge.buffer.length > 10 * MB, `${(files.huge.buffer.length / MB).toFixed(1)} MB`)
    await openStep2(page)
    await pickFile(page, files.huge)
    await send(page).waitFor({ timeout: 20000 })
    await send(page).click()
    check(L('10 MB photo: uploads and the card reaches WAITING'), await waitState(page, 'WAITING', 15000))
    check(L('10 MB photo: what was sent is small and JPEG'), world.posts.length === 1 && world.posts[0].size < 1.8 * MB && world.posts[0].jpeg, JSON.stringify(world.posts[0]))
    await context.close()
  }

  // 5. a non-image
  {
    const { world, context, page } = await fresh()
    await openStep2(page)
    await pickFile(page, files.text)
    await page.locator('[data-testid=proof-error]').waitFor({ timeout: 5000 })
    check(L('non-image: friendly error, nothing sent, still NEEDS_PAYMENT'),
      (await page.locator('[data-testid=proof-error]').innerText()).includes(T['proof.err.notImage']) && world.posts.length === 0 && (await state(page)) === 'NEEDS_PAYMENT')
    await shot(page, tag, '8-error-not-image')
    await context.close()
  }

  // 6. offline mid-upload: the picture is kept, never a false "sent", and Try again works once back online
  {
    const { world, context, page } = await fresh((w) => {
      w.upload = 'drop'
      w.uploadDelay = 1500
    })
    await openStep2(page)
    await pickFile(page, files.photo)
    await send(page).waitFor({ timeout: 8000 })
    await send(page).click()
    await waitState(page, 'UPLOADING', 3000)
    await context.setOffline(true)
    await page.locator('[data-testid=proof-error]').waitFor({ timeout: 8000 })
    check(L('offline mid-upload: says so, and is NOT "sent" (still NEEDS_PAYMENT)'),
      (await page.locator('[data-testid=proof-error]').innerText()).includes(T['proof.err.offline']) && (await state(page)) === 'NEEDS_PAYMENT')
    check(L('offline mid-upload: the picture is kept, with a Try again button'),
      (await page.locator('[data-testid=proof-panel] img').first().isVisible()) && (await page.locator('[data-testid=proof-retry]').isVisible()))
    await shot(page, tag, '9-error-offline')
    world.upload = 'ok'
    world.uploadDelay = 300
    await context.setOffline(false)
    await page.locator('[data-testid=proof-error]').filter({ hasText: T['proof.err.online'] }).waitFor({ timeout: 5000 }).catch(() => {})
    check(L('back online: the message offers to retry'), (await page.locator('[data-testid=proof-error]').innerText()).includes(T['proof.err.online']))
    await page.locator('[data-testid=proof-retry]').click()
    check(L('back online: Try again sends the kept picture'), await waitState(page, 'WAITING', 8000))
    await context.close()
  }

  // 7. a double tap sends once
  {
    const { world, context, page } = await fresh((w) => (w.uploadDelay = 1200))
    await openStep2(page)
    await pickFile(page, files.photo)
    await send(page).waitFor({ timeout: 8000 })
    await send(page).dblclick()
    await send(page).click({ force: true }).catch(() => {})
    await waitState(page, 'WAITING', 8000)
    check(L('double tap: exactly one upload'), world.posts.length === 1, `${world.posts.length} uploads`)
    await context.close()
  }

  // 8. cancel while uploading keeps the picture
  {
    const { context, page } = await fresh((w) => (w.uploadDelay = 3000))
    await openStep2(page)
    await pickFile(page, files.photo)
    await send(page).waitFor({ timeout: 8000 })
    await send(page).click()
    await waitState(page, 'UPLOADING', 3000)
    await page.locator('[data-testid=proof-cancel]').click()
    await page.waitForTimeout(400)
    check(L('cancel: back to the picked picture, ready to send again, nothing marked sent'),
      (await state(page)) === 'NEEDS_PAYMENT' && (await send(page).isEnabled()) && (await page.locator('[data-testid=proof-panel] img').first().isVisible()))
    await context.close()
  }

  // 9. rate limited (server's message) and a server refusal: both keep the picture and offer Try again
  for (const [mode, text] of [['rate', 'Too many requests, please try again later'], ['rejected', 'That image could not be read']]) {
    const { context, page } = await fresh((w) => (w.upload = mode))
    await openStep2(page)
    await pickFile(page, files.photo)
    await send(page).waitFor({ timeout: 8000 })
    await send(page).click()
    await page.locator('[data-testid=proof-error]').waitFor({ timeout: 8000 })
    const message = await page.locator('[data-testid=proof-error]').innerText()
    check(L(`${mode}: shows the server's message`), message.includes(text) && (mode !== 'rate' || message.includes(T['proof.err.rate'])), message.replace(/\n/g, ' | '))
    check(L(`${mode}: Try again keeps the picture, state stays NEEDS_PAYMENT`), (await page.locator('[data-testid=proof-retry]').isVisible()) && (await state(page)) === 'NEEDS_PAYMENT')
    if (mode === 'rate') await shot(page, tag, '10-error-rate-limited')
    await context.close()
  }

  // 10. never a dead end: nothing can be sent (9 MB it cannot decode): three ways out. 11. (2 MB it cannot decode: the original is sent.)
  {
    const { world, context, page } = await fresh()
    await openStep2(page)
    await pickFile(page, files.brokenBig)
    await page.locator('[data-testid=proof-stuck]').waitFor({ timeout: 10000 })
    const stuck = page.locator('[data-testid=proof-stuck]')
    check(L('stuck: friendly message with the way out, not a bare "too big"'), (await stuck.innerText()).includes(T['proof.stuck.title']) && (await stuck.innerText()).includes(T['proof.stuck.body']))
    check(L('stuck: nothing was sent and the card is still NEEDS_PAYMENT'), world.posts.length === 0 && (await state(page)) === 'NEEDS_PAYMENT')
    check(L('stuck path 1: pick a different screenshot'), await stuck.locator('[data-testid=proof-stuck-pick]').isVisible())
    const chooser = page.waitForEvent('filechooser', { timeout: 4000 })
    await stuck.locator('[data-testid=proof-stuck-pick]').click()
    check(L('stuck path 1: it opens the file chooser'), !!(await chooser.catch(() => null)))
    const wa = stuck.locator('[data-testid=proof-stuck-whatsapp]')
    const href = (await wa.getAttribute('href')) ?? ''
    check(L('stuck path 3: WhatsApp button with the shop number and the order message'), href.startsWith('https://wa.me/923001234567?text=') && href.includes('K7P2M'), href)
    check(L('stuck: no waiter option on an order with no table'), (await stuck.locator('[data-testid=proof-stuck-waiter]').count()) === 0)
    await shot(page, tag, '11-error-stuck')
    await context.close()
  }
  {
    const { world, context, page } = await fresh()
    await openStep2(page)
    await pickFile(page, files.brokenSmall)
    await send(page).waitFor({ timeout: 8000 })
    await send(page).click()
    check(L('compression broke but the file fits: the ORIGINAL is uploaded'), (await waitState(page, 'WAITING', 8000)) && world.posts.length === 1 && world.posts[0].size > 1.9 * MB, JSON.stringify(world.posts[0]))
    await context.close()
  }
}

// ---------- The waiter path (a table guest's share of the bill) ----------
async function waiterPath(browser, base) {
  const label = (text) => `390x844 table bill: ${text}`
  const world = makeServer()
  const { context, page } = await newPage(browser, [390, 844], 'en', world)
  await context.addInitScript((qr) => sessionStorage.setItem(`zoryx:table-token:${qr}`, 'A'.repeat(43)), QR)
  const share = { id: 'sh1', position: 1, label: 'Ali', guestId: 'g1', isMine: true, amount: '1550.00', status: 'UNPAID', method: 'ONLINE', cashRequested: false, rejectedReason: null }
  const poll = {
    version: 1, table: { name: 'Table 7', area: null },
    session: { status: 'OPEN', seatedAt: new Date().toISOString(), orderingOpen: true, closedReason: null },
    me: { guestId: 'g1', displayName: 'Ali', joinOrder: 1 }, guests: [{ id: 'g1', displayName: 'Ali', isMe: true }],
    rounds: [{ orderId: 'o1', orderNumber: 41, guestName: 'Ali', isMine: true, status: 'SERVED', cancelReason: null, createdAt: new Date().toISOString(), total: '1550.00', lines: [{ kind: 'item', lineId: 'l1', name: 'Zinger Burger', nameUr: null, size: null, addOns: [], quantity: 2, lineTotal: '1550.00', note: null, ownerGuestId: 'g1' }] }],
    myCalls: [], cooldowns: { orderSeconds: 0, callSeconds: 0 }, receiptKey: null,
    bill: { version: 1, status: 'REQUESTED', subtotal: '1550.00', discount: '0.00', total: '1550.00', splitMode: 'EQUAL', splitVersion: 1, canSplit: false, blockedReason: null, needsSplit: false, shares: [share], myClaims: [], sharedLines: [] },
  }
  const previous = world.handler
  world.handler = async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/online/table/session') return json(route, poll, 200, { etag: '"v1"' })
    if (path === '/api/online/table/menu') return json(route, { categories: [], items: [], deals: [] })
    if (path === `/api/online/table/${QR}`) return json(route, { table: poll.table, state: 'OPEN', requiresPin: false, orderingOpen: true, closedReason: null })
    return previous(route)
  }
  await page.unroute('http://localhost:5000/**')
  await page.route('http://localhost:5000/**', world.handler)
  await page.goto(`${base}/t/${QR}/bill`)
  const choose = page.locator('[data-testid=proof-choose]')
  try {
    await choose.waitFor({ timeout: 15000 })
  } catch {
    check(label('the share payment screen opened'), false, (await page.evaluate(() => document.body.innerText.slice(0, 160))).replace(/\n/g, ' | '))
    await context.close()
    return
  }
  await page.locator('input[type=file]').setInputFiles(files.brokenBig)
  const stuck = page.locator('[data-testid=proof-stuck]')
  await stuck.waitFor({ timeout: 10000 })
  check(label('stuck help offers the waiter'), await stuck.locator('[data-testid=proof-stuck-waiter]').isVisible())
  await stuck.locator('[data-testid=proof-stuck-waiter]').click()
  await page.waitForTimeout(600)
  const call = world.calls[0]
  check(label('call the waiter: a waiter call is created with the note'), !!call && call.type === 'OTHER' && call.note === 'Payment proof not uploading', JSON.stringify(call))
  check(label('call the waiter: the guest is told the waiter is coming'), await page.getByText(en['proof.stuck.waiterSent']).isVisible())
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/390x844-en-12-stuck-with-waiter.png` })
  await context.close()
}

// ---------- Run ----------
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5291, strictPort: false } })
await server.listen()
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
try {
  const only = process.env.ONLY // e.g. ONLY=768x1024-en runs just that screen
  for (const size of SIZES) for (const lang of Object.keys(LANGS)) if (!only || only === `${size.join('x')}-${lang}`) await scenarios(browser, base, size, lang)
  if (!only || only === 'waiter') await waiterPath(browser, base)
} finally {
  await browser.close()
  await server.close()
}
console.log(`\n${passed} passed, ${failures.length} failed`)
for (const failure of failures) console.log(` - ${failure}`)
process.exit(failures.length ? 1 : 0)
