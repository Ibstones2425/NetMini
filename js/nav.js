/* ============================================================
   nav.js — Active-state highlighting.
   renderNav() is defined in components.js.
   ============================================================ */

function highlightNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(el => {
    const href   = el.getAttribute('href') || '';
    const target = href.split('/').pop();
    if (target === path) {
      el.classList.add('active');
      el.setAttribute('aria-current', 'page');
    } else {
      el.classList.remove('active');
      el.removeAttribute('aria-current');
    }
  });
}
