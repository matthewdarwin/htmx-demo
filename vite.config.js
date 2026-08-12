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

export default defineConfig({
  plugins: [includePartials(), redirectProxy()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        404: resolve(import.meta.dirname, '404.html'),
        feedback: resolve(import.meta.dirname, 'feedback/index.html'),
        faq: resolve(import.meta.dirname, 'faq/index.html'),
        location: resolve(import.meta.dirname, 'location/index.html'),
        volunteer: resolve(import.meta.dirname, 'volunteer/index.html'),
        tour: resolve(import.meta.dirname, 'tour/index.html'),
        history: resolve(import.meta.dirname, 'history/index.html'),
        'history-shows-by-name': resolve(
          import.meta.dirname,
          'history/shows_by_name.html',
        ),
        'history-shows-by-date': resolve(
          import.meta.dirname,
          'history/shows_by_date.html',
        ),
        'history-gallery': resolve(
          import.meta.dirname,
          'history/gallery.html',
        ),
        member: resolve(import.meta.dirname, 'member/index.html'),
        giftcertificates: resolve(
          import.meta.dirname,
          'giftcertificates/index.html',
        ),
      },
    },
  },
})
