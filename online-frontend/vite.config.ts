import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import site from './site.config.json' with { type: 'json' }
import { brand } from './src/brand/brand.config.ts'

// HTML-escape a brand string before it goes into index.html (the tagline contains an ampersand).
const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

// Swaps %SITE_URL% in index.html, robots.txt and sitemap.xml for VITE_SITE_URL at build time,
// so no domain is hard-coded anywhere.
function siteUrl(url: string, apiUrl: string): Plugin {
  const clean = url.replace(/\/+$/, '')
  const apiOrigin = (() => {
    try {
      return new URL(apiUrl).origin
    } catch {
      return ''
    }
  })()
  return {
    name: 'site-url',
    buildStart() {
      // The CSP in vercel.json must allow the API origin, or every API call and image is blocked in production.
      try {
        const csp = JSON.stringify(JSON.parse(readFileSync('vercel.json', 'utf8')))
        if (apiOrigin && !csp.includes(apiOrigin)) {
          this.warn(`vercel.json's Content-Security-Policy does not list the API origin ${apiOrigin}. Update connect-src and img-src (see README).`)
        }
      } catch {
        /* no vercel.json: nothing to check */
      }
    },
    transformIndexHtml: (html) =>
      html
        .replaceAll('%SITE_URL%', clean)
        .replaceAll('%API_ORIGIN%', apiOrigin)
        .replaceAll('%THEME_COLOR%', brand.theme.action)
        .replaceAll('%BRAND_NAME_EN%', esc(brand.nameEn))
        .replaceAll('%BRAND_NAME_UR%', esc(brand.nameUr))
        .replaceAll('%BRAND_OWNER_UR%', esc(brand.ownerUr))
        .replaceAll('%BRAND_TAGLINE_EN%', esc(brand.taglineEn))
        .replaceAll('%BRAND_TAGLINE_UR%', esc(brand.taglineUr))
        .replaceAll('%SHOP_PHONE_TEL%', site.phone.replace(/[^\d+]/g, ''))
        .replaceAll('%SHOP_PHONE%', site.phone),
    closeBundle: {
      order: 'post',
      async handler() {
        const { readFile, writeFile } = await import('node:fs/promises')
        for (const name of ['robots.txt', 'sitemap.xml']) {
          const file = `dist/${name}`
          try {
            await writeFile(file, (await readFile(file, 'utf8')).replaceAll('%SITE_URL%', clean))
          } catch {
            /* file missing: nothing to template */
          }
        }
      },
    },
  }
}

// The fonts the first screen paints with, per page language. Their built (hashed) URLs go into index.html as
// <meta name="font-preload-ur|en">, and public/early-hints.js preloads the set for the visitor's saved language, so the
// text does not wait for the CSS to be parsed before the font download starts (and English visitors never fetch the
// 100 KB Nastaliq face early, nor Urdu visitors the Latin ones).
const firstScreenFonts = {
  ur: [/noto-nastaliq-urdu-400-[^/]*\.woff2$/],
  en: [/dm-sans-latin-400-normal-[^/]*\.woff2$/, /dm-sans-latin-700-normal-[^/]*\.woff2$/, /bricolage-grotesque-latin-800-normal-[^/]*\.woff2$/],
}
function fontPreloads(): Plugin {
  return {
    name: 'font-preloads',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {})
        return (Object.keys(firstScreenFonts) as (keyof typeof firstScreenFonts)[]).map((lang) => {
          const urls = firstScreenFonts[lang].map((pattern) => {
            const file = files.find((name) => pattern.test(name))
            if (!file) throw new Error(`font-preloads: no built font matches ${pattern} (were the font imports in index.css changed?)`)
            return `/${file}`
          })
          return { tag: 'meta', attrs: { name: `font-preload-${lang}`, content: urls.join(' ') }, injectTo: 'head' as const }
        })
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), siteUrl(env.VITE_SITE_URL || 'https://zoryx.dev', env.VITE_API_URL || ''), fontPreloads()],
    build: { sourcemap: false },
  }
})
