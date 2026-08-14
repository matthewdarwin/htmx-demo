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

**Logged-in-only pages** (Change Password, and future Change Name/Link
Membership/Shopping Cart) live under `pages/account/` (e.g.
`pages/account/password/index.html` → `/account/password/`), and follow
one more convention on top of the above: wrap the page's real content in
`<div id="account-page-content" class="is-hidden">...</div>`, then include
the shared `<!--#include account-login-prompt.html -->` partial right
after it. `updateAccountNav` in `src/main.js` toggles between the two
based on the `account_hint` cookie (see "Login/logout" below) — new pages
get this "must be logged in" gating for free just by using those same two
pieces, no new JS needed.

## Content sourcing

Every content-sourcing page uses the same pattern: plain htmx —
`hx-get="/api/whatever.html" hx-trigger="load" hx-swap="innerHTML"` on a
container div with a `<progress>` placeholder inside. No JS needed. FAQ and
volunteer (`faq-list`/`volunteer-list`) used to be the exception — a
`loadAccordionList` JS helper fetched JSON and built `<details class="box">`
accordion entries client-side — but the backend now renders that same
`<details class="box"><summary class="title is-5">…</summary><div
class="content">…</div></details>` HTML directly (plus an `<a name="...">`
anchor per entry), so they're plain `hx-get` targets like everything else
now. If a future JSON-backed endpoint ever needs client-side rendering
again, don't hand-roll it inline — but there's no longer a shared helper
for it, since the one that existed is gone.

The feedback (`/feedback/`, `hx-post="/api/feedback.html"`), register
(`/register/`, `hx-post="/api/account_new.html"`), and recover
(`/recover/`, `hx-post="/api/account_recover.html"`) forms are the write
paths: field `name`s are dictated by the real server (`realname`,
`membership`, `email`, `comments`, `check` for feedback; `login`, `name`,
`send_announcement`, `send_promo`, `send_schedule`, `check` for register;
`email`, `check` for recover), not by what reads nicely in markup, since
they're form-encoded straight through to production. None of the three
has client-side validation — including the `check` (human/year check)
field on all of them — because the response HTML already says exactly
what was wrong; duplicating that logic client-side would just be a second
place for it to drift out of sync.

All three forms share the exact same result-handling behavior via
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

## Login/logout

Three pages handle authentication: `/login/` (password, `hx-post
/api/account_login.html`), `/login-link/` (consumes the one-time link from
a recovery e-mail — hidden `username`/`recovery` fields filled from the
URL query string by a small inline `<script>`, then auto-submitted via
`hx-trigger="load"` to `/api/account_login_link.html`), and `/logout/`
(auto-posts to `/api/account_logout.html` on load, same shape). All three
use `setupResultForm` like every other form here.

A successful login sets **two** cookies, not one: `jwt` (httponly — the
real credential, never readable from JS by design) and `account_hint`
(plain, holds the account's e-mail) — the second exists specifically
because this is a static site with no server-side rendering, so client JS
has no other way to know "is someone logged in, and as whom" without an
extra fetch round-trip (and the flash of the wrong state that would cause
on every page load). `updateAccountNav()` in `main.js` reads
`account_hint` and:
- toggles the navbar's `#nav-account-logged-out`/`#nav-account-logged-in`
  and the footer's `#footer-login`/`#footer-logout`,
- fills `#nav-account-email` with "Signed in as \<e-mail\>",
- toggles `#account-page-content`/`#account-login-prompt` — see "Adding a
  new page" above for how logged-in-only pages use this pair.

It re-runs on every `htmx:afterSwap`, not just once at page load, since
login/login-link/logout change the cookie via an in-page AJAX POST with no
navigation — without that, the nav would only catch up after the user
happened to click through to another page.

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

**A related variant:** some Bulma elements don't shadow the same custom
property at all — they compute their own color from a *different* formula
that was never themed. `.navbar-divider`'s background is
`hsl(var(--bulma-navbar-h), var(--bulma-navbar-s),
var(--bulma-navbar-divider-background-l))`, none of which this project
overrides, so it always rendered as Bulma's own default regardless of
`--brand-surface`; likewise `.navbar-dropdown`'s `box-shadow` is tinted via
`--bulma-scheme-invert-l`, showing up as a mismatched band under the open
dropdown. And separately, Bulma has both a bare `.navbar-item` background
rule and a more specific `a.navbar-item` one for dropdown items — an
override matching only the bare class silently loses to Bulma's tag-
qualified rule for every actual (anchor) item. Fix for all three: override
the literal property directly on Bulma's own selector (`.navbar-divider`,
`.navbar-dropdown`, `.navbar-dropdown a.navbar-item`) rather than trying to
thread values through Bulma's internal HSL variables or matching specificity
loosely.

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
  "shared" chunk. A plain `?url` import doesn't work — Vite treats the
  target as an opaque asset and never follows that internal import, so the
  worker 404s at runtime looking for the shared chunk. The fix is
  `import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'`
  — Vite's `?worker` suffix bundles the target as a real module graph
  (following its imports, inlining the shared chunk into one self-contained
  file) and `&url` gives back the resulting hashed URL to hand to
  `maplibregl.setWorkerUrl()`, instead of the file being copied verbatim.
  This used to be self-hosted by hand under `public/maplibre/` (copied from
  `node_modules/maplibre-gl/dist/`, re-copied on every `maplibre-gl`
  upgrade) — not needed anymore now that the real fix was found.
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

## Formatting and linting

[Biome](https://biomejs.dev/) handles both formatting and linting for
JS/CSS/HTML/JSON, replacing the previous ESLint + Prettier setup — one
tool, one config file (`biome.json`), far fewer `node_modules` (swapping
in `@biomejs/biome` removed `eslint`, `eslint-config-prettier`, `@eslint/js`,
and `globals` — about 70 fewer packages overall). `npm run build` runs
`npm run format:check` (`biome format .`) and `npm run lint` (`biome lint
.`) before `vite build` — `npm run format` (`biome format --write .`)
applies formatting fixes; `biome check --write .` (not currently wired to
an npm script) applies both formatting and safe lint/import-sort fixes in
one pass.

`biome.json`'s `javascript.formatter` is set to `quoteStyle: "single"`,
`semicolons: "asNeeded"` — matching the no-semicolon, single-quote style
already used throughout `src/`, not Biome's own defaults (double quotes,
always-semicolons) — don't "fix" files back to Biome's defaults.
`html.formatter.enabled` must stay `true`: Biome silently skips HTML files
entirely (no error) if it's left off or missing, which would make
`format`/`lint`/`check` look clean while doing nothing for the vast
majority of this project's files. `indentScriptAndStyle: true` matches
this codebase's existing convention of indenting embedded `<script>`/
`<style>` content to the surrounding HTML nesting level — the default
(`false`) undershoots it by one level.

`linter.rules` uses Biome's own `recommended` preset (broader than the old
ESLint `js.configs.recommended`, since it also covers CSS and HTML/a11y
rules) with four categories explicitly turned off, each for a real,
previously-debugged reason rather than convenience:
- `a11y.useValidAnchor` — Bulma's `<a class="navbar-link">` dropdown
  trigger has no `href` by design (it's a hover/click target for the
  dropdown, not a navigation link).
- `a11y.noLabelWithoutControl` — the register form's radio-group `<label
  class="label">` headings (e.g. "Receive announcements") describe a
  group of inputs, not one; the semantically-correct fix
  (`<fieldset>`/`<legend>`) is a real markup change, left as a follow-up
  rather than bundled into the linter swap.
- `complexity.noImportantStyles` / `style.noDescendingSpecificity` — see
  the CSS gotchas above: the `--bulma-primary-h/s/l` `!important` override
  and the footer/`.icon-social` selector order are deliberate, tested
  choices, not oversights a linter should keep flagging.

`*.md` stays excluded from formatting (`formatter.includes` in
`biome.json`), though it's currently a no-op either way — Biome has no
Markdown formatter at all (confirmed: it silently skips `.md` files
regardless of this setting). The exclude is left in for clarity/future-
proofing in case that ever changes.

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

**Caching**: GitHub Pages sends `Cache-Control: max-age=600` on every
response, hashed assets and frequently-changing pages alike, and there's
no way to override that from the repo/build side (GitHub Pages doesn't
support custom response headers). nginx on `testdemo.familycinema.ca`
fixes this at the proxy: ordinary page requests get `Cache-Control:
no-cache, must-revalidate` (browsers still get a cheap `304` via the
ETag GitHub Pages already sends, rather than a full re-download, just
always check freshness first), while `/assets/*` — Vite's
content-hashed build output, where a changed file gets a new filename —
gets `public, max-age=31536000, immutable`. `/maplibre/*` deliberately
stays under the `no-cache` rule despite also being a build artifact: those
two files are copied verbatim rather than content-hashed (see the
MapLibre section above), so their URL doesn't change across a
maplibre-gl version upgrade — a long cache there could leave clients
stuck with a stale, possibly-incompatible worker file for up to a year.

CI note: the workflow pins Node 22 (`actions/setup-node`) — cspell 10.x
requires ≥22.18, and the default `ubuntu-latest` Node (20) fails the build
step with a version error if this ever gets reverted.

## Maintenance automation

`.github/dependabot.yml` opens weekly PRs for outdated npm deps (grouped
into one PR to avoid per-package noise) and GitHub Actions versions
(ungrouped — there are only a handful, and action bumps are worth
reviewing individually since behavior can shift more than a typical npm
patch). `.github/workflows/ci.yml` runs `npm run build` (spellcheck +
build) on every pull request — this is what actually gates Dependabot's
own PRs before merge; without it they'd open but nothing would verify
they still build. Dependabot alerts and automated security-fix PRs are
also enabled at the repo level (Settings → Code security, not something
tracked in this repo's files).

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
