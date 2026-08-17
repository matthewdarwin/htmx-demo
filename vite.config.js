import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { defineConfig } from 'vite'

const siteUrl = 'https://testdemo.familycinema.ca'
const pagesRoot = resolve(import.meta.dirname, 'pages')

// The same page list build.rollupOptions.input needs, keyed the way Rollup
// wants (name -> absolute entry path) — defined once here so the sitemap
// plugin below reads it instead of carrying its own separately-maintained
// copy that could silently drift out of sync as pages are added/removed.
const pageEntries = {
  index: resolve(pagesRoot, 'index.html'),
  404: resolve(pagesRoot, '404.html'),
  announcements: resolve(pagesRoot, 'announcements/index.html'),
  feedback: resolve(pagesRoot, 'feedback/index.html'),
  faq: resolve(pagesRoot, 'faq/index.html'),
  location: resolve(pagesRoot, 'location/index.html'),
  volunteer: resolve(pagesRoot, 'volunteer/index.html'),
  tour: resolve(pagesRoot, 'tour/index.html'),
  history: resolve(pagesRoot, 'history/index.html'),
  'history-shows-by-name': resolve(pagesRoot, 'history/shows_by_name.html'),
  'history-shows-by-date': resolve(pagesRoot, 'history/shows_by_date.html'),
  'history-gallery': resolve(pagesRoot, 'history/gallery.html'),
  member: resolve(pagesRoot, 'member/index.html'),
  giftcertificates: resolve(pagesRoot, 'giftcertificates/index.html'),
  birthdays: resolve(pagesRoot, 'birthdays/index.html'),
  register: resolve(pagesRoot, 'register/index.html'),
  recover: resolve(pagesRoot, 'recover/index.html'),
  login: resolve(pagesRoot, 'login/index.html'),
  'login-link': resolve(pagesRoot, 'login-link/index.html'),
  logout: resolve(pagesRoot, 'logout/index.html'),
  account: resolve(pagesRoot, 'account/index.html'),
  'account-password': resolve(pagesRoot, 'account/password/index.html'),
  'account-name': resolve(pagesRoot, 'account/name/index.html'),
  'account-communication': resolve(
    pagesRoot,
    'account/communication/index.html',
  ),
  'account-membership': resolve(pagesRoot, 'account/membership/index.html'),
  'account-membership-new': resolve(
    pagesRoot,
    'account/membership/new/index.html',
  ),
  'account-membership-edit': resolve(
    pagesRoot,
    'account/membership/edit/index.html',
  ),
  'account-membership-share': resolve(
    pagesRoot,
    'account/membership/share/index.html',
  ),
  'account-membership-delete': resolve(
    pagesRoot,
    'account/membership/delete/index.html',
  ),
  'account-membership-buy': resolve(
    pagesRoot,
    'account/membership/buy/index.html',
  ),
  'account-cart': resolve(pagesRoot, 'account/cart/index.html'),
  'account-cart-pay': resolve(pagesRoot, 'account/cart/pay/index.html'),
  'account-snacks-buy': resolve(pagesRoot, 'account/snacks/buy/index.html'),
  'account-donation-buy': resolve(pagesRoot, 'account/donation/buy/index.html'),
  'account-tickets-buy': resolve(pagesRoot, 'account/tickets/buy/index.html'),
  'account-volunteer': resolve(pagesRoot, 'account/volunteer/index.html'),
  'account-volunteer-new': resolve(
    pagesRoot,
    'account/volunteer/new/index.html',
  ),
}

// Inlines <!--#include name.html --> markers with the contents of the
// matching file under public/, at build time and in dev (transformIndexHtml
// runs on every request, so edits to the partial show up on reload).
function includePartials() {
  return {
    name: 'include-partials',
    transformIndexHtml(html) {
      return html.replace(/<!--#include\s+([\w.-]+)\s*-->/g, (_, name) =>
        readFileSync(resolve(import.meta.dirname, 'public', name), 'utf-8'),
      )
    },
  }
}

// Mirrors the production nginx rule for /redirect/*, which isn't present in
// local dev/preview: /redirect/x.y.z/abc -> https://x.y.z/abc (the host and
// path after the prefix are used verbatim, query string included).
function redirectProxy() {
  const middleware = (req, res, next) => {
    if (req.url?.startsWith('/redirect/')) {
      const target = `https://${req.url.slice('/redirect/'.length)}`
      res.writeHead(302, { Location: target })
      res.end()
      return
    }
    next()
  }
  return {
    name: 'redirect-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// Generates dist/sitemap.xml from pageEntries at build time (not maintained
// by hand) so it can't go stale the way a static file would as pages get
// added or removed. 404.html is excluded — it's an error page, not content
// a search engine should index. No <lastmod>: this is a static demo with
// no real per-page modification tracking, and a fabricated date is worse
// than omitting it.
function sitemap() {
  return {
    name: 'sitemap',
    apply: 'build',
    closeBundle() {
      const urls = Object.values(pageEntries)
        .map((absPath) => relative(pagesRoot, absPath).replaceAll('\\', '/'))
        .filter((relPath) => relPath !== '404.html')
        .map((relPath) => {
          if (relPath === 'index.html') return `${siteUrl}/`
          if (relPath.endsWith('/index.html')) {
            return `${siteUrl}/${relPath.slice(0, -'index.html'.length)}`
          }
          return `${siteUrl}/${relPath}`
        })

      const body = urls
        .map((url) => `  <url>\n    <loc>${url}</loc>\n  </url>`)
        .join('\n')
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`

      writeFileSync(resolve(import.meta.dirname, 'dist/sitemap.xml'), xml)
    },
  }
}

// Generated (rather than a static public/robots.txt) so siteUrl has exactly
// one home in the whole repo — the Sitemap: directive must be a
// fully-qualified URL per the sitemap protocol spec (unlike Allow/Disallow,
// it can't be relative), so without this the domain would be hard-coded
// here *and* in the sitemap plugin above, free to drift apart.
function robotsTxt() {
  return {
    name: 'robots-txt',
    apply: 'build',
    closeBundle() {
      const contents = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
      writeFileSync(resolve(import.meta.dirname, 'dist/robots.txt'), contents)
    },
  }
}

// Mirrors the production nginx rule for /api/*, which proxies it straight
// through to the real backend — not present in local dev/preview, so pages
// fetch this the same relative "/api/..." way in every environment instead
// of hard-coding the upstream host (and dodging CORS/htmx's cross-origin
// checks entirely, since the request never leaves the current origin).
const apiProxy = {
  '/api': {
    target: 'https://www.familycinema.ca',
    changeOrigin: true,
  },
}

export default defineConfig({
  root: resolve(import.meta.dirname, 'pages'),
  publicDir: resolve(import.meta.dirname, 'public'),
  resolve: {
    alias: {
      '/src': resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: [includePartials(), redirectProxy(), sitemap(), robotsTxt()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: pageEntries,
    },
  },
})
