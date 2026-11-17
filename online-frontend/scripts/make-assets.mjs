// One-off: derives every brand raster from src/brand/logo.svg and the colours in src/brand/brand.config.ts.
// Run with `npm run assets`; the outputs in public/ are committed, so the production build never needs sharp.
import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { brand } from '../src/brand/brand.config.ts'

const { action, 'on-action': onAction, canvas, promo } = brand.theme
const svg = (await readFile('src/brand/logo.svg', 'utf8')).replaceAll('__ACTION__', action).replaceAll('__ON_ACTION__', onAction).replaceAll('__PROMO__', promo)
const render = (size, density = 384) => sharp(Buffer.from(svg), { density }).resize(size, size)

await mkdir('public', { recursive: true })

// Favicons and app icons
await render(32).png().toFile('public/favicon.png')
await render(192).png().toFile('public/icon-192.png')
await render(512).png().toFile('public/icon-512.png')
const ico = await render(48).png().toBuffer()
// A PNG-in-ICO container (supported by every current browser)
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
header.writeUInt8(48, 6); header.writeUInt8(48, 7); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12)
header.writeUInt32LE(ico.length, 14); header.writeUInt32LE(22, 18)
await writeFile('public/favicon.ico', Buffer.concat([header, ico]))

// Maskable icon: the logo inside the 80% safe zone on a full-bleed action-colour square
const mark = await render(410).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 3, background: action } })
  .composite([{ input: mark, gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile('public/icon-maskable-512.png')

// Open Graph card 1200x630: the logo on the canvas colour
const og = await render(360).png().toBuffer()
await sharp({ create: { width: 1200, height: 630, channels: 3, background: canvas } })
  .composite([{ input: og, gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile('public/og-image.png')

// A web manifest so the maskable icon is actually offered to Android
await writeFile(
  'public/site.webmanifest',
  JSON.stringify(
    {
      name: `${brand.nameEn} — ${brand.taglineEn}`,
      short_name: brand.nameEn,
      start_url: '/',
      display: 'standalone',
      background_color: canvas,
      theme_color: action,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ) + '\n',
)

console.log('assets written')
