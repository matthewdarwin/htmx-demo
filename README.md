# htmx-demo

A static multi-page demo site built with [Vite](https://vite.dev),
[htmx](https://htmx.org), and [Bulma](https://bulma.io). It mirrors the
structure and content of https://www.familycinema.ca — every content page
pulls its real content live from that site's `/api/*` endpoints via htmx
instead of hard-coding it, rather than being a from-scratch demo. It also
doubles as a demo of htmx patterns: loading fragments on page load, form
submissions that swap in a result without a page reload, and reacting to
both success and failure responses from the server.

## Development

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`.

## Production build

```bash
npm run build    # spellcheck, format check, lint, then `vite build`
npm run format   # auto-fix formatting (Prettier)
npm run lint     # ESLint
npm run preview  # serve the built dist/ locally, on http://localhost:4173
```

## Project structure

```
pages/            # page source — one directory per URL, e.g. pages/faq/index.html serves at /faq/
public/           # static passthrough assets: header.html/footer.html includes,
                   # CNAME, .nojekyll
                   # (robots.txt and sitemap.xml are generated at build time, not stored here)
src/              # main.js and style.css, bundled by Vite
vite.config.js    # multi-page build config, build-time include mechanism,
                   # sitemap.xml/robots.txt generation, local dev/preview
                   # stand-ins for production nginx behavior
cspell.json       # spellcheck word list (proper nouns, brand names, etc.)
.prettierrc.json / .prettierignore  # formatting config
eslint.config.js  # lint config
.github/workflows/deploy.yml  # publishes dist/ to GitHub Pages on push to main
.github/workflows/ci.yml      # runs the build (spellcheck/format/lint) on every pull request
.github/dependabot.yml        # weekly dependency update PRs (npm + GitHub Actions)
```

Pages: home (with a live promo carousel and announcement headline),
feedback, account registration, account recovery, announcements, FAQ,
theatre location (with a live map), volunteer info, theatre tour, cinema
history (plus show-history-by-name/date and a poster gallery),
memberships, gift certificates, upcoming shows, and birthday parties —
plus a custom 404 page.

## Notable pieces

- **Light/dark theme**, following the OS preference by default with a
  manual toggle in the navbar (persisted in `localStorage`) — an
  icon-only version of the same toggle sits next to the burger menu on
  small/medium screens.
- **Live content**: every content page fetches its actual HTML fragment
  from familycinema.ca's `/api/*` rather than hard-coding it — see
  `AGENT.md` for the pattern and the local dev/preview proxy that stands
  in for it.
- **Write-path forms** (feedback, account registration, account
  recovery): submit via htmx to `/api/*.html`, and read an
  `X-Form-Result: ok`/`error` response header to decide whether to hide
  the form (success) or leave it up so the user can fix the problem and
  resubmit (failure) — see `AGENT.md` for the full convention, including
  handling a server error or an unreachable server, not just a
  validation failure.
- **A real map** (MapLibre GL JS, styled via Mapbox) on the location page.
- **Deployed to GitHub Pages** at a custom subdomain, sitting behind an
  nginx reverse proxy that also handles the site's click-tracking
  redirects and API routing — see `AGENT.md` for the full picture and
  the local dev stand-ins for that nginx behavior.
- **Automated maintenance**: Dependabot opens weekly PRs for outdated
  dependencies (npm and GitHub Actions), a required CI check runs the
  full build (spellcheck, formatting, linting) on every pull request, and
  branch protection on `main` requires it to pass before merging.
  Dependabot alerts and secret scanning are also enabled at the repo
  level.

For implementation details, gotchas, and the reasoning behind the less
obvious decisions in this codebase, see [`AGENT.md`](./AGENT.md).
