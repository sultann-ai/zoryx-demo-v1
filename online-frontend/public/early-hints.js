// Starts the most important downloads before the app's JavaScript has even loaded. External + async because the
// CSP forbids inline scripts. Everything here is optional: if it does nothing, the app simply fetches later.
;(function () {
  var path = location.pathname
  var meta = document.querySelector('meta[name="api-origin"]')
  var api = meta ? meta.getAttribute('content') : ''
  function add(attrs) {
    var link = document.createElement('link')
    link.rel = 'preload'
    for (var key in attrs) link.setAttribute(key, attrs[key])
    document.head.appendChild(link)
  }
  // The fonts of the first screen, for the saved language (Urdu is the default). vite.config.ts writes their built URLs
  // into <meta name="font-preload-ur|en">; in dev there are no such tags and nothing happens.
  var lang = 'ur'
  try {
    if (localStorage.getItem('mc.lang') === 'en') lang = 'en'
  } catch {
    /* storage blocked: keep the default */
  }
  var fonts = document.querySelector('meta[name="font-preload-' + lang + '"]')
  var fontUrls = fonts ? (fonts.getAttribute('content') || '').split(' ') : []
  for (var i = 0; i < fontUrls.length; i++) {
    if (fontUrls[i]) add({ as: 'font', type: 'font/woff2', href: fontUrls[i], crossorigin: 'anonymous' })
  }
  // Data the page is certain to ask for first (the app's own fetch reuses these when the URL matches).
  if (api && (path === '/' || path === '/menu')) add({ as: 'fetch', href: api + '/api/online/store', crossorigin: 'anonymous' })
  if (api && path === '/menu') {
    add({ as: 'fetch', href: api + '/api/online/menu', crossorigin: 'anonymous' })
    add({ as: 'fetch', href: api + '/api/online/deals', crossorigin: 'anonymous' })
  }
})()
