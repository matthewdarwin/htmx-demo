# AGENT.md

Working notes for anyone (human or agent) picking up this repo. This is a
Vite + htmx + Bulma static site that mirrors the structure and content of
https://www.familycinema.ca — most pages pull their real content live from
that site's `/api/*` endpoints rather than hard-coding it, and the goal has
generally been to match the reference site's look, URLs, and behavior
unless there's a good reason to diverge.

## Project layout

Page source lives under `pages/`, not the project root — `vite.config.js`
sets `root: 'pages'` so that page URLs stay clean (`/feedback/`, not
`/pages/feedback/`) without needing a manual post-build move step. Three
things fall out of that and are already handled, but matter if you ever
touch `vite.config.js`:

- **`publicDir` and `build.outDir` are pinned back to the top-level
  `public/` and `dist/`** (as absolute paths) — both default to
  paths *relative to `root`*, so without this they'd silently look for
  `pages/public/` and write to `pages/dist/` instead.
- **`resolve.alias` maps `/src` to the real top-level `src/` directory.**
  Every page's `<script type="module" src="/src/main.js">` is an
  absolute path, and Vite resolves those relative to `root` — without the
  alias, that script tag 404s on every single page once `root` isn't the
  project root anymore. If you ever need another absolute reference to
  something outside `pages/` (not already under `public/`), it'll need the
  same alias treatment.
- **Every HTML entry in `build.rollupOptions.input` must resolve to a path
  inside `pages/`.** Rollup computes each page's output filename as the
  input path relative to `root`; a page living outside `root` produces a
  `../`-escaping relative path and the build fails outright (not a silent
  wrong-URL bug — you'll see it immediately).

**`pages/` vs `public/` is a "what does Vite do with this file" split, not
just a location.** `pages/*.html` are full documents and Vite build
entries — each gets the `<!--#include-->` treatment, its `<script
src="/src/main.js">` bundled, etc. — meant to be navigated to directly.
Anything meant to be served byte-for-byte with zero processing goes in
`public/` instead: `public/header.html`/`public/footer.html` (the include
partials themselves), and `public/meta-og.html` (Open Graph `<meta>` tags
plus the reference site's `Organization`/`LocalBusiness` JSON-LD, included
into `<head>` — currently just the homepage, via `<!--#include
meta-og.html -->`).

## Adding a new page

1. Create `pages/<name>/index.html` (directory + `index.html`, not
   `<name>.html`) so it serves at the clean `/name/` URL. A few pages
   under `pages/history/` are flat files instead (`shows_by_name.html`
   etc.) specifically to match the reference site's exact SEO paths —
   that's the only reason to break the directory convention.
2. **Register it in `vite.config.js`'s `rollupOptions.input`, pointing at
   the `pages/...` path.** Vite won't build a page that isn't listed
   there, even though `npm run dev` will happily serve it from source.
   This is the single most common thing to forget.
3. Start the file with `<!--#include header.html -->` right after `<body>`
   and `<!--#include footer.html -->` before the closing `</main>`/before
   the `<script>` tag. These are inlined at build/dev time by the
   `includePartials` plugin in `vite.config.js`, which reads the matching
   file from `public/`. It's a plain string replace on `<!--#include
   name.html -->`, not real templating — keep marker names matching an
   actual `public/*.html` file.
4. Use `<section class="hero is-primary">` for the page hero, not
   `is-link`. `is-primary` is themed to match the navbar's custom blue;
   `is-link` uses Bulma's separate, unthemed default blue and visibly
   clashes with the navbar sitting right above it.
5. If linking to it from the nav, update `public/header.html` (and
   `public/footer.html` if it belongs in the footer list) to point at the
   local path instead of the external `familycinema.ca` URL. Both files are
   shared across every page via the include mechanism — edit once.
6. Run `npm run build` before considering it done — it runs `cspell` first
   (see below) and will fail loudly on both typos and missing pages.

## Content sourcing

Several pages load their real content live from `/api/*` instead of
hard-coding it, using one of two patterns:

- **HTML fragments** (tour, history, member, giftcertificates): plain htmx —
  `hx-get="/api/whatever.html" hx-trigger="load" hx-swap="innerHTML"` on a
  container div with a `<progress>` placeholder inside. No JS needed.
- **JSON lists** (FAQ, volunteer): `loadAccordionList(elementId, apiUrl,
  errorMessage)` in `src/main.js` — a small reusable helper that fetches
  JSON and renders each `{title, name, detail}` item as a `<details
  class="box">` accordion entry. Reuse this helper for any new JSON-backed
  list rather than duplicating the fetch/render logic.

The feedback (`/feedback/`, `hx-post="/api/feedback.html"`) and register
(`/register/`, `hx-post="/api/account_new.html"`) forms are the write
paths: field `name`s are dictated by the real server (`realname`,
`membership`, `email`, `comments`, `check` for feedback; `login`, `name`,
`send_announcement`, `send_promo`, `send_schedule`, `check` for register),
not by what reads nicely in markup, since they're form-encoded straight
through to production. Neither has client-side validation — including the
`check` (human/year check) field on both — because the response HTML
already says exactly what was wrong; duplicating that logic client-side
would just be a second place for it to drift out of sync.

Both forms share the exact same result-handling behavior via
`setupResultForm(formId, messageId)` in `main.js` — add any future
form-processing `/api/*` endpoint to this same helper rather than
hand-rolling the wiring again. On response, it swaps the result into the
message target and hides the form (`htmx:afterSwap`, keyed off that
target's id) — but only on success, so a validation failure leaves the
form up to fix and resubmit rather than stranding the user with no way
back to it. Success/failure is read from an `X-Form-Result: ok`/`error`
response header, read directly with no client-side sniffing of the
message HTML.

**A server error gets no `htmx:afterSwap` at all**, by design: htmx's
default `responseHandling` treats 4xx/5xx as `swap: false`, so nothing
above ever runs. Without separate `htmx:responseError` (bad response) and
`htmx:sendError` (request never got a response — network down) handlers,
a 500 or an unreachable server is completely silent: button re-enables,
nothing else happens, no indication anything went wrong. Both are handled
by writing a generic error message directly into the message target
(there's no server HTML to reuse in this case) while leaving the form
visible, same as a validation failure.

**`/api/*` is always requested relative to the current page, never as a
hard-coded `https://www.familycinema.ca/...` URL.** In production this
matches nginx on `testdemo.familycinema.ca`, which proxies `/api/*`
straight through (see "Deployment"). Locally there's no nginx, so
`vite.config.js`'s `server.proxy`/`preview.proxy` (`apiProxy`) forwards
`/api/*` to `https://www.familycinema.ca` for both `npm run dev` and `npm
run preview`, the same way `redirectProxy` stands in for nginx's
`/redirect/*` rule. Because the request never leaves the current origin
(the browser only ever sees `/api/...`), htmx's default cross-origin block
(`htmx.config.selfRequestsOnly`) and CORS never come into play at all —
there's no client-side allowlist or preflight to work around, and no
`Access-Control-Allow-Headers` requirement on the upstream server.

Links inside fetched content that point at `/redirect/host/path` are the
site's click-tracking mechanism (nginx rewrites them to `https://host/path`
in production/on the proxy domain — see "Deployment" below). They're left
untouched when fragments are inserted; don't try to rewrite them client-side.

## Styling (`src/style.css`)

Bulma 1.0.4, with a light/dark theme layered on top via semantic custom
properties: `--brand-surface` (navbar/hero background), `--brand-accent`
(title/card-header/footer-link text color), `--page-background`,
`--footer-background`. Light values live at `:root`; dark values are
duplicated under both `@media (prefers-color-scheme: dark) {
:root:not([data-theme="light"]) {...} }` and `[data-theme="dark"] {...}` —
the former handles OS preference, the latter the manual toggle (see below).
Use these tokens for anything theme-dependent rather than hardcoding a
color, and give any new token both a light and dark value.

**The single biggest CSS gotcha in this codebase:** Bulma 1.x components
frequently re-declare their own default value for a custom property
directly on their own selector — e.g. `.navbar { --bulma-navbar-background-color:
var(--bulma-scheme-main); }`. That shadows anything set at `:root`, because
inheritance only kicks in when an element has *no* matching rule for that
property at all. If a `:root` override silently does nothing, this is why —
override on the same selector Bulma uses (`.navbar { --bulma-navbar-background-color:
... }`), not `:root`. This has bitten navbar colors, burger color, title
color, card-header color, and footer background so far; assume any new
Bulma color override needs the same treatment.

The `--bulma-primary-h/s/l` override at `:root` *does* need `!important` —
that one has no more-specific competing selector, only competing `:root`
declarations inside Bulma's own dark-mode media query, which a CSS
minifier can reorder relative to ours. Don't add `!important` elsewhere by
default though — it beat a legitimate, more-specific contextual override
once (`.hero.is-link .title`) and caused a real regression.

**Dark/light toggle:** manual override via `document.documentElement`'s
`data-theme` attribute, set by the button(s) in `public/header.html` /
handled in `src/main.js`, persisted to `localStorage`. There's a small
synchronous inline `<script>` at the very top of `header.html` (before the
`<nav>`) that applies the stored theme immediately, specifically to avoid a
flash of the wrong theme before the deferred module script runs. There are
two toggle buttons — `#theme-toggle` (icon + label, in the collapsible
menu) and `#theme-toggle-mobile` (icon only, next to the burger on
small/medium screens) — `main.js` keeps both in sync regardless of which
one is clicked.

**Another Bulma breakpoint gotcha:** `$navbar-breakpoint` (where the
burger hides and the full menu shows) defaults to *desktop*, 1024px — not
*tablet*, 769px, despite "tablet" being the more natural-sounding match
for "mobile nav collapses." Anything meant to show/hide in lockstep with
the burger (like `#theme-toggle-mobile`'s wrapper) needs `is-hidden-desktop`/
`is-hidden-touch`, not `is-hidden-tablet` — using the tablet-breakpoint
helper left a ~769–1023px gap where the burger showed but the element
didn't, which also broke that element's `margin-left: auto` (see below)
since it wasn't there to claim the free space, leaving the burger
sitting wherever normal flow put it instead of pushed to the right.

## MapLibre / Mapbox (location page)

- MapLibre GL JS's worker script has its own internal relative import to a
  "shared" chunk. Vite can't see through a `?url` import to also bundle
  that second file, so the worker 404s if you try the obvious approach.
  Fix: both files are self-hosted verbatim under `public/maplibre/` (copied
  from `node_modules/maplibre-gl/dist/`), referenced by a fixed path rather
  than a Vite-processed import. If `maplibre-gl` gets upgraded, re-copy
  both files from the new version's `dist/`.
- The Mapbox access token is chosen at runtime in `main.js` based on
  `location.hostname`: the production token (restricted by Mapbox's own URL
  allowlist to `familycinema.ca` subdomains) everywhere except `localhost`,
  where an unrestricted token is used instead so local dev/preview still
  renders tiles. If a new deployment hostname needs the map to work, it
  needs to be added to the production token's allowlist in the Mapbox
  dashboard — that's an external, manual step, not something fixable here.
- Dev and preview ports are pinned (`strictPort: true`, 5173/4173) in
  `vite.config.js` specifically so they stay stable — the unrestricted
  token's own allowlist is keyed to those exact origins.

## Spellcheck gate

`npm run build` runs `npm run spellcheck` (cspell) first and fails the
build on typos. Legitimate but non-dictionary words — brand names, Bulma
class names, base64 token substrings, etc. — go in `cspell.json`'s `words`
list rather than being ignored some other way. Requires Node ≥22.18 (see
CI note below).

## Deployment

Static build published to GitHub Pages via `.github/workflows/deploy.yml`
(triggers on push to `main`), served at the custom domain
`testdemostatic.familycinema.ca` (`public/CNAME`). The real public-facing
domain is `testdemo.familycinema.ca`, which runs nginx that:

- proxies ordinary page requests through to `testdemostatic.familycinema.ca`
  (this now includes `/robots.txt` — it was briefly overridden by nginx
  serving the real familycinema.ca's own robots.txt instead, but that's
  since been fixed on the nginx side),
- handles `/redirect/*` itself (the click-tracking mechanism mentioned
  above — `/redirect/x.y.z/abc` → `302` to `https://x.y.z/abc`),
- and handles `/api/*` itself.

None of that nginx logic exists in the static build — locally, `/redirect/*`
is instead handled by a small Vite plugin (`redirectProxy` in
`vite.config.js`) that runs in `configureServer`/`configurePreviewServer`
only, and `/api/*` by Vite's built-in `server.proxy`/`preview.proxy`
(`apiProxy`, same file), so `npm run dev`/`npm run preview` behave like the
real deployment without needing nginx locally.

CI note: the workflow pins Node 22 (`actions/setup-node`) — cspell 10.x
requires ≥22.18, and the default `ubuntu-latest` Node (20) fails the build
step with a version error if this ever gets reverted.

`pages/404.html` (built to `dist/404.html`, at the *output* root — GitHub
Pages requires it there, regardless of where the source lives) is GitHub
Pages' own convention: auto-served, with a real `404` status, for any
unmatched path, on custom domains too. No server config needed for that
one. It mirrors the reference site's 404 page, filling in the missing path
client-side via `location.pathname` since there's no server-side rendering
available.

`dist/sitemap.xml` and `dist/robots.txt` are both generated at build time
(the `sitemap`/`robotsTxt` plugins in `vite.config.js`) rather than
hand-maintained as static `public/` files. The sitemap is keyed off
`pageEntries` — the same object `build.rollupOptions.input` uses — so
adding or removing a page can't leave it stale; `404.html` is deliberately
excluded (it's an error page, not indexable content), and there's no
`<lastmod>` since nothing here tracks real per-page modification times.
`robots.txt`'s `Sitemap:` line is built from the same `siteUrl` constant
the sitemap plugin uses — generating it, rather than hard-coding the line
into a static file, keeps the domain in exactly one place (the sitemap
protocol requires `Sitemap:` to be a fully-qualified absolute URL, unlike
`Allow`/`Disallow`, so it can't just be relative instead). Note the
reference site has neither a sitemap nor a `Sitemap:` line in its own
`robots.txt` — nothing to mirror here, this is just standard practice for
a real site being added on top of it.

## Local testing notes

- **zsh gotcha:** never use `path` as a shell loop variable name
  (`for path in ...`) — it's a special array tied to `$PATH` in zsh, and
  assigning to it clobbers the actual `PATH` for the rest of the session,
  breaking every subsequent command. Use `p` or anything else.
- `npm run dev` can fail with `EMFILE: too many open files` in
  resource-constrained environments (inotify instance limits, not a bug in
  this project) — `npm run build && npm run preview` is a more reliable way
  to sanity-check a change end-to-end when that happens.
- There's no visual test runner here; verification throughout has been
  real headless-Chrome screenshots and DOM dumps (`google-chrome
  --headless=new --dump-dom` / `--screenshot`), sometimes with a small
  injected `<script>` in a scratch copy of the built HTML to read back
  computed styles or trigger interactions. Worth reaching for over just
  reading the CSS/HTML and assuming it's right — several bugs in this repo
  (container width, burger icon spacing, dark-mode color overrides) were
  only caught this way.
