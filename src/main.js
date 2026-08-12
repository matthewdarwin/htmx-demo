import 'bulma/css/bulma.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import htmx from 'htmx.org'
import { isMapboxURL, transformMapboxUrl } from './mapbox-request-transformer.js'

// Self-hosted from public/maplibre/ rather than a bundler `?url` import: the
// worker chunk has its own relative `import './maplibre-gl-shared.mjs'`, which
// Vite can't see (it treats `?url` imports as opaque assets), so the shared
// chunk never gets emitted and the worker 404s. Keeping both files side by
// side at a fixed path keeps that relative import intact.
const maplibreWorkerUrl = '/maplibre/maplibre-gl-worker.mjs'

window.htmx = htmx

// htmx 2.x blocks cross-origin hx-get/hx-post by default (selfRequestsOnly)
// before htmx:validateUrl even fires, so the flag has to come off first. The
// validateUrl listener then puts the restriction back as an explicit
// allowlist instead of opening up every origin.
htmx.config.selfRequestsOnly = false

document.body.addEventListener('htmx:validateUrl', (evt) => {
  if (!evt.detail.sameHost && evt.detail.url.origin !== 'https://www.familycinema.ca') {
    evt.preventDefault()
  }
})

document.querySelectorAll('.navbar-burger').forEach((burger) => {
  burger.addEventListener('click', () => {
    const menu = document.getElementById(burger.dataset.target)
    burger.classList.toggle('is-active')
    menu.classList.toggle('is-active')
  })
})

const themeToggle = document.getElementById('theme-toggle')
if (themeToggle) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

  const currentTheme = () =>
    document.documentElement.getAttribute('data-theme') ||
    (prefersDark.matches ? 'dark' : 'light')

  const updateToggle = () => {
    const isDark = currentTheme() === 'dark'
    themeToggle.querySelector('i').className = isDark
      ? 'fas fa-sun'
      : 'fas fa-moon'
    themeToggle.querySelector('#theme-toggle-label').textContent = isDark
      ? 'Light mode'
      : 'Dark mode'
  }

  updateToggle()

  themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    updateToggle()
  })
}

document.body.addEventListener('htmx:confirm', (evt) => {
  if (evt.target.id !== 'feedback-form') return

  const yearInput = evt.target.elements['human-check']
  const currentYear = String(new Date().getFullYear())

  const message = document.getElementById('feedback-message')

  if (yearInput.value.trim() === currentYear) {
    message.classList.remove('is-danger')
    message.classList.add('is-light')
    return
  }

  evt.preventDefault()
  yearInput.classList.add('is-danger')
  yearInput.focus()

  message.classList.remove('is-light')
  message.classList.add('is-danger')
  message.textContent = `That's not the current year. Please enter ${currentYear}.`
})

document
  .getElementById('feedback-form')
  ?.addEventListener('input', (evt) => {
    if (evt.target.id === 'human-check') {
      evt.target.classList.remove('is-danger')
    }
  })

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
  'https://www.familycinema.ca/api/faq.json',
  'Unable to load the FAQ right now. Please try again later.',
)

loadAccordionList(
  'volunteer-list',
  'https://www.familycinema.ca/api/volunteer.json',
  'Unable to load volunteer info right now. Please try again later.',
)

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
