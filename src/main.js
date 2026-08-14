import 'bulma/css/bulma.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'swiper/css'
import './style.css'
import 'htmx.org'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import Swiper from 'swiper'
import { Autoplay } from 'swiper/modules'
import {
  isMapboxURL,
  transformMapboxUrl,
} from './mapbox-request-transformer.js'

const missingPath = document.getElementById('missing-path')
if (missingPath) {
  missingPath.textContent = location.pathname
}

document.querySelectorAll('.navbar-burger').forEach((burger) => {
  burger.addEventListener('click', () => {
    const menu = document.getElementById(burger.dataset.target)
    burger.classList.toggle('is-active')
    menu.classList.toggle('is-active')
  })
})

// theme-toggle-mobile (icon only, next to the burger) mirrors theme-toggle
// (icon + label, in the collapsible menu) — both stay in sync regardless of
// which one is clicked.
const themeToggles = document.querySelectorAll(
  '#theme-toggle, #theme-toggle-mobile',
)
if (themeToggles.length) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

  const currentTheme = () =>
    document.documentElement.getAttribute('data-theme') ||
    (prefersDark.matches ? 'dark' : 'light')

  const updateToggles = () => {
    const isDark = currentTheme() === 'dark'
    themeToggles.forEach((toggle) => {
      toggle.querySelector('i').className = isDark
        ? 'fas fa-sun'
        : 'fas fa-moon'
      const label = toggle.querySelector('#theme-toggle-label')
      if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode'
    })
  }

  updateToggles()

  themeToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('theme', next)
      updateToggles()
    })
  })
}

// Toggles the navbar/footer between logged-out (Login/Registration) and
// logged-in (Logout) states. The jwt cookie itself is httponly (can't be
// read here by design), so this reads account_hint instead — a second,
// plain cookie the backend bakes alongside jwt specifically so a static
// site with no server-side rendering can tell which state to show without
// a fetch round-trip (and the flash of the wrong state that would cause).
function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

// Re-run on every htmx swap, not just once at page load: the login/
// login-link/logout forms change the cookie via an in-page AJAX POST with
// no navigation, so without this the nav would only reflect the new state
// after the user happened to click through to another page.
function updateAccountNav() {
  const loggedIn = getCookie('account_hint')
  document
    .getElementById('nav-account-logged-out')
    ?.classList.toggle('is-hidden', !!loggedIn)
  document
    .getElementById('nav-account-logged-in')
    ?.classList.toggle('is-hidden', !loggedIn)
  document
    .getElementById('footer-login')
    ?.classList.toggle('is-hidden', !!loggedIn)
  document
    .getElementById('footer-logout')
    ?.classList.toggle('is-hidden', !loggedIn)
  document
    .getElementById('account-page-content')
    ?.classList.toggle('is-hidden', !loggedIn)
  document
    .getElementById('account-login-prompt')
    ?.classList.toggle('is-hidden', !!loggedIn)
  const emailLabel = document.getElementById('nav-account-email')
  if (emailLabel) {
    emailLabel.textContent = loggedIn ? `Signed in as ${loggedIn}` : ''
  }
}

updateAccountNav()
document.body.addEventListener('htmx:afterSwap', updateAccountNav)

// Wires up the shared result-handling behavior for any hx-post form that
// follows the feedback form's convention: server validates everything
// (no client-side validation to duplicate/drift), responds with a Bulma
// "message" fragment and an X-Form-Result: ok/error header, and on
// success the form should hide in favor of the message — but on failure
// stay up so the user can fix the offending field and resubmit, rather
// than getting stuck with no way back to the form. infoId is an optional
// page intro box (register/recover's "here's what this form does" notice)
// that should disappear alongside the form on success, but stay put
// through any failure.
function setupResultForm(formId, messageId, infoId) {
  const form = document.getElementById(formId)
  if (!form) return

  const message = document.getElementById(messageId)
  const info = infoId ? document.getElementById(infoId) : null

  const showFailure = (text) => {
    message.innerHTML = `<article class="message is-danger">
  <div class="message-header">
    <p><strong>Error</strong></p>
  </div>
  <div class="message-body">${text}</div>
</article>`
    message.classList.remove('is-hidden')
    form.classList.remove('is-hidden')
  }

  document.body.addEventListener('htmx:afterSwap', (evt) => {
    if (evt.target !== message) return
    message.classList.remove('is-hidden')
    const isError =
      evt.detail.xhr.getResponseHeader('X-Form-Result') === 'error'
    form.classList.toggle('is-hidden', !isError)
    if (info) info.classList.toggle('is-hidden', !isError)
  })

  // htmx's default responseHandling treats 4xx/5xx as swap:false, so
  // htmx:afterSwap above never fires for a server error — without this,
  // the user gets no feedback at all beyond the submit button re-enabling.
  // htmx:sendError covers the network-failure case (server unreachable),
  // which never gets a response to hand responseHandling in the first
  // place.
  document.body.addEventListener('htmx:responseError', (evt) => {
    if (evt.target !== form) return
    showFailure('Something went wrong submitting the form. Please try again.')
  })

  document.body.addEventListener('htmx:sendError', (evt) => {
    if (evt.target !== form) return
    showFailure(
      'Could not reach the server. Please check your connection and try again.',
    )
  })
}

// Wires up the "fields fetched from the server" account forms (Change
// Password, Change Name, Communication Preferences, and any future
// "edit my X" page that follows the same shape): the submit button
// starts disabled in markup so it can't be used before the real fields
// have arrived, and only enables once that fetch actually lands -
// without this, submitting while the placeholder <progress> is still
// showing would post a form with none of its real fields present at
// all. A failed fetch (network down, unexpected 5xx) replaces the
// placeholder with an inline message instead of leaving the button
// disabled forever with no explanation.
function setupPrefillFields(fieldsId, formId) {
  const fields = document.getElementById(fieldsId)
  const form = document.getElementById(formId)
  if (!fields || !form) return

  const submit = form.querySelector('button[type="submit"]')

  document.body.addEventListener('htmx:afterSwap', (evt) => {
    if (evt.target !== fields) return
    submit.disabled = false
  })

  const showLoadFailure = (text) => {
    fields.innerHTML = `<article class="message is-warning">
  <div class="message-body">${text}</div>
</article>`
  }

  // Same reasoning as setupResultForm's htmx:responseError/sendError
  // handlers: htmx's default responseHandling treats 4xx/5xx as
  // swap:false, so htmx:afterSwap never fires for those and the button
  // would otherwise stay disabled with no feedback at all.
  document.body.addEventListener('htmx:responseError', (evt) => {
    if (evt.target !== fields) return
    showLoadFailure(
      'Could not load this form. Please refresh the page to try again.',
    )
  })

  document.body.addEventListener('htmx:sendError', (evt) => {
    if (evt.target !== fields) return
    showLoadFailure(
      'Could not reach the server. Please check your connection and refresh the page to try again.',
    )
  })
}

setupPrefillFields('password-fields', 'password-form')
setupPrefillFields('name-fields', 'name-form')
setupPrefillFields('communication-fields', 'communication-form')

setupResultForm('feedback-form', 'feedback-message')
setupResultForm('register-form', 'register-message', 'register-info')
setupResultForm('recover-form', 'recover-message', 'recover-info')
setupResultForm('login-form', 'login-message')
setupResultForm('login-link-form', 'login-link-message')
setupResultForm('logout-form', 'logout-message')
setupResultForm('password-form', 'password-message')
setupResultForm('name-form', 'name-message')
setupResultForm('communication-form', 'communication-message')

const promoWrapper = document.querySelector('.HomePromo')
if (promoWrapper) {
  // The fetched fragment is itself a full .swiper element, so
  // hx-swap="outerHTML" replaces the placeholder with it outright rather
  // than nesting it inside one. Querying fresh here (instead of caching a
  // reference before the swap) finds the live element once it lands.
  document.body.addEventListener('htmx:afterSwap', () => {
    const promoContainer = promoWrapper.querySelector('.swiper')
    if (!promoContainer) return
    new Swiper(promoContainer, {
      modules: [Autoplay],
      direction: 'horizontal',
      loop: true,
      autoplay: { delay: 3000 },
    })
  })
}

const mapCanvas = document.getElementById('map_canvas')
if (mapCanvas) {
  const maplibregl = await import('maplibre-gl')
  maplibregl.setWorkerUrl(maplibreWorkerUrl)

  // MapLibre uses [longitude, latitude] instead of [latitude, longitude]
  const coord = [-75.64236, 45.43447]

  // The production token is restricted (by Mapbox URL allowlist) to
  // familycinema.ca subdomains, so it works once deployed but not on
  // localhost during dev/preview — fall back to the unrestricted token there.
  const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname)
  const accessToken = isLocalhost
    ? 'pk.eyJ1IjoibWF0dGhld2RhcndpbiIsImEiOiJjbXNwN3U4NHcwY2ptMzBwejRwcG1iaDQ5In0.jC00V0_NxgwKDSldW6Nbew'
    : 'pk.eyJ1IjoibWF0dGhld2RhcndpbiIsImEiOiJjazR5bzZnOG8wMGpiM2twZHd3eW1nYzdhIn0.D-gcGrhmG0cwaF8HStvTLQ'

  const transformRequest = (url, resourceType) => {
    if (isMapboxURL(url)) {
      return transformMapboxUrl(url, resourceType, accessToken)
    }
    return { url }
  }

  const map = new maplibregl.Map({
    container: 'map_canvas',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: coord,
    zoom: 13,
    transformRequest,
    validateStyle: false,
  })

  const popup = new maplibregl.Popup({
    offset: 25,
    className: 'LocationPopup',
  }).setHTML('Ottawa Family Cinema<br>815 St-Laurent Boulevard')

  const marker = new maplibregl.Marker()
    .setLngLat(coord)
    .setPopup(popup)
    .addTo(map)

  map.on('load', () => {
    marker.togglePopup()
  })

  marker.getElement().style.cursor = 'pointer'
}
