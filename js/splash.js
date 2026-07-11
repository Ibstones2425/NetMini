/* ============================================================
   splash.js — App splash screen & page transition manager.
   Injected on every page. Shows branded splash on first load,
   then a minimal page-fade on subsequent navigations.
   ============================================================ */

(function () {
  'use strict';

  const SPLASH_KEY   = 'nm_splash_v1';
  const MIN_SHOW_MS  = 1600; /* minimum visible time */
  const FADE_MS      = 500;

  /* Check if splash was already shown this session */
  const isFirstLoad = !sessionStorage.getItem(SPLASH_KEY);

  /* Only show full splash on first load */
  if (!isFirstLoad) return;

  /* ── Build splash DOM ─────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'app-splash';
  overlay.innerHTML = `
    <div class="splash-inner">
      <div class="splash-wordmark">NET<span>MINI</span></div>
      <div class="splash-tagline">Stream Smarter</div>
      <div class="splash-progress"><div class="splash-progress-bar"></div></div>
    </div>`;

  /* Insert into body immediately */
  function mountSplash() {
    document.body.insertBefore(overlay, document.body.firstChild);
    /* Trigger progress bar animation */
    requestAnimationFrame(() => {
      overlay.classList.add('splash-animate');
    });
  }

  /* ── Dismiss splash ─────────────────────── */
  function hideSplash() {
    overlay.classList.add('splash-out');
    sessionStorage.setItem(SPLASH_KEY, '1');
    setTimeout(() => {
      overlay.remove();
    }, FADE_MS + 50);
  }

  /* Mount as soon as DOM is ready */
  if (document.body) {
    mountSplash();
  } else {
    document.addEventListener('DOMContentLoaded', mountSplash);
  }

  /* Dismiss after min display time, regardless of load state */
  const startTime = Date.now();
  window.addEventListener('load', () => {
    const elapsed   = Date.now() - startTime;
    const remaining = Math.max(0, MIN_SHOW_MS - elapsed);
    setTimeout(hideSplash, remaining);
  });

  /* Absolute fallback in case 'load' never fires */
  setTimeout(hideSplash, MIN_SHOW_MS + 1200);

})();
