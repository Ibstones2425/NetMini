/* ============================================================
   pwa.js — NetMini PWA bootstrap.
   Loaded on every page. Registers the service worker and
   exposes a tiny helper API for install prompts.
   ============================================================ */

(function () {
  'use strict';

  /* ── Register the service worker ── */
  if ('serviceWorker' in navigator) {
    // Wait for window load so the SW registration doesn't compete
    // with first-paint critical requests.
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('./service-worker.js', { scope: './' })
        .then(function (reg) {
          //console.log('[PWA] service worker registered', reg.scope);

          // Check for updates every hour
          setInterval(function () {
            reg.update().catch(function () { /* silent */ });
          }, 60 * 60 * 1000);

          // If a new SW takes over, reload once so the user gets
          // the latest app shell.
          var refreshing = false;
          navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
          });
        })
        .catch(function (err) {
          console.warn('[PWA] service worker registration failed', err);
        });
    });
  }

  /* ── beforeinstallprompt: capture for custom install button ── */
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    deferredPrompt = e;
    // Notify any UI listeners that an install is now available
    window.dispatchEvent(new CustomEvent('pwa-installable'));
    //console.log('[PWA] install prompt captured');
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    //console.log('[PWA] app installed');
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });

  /* ── Public helper API (window.NetMiniPWA) ── */
  window.NetMiniPWA = {
    /* True if the app is running as an installed PWA (standalone) */
    get isStandalone() {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari standalone flag
        window.navigator.standalone === true
      );
    },

    /* True if an install prompt is available (Chrome/Edge/Android) */
    canInstall: function () {
      return deferredPrompt !== null;
    },

    /* Trigger the install prompt (returns a Promise<boolean>) */
    promptInstall: function () {
      if (!deferredPrompt) return Promise.resolve(false);
      return deferredPrompt
        .prompt()
        .then(function () {
          return deferredPrompt.userChoice;
        })
        .then(function (choice) {
          deferredPrompt = null;
          return choice.outcome === 'accepted';
        });
    },
  };
})();
