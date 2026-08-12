# htmx-demo

A static multi-page demo site built with [Vite](https://vite.dev),
[htmx](https://htmx.org), and [Bulma](https://bulma.io). It mirrors the
structure and content of https://www.familycinema.ca — most pages pull
their real content live from that site's public `/api/*` endpoints
(via htmx or `fetch`) instead of hard-coding it, rather than being a
from-scratch demo. It also doubles as a demo of htmx patterns: loading
fragments on page load, cross-origin requests, and a form submission
that swaps in a confirmation without a page reload.

## Development

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`.

## Production build

```bash
npm run build   # runs a spellcheck (cspell) first, then `vite build`
npm run preview # serve the built dist/ locally, on http://localhost:4173
```

## Project structure

```
pages/            # page source — one directory per URL, e.g. pages/faq/index.html serves at /faq/
public/           # static passthrough assets: header.html/footer.html includes,
                   # htmx-loaded fragments, the MapLibre worker files, CNAME, .nojekyll
src/              # main.js and style.css, bundled by Vite
vite.config.js    # multi-page build config, build-time include mechanism,
                   # local dev/preview stand-ins for production nginx behavior
cspell.json       # spellcheck word list (proper nouns, brand names, etc.)
.github/workflows/deploy.yml  # publishes dist/ to GitHub Pages on push to main
```

Pages: home, feedback, FAQ, theatre location (with a live map), volunteer
info, theatre tour, cinema history (plus show-history-by-name/date and a
poster gallery), memberships, gift certificates, upcoming shows, and
birthday parties — plus a custom 404 page.

## Notable pieces

- **Light/dark theme**, following the OS preference by default with a
  manual toggle in the navbar (persisted in `localStorage`).
- **Live content**: several pages fetch their actual content from
  familycinema.ca's API rather than hard-coding it — see `AGENT.md` for
  the two patterns used and the CORS/htmx quirks involved.
- **A real map** (MapLibre GL JS, styled via Mapbox) on the location page.
- **Deployed to GitHub Pages** at a custom subdomain, sitting behind an
  nginx reverse proxy that also handles the site's click-tracking
  redirects and API routing — see `AGENT.md` for the full picture and
  the local dev stand-ins for that nginx behavior.

For implementation details, gotchas, and the reasoning behind the less
obvious decisions in this codebase, see [`AGENT.md`](./AGENT.md).
