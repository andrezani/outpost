/**
 * Outpost Landing Page — app.js
 * 
 * Handles:
 * 1. Stripe checkout link wiring (swap placeholders with real URLs when available)
 * 2. Founding rate seat counter (fetches from API or falls back to static)
 * 3. Smooth nav highlighting
 */

// ─────────────────────────────────────────────
// CONFIG — swap these when Stripe account is ready
// ─────────────────────────────────────────────
const STRIPE_LINKS = {
  pro: null,   // TODO: 'https://buy.stripe.com/XXX' — Pro $29/mo
  team: null,  // TODO: 'https://buy.stripe.com/XXX' — Team $99/mo
  teamFounding: null, // TODO: 'https://buy.stripe.com/XXX' — Team Founding $49/mo
};

// API base URL — set when domain is registered
const API_BASE = null; // TODO: 'https://api.outpost.dev'

// Founding seats total
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
  // If Stripe not configured, cta-pro already points to #waitlist in HTML

  if (teamCta) {
    const teamLink = STRIPE_LINKS.teamFounding || STRIPE_LINKS.team;
    if (teamLink) {
      teamCta.href = teamLink;
      teamCta.target = '_blank';
      teamCta.rel = 'noopener';
      teamCta.textContent = 'Start Team →';
    }
  }
  // If Stripe not configured, cta-team already points to #waitlist in HTML
}

// ─────────────────────────────────────────────
// Founding seat counter
// ─────────────────────────────────────────────
async function loadFoundingCount() {
  const countEl = document.getElementById('founding-count');
  const badgeEl = document.getElementById('founding-badge');
  
  if (!countEl || !badgeEl) return;

  if (!API_BASE) {
    // API not configured yet — show full seats (no customers yet)
    countEl.textContent = FOUNDING_SEATS_TOTAL;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/public/founding-seats`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error('API error');
    const { remaining } = await res.json();
    countEl.textContent = remaining;
    
    // Hide badge if no founding rate active or seats exhausted
    if (remaining <= 0) {
      badgeEl.style.display = 'none';
    }
  } catch {
    // Silently fail — static fallback is fine
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
// Copy-to-clipboard for API key placeholder
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
// Waitlist form — safe submission handler
// Handles both: real Formspree ID and placeholder (dev mode)
// ─────────────────────────────────────────────
function initWaitlistForm() {
  const form = document.querySelector('.waitlist-form');
  if (!form) return;

  const actionUrl = form.getAttribute('action') || '';
  const isPlaceholder = actionUrl.includes('REPLACE_WITH_YOUR_FORMSPREE_ID');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = form.querySelector('input[type="email"]');
    const submitBtn = form.querySelector('button[type="submit"]');
    const email = emailInput ? emailInput.value.trim() : '';

    if (!email) return;

    // Disable button during submission
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Joining…';
    }

    if (isPlaceholder) {
      // Formspree not configured yet — log locally and show success UI
      console.info('[Outpost] Waitlist signup captured (Formspree not configured):', email);
      showWaitlistSuccess(form, email);
      return;
    }

    // Real Formspree endpoint — submit via fetch
    try {
      const res = await fetch(actionUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        showWaitlistSuccess(form, email);
      } else {
        throw new Error(`Formspree error: ${res.status}`);
      }
    } catch (err) {
      console.error('[Outpost] Waitlist submission failed:', err);
      // Re-enable on failure so user can retry
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Join Waitlist';
      }
      const note = form.querySelector('.waitlist-note');
      if (note) {
        note.textContent = 'Something went wrong — try again or email hello@outpost.dev';
        note.style.color = '#ff6b6b';
      }
    }
  });
}

function showWaitlistSuccess(form, email) {
  form.innerHTML = `
    <div class="waitlist-success">
      <p class="waitlist-success-title">✅ You're on the list.</p>
      <p class="waitlist-success-sub">We'll reach out to <strong>${email}</strong> when your spot is ready.</p>
    </div>
  `;
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  wireStripeCTAs();
  loadFoundingCount();
  initNavHighlight();
  initCodeCopy();
  initWaitlistForm();
});
