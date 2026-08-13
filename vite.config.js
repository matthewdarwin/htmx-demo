import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

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
    if (req.url && req.url.startsWith('/redirect/')) {
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
  plugins: [includePartials(), redirectProxy()],
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
      input: {
        index: resolve(import.meta.dirname, 'pages/index.html'),
        404: resolve(import.meta.dirname, 'pages/404.html'),
        feedback: resolve(import.meta.dirname, 'pages/feedback/index.html'),
        faq: resolve(import.meta.dirname, 'pages/faq/index.html'),
        location: resolve(import.meta.dirname, 'pages/location/index.html'),
        volunteer: resolve(
          import.meta.dirname,
          'pages/volunteer/index.html',
        ),
        tour: resolve(import.meta.dirname, 'pages/tour/index.html'),
        history: resolve(import.meta.dirname, 'pages/history/index.html'),
        'history-shows-by-name': resolve(
          import.meta.dirname,
          'pages/history/shows_by_name.html',
        ),
        'history-shows-by-date': resolve(
          import.meta.dirname,
          'pages/history/shows_by_date.html',
        ),
        'history-gallery': resolve(
          import.meta.dirname,
          'pages/history/gallery.html',
        ),
        member: resolve(import.meta.dirname, 'pages/member/index.html'),
        giftcertificates: resolve(
          import.meta.dirname,
          'pages/giftcertificates/index.html',
        ),
        shows: resolve(import.meta.dirname, 'pages/shows/index.html'),
        birthdays: resolve(import.meta.dirname, 'pages/birthdays/index.html'),
      },
    },
  },
})
