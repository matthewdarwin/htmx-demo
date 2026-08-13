import 'bulma/css/bulma.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'swiper/css'
import './style.css'
import 'htmx.org'
import Swiper from 'swiper'
import { Autoplay } from 'swiper/modules'
import { isMapboxURL, transformMapboxUrl } from './mapbox-request-transformer.js'

// Self-hosted from public/maplibre/ rather than a bundler `?url` import: the
// worker chunk has its own relative `import './maplibre-gl-shared.mjs'`, which
// Vite can't see (it treats `?url` imports as opaque assets), so the shared
// chunk never gets emitted and the worker 404s. Keeping both files side by
// side at a fixed path keeps that relative import intact.
const maplibreWorkerUrl = '/maplibre/maplibre-gl-worker.mjs'

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
      toggle.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon'
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

const feedbackForm = document.getElementById('feedback-form')
if (feedbackForm) {
  // The server validates the human-check year itself (and every other
  // field); on response, reveal the result in place of the form. Only hide
  // the form on success — on failure leave it up so the user can fix the
  // offending field and resubmit, rather than getting stuck with no way
  // back to the form.
  //
  // Prefers the X-Form-Result: ok/error response header when the server
  // sends one, falling back to sniffing the message's own is-danger class
  // otherwise — so this works today and gets more robust the moment the
  // backend adds the header, with no coordinated deploy required.
  document.body.addEventListener('htmx:afterSwap', (evt) => {
    if (evt.target.id !== 'feedback-message') return
    evt.target.classList.remove('is-hidden')
    const resultHeader = evt.detail.xhr.getResponseHeader('X-Form-Result')
    const isError = resultHeader
      ? resultHeader === 'error'
      : evt.target.querySelector('.message.is-danger') !== null
    feedbackForm.classList.toggle('is-hidden', !isError)
  })
}

function loadAccordionList(elementId, apiUrl, errorMessage) {
  const list = document.getElementById(elementId)
  if (!list) return

  fetch(apiUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      return res.json()
    })
    .then((items) => {
      list.innerHTML = ''
      items.forEach((item) => {
        const details = document.createElement('details')
        details.className = 'box'

        const summary = document.createElement('summary')
        summary.className = 'title is-5'
        summary.textContent = item.title
        details.appendChild(summary)

        const content = document.createElement('div')
        content.className = 'content'
        content.innerHTML = item.detail
        details.appendChild(content)

        list.appendChild(details)
      })
    })
    .catch(() => {
      list.innerHTML = `<div class="notification is-danger">${errorMessage}</div>`
    })
}

loadAccordionList(
  'faq-list',
  '/api/faq.json',
  'Unable to load the FAQ right now. Please try again later.',
)

loadAccordionList(
  'volunteer-list',
  '/api/volunteer.json',
  'Unable to load volunteer info right now. Please try again later.',
)

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

  const popup = new maplibregl.Popup({ offset: 25 }).setHTML(
    'Ottawa Family Cinema<br>815 St-Laurent Boulevard',
  )

  const marker = new maplibregl.Marker()
    .setLngLat(coord)
    .setPopup(popup)
    .addTo(map)

  map.on('load', () => {
    marker.togglePopup()
  })

  marker.getElement().style.cursor = 'pointer'
}
