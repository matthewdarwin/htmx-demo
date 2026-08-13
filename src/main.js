import 'bulma/css/bulma.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'swiper/css'
import './style.css'
import 'htmx.org'
import Swiper from 'swiper'
import { Autoplay } from 'swiper/modules'
import {
  isMapboxURL,
  transformMapboxUrl,
} from './mapbox-request-transformer.js'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

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

setupResultForm('feedback-form', 'feedback-message')
setupResultForm('register-form', 'register-message', 'register-info')
setupResultForm('recover-form', 'recover-message', 'recover-info')

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
