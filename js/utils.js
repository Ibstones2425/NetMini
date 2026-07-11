/* ============================================================
   utils.js — Shared helper functions.
   Loaded third on every page (after config.js, api.js).
   ============================================================ */

/**
 * Build a full TMDB image URL.
 * @param {string} path  - TMDB poster/backdrop/profile path (e.g. "/abc.jpg")
 * @param {string} size  - "w500" | "original" | "w185" etc.
 */
function imgUrl(path, size) {
  if (!path) return "";
  return `${TMDB_CONFIG.IMAGE_BASE_URL}${size}${path}`;
}

/**
 * Build a poster image URL (w500).
 */
function posterUrl(path) {
  return imgUrl(path, TMDB_CONFIG.POSTER_SIZE);
}

/**
 * Build a backdrop image URL (original).
 */
function backdropUrl(path) {
  return imgUrl(path, TMDB_CONFIG.BACKDROP_SIZE);
}

/**
 * Build a profile image URL (w185).
 */
function profileUrl(path) {
  return imgUrl(path, TMDB_CONFIG.PROFILE_SIZE);
}

/**
 * Read URL query params on the current page.
 * @param {string} key
 * @returns {string|null}
 */
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

/**
 * Debounce a function.
 * @param {Function} fn
 * @param {number} delay - ms
 */
function debounce(fn, delay = 400) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Format a TMDB date string ("2024-07-11") to "Jul 11, 2024".
 */
function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

/**
 * Format runtime minutes → "2h 14m" or TV seasons/episodes.
 */
function formatRuntime(minutes) {
  if (!minutes || minutes <= 0) return "N/A";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Truncate text to n chars with ellipsis.
 */
function truncate(str, n = 150) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

/**
 * Get the media type from a TMDB result item.
 * Some endpoints return "media_type", others don't.
 */
function getMediaType(item) {
  if (item.media_type) return item.media_type;
  if (item.first_air_date) return "tv";
  if (item.release_date) return "movie";
  return "movie";
}

/**
 * Get the title from a TMDB item (movie → title, tv → name).
 */
function getTitle(item) {
  return item.title || item.name || item.original_title || item.original_name || "Untitled";
}

/**
 * Get the release year from a TMDB item.
 */
function getYear(item) {
  const d = item.release_date || item.first_air_date;
  return d ? new Date(d).getFullYear() : "";
}

/* ── Skeleton loaders ── */

/**
 * Create N skeleton poster cards (for rows).
 */
function skeletonRowCards(count = 6) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="poster-card">
        <div class="skeleton skeleton-poster" style="width:100%"></div>
        <div class="skeleton skeleton-text" style="width:80%"></div>
      </div>`;
  }
  return html;
}

/**
 * Create N skeleton avatar cards.
 */
function skeletonAvatarCards(count = 6) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="avatar-card">
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton skeleton-text" style="width:60px"></div>
      </div>`;
  }
  return html;
}

/**
 * Create a skeleton poster grid.
 */
function skeletonGrid(count = 12) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="poster-card">
        <div class="skeleton" style="width:100%;aspect-ratio:2/3;border-radius:8px"></div>
        <div class="skeleton skeleton-text" style="width:80%"></div>
      </div>`;
  }
  return html;
}

/* ── Playlist (localStorage) helpers ── */

const PLAYLIST_KEY = "netmini_playlist";

/**
 * Get the full playlist array.
 * Each item: { id, type, title, poster, rating, year }
 */
function getPlaylist() {
  try {
    return JSON.parse(localStorage.getItem(PLAYLIST_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Check if a title is in the playlist.
 */
function isInPlaylist(id, type) {
  return getPlaylist().some(
    (item) => item.id === Number(id) && item.type === type
  );
}

/**
 * Toggle a title in the playlist. Returns true if now saved.
 */
function togglePlaylist(item) {
  const list = getPlaylist();
  const idx = list.findIndex(
    (x) => x.id === item.id && x.type === item.type
  );
  if (idx >= 0) {
    list.splice(idx, 1);
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(list));
    return false;
  } else {
    list.push(item);
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(list));
    return true;
  }
}

/**
 * Remove a title from the playlist by id+type.
 */
function removeFromPlaylist(id, type) {
  const list = getPlaylist().filter(
    (item) => !(item.id === Number(id) && item.type === type)
  );
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(list));
}

/* ── Watch History (localStorage) ── */

const HISTORY_KEY = "netmini_history";

/**
 * Get watch history array (most recent first).
 */
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Add or move a title to the front of watch history.
 */
function addToHistory(item) {
  let list = getHistory();
  list = list.filter((x) => !(x.id === item.id && x.type === item.type));
  list.unshift(item);
  list = list.slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

/* ── Toast notification (global) ── */
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.remove('show'), duration);
}
