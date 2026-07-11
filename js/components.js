/* ============================================================
   components.js — Shared render functions used across pages.
   KEY FIX: uses src= directly with loading="lazy" (not data-src)
   so images actually load on all devices, including 360px mobile.
   ============================================================ */

/* ── Inline SVG icon set ── */
const ICONS = {
  check:        '<svg viewBox="0 0 24 24" class="chip-check" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"/></svg>',
  sliders:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="9" cy="18" r="2" fill="currentColor"/></svg>',
  chevronLeft:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
  home:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12L12 3l9 9"/><path d="M5 10v10h14V10"/></svg>',
  telescope:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 14l8-3 5 8-8 3z"/><path d="M11 11l4-7 5 3-4 7"/><line x1="7" y1="20" x2="5" y2="22"/></svg>',
  search:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  bookmark:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  dots:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none"/></svg>',
  play:         '<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/></svg>',
  back:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
  plus:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  info:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  close:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

/* ── HTML escape ── */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── Poster image error handler (called via onerror="…") ──
   Kept as a named global so the onerror attribute never needs
   nested quotes — avoids the broken \" parsing issue. */
function posterImgError(el) {
  el.parentElement.innerHTML = '<div class="img-placeholder">No Image</div>';
}

/* ── Render a single poster card ──
   FIXED: uses src= directly with loading="lazy" — not data-src!
   This is why images weren't showing on mobile.
   Premium: image fades in (opacity 0.4s) when finished loading
   from the TMDB API. */
function renderPosterCard(item, opts = {}) {
  const type  = opts.type || getMediaType(item);
  const title = getTitle(item);
  const score = Number.isFinite(item.vote_average) ? Math.round(item.vote_average * 10) : null;
  const year = getYear(item);
  // Support both TMDB API items (poster_path) and stored history/playlist items (poster)
  const posterPath = item.poster_path || item.poster || null;
  const poster = posterPath
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${TMDB_CONFIG.POSTER_SIZE}${posterPath}`
    : '';
  const href = `details.html?type=${type}&id=${item.id}`;

  const scoreBadge = score !== null
    ? `<span class="poster-score">${score}%</span>`
    : '';
  const typeBadge = `<span class="poster-type-badge">${type === 'tv' ? 'TV' : 'MOVIE'}</span>`;
  const imgHtml = poster
    ? `<img class="nf-img-fade" src="${poster}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="posterImgError(this)">`
    : `<div class="img-placeholder">No Image</div>`;
  const metaBits = [];
  if (year) metaBits.push(`<span>${year}</span>`);
  if (score !== null) metaBits.push(`<span class="poster-meta-score">${score}%</span>`);

  return `
    <a class="poster-card" href="${href}">
      <div class="poster-card-img-wrap">
        ${imgHtml}
        ${typeBadge}
        ${scoreBadge}
      </div>
      <div class="poster-card-body">
        <div class="poster-card-title">${escapeHtml(title)}</div>
        ${metaBits.length ? `<div class="poster-card-meta">${metaBits.join('<span class="poster-meta-dot">•</span>')}</div>` : ''}
      </div>
    </a>`;
}

function renderTopTenCard(item, rank, opts = {}) {
  const type = opts.type || getMediaType(item);
  const title = getTitle(item);
  const posterPath = item.poster_path || item.poster || null;
  const poster = posterPath
    ? `${TMDB_CONFIG.IMAGE_BASE_URL}${TMDB_CONFIG.POSTER_SIZE}${posterPath}`
    : '';
  const href = `details.html?type=${type}&id=${item.id}`;
  const score = Number.isFinite(item.vote_average) ? Math.round(item.vote_average * 10) : null;

  return `
    <a class="poster-card top-ten-card" href="${href}" aria-label="Top ${rank}: ${escapeHtml(title)}">
      <span class="top-ten-rank" aria-hidden="true">${rank}</span>
      <div class="poster-card-img-wrap">
        ${
          poster
            ? `<img class="nf-img-fade" src="${poster}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')" onerror="posterImgError(this)">`
            : `<div class="img-placeholder">No Image</div>`
        }
        <span class="poster-type-badge">${type === 'tv' ? 'TV' : 'MOVIE'}</span>
        ${score !== null ? `<span class="poster-score">${score}%</span>` : ''}
      </div>
    </a>`;
}

/* ── Avatar card (cast/people) ── */
function renderAvatarRow(items, opts = {}) {
  const cards = items
    .filter(i => i && i.profile_path)
    .map(i => {
      const charHtml = i.character
        ? `<div class="avatar-character">as ${escapeHtml(i.character)}</div>`
        : '';
      const profileSrc = `${TMDB_CONFIG.IMAGE_BASE_URL}${TMDB_CONFIG.PROFILE_SIZE}${i.profile_path}`;
      return `
        <div class="avatar-card">
          <div class="avatar-img-wrap">
            <img class="nf-img-fade" src="${profileSrc}" alt="${escapeHtml(i.name)}" loading="lazy" decoding="async" onload="this.classList.add('loaded')">
          </div>
          <div class="avatar-name">${escapeHtml(i.name)}</div>
          ${charHtml}
        </div>`;
    })
    .join('');
  return `
    <div class="content-row-wrapper">
      <button class="row-arrow left" aria-label="Scroll left">${ICONS.chevronLeft}</button>
      <div class="content-row">${cards}</div>
      <button class="row-arrow right" aria-label="Scroll right">${ICONS.chevronRight}</button>
    </div>`;
}

/* ── Filter chip ── */
function renderChip(label, opts = {}) {
  const activeCls = opts.active ? 'active' : '';
  const iconHtml  = opts.icon ? ICONS[opts.icon] || '' : '';
  const tag       = opts.href ? 'a' : 'button';
  const href      = opts.href ? `href="${opts.href}"` : '';
  const dataAttrs = opts.dataKey ? `data-${opts.dataKey}="${opts.dataValue || ''}"` : '';
  return `<${tag} class="chip ${activeCls}" ${href} ${dataAttrs}>${iconHtml}<span>${label}</span>${ICONS.check}</${tag}>`;
}

/* ── Skeleton loaders ── */
function skeletonRowCards(count = 6) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="poster-card">
      <div class="skeleton skeleton-poster"></div>
      <div class="skeleton skeleton-text" style="width:80%"></div>
    </div>`;
  }
  return html;
}

function skeletonAvatarCards(count = 6) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="avatar-card">
      <div class="skeleton skeleton-avatar"></div>
      <div class="skeleton skeleton-text" style="width:60px"></div>
    </div>`;
  }
  return html;
}

function skeletonGrid(count = 12) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="poster-card">
      <div class="skeleton" style="width:100%;aspect-ratio:2/3;border-radius:8px"></div>
      <div class="skeleton skeleton-text" style="width:80%"></div>
    </div>`;
  }
  return html;
}

/* ── Row arrow scroll buttons ── */
function attachRowArrows() {
  document.querySelectorAll('.content-row-wrapper').forEach(wrap => {
    const row   = wrap.querySelector('.content-row');
    if (!row) return;
    const left  = wrap.querySelector('.row-arrow.left');
    const right = wrap.querySelector('.row-arrow.right');
    if (left)  left.onclick  = () => row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' });
    if (right) right.onclick = () => row.scrollBy({ left:  row.clientWidth * 0.8, behavior: 'smooth' });
  });
}

/* ── Render sidebar + bottom nav ──
   Integrates logo.png into the sidebar wordmark and the
   mobile top wordmark. */
function renderNav() {
  const sidebar   = document.getElementById('sidebar');
  const bottomBar = document.getElementById('bottom-bar');
  const navHtml = `
    <a class="nav-item" href="index.html"><span class="nav-icon">${ICONS.home}</span><span>Home</span></a>
    <a class="nav-item" href="discover.html"><span class="nav-icon">${ICONS.telescope}</span><span>Discover</span></a>
    <a class="nav-item" href="search.html"><span class="nav-icon">${ICONS.search}</span><span>Search</span></a>
    <a class="nav-item" href="playlist.html"><span class="nav-icon">${ICONS.bookmark}</span><span>Saved</span></a>
    <a class="nav-item" href="more.html"><span class="nav-icon">${ICONS.dots}</span><span>Menu</span></a>
  `;
  if (sidebar)   sidebar.innerHTML   = `<div class="sidebar-wordmark"><img class="sidebar-logo" src="logo.png" alt="NetMini"><span class="sidebar-wordmark-text">NET<span>MINI</span></span></div><nav class="sidebar-nav">${navHtml}</nav>`;
  if (bottomBar) bottomBar.innerHTML = navHtml;

  /* Inject logo into the mobile top wordmark (if present) */
  document.querySelectorAll('.mobile-wordmark').forEach(wm => {
    if (!wm.querySelector('.mobile-logo')) {
      const logo = document.createElement('img');
      logo.className = 'mobile-logo';
      logo.src = 'logo.png';
      logo.alt = 'NetMini';
      wm.insertBefore(logo, wm.firstChild);
    }
  });

  highlightNav();
}

/* ── Auto-init nav on DOMContentLoaded ── */
document.addEventListener('DOMContentLoaded', renderNav);

/* ── No-op — images now load natively, keeping stub so nothing breaks ── */
function lazyLoadImages() { /* native loading="lazy" handles this */ }

/* ════════════════════════════════════════════════════════════
   ANILIST TRENDING CARD
   Renders an AniList-format card for the "Trending Anime" row
   on the home page. AniList cards have:
     • coverImage.large (poster URL — already a TMDB-equivalent
       w342 image, no URL prefixing needed)
     • title.english / title.romaji / title.native
     • averageScore (0-100)
     • format (TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL, MUSIC)
     • episodes
     • seasonYear

   The card is clickable and triggers a TMDB title search to
   resolve the corresponding TMDB id, then redirects to the
   details page so the user lands on the same Netflix-style
   surface they're used to (and the watch page's isAnime()
   routing picks up from there).
   ════════════════════════════════════════════════════════════ */
function renderAnimeCard(item) {
  if (!item) return '';
  const title    = (item.title && (item.title.english || item.title.romaji || item.title.native)) || 'Untitled';
  const coverUrl = item.coverImage && (item.coverImage.extraLarge || item.coverImage.large);
  const score    = item.averageScore ? Math.round(item.averageScore) : null;
  const year     = item.seasonYear || '';
  const format   = item.format || 'TV';
  const episodes = item.episodes;
  const anilistId = item.id;

  // Score badge (AniList scores are 0-100, displayed as "85%")
  const scoreBadge = score !== null
    ? `<span class="poster-score">${score}%</span>`
    : '';
  // Format badge (TV / MOVIE / OVA / etc.)
  const formatBadge = `<span class="poster-type-badge">${escapeHtml(format)}</span>`;

  // Body meta: year • episodes
  const metaBits = [];
  if (year) metaBits.push(`<span>${year}</span>`);
  if (episodes) metaBits.push(`<span class="poster-meta-score">${episodes} ep</span>`);

  const imgHtml = coverUrl
    ? `<img class="nf-img-fade" src="${coverUrl}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('loaded')" onerror="posterImgError(this)">`
    : `<div class="img-placeholder">No Image</div>`;

  return `
    <a class="poster-card anime-card" href="#" data-anilist-id="${anilistId}" data-anilist-title="${escapeHtml(title)}">
      <div class="poster-card-img-wrap">
        ${imgHtml}
        ${formatBadge}
        ${scoreBadge}
      </div>
      <div class="poster-card-body">
        <div class="poster-card-title">${escapeHtml(title)}</div>
        ${metaBits.length ? `<div class="poster-card-meta">${metaBits.join('<span class="poster-meta-dot">•</span>')}</div>` : ''}
      </div>
    </a>`;
}

/* ── Wire up clicks on AniList cards ──
   Card clicks trigger a TMDB title search via findTmdbIdFromAnilistTitle(),
   then redirect to details.html with the resolved TMDB id. Falls
   back to opening watch.html?anilist={id} (which the watch page
   treats as a direct Cinezo anime play) if TMDB lookup fails. */
function attachAnimeCardClicks(scope) {
  const root = scope || document;
  root.querySelectorAll('.anime-card[data-anilist-id]').forEach(card => {
    if (card._animeClickWired) return;
    card._animeClickWired = true;
    card.addEventListener('click', async (e) => {
      e.preventDefault();
      const title = card.dataset.anilistTitle;
      const anilistId = card.dataset.anilistId;
      // Visual feedback
      card.style.opacity = '0.6';
      card.style.pointerEvents = 'none';

      try {
        // findTmdbIdFromAnilistTitle is defined in anilist.js (loaded before home.js)
        const match = await findTmdbIdFromAnilistTitle(title);
        if (match) {
          window.location.href = `details.html?type=${match.type}&id=${match.id}`;
          return;
        }
      } catch (_) { /* fall through to anilist-only mode */ }

      // Fallback: open watch.html?anilist={id} — watch.js's existing
      // anilist-mode handler will resolve the rest. (Note: anilist-
      // mode is a future enhancement; for now we show a toast.)
      if (typeof showToast === 'function') {
        showToast('Could not find this title on TMDB — try searching manually');
      }
      card.style.opacity = '';
      card.style.pointerEvents = '';
    });
  });
}
