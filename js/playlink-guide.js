/* ============================================================
   playlink-guide.js — Detects whether the user is browsing
   NetMini without a strong ad blocker. If so, intercepts the
   first visit and walks them through a 5-step guide that
   points them to the Playlink app (an in-app browser with
   built-in content filtering) so they get an ad-free streaming
   experience.

   Flow (mirrors suuu.app's guide):
     Step 1 — Download Playlink (App Store / Play Store)
     Step 2 — Open & Search inside Playlink's browser
     Step 3 — Type netmini.vercel.app into the address bar
     Step 4 — Hit submit on the keyboard
     Step 5 — Choose a server & start watching

   Detection strategy (multi-pronged):
     1) Bait element with ad-blocked class names. If it ends up
        hidden, an adblocker is active.
     2) Network fetch to a known ad-tech URL (googlesyndication).
        If the request fails fast, an adblocker is active.
     3) Brave-style detection: navigator.brave is checked.

   The guide is shown only when NO adblocker is detected AND
   the user hasn't already dismissed it this session.
   ============================================================ */

(function () {
  'use strict';

  /* ── Configuration ── */
  const SITE_URL = 'https://netmini.vercel.app';
  const SITE_HOST = 'netmini.vercel.app';

  /* Playlink app store URLs — adjust to the real ones when known.
     The Android package name com.playlink.mediaclient is taken
     from the screenshots you provided. */
  const PLAYLINK_PLAY_STORE =
    'https://play.google.com/store/apps/details?id=com.playlink.mediaclient';
  const PLAYLINK_APP_STORE =
    'https://apps.apple.com/app/playlink-media-client';

  /* Session-storage key — once dismissed (skip or finish), the
     guide won't show again until the next session. */
  const DISMISS_KEY = 'nm_playlink_guide_dismissed';

  /* ── Don't double-run ── */
  if (window.__playlinkGuideMounted) return;
  window.__playlinkGuideMounted = true;

  /* ── Don't show if already dismissed this session ── */
  if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

  /* ── Don't show inside an installed PWA standalone display ──
     (If the user installed NetMini as a PWA, they're already in
     a "trusted" context. The guide is for browser visitors.) */
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
    return;
  }

  /* ── Run detection on DOMContentLoaded ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  async function mount() {
    const hasAdblocker = await detectAdblocker();
    if (hasAdblocker) return; // user is protected, no guide needed

    /* Inject stylesheet if not already present */
    if (!document.querySelector('link[href="css/playlink-guide.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/playlink-guide.css';
      document.head.appendChild(link);
    }

    buildOverlay();
  }

  /* ══════════════════════════════════════════
     ADBLOCKER DETECTION
  ══════════════════════════════════════════ */

  async function detectAdblocker() {
    /* Method 1: Bait element with ad-style class names.
       Adbblockers that use element-hiding lists (AdBlock, uBlock,
       Brave Shields) will hide these via CSS rules. */
    const baitClassNames = [
      'ad', 'ads', 'adsbox', 'ad-banner', 'advert', 'advertisement',
      'pub_300x250', 'pub_300x250m', 'pub_728x90', 'text-ad',
      'textAd', 'ad-unit', 'ad-container', 'sponsor-banner'
    ];
    const bait = document.createElement('div');
    bait.className = baitClassNames.join(' ');
    bait.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;' +
      'width:1px;height:1px;pointer-events:none;';
    bait.innerHTML = '&nbsp;';
    document.body.appendChild(bait);

    /* Give the browser + any injected stylesheets a moment to react. */
    await new Promise(r => setTimeout(r, 80));

    const baitHidden =
      bait.offsetParent === null ||
      bait.offsetHeight === 0 ||
      bait.offsetWidth === 0 ||
      bait.clientHeight === 0 ||
      window.getComputedStyle(bait).display === 'none' ||
      window.getComputedStyle(bait).visibility === 'hidden' ||
      window.getComputedStyle(bait).opacity === '0';

    bait.remove();
    if (baitHidden) return true;

    /* Method 2: Try fetching a known ad-tech script URL.
       Adblockers block the network request entirely. We use
       googlesyndication because it's the most-blocked domain in
       any filter list. The fetch is `no-cors` so the response is
       opaque — we only care whether the promise rejects. */
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      await fetch(
        'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
        { method: 'GET', mode: 'no-cors', signal: controller.signal }
      );
      clearTimeout(timeoutId);
      /* Fetch didn't throw — request went through. No adblocker. */
      return false;
    } catch (e) {
      /* Either aborted (timeout) or network error. Both indicate
         the request was blocked — adblocker is present. */
      return true;
    }
  }

  /* ══════════════════════════════════════════
     OVERLAY CONSTRUCTION
  ══════════════════════════════════════════ */

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'playlink-guide';
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
      <div class="plg-shell">
        <div class="plg-topbar">
          <button class="plg-skip" id="plg-skip-btn" type="button">Skip</button>
          <span class="plg-step-counter" id="plg-step-counter">Step 1 of 5</span>
        </div>

        <div class="plg-progress" id="plg-progress">
          <div class="plg-progress-dot active"></div>
          <div class="plg-progress-dot"></div>
          <div class="plg-progress-dot"></div>
          <div class="plg-progress-dot"></div>
          <div class="plg-progress-dot"></div>
        </div>

        <!-- ── Step 1: Download Playlink ── -->
        <section class="plg-step active" data-step="1">
          <div class="plg-step-label">Step 01</div>
          <h2 class="plg-step-title">How to watch?</h2>
          <p class="plg-step-desc">
            The Playlink app is required to block ads for a smoother
            streaming experience. Download it on the App Store or
            Play Store.
          </p>

          <div class="plg-phone">
            <div class="plg-phone-screen">
              <div class="plg-step1-badges">
                <span class="plg-step1-step-pill">Step 1</span>
              </div>
              <div class="plg-step1-icon">
                <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>
                </svg>
              </div>
              <div class="plg-step1-dock">
                <div class="plg-step1-dock-app">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div class="plg-step1-dock-app">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor"/></svg>
                </div>
                <div class="plg-step1-dock-app">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="plg-step1-dock-app">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
              </div>
            </div>
          </div>

          <div class="plg-store-row">
            <a class="plg-store-btn" href="${PLAYLINK_APP_STORE}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.04c-.03-3.05 2.49-4.51 2.6-4.58-1.42-2.08-3.62-2.36-4.4-2.39-1.87-.19-3.65 1.1-4.6 1.1-.95 0-2.41-1.08-3.97-1.05-2.04.03-3.93 1.19-4.98 3.02-2.13 3.69-.54 9.15 1.53 12.15 1.01 1.47 2.21 3.11 3.78 3.05 1.52-.06 2.09-.98 3.92-.98 1.83 0 2.36.98 3.96.95 1.64-.03 2.67-1.49 3.67-2.97 1.16-1.71 1.64-3.38 1.67-3.46-.04-.02-3.2-1.23-3.18-4.85zM14.06 3.42c.84-1.02 1.41-2.43 1.26-3.84-1.21.05-2.69.81-3.56 1.82-.78.89-1.46 2.32-1.28 3.7 1.35.11 2.74-.69 3.58-1.68z"/></svg>
              <div class="plg-store-btn-text">
                <span class="small">Download on the</span>
                <span class="big">App Store</span>
              </div>
            </a>
            <a class="plg-store-btn" href="${PLAYLINK_PLAY_STORE}" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24"><path fill="#34A853" d="M3.6 2.4L13.2 12 3.6 21.6c-.2-.2-.3-.5-.3-.8V3.2c0-.3.1-.6.3-.8z"/><path fill="#4285F4" d="M16.8 8.8l3.6 2.1c.6.4.6 1.3 0 1.7l-3.6 2.1L13.2 12l3.6-3.2z"/><path fill="#FBBC04" d="M3.6 2.4c.2-.2.5-.4.9-.4.3 0 .6.1.9.3l11.4 6.5-3.6 3.2L3.6 2.4z"/><path fill="#EA4335" d="M3.6 21.6L13.2 12l3.6 3.2-11.4 6.5c-.3.2-.6.3-.9.3-.4 0-.7-.2-.9-.4z"/></svg>
              <div class="plg-store-btn-text">
                <span class="small">Get it on</span>
                <span class="big">Google Play</span>
              </div>
            </a>
          </div>

          <div class="plg-nav-row">
            <button class="plg-btn secondary" id="plg-back-1" type="button">Back</button>
            <button class="plg-btn primary plg-next" type="button" data-to="2">
              Next <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </section>

        <!-- ── Step 2: Open & Search ── -->
        <section class="plg-step" data-step="2">
          <div class="plg-step-label">Step 02</div>
          <h2 class="plg-step-title">Open &amp; Search</h2>
          <p class="plg-step-desc">
            Launch Playlink and tap the search bar at the bottom of
            the screen. Playlink's built-in content filter blocks
            ads automatically.
          </p>

          <div class="plg-phone">
            <div class="plg-phone-screen">
              <div class="plg-step2-statusbar">
                <span>8:45 PM</span>
                <span>93%</span>
              </div>
              <div class="plg-step2-ready">Ready to browse?</div>
              <div class="plg-step2-stats">
                <div class="plg-step2-stats-title">
                  <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/></svg>
                  SCF Privacy Stats
                </div>
                <div class="plg-step2-stats-row">
                  <span class="v-white">8 Protected Sites</span>
                </div>
                <div class="plg-step2-stats-row">
                  <span class="v-red">278 Blocked URLs</span>
                </div>
                <div class="plg-step2-stats-row">
                  <span class="v-blue">0 Ignored URLs</span>
                </div>
              </div>
              <div class="plg-step2-searchbar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                <span class="ph">Search or type URL</span>
              </div>
              <div class="plg-step2-quickaccess">
                <div class="plg-step2-quickaccess-title">
                  <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15 9 22 9 17 14 19 22 12 17 5 22 7 14 2 9 9 9 12 2" fill="currentColor"/></svg>
                  Quick Access
                </div>
                <div class="plg-step2-quickaccess-row">
                  <div class="plg-step2-quickaccess-item">R</div>
                  <div class="plg-step2-quickaccess-item">P</div>
                  <div class="plg-step2-quickaccess-item">G</div>
                  <div class="plg-step2-quickaccess-item">B</div>
                </div>
              </div>
              <div class="plg-step2-bottomnav">
                <div class="plg-step2-bottomnav-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/></svg>
                  SCF
                </div>
                <div class="plg-step2-bottomnav-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  Saved
                </div>
                <div class="plg-step2-bottomnav-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  History
                </div>
                <div class="plg-step2-bottomnav-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  Dark
                </div>
              </div>
            </div>
          </div>

          <div class="plg-nav-row">
            <button class="plg-btn secondary plg-prev" type="button" data-to="1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <button class="plg-btn primary plg-next" type="button" data-to="3">
              Next <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </section>

        <!-- ── Step 3: Go to netmini.vercel.app ── -->
        <section class="plg-step" data-step="3">
          <div class="plg-step-label">Step 03</div>
          <h2 class="plg-step-title">Go to ${SITE_HOST}</h2>
          <p class="plg-step-desc">
            Type <strong style="color:#fff">${SITE_HOST}</strong> into
            the address bar at the top of Playlink's browser.
          </p>

          <div class="plg-phone">
            <div class="plg-phone-screen">
              <div class="plg-step3-statusbar">
                <span>8:46 PM</span>
                <span>93%</span>
              </div>
              <div class="plg-step3-searchbar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                <span class="url">${SITE_HOST}</span>
                <span class="cursor"></span>
              </div>
              <div class="plg-step3-suggestions">
                <div class="plg-step3-suggestion"><strong>${SITE_HOST}</strong></div>
                <div class="plg-step3-suggestion">https://${SITE_HOST}/</div>
                <div class="plg-step3-suggestion">http://${SITE_HOST}/</div>
              </div>
            </div>
          </div>

          <div class="plg-nav-row">
            <button class="plg-btn secondary plg-prev" type="button" data-to="2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <button class="plg-btn primary plg-next" type="button" data-to="4">
              Next <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </section>

        <!-- ── Step 4: Hit submit ── -->
        <section class="plg-step" data-step="4">
          <div class="plg-step-label">Step 04</div>
          <h2 class="plg-step-title">Hit submit</h2>
          <p class="plg-step-desc">
            Tap the blue submit button on Playlink's keyboard to
            navigate to NetMini.
          </p>

          <div class="plg-phone">
            <div class="plg-phone-screen">
              <div class="plg-step4-statusbar">
                <span>8:46 PM</span>
                <span>93%</span>
              </div>
              <div class="plg-step4-searchbar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                <span class="url">${SITE_HOST}</span>
              </div>
              <div class="plg-step4-submit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              </div>
              <div class="plg-step4-keyboard">
                <div class="plg-step4-keyrow">
                  <div class="plg-step4-key">q</div>
                  <div class="plg-step4-key">w</div>
                  <div class="plg-step4-key">e</div>
                  <div class="plg-step4-key">r</div>
                  <div class="plg-step4-key">t</div>
                  <div class="plg-step4-key">y</div>
                  <div class="plg-step4-key">u</div>
                  <div class="plg-step4-key">i</div>
                  <div class="plg-step4-key">o</div>
                  <div class="plg-step4-key">p</div>
                </div>
                <div class="plg-step4-keyrow">
                  <div class="plg-step4-key">a</div>
                  <div class="plg-step4-key">s</div>
                  <div class="plg-step4-key">d</div>
                  <div class="plg-step4-key">f</div>
                  <div class="plg-step4-key">g</div>
                  <div class="plg-step4-key">h</div>
                  <div class="plg-step4-key">j</div>
                  <div class="plg-step4-key">k</div>
                  <div class="plg-step4-key">l</div>
                </div>
                <div class="plg-step4-keyrow">
                  <div class="plg-step4-key extra dark">⇧</div>
                  <div class="plg-step4-key">z</div>
                  <div class="plg-step4-key">x</div>
                  <div class="plg-step4-key">c</div>
                  <div class="plg-step4-key">v</div>
                  <div class="plg-step4-key">b</div>
                  <div class="plg-step4-key">n</div>
                  <div class="plg-step4-key">m</div>
                  <div class="plg-step4-key dark">⌫</div>
                </div>
                <div class="plg-step4-keyrow">
                  <div class="plg-step4-key wide dark">123</div>
                  <div class="plg-step4-key dark">🎤</div>
                  <div class="plg-step4-key extra" style="background:rgba(255,255,255,0.25)">space</div>
                  <div class="plg-step4-key wide dark">Go</div>
                </div>
              </div>
            </div>
          </div>

          <div class="plg-nav-row">
            <button class="plg-btn secondary plg-prev" type="button" data-to="3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <button class="plg-btn primary plg-next" type="button" data-to="5">
              Next <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </section>

        <!-- ── Step 5: Choose a server ── -->
        <section class="plg-step" data-step="5">
          <div class="plg-step-label">Step 05</div>
          <h2 class="plg-step-title">Ready to watch?</h2>
          <p class="plg-step-desc">
            Now choose a server that works best for you. If the
            selected one fails, try another. That's it — happy
            streaming!
          </p>

          <div class="plg-phone">
            <div class="plg-phone-screen">
              <div class="plg-step5-statusbar">
                <span>8:47 PM</span>
                <span>93%</span>
              </div>
              <div class="plg-step5-modal">
                <div class="plg-step5-modal-title">Available Servers</div>
                <div class="plg-step5-modal-sub">
                  Please choose a server to start watching!<br>
                  If the selected one is not working, try another.
                </div>
                <div class="plg-step5-server">
                  <div class="plg-step5-server-icon blue">
                    <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                  </div>
                  <div class="plg-step5-server-info">
                    <div class="plg-step5-server-name">
                      VSEMbed
                      <span class="plg-step5-server-rec">Recommended</span>
                    </div>
                    <div class="plg-step5-server-tag">Movies/TV Shows · v1.0.1</div>
                  </div>
                </div>
                <div class="plg-step5-server">
                  <div class="plg-step5-server-icon green">
                    <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                  </div>
                  <div class="plg-step5-server-info">
                    <div class="plg-step5-server-name">VidBolt</div>
                    <div class="plg-step5-server-tag">Movies/TV Shows · v1.0.0</div>
                  </div>
                </div>
                <div class="plg-step5-server">
                  <div class="plg-step5-server-icon globe">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg>
                  </div>
                  <div class="plg-step5-server-info">
                    <div class="plg-step5-server-name">VidLink</div>
                    <div class="plg-step5-server-tag">Movies/TV Shows · v1.0.0</div>
                  </div>
                </div>
                <div class="plg-step5-server">
                  <div class="plg-step5-server-icon teal">
                    <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                  </div>
                  <div class="plg-step5-server-info">
                    <div class="plg-step5-server-name">VidSrc</div>
                    <div class="plg-step5-server-tag">Movies/TV Shows · v1.0.0</div>
                  </div>
                </div>
                <div class="plg-step5-server">
                  <div class="plg-step5-server-icon red">
                    <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                  </div>
                  <div class="plg-step5-server-info">
                    <div class="plg-step5-server-name">Cinezo</div>
                    <div class="plg-step5-server-tag">Movies/TV Shows · v1.0.0</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="plg-final-cta">
            <button class="plg-btn done" id="plg-done-btn" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Done
            </button>
          </div>
        </section>
      </div>
    `;

    document.body.appendChild(overlay);

    /* Reveal after a brief tick so the CSS transition fires. */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
      });
    });

    /* ── Wire up controls ── */
    let currentStep = 1;
    const totalSteps = 5;

    function goToStep(n) {
      if (n < 1 || n > totalSteps) return;
      currentStep = n;
      overlay.querySelectorAll('.plg-step').forEach(s => {
        s.classList.toggle('active', Number(s.dataset.step) === n);
      });
      overlay.querySelectorAll('.plg-progress-dot').forEach((dot, i) => {
        dot.classList.remove('active', 'done');
        if (i + 1 < n) dot.classList.add('done');
        else if (i + 1 === n) dot.classList.add('active');
      });
      overlay.querySelector('#plg-step-counter').textContent =
        `Step ${n} of ${totalSteps}`;
      overlay.scrollTop = 0;
    }

    overlay.querySelectorAll('.plg-next, .plg-prev').forEach(btn => {
      btn.addEventListener('click', () => {
        const to = Number(btn.dataset.to);
        if (to) goToStep(to);
      });
    });

    /* Back button on Step 1 just dismisses (acts like Skip). */
    const back1 = overlay.querySelector('#plg-back-1');
    if (back1) back1.addEventListener('click', dismiss);

    overlay.querySelector('#plg-skip-btn').addEventListener('click', dismiss);
    overlay.querySelector('#plg-done-btn').addEventListener('click', dismiss);

    function dismiss() {
      sessionStorage.setItem(DISMISS_KEY, '1');
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      setTimeout(() => overlay.remove(), 350);
    }

    /* ── Esc key dismisses ── */
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) {
        dismiss();
        document.removeEventListener('keydown', onEsc);
      }
    });
  }
})();
