/**
 * Outpost Landing Page — app.js
 *
 * Handles:
 * 1. Stripe checkout link wiring (swap placeholders with real URLs when available)
 * 2. Founding rate seat counter (fetches from API)
 * 3. Smooth nav highlighting
 * 4. Free tier registration — calls POST /api/v1/auth/register, displays real API key inline
 * 5. Pro waitlist form — calls POST /api/v1/public/waitlist
 */

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const STRIPE_LINKS = {
  pro: null,          // TODO: 'https://buy.stripe.com/XXX' — Pro $29/mo
  team: null,         // TODO: 'https://buy.stripe.com/XXX' — Team $99/mo
  teamFounding: null, // TODO: 'https://buy.stripe.com/XXX' — Team Founding $49/mo
};

const API_BASE = 'https://outpost-production-b1b8.up.railway.app';

const FOUNDING_SEATS_TOTAL = 50;

// ─────────────────────────────────────────────
// Wire Stripe CTAs
// ─────────────────────────────────────────────
function wireStripeCTAs() {
  const proCta = document.getElementById('cta-pro');
  const teamCta = document.getElementById('cta-team');

  if (STRIPE_LINKS.pro && proCta) {
    proCta.href = STRIPE_LINKS.pro;
    proCta.target = '_blank';
    proCta.rel = 'noopener';
    proCta.textContent = 'Start Pro →';
  }

  if (teamCta) {
    const teamLink = STRIPE_LINKS.teamFounding || STRIPE_LINKS.team;
    if (teamLink) {
      teamCta.href = teamLink;
      teamCta.target = '_blank';
      teamCta.rel = 'noopener';
      teamCta.textContent = 'Start Team →';
    }
  }
}

// ─────────────────────────────────────────────
// Founding seat counter
// ─────────────────────────────────────────────
async function loadFoundingCount() {
  const countEl = document.getElementById('founding-count');
  const badgeEl = document.getElementById('founding-badge');

  if (!countEl || !badgeEl) return;

  try {
    const res = await fetch(`${API_BASE}/api/v1/public/founding-seats`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('API error');
    const { remaining } = await res.json();
    countEl.textContent = remaining;
    if (remaining <= 0) badgeEl.style.display = 'none';
  } catch {
    countEl.textContent = FOUNDING_SEATS_TOTAL;
  }
}

// ─────────────────────────────────────────────
// Active nav section highlighting
// ─────────────────────────────────────────────
function initNavHighlight() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((link) => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${entry.target.id}`) {
              link.classList.add('active');
            }
          });
        }
      });
    },
    { threshold: 0.5 }
  );

  sections.forEach((s) => observer.observe(s));
}

// ─────────────────────────────────────────────
// Copy-to-clipboard for code blocks
// ─────────────────────────────────────────────
function initCodeCopy() {
  document.querySelectorAll('.code-block').forEach((block) => {
    block.style.cursor = 'pointer';
    block.title = 'Click to copy';
    block.addEventListener('click', () => {
      const text = block.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        const original = block.style.outline;
        block.style.outline = '1px solid #6c63ff';
        setTimeout(() => { block.style.outline = original; }, 800);
      });
    });
  });
}

// ─────────────────────────────────────────────
// FREE TIER REGISTRATION
// Calls POST /api/v1/auth/register → shows real API key inline
// ─────────────────────────────────────────────
function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const orgInput  = document.getElementById('register-org');
    const emailInput = document.getElementById('register-email');
    const submitBtn  = form.querySelector('button[type="submit"]');
    const note       = document.getElementById('register-note');

    const orgName = orgInput ? orgInput.value.trim() : '';
    const email   = emailInput ? emailInput.value.trim() : '';

    if (!orgName || !email) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account…';
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, email }),
      });

      if (res.ok) {
        const data = await res.json();
        showApiKeySuccess(form, data.apiKey, orgName);
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = Array.isArray(err.message) ? err.message[0] : (err.message || `Error ${res.status}`);
        throw new Error(msg);
      }
    } catch (err) {
      console.error('[Outpost] Registration failed:', err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Get API Key →';
      }
      if (note) {
        note.textContent = err.message || 'Something went wrong — try again or email hello@outpost.dev';
        note.style.color = '#ff6b6b';
      }
    }
  });
}

function showApiKeySuccess(form, apiKey, orgName) {
  form.innerHTML = `
    <div class="waitlist-success">
      <p class="waitlist-success-title">✅ You're in. Here's your API key.</p>
      <p class="waitlist-success-sub">Save this — it won't be shown again.</p>
      <div class="api-key-display" id="api-key-value" title="Click to copy" style="
        font-family: 'JetBrains Mono', monospace;
        background: #1a1a2e;
        border: 1px solid #6c63ff;
        border-radius: 8px;
        padding: 12px 16px;
        margin: 12px 0;
        font-size: 0.9rem;
        letter-spacing: 0.5px;
        cursor: pointer;
        word-break: break-all;
        color: #a78bfa;
      ">${apiKey}</div>
      <p style="font-size: 0.8rem; color: #888; margin: 4px 0 0;">Click key to copy &nbsp;·&nbsp; <a href="#quickstart" style="color: #6c63ff;">View quick start →</a></p>
    </div>
  `;

  // Wire click-to-copy on the key
  const keyEl = document.getElementById('api-key-value');
  if (keyEl) {
    keyEl.addEventListener('click', () => {
      navigator.clipboard.writeText(apiKey).then(() => {
        const orig = keyEl.style.outline;
        keyEl.style.outline = '2px solid #6c63ff';
        keyEl.title = 'Copied!';
        setTimeout(() => { keyEl.style.outline = orig; keyEl.title = 'Click to copy'; }, 1000);
      });
    });
  }
}

// ─────────────────────────────────────────────
// PRO WAITLIST FORM (Pro/Team paid tiers)
// ─────────────────────────────────────────────
function initWaitlistForm() {
  const form = document.getElementById('waitlist-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = form.querySelector('input[type="email"]');
    const submitBtn  = form.querySelector('button[type="submit"]');
    const note       = document.getElementById('waitlist-note');
    const email      = emailInput ? emailInput.value.trim() : '';

    if (!email) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Joining…';
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/public/waitlist`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'landing-pro' }),
      });

      if (res.ok) {
        form.innerHTML = `
          <div class="waitlist-success">
            <p class="waitlist-success-title">✅ You're on the list.</p>
            <p class="waitlist-success-sub">We'll email <strong>${email}</strong> when Pro billing is live.</p>
          </div>
        `;
      } else {
        throw new Error(`API error: ${res.status}`);
      }
    } catch (err) {
      console.error('[Outpost] Waitlist submission failed:', err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Join Waitlist';
      }
      if (note) {
        note.textContent = 'Something went wrong — try again or email hello@outpost.dev';
        note.style.color = '#ff6b6b';
      }
    }
  });
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireStripeCTAs();
  loadFoundingCount();
  initNavHighlight();
  initCodeCopy();
  initRegisterForm();
  initWaitlistForm();
});
