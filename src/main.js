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
import './square.js'

// The backend renders postal code fields (Davin::Element::PostalCode) with
// inline onkeyup/onblur="uc_postal_code(this)" attributes, expecting a
// global function of that name - matching the old site's script. Inline
// event handler attributes always run against `window`, never a module's
// own scope, so this has to be an explicit global assignment rather than a
// plain top-level function/const - this file is loaded as a module, whose
// top-level bindings are NOT globals.
window.uc_postal_code = (e) => {
  e.value = e.value.toUpperCase()
}

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
    .getElementById('footer-account')
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
// secondary block (login/recover/register's "Alternatively:" cross-nav
// row) that should disappear alongside the form on success — once you're
// logged in there's no reason to still be offered "trouble logging in?"
// — but stay put through any failure. nextStepsId is the opposite: an
// optional block
// (the account forms' "Back to Account"/"Home" buttons) that stays
// hidden by default and on failure, and only appears on success — so
// the user isn't left on a page with nothing but a static "done"
// message and no indication of what to do next.
function setupResultForm(formId, messageId, infoId, nextStepsId) {
  const form = document.getElementById(formId)
  if (!form) return

  const message = document.getElementById(messageId)
  const info = infoId ? document.getElementById(infoId) : null
  const nextSteps = nextStepsId ? document.getElementById(nextStepsId) : null

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
    if (nextSteps) nextSteps.classList.toggle('is-hidden', isError)
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

// Static "hub" pages (Edit Profile, Scheduling) just link to existing
// account pages - each of those pages reads volunteer_id off its own
// URL (see the inline scripts on their hidden inputs), so the hub's
// links need that same query param carried forward from whichever
// volunteer's dashboard the hub was reached from.
function setupVolunteerIdLinks(containerId) {
  const container = document.getElementById(containerId)
  if (!container) return

  const volunteerId = new URLSearchParams(location.search).get('volunteer_id')
  if (!volunteerId) return

  container.querySelectorAll('a[href^="/account/volunteer/"]').forEach((a) => {
    a.href += `?volunteer_id=${encodeURIComponent(volunteerId)}`
  })
}

setupVolunteerIdLinks('volunteer-profile-links')
setupVolunteerIdLinks('volunteer-scheduling-links')

// Carries the page a logged-out visitor was actually trying to reach
// through the login/recover/register detour and back again, using the
// same `uri` param name the old (pre-htmx-demo) site's own login flow
// already reads (Davin::Middleware::Auth::Form / Content::Login.pm) -
// not a new, separately-invented name for the same concept.
//
// (a) retargets a success "next steps" primary button to `uri` when
// present in our own URL - covers both /login/ (typed in this tab) and
// /login-link/ (arrived via the e-mailed link, which already has uri
// baked in by Object::Account::send_login_link on the backend).
function setupReturnUriNextSteps(nextStepsId) {
  const nextSteps = document.getElementById(nextStepsId)
  if (!nextSteps) return

  const uri = new URLSearchParams(location.search).get('uri')
  if (!uri) return

  const primary = nextSteps.querySelector('a.is-primary')
  if (primary) primary.href = uri
}

// (b) appends uri (this page's own path) onto outbound links to the
// three entry pages, so account-login-prompt.html - included on real
// content pages like the cart - sends the user back to wherever they
// actually were.
function setupReturnUriLinks(containerId) {
  const container = document.getElementById(containerId)
  if (!container) return

  const uri = location.pathname + location.search
  container
    .querySelectorAll(
      'a[href^="/login/"], a[href^="/recover/"], a[href^="/register/"]',
    )
    .forEach((a) => {
      a.href += `?uri=${encodeURIComponent(uri)}`
    })
}

// (c) the login/recover/register cross-nav rows bounce between those
// three pages themselves, so "this page's own path" is never a useful
// destination - instead forward whatever uri this page already arrived
// with (if any), unchanged, so hopping from recover to register (say)
// while trying to reach the cart doesn't lose that destination or nest
// it inside a pointless "return to the auth page" link.
function setupCrossNavUriLinks(containerId) {
  const container = document.getElementById(containerId)
  if (!container) return

  const uri = new URLSearchParams(location.search).get('uri')
  if (!uri) return

  container
    .querySelectorAll(
      'a[href^="/login/"], a[href^="/recover/"], a[href^="/register/"]',
    )
    .forEach((a) => {
      a.href += `?uri=${encodeURIComponent(uri)}`
    })
}

setupReturnUriLinks('account-login-prompt')
setupCrossNavUriLinks('login-crossnav')
setupCrossNavUriLinks('recover-crossnav')
setupCrossNavUriLinks('register-crossnav')
setupReturnUriNextSteps('login-next-steps')
setupReturnUriNextSteps('login-link-next-steps')

// Each sub-page's "back up one level" link (top nav) and its post-save
// "next steps" buttons both need volunteer_id carried forward to the
// hub page, same reason as the hub's own links above - the hub can't
// know which volunteer registration you're on otherwise.
for (const slug of [
  'name-address',
  'contact',
  'references',
  'preferences',
  'interests',
  'availability',
  'default-availability',
  'schedule',
]) {
  setupVolunteerIdLinks(`volunteer-${slug}-topnav`)
  setupVolunteerIdLinks(`volunteer-${slug}-next-steps`)
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
// disabled forever with no explanation. The submit button is looked up
// fresh on every swap (rather than captured once at setup) since Order
// Tickets' fields response conditionally omits the button entirely
// when there's nothing to buy, replacing it with links elsewhere -
// every other caller always renders a real button, so this is a no-op
// change for them.
function setupPrefillFields(fieldsId, formId) {
  const fields = document.getElementById(fieldsId)
  const form = document.getElementById(formId)
  if (!fields || !form) return

  document.body.addEventListener('htmx:afterSwap', (evt) => {
    if (evt.target !== fields) return
    const submit = form.querySelector('button[type="submit"]')
    if (submit) submit.disabled = false
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
setupPrefillFields('membership-new-fields', 'membership-new-form')
setupPrefillFields('membership-edit-fields', 'membership-edit-form')
setupPrefillFields('membership-share-fields', 'membership-share-form')
setupPrefillFields('membership-delete-fields', 'membership-delete-form')
setupPrefillFields('membership-buy-fields', 'membership-buy-form')
setupPrefillFields('volunteer-new-fields', 'volunteer-new-form')
setupPrefillFields(
  'volunteer-name-address-fields',
  'volunteer-name-address-form',
)
setupPrefillFields('volunteer-contact-fields', 'volunteer-contact-form')
setupPrefillFields('volunteer-references-fields', 'volunteer-references-form')
setupPrefillFields('volunteer-preferences-fields', 'volunteer-preferences-form')
setupPrefillFields('volunteer-interests-fields', 'volunteer-interests-form')
setupPrefillFields(
  'volunteer-availability-fields',
  'volunteer-availability-form',
)
setupPrefillFields(
  'volunteer-default-availability-fields',
  'volunteer-default-availability-form',
)
setupPrefillFields('volunteer-retire-fields', 'volunteer-retire-form')
setupPrefillFields('snack-buy-fields', 'snack-buy-form')
setupPrefillFields('donation-buy-fields', 'donation-buy-form')
setupPrefillFields('ticket-buy-fields', 'ticket-buy-form')

setupResultForm('feedback-form', 'feedback-message')
setupResultForm('register-form', 'register-message', 'register-crossnav')
setupResultForm('recover-form', 'recover-message', 'recover-crossnav')
setupResultForm(
  'login-form',
  'login-message',
  'login-crossnav',
  'login-next-steps',
)
setupResultForm(
  'login-link-form',
  'login-link-message',
  'login-link-info',
  'login-link-next-steps',
)
setupResultForm('logout-form', 'logout-message', undefined, 'logout-next-steps')
setupResultForm(
  'password-form',
  'password-message',
  undefined,
  'password-next-steps',
)
setupResultForm('name-form', 'name-message', undefined, 'name-next-steps')
setupResultForm(
  'communication-form',
  'communication-message',
  undefined,
  'communication-next-steps',
)
setupResultForm(
  'membership-new-form',
  'membership-new-message',
  undefined,
  'membership-new-next-steps',
)
setupResultForm(
  'membership-edit-form',
  'membership-edit-message',
  undefined,
  'membership-edit-next-steps',
)
setupResultForm(
  'membership-share-form',
  'membership-share-message',
  undefined,
  'membership-share-next-steps',
)
setupResultForm(
  'membership-delete-form',
  'membership-delete-message',
  undefined,
  'membership-delete-next-steps',
)
setupResultForm(
  'membership-buy-form',
  'membership-buy-message',
  undefined,
  'membership-buy-next-steps',
)
setupResultForm(
  'volunteer-new-form',
  'volunteer-new-message',
  undefined,
  'volunteer-new-next-steps',
)
setupResultForm(
  'volunteer-name-address-form',
  'volunteer-name-address-message',
  undefined,
  'volunteer-name-address-next-steps',
)
setupResultForm(
  'volunteer-contact-form',
  'volunteer-contact-message',
  undefined,
  'volunteer-contact-next-steps',
)
setupResultForm(
  'volunteer-references-form',
  'volunteer-references-message',
  undefined,
  'volunteer-references-next-steps',
)
setupResultForm(
  'volunteer-preferences-form',
  'volunteer-preferences-message',
  undefined,
  'volunteer-preferences-next-steps',
)
setupResultForm(
  'volunteer-interests-form',
  'volunteer-interests-message',
  undefined,
  'volunteer-interests-next-steps',
)
setupResultForm(
  'volunteer-availability-form',
  'volunteer-availability-message',
  undefined,
  'volunteer-availability-next-steps',
)
setupResultForm(
  'volunteer-default-availability-form',
  'volunteer-default-availability-message',
  undefined,
  'volunteer-default-availability-next-steps',
)
setupResultForm(
  'volunteer-retire-form',
  'volunteer-retire-message',
  undefined,
  'volunteer-retire-next-steps',
)
setupResultForm(
  'order-pay-form',
  'order-pay-message',
  undefined,
  'order-pay-next-steps',
)
setupResultForm(
  'snack-buy-form',
  'snack-buy-message',
  undefined,
  'snack-buy-next-steps',
)
setupResultForm(
  'donation-buy-form',
  'donation-buy-message',
  undefined,
  'donation-buy-next-steps',
)
setupResultForm(
  'ticket-buy-form',
  'ticket-buy-message',
  undefined,
  'ticket-buy-next-steps',
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

const morePhotoReel = document.querySelector('.MorePhotoReel .swiper')
if (morePhotoReel) {
  // Static slides baked into the page (unlike .HomePromo, there's no
  // htmx fetch involved), so Swiper can init immediately on load.
  new Swiper(morePhotoReel, {
    modules: [Autoplay],
    direction: 'horizontal',
    loop: true,
    autoplay: { delay: 4000 },
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
