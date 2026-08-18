// Square Web Payments SDK integration for /account/cart/pay/ only - a
// no-op import on every other page (bails out immediately if the
// order-pay-fields div isn't present).
//
// The order-pay-fields div's GET response includes a #square-config
// element with the application id/location id/environment for this
// payment - all driven server-side by the `square_sandbox` variable,
// never hardcoded here. The SDK script itself has to load from
// Square's CDN (not npm-bundled, Square requires this), and sandbox
// vs production are genuinely different script URLs, so it's loaded
// dynamically once we know which environment applies.

const SQUARE_SDK_URLS = {
  sandbox: 'https://sandbox.web.squarecdn.com/v1/square.js',
  production: 'https://web.squarecdn.com/v1/square.js',
}

// Square's card element renders inside its own iframe, so it doesn't
// inherit our page's CSS at all - it needs its colors passed in
// explicitly via the style option below, otherwise it defaults to a
// white input regardless of our own dark/light theme. Detection
// mirrors main.js's own (unexported) currentTheme() - duplicated here
// rather than shared, since square.js is a separate module and this
// is only two lines.
function isDarkTheme() {
  const explicit = document.documentElement.getAttribute('data-theme')
  if (explicit) return explicit === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Square's own documented dark-mode example (web-payments-quickstart's
// card-styling-simple.html) - the card element has no way to restyle
// itself after attach(), so this is only ever applied once, at attach
// time; toggling the site's theme while this page is already open
// won't retroactively restyle an already-mounted card.
const DARK_CARD_STYLE = {
  '.input-container': {
    borderColor: '#2D2D2D',
    borderRadius: '6px',
  },
  '.input-container.is-focus': {
    borderColor: '#006AFF',
  },
  '.input-container.is-error': {
    borderColor: '#ff1600',
  },
  '.message-text': {
    color: '#999999',
  },
  '.message-icon': {
    color: '#999999',
  },
  '.message-text.is-error': {
    color: '#ff1600',
  },
  '.message-icon.is-error': {
    color: '#ff1600',
  },
  input: {
    backgroundColor: '#2D2D2D',
    color: '#FFFFFF',
  },
  'input::placeholder': {
    color: '#999999',
  },
  'input.is-error': {
    color: '#ff1600',
  },
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

const orderPayFields = document.getElementById('order-pay-fields')

if (orderPayFields) {
  const form = document.getElementById('order-pay-form')
  const submit = form.querySelector('button[type="submit"]')
  const message = document.getElementById('order-pay-message')
  let card = null

  const showFieldsError = (text) => {
    orderPayFields.innerHTML = `<article class="message is-warning">
  <div class="message-body">${text}</div>
</article>`
  }

  async function setupCard() {
    const config = document.getElementById('square-config')
    if (!config) return // an error/empty state swapped in instead of the real fields

    const { applicationId, locationId } = config.dataset
    const environment =
      config.dataset.environment === 'production' ? 'production' : 'sandbox'

    try {
      await loadScript(SQUARE_SDK_URLS[environment])
      const payments = window.Square.payments(applicationId, locationId)
      card = await payments.card(
        isDarkTheme() ? { style: DARK_CARD_STYLE } : {},
      )
      await card.attach('#square-card')
      submit.disabled = false
    } catch {
      showFieldsError(
        'Could not load the payment form. Please refresh the page to try again.',
      )
    }
  }

  document.body.addEventListener('htmx:afterSwap', (evt) => {
    if (evt.target !== orderPayFields) return
    setupCard()
  })

  // Same reasoning as setupPrefillFields's own handlers elsewhere:
  // htmx's default responseHandling treats 4xx/5xx as swap:false, so
  // htmx:afterSwap never fires for those - without this the submit
  // button would stay disabled forever with no explanation.
  document.body.addEventListener('htmx:responseError', (evt) => {
    if (evt.target !== orderPayFields) return
    showFieldsError('Could not load this page. Please refresh to try again.')
  })
  document.body.addEventListener('htmx:sendError', (evt) => {
    if (evt.target !== orderPayFields) return
    showFieldsError(
      'Could not reach the server. Please check your connection and refresh to try again.',
    )
  })

  // Square nonces are single-use, but tokenize() itself can be called
  // again on the same attached card for every retry - so a declined
  // payment or a fixed-up card number just needs a fresh tokenize()
  // call on the next submit, not a full re-attach.
  form.addEventListener('htmx:confirm', (evt) => {
    evt.preventDefault()
    ;(async () => {
      if (!card) {
        evt.detail.issueRequest() // let the server reject with a clear error rather than silently doing nothing
        return
      }

      const result = await card.tokenize()
      if (result.status === 'OK') {
        form.querySelector('input[name="source_id"]').value = result.token
        evt.detail.issueRequest()
      } else {
        message.classList.remove('is-hidden')
        message.innerHTML = `<article class="message is-danger">
  <div class="message-body">Could not process the card. Please check the details and try again.</div>
</article>`
      }
    })()
  })
}
