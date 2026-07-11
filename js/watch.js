/* ============================================================
   watch.js — NetMini watch page.
   Providers:
     1. Cinezo       (primary  — best quality, customisable)
     2. VidBolt      (secondary — postMessage events + sync)
     3. Visembed     (tier-3 fallback — correct query-param URLs)
     4. VidSrc.to    (server 4)
     5. VidSrc.cc    (server 5)
     6. 2Embed       (server 6)
   ============================================================ */

(function () {
  'use strict';

  /* ── State ── */
  let mediaType, mediaId, detailsData, activeProvider;
  let playerOpen    = false;
  let lastProgressSave = 0;

  /* ── Provider registry ──
     Cinezo:   clean path URLs, rich params, autoplay=true works
     VidBolt:  postMessage events; only movies are officially supported
     Visembed: MUST use ?tmdb= query params (NOT /movie/{id} path) */
  const PROVIDERS = [
    {
      key:     'cinezo',
      name:    'Cinezo',
      tag:     'Recommended · HD',
      tier:    'primary',
      movieUrl: id      => `https://player.cinezo.live/embed/movie/${id}?autoplay=true&primarycolor=E50914&secondarycolor=0a0a12&iconcolor=ffffff&poster=true&pip=true&chromecast=true&servericon=true&setting=true`,
      tvUrl:   (id,s,e) => `https://player.cinezo.live/embed/tv/${id}/${s}/${e}?autoplay=true&primarycolor=E50914&secondarycolor=0a0a12&iconcolor=ffffff&poster=true&pip=true&chromecast=true&servericon=true&setting=true`,
    },
    {
      key:     'vidbolt',
      name:    'VidBolt',
      tag:     'Server 2 · Interactive',
      tier:    'secondary',
      movieUrl: id      => `https://vidbolt.xyz/movie/${id}?theme=E50914&autoPlay=true&title=false&poster=false`,
      /* VidBolt TV endpoint mirrors movie for now */
      tvUrl:   (id,s,e) => `https://vidbolt.xyz/movie/${id}?theme=E50914&autoPlay=true`,
    },
    {
      key:     'visembed',
      name:    'Visembed',
      tag:     'Server 3 · Classic',
      tier:    'fallback',
      /* NOTE: Visembed uses query params NOT path routing */
      movieUrl: id      => `https://vsembed.ru/embed/movie?tmdb=${id}`,
      tvUrl:   (id,s,e) => `https://vsembed.ru/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
    },
    {
      key:     'vidsrc',
      name:    'VidSrc.to',
      tag:     'Server 4',
      tier:    'extra',
      movieUrl: id      => `https://vidsrc.to/embed/movie/${id}`,
      tvUrl:   (id,s,e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
    },
    {
      key:     'vidsrccc',
      name:    'VidSrc.cc',
      tag:     'Server 5',
      tier:    'extra',
      movieUrl: id      => `https://vidsrc.cc/v2/embed/movie/${id}`,
      tvUrl:   (id,s,e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
    },
    {
      key:     '2embed',
      name:    '2Embed',
      tag:     'Server 6',
      tier:    'extra',
      movieUrl: id      => `https://www.2embed.cc/embed/${id}`,
      tvUrl:   (id,s,e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
    },
  ];

  /* ── Element refs ── */
  let elHeroBackdrop, elHeroTitle, elWatchTitle,
      elMetaMatch, elMetaYear, elMetaRating, elMetaRuntime,
      elServerChip, elServerName, elHeroServerBadge, elHeroServerLabel,
      elSynopsis, elCastLine,
      elOverlay, elOverlayIframe, elOverlayClose,
      elIframeLoader, elIframeLoaderTip,
      elServerModal, elServerModalList,
      elPlayerActiveServer;

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    mediaType = getParam('type') || 'movie';
    mediaId   = getParam('id');

    /* Cache DOM refs */
    elHeroBackdrop      = document.getElementById('watch-hero-backdrop');
    elHeroTitle         = document.getElementById('watch-hero-title');
    elWatchTitle        = document.getElementById('watch-title');
    elMetaMatch         = document.getElementById('watch-meta-match');
    elMetaYear          = document.getElementById('watch-meta-year');
    elMetaRating        = document.getElementById('watch-meta-rating');
    elMetaRuntime       = document.getElementById('watch-meta-runtime');
    elServerChip        = document.getElementById('watch-server-chip');
    elServerName        = document.getElementById('watch-server-name');
    elHeroServerBadge   = document.getElementById('watch-hero-server-badge');
    elHeroServerLabel   = document.getElementById('watch-hero-server-label');
    elSynopsis          = document.getElementById('watch-synopsis');
    elCastLine          = document.getElementById('watch-cast-line');
    elOverlay           = document.getElementById('player-overlay');
    elOverlayIframe     = document.getElementById('player-overlay-iframe');
    elOverlayClose      = document.getElementById('player-overlay-close');
    elIframeLoader      = document.getElementById('iframe-loader');
    elIframeLoaderTip   = document.getElementById('iframe-loader-tip');
    elServerModal       = document.getElementById('server-modal');
    elServerModalList   = document.getElementById('server-modal-list');
    elPlayerActiveServer = document.getElementById('player-active-server');

    /* Wire up controls */
    document.getElementById('watch-back-btn').addEventListener('click', () => window.history.back());
    document.getElementById('watch-hero-play-btn').addEventListener('click', openPlayer);
    document.getElementById('watch-play-btn').addEventListener('click', openPlayer);
    document.getElementById('watch-servers-btn').addEventListener('click', openServerModal);
    document.getElementById('util-mylist').addEventListener('click', toggleMyList);
    document.getElementById('util-share').addEventListener('click', handleShare);
    document.getElementById('util-servers-icon').addEventListener('click', openServerModal);

    /* Episode play button (TV) */
    const epPlayBtn = document.getElementById('episode-play-btn');
    if (epPlayBtn) epPlayBtn.addEventListener('click', openPlayer);

    /* Server modal */
    elServerChip.addEventListener('click', openServerModal);
    document.getElementById('server-modal-close').addEventListener('click', closeServerModal);
    elServerModal.addEventListener('click', e => { if (e.target === elServerModal) closeServerModal(); });

    /* Player overlay */
    elOverlayClose.addEventListener('click', closePlayer);
    const playerServerSwitch = document.getElementById('player-server-switch');
    if (playerServerSwitch) playerServerSwitch.addEventListener('click', () => {
      closePlayer();
      openServerModal();
    });

    /* Fullscreen change → close overlay if user exits native FS */
    document.addEventListener('fullscreenchange',       onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    /* Android back button while overlay is open */
    window.addEventListener('popstate', e => {
      if (playerOpen) { closePlayer(); e.preventDefault(); }
    });

    /* VidBolt / VidFast postMessage events */
    window.addEventListener('message', handlePlayerMessage);

    /* Iframe load event → hide loader */
    elOverlayIframe.addEventListener('load', onIframeLoad);

    /* Default provider */
    activeProvider = PROVIDERS[0];
    updateServerLabels();

    /* Build server modal */
    buildServerModalList();

    /* Fetch TMDB data */
    if (mediaId) loadDetails();
  });

  /* ══════════════════════════════════════════
     DATA
  ══════════════════════════════════════════ */
  async function loadDetails() {
    const { data, error } = await getDetails(mediaType, mediaId);
    if (error || !data) {
      elWatchTitle.textContent = 'Failed to load';
      elHeroTitle.textContent  = '';
      return;
    }
    detailsData = data;

    const title   = getTitle(data);
    const year    = getYear(data);
    const rating  = data.vote_average ? Math.round(data.vote_average * 10) : null;
    const runtime = mediaType === 'movie'
      ? (data.runtime ? formatRuntime(data.runtime) : null)
      : (data.episode_run_time?.[0] ? formatRuntime(data.episode_run_time[0]) : null);
    const cert = data.adult ? '18+' : (mediaType === 'movie' ? 'U/A 16+' : 'TV-14');

    /* Backdrop */
    if (data.backdrop_path) {
      elHeroBackdrop.src = `${TMDB_CONFIG.IMAGE_BASE_URL}original${data.backdrop_path}`;
      elHeroBackdrop.alt = title;
    }

    /* Titles */
    elHeroTitle.textContent  = title;
    elWatchTitle.textContent = title;

    /* Meta */
    if (rating)  { elMetaMatch.textContent = `${rating}% match`; elMetaMatch.style.display = ''; }
    if (year)    elMetaYear.textContent    = year;
    if (cert)    elMetaRating.textContent  = cert;
    if (runtime) elMetaRuntime.textContent = runtime;

    /* Synopsis */
    elSynopsis.textContent = data.overview || 'No synopsis available.';

    /* Cast */
    const castNames = data.credits?.cast?.slice(0, 5).map(c => c.name).join(', ');
    if (castNames) {
      elCastLine.innerHTML = `<span class="cast-label">Cast: </span>${escapeHtml(castNames)}`;
    }

    /* TV → show season/episode selector */
    if (mediaType === 'tv' && data.seasons) {
      renderSeasonSelector(data);
      document.querySelector('.watch-brand-pill').innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="#E50914"><rect x="3" y="2" width="5" height="20"/><rect x="16" y="2" width="5" height="20"/><rect x="3" y="2" width="18" height="3.5" fill="#E50914"/></svg>
        SERIES`;
    }

    /* Save to watch history */
    addToHistory({
      id:     Number(mediaId),
      type:   mediaType,
      title,
      poster: data.poster_path,
      rating: data.vote_average ? data.vote_average.toFixed(1) : null,
      year
    });
  }

  /* ══════════════════════════════════════════
     SEASON / EPISODE (TV)
  ══════════════════════════════════════════ */
  function renderSeasonSelector(data) {
    const selector      = document.getElementById('watch-selector');
    const seasonSelect  = document.getElementById('season-select');
    const episodeSelect = document.getElementById('episode-select');

    selector.hidden = false;

    const seasons    = data.seasons.filter(s => s.season_number > 0);
    const urlSeason  = Number(getParam('season'))  || 1;
    const urlEpisode = Number(getParam('episode')) || 1;

    seasonSelect.innerHTML = seasons
      .map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`)
      .join('');
    seasonSelect.value = urlSeason;
    updateEpisodes(urlSeason, urlEpisode);

    seasonSelect.addEventListener('change', () => { updateEpisodes(seasonSelect.value, 1); syncUrl(); });
    episodeSelect.addEventListener('change', syncUrl);
  }

  function updateEpisodes(seasonNum, selectedEp) {
    const episodeSelect = document.getElementById('episode-select');
    const season  = detailsData?.seasons?.find(s => s.season_number === Number(seasonNum));
    const epCount = season?.episode_count || 10;
    episodeSelect.innerHTML = Array.from({ length: epCount }, (_, i) =>
      `<option value="${i + 1}">Episode ${i + 1}</option>`).join('');
    episodeSelect.value = selectedEp;
  }

  function syncUrl() {
    const s = document.getElementById('season-select')?.value  || 1;
    const e = document.getElementById('episode-select')?.value || 1;
    const url = new URL(window.location.href);
    url.searchParams.set('season', s);
    url.searchParams.set('episode', e);
    window.history.replaceState({}, '', url);
  }

  /* ══════════════════════════════════════════
     EMBED URL BUILDER
  ══════════════════════════════════════════ */
  function buildEmbedUrl(provider) {
    if (mediaType === 'tv') {
      const s = document.getElementById('season-select')?.value  || getParam('season')  || 1;
      const e = document.getElementById('episode-select')?.value || getParam('episode') || 1;
      return provider.tvUrl(mediaId, s, e);
    }
    return provider.movieUrl(mediaId);
  }

  /* ══════════════════════════════════════════
     PLAYER — OPEN / CLOSE

     Smart landscape strategy (anti-iframe-crash):
       • Detect portrait mode (innerHeight > innerWidth).
       • If portrait → apply `.force-landscape` CSS class to rotate
         the overlay 90° via CSS transform. NO native orientation
         lock is ever called, because cross-origin iframes from
         third-party providers (Cinezo, VidBolt, VidSrc, 2Embed…)
         often have anti-hijack protection that crashes when the
         parent attempts `screen.orientation.lock('landscape')`.
       • If already landscape → no rotation needed.
       • Re-evaluate on resize / orientationchange so the user can
         freely rotate their device; we just follow.
  ══════════════════════════════════════════ */
  function openPlayer() {
    if (!mediaId) return;
    const url = buildEmbedUrl(activeProvider);

    /* Show loader */
    showIframeLoader(activeProvider.name);

    /* Load the iframe */
    elOverlayIframe.src = url;

    /* Show overlay */
    elOverlay.classList.add('active');
    document.body.classList.add('player-open');
    playerOpen = true;

    /* Push history so back-button closes overlay */
    window.history.pushState({ playerOpen: true }, '');

    /* Apply CSS-based landscape rotation if needed (no native API) */
    applySmartLandscape();

    /* On desktop (non-touch), also request native fullscreen for a
       cleaner viewing experience. On touch devices, we rely purely
       on CSS rotation to avoid iframe anti-hijack crashes. */
    tryFullscreen(elOverlay);

    /* Listen for orientation changes while player is open */
    window.addEventListener('resize',        onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
  }

  function closePlayer() {
    elOverlayIframe.src = '';             /* kill audio/stream immediately */
    elOverlay.classList.remove('active', 'force-landscape', 'landscape-fallback');
    document.body.classList.remove('player-open');
    playerOpen = false;
    hideIframeLoader();

    /* Stop listening to orientation changes */
    window.removeEventListener('resize',        onViewportChange);
    window.removeEventListener('orientationchange', onViewportChange);

    /* Exit native fullscreen on desktop if we entered it.
       (Mobile never enters native FS — uses CSS rotation only.) */
    if (_inNativeFS) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
      if (exit && document.fullscreenElement) {
        exit.call(document).catch(() => {});
      }
      _inNativeFS = false;
    }
  }

  /* ── Smart landscape helper ──
     Applies `.force-landscape` only when device is in portrait.
     Never calls screen.orientation.lock — that's the whole point. */
  function applySmartLandscape() {
    if (!playerOpen) return;
    const isPortrait = window.innerHeight > window.innerWidth;
    if (isPortrait) {
      elOverlay.classList.add('force-landscape');
    } else {
      elOverlay.classList.remove('force-landscape');
    }
  }

  function onViewportChange() {
    applySmartLandscape();
  }

  /* Fullscreen change handler — kept for the rare case where a
     desktop user manually toggles native fullscreen; we don't
     initiate it ourselves on mobile to avoid iframe crashes. */
  function onFullscreenChange() {
    const inFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!inFS && _inNativeFS && playerOpen) {
      _inNativeFS = false;
      /* Don't auto-close on mobile — that would fight the user.
         Only close if we explicitly entered native FS (desktop). */
    }
    if (!inFS) _inNativeFS = false;
  }

  /* Track whether we successfully entered native fullscreen so
     onFullscreenChange doesn't close the player on a failed attempt. */
  let _inNativeFS = false;

  /* tryFullscreen is now a no-op on mobile. On desktop (≥1024px or
     non-touch), we still attempt native fullscreen for a cleaner
     viewing experience — desktop iframes don't have the same
     anti-hijack issues as mobile. */
  function tryFullscreen(el) {
    /* Skip native fullscreen entirely on touch devices — pure CSS
       rotation handles landscape on mobile. */
    const isTouchDevice = (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
    if (isTouchDevice) {
      _inNativeFS = false;
      return;
    }

    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (req) {
      req.call(el).then(() => {
        _inNativeFS = true;
      }).catch(() => {
        /* Fullscreen refused — CSS fallback already applied via
           applySmartLandscape if portrait. */
        _inNativeFS = false;
      });
    } else {
      _inNativeFS = false;
    }
  }

  /* ══════════════════════════════════════════
     IFRAME LOADER
  ══════════════════════════════════════════ */
  function showIframeLoader(serverName) {
    elIframeLoader.classList.remove('hidden');
    elIframeLoaderTip.textContent = `Loading via ${serverName}…`;
  }

  function hideIframeLoader() {
    elIframeLoader.classList.add('hidden');
  }

  /* iframe load event — fires when the iframe document fully loads */
  function onIframeLoad() {
    /* Small delay so player UI inside the iframe has time to paint */
    setTimeout(hideIframeLoader, 800);
  }

  /* ══════════════════════════════════════════
     postMessage EVENTS
     Handles:
       • Cinezo     — WATCH_PROGRESS envelope
       • VidBolt    — {type, time, duration} flat object
       • VidFast    — PLAYER_EVENT envelope
  ══════════════════════════════════════════ */

  /* Trusted origins — reject messages from anywhere else */
  const TRUSTED_ORIGINS = new Set([
    'https://player.cinezo.live',
    'https://vidbolt.xyz',
    'https://vsembed.ru',
    'https://vidsrc.to',
    'https://vidsrc.cc',
    'https://www.2embed.cc',
  ]);

  function handlePlayerMessage(event) {
    /* ── Security: ignore untrusted origins ── */
    if (!TRUSTED_ORIGINS.has(event.origin)) return;
    if (!event.data || typeof event.data !== 'object') return;

    /* ── Cinezo: WATCH_PROGRESS envelope ── */
    if (event.data.type === 'WATCH_PROGRESS') {
      const { mediaId: _mid, eventType, currentTime, duration } = event.data.data || {};
      /* Use page mediaId as ground truth (more reliable than player's mediaId) */
      const ct = Number(currentTime);
      const dur = Number(duration) || 0;
      if (!ct || !mediaId) return;

      switch (eventType) {
        case 'play':
          hideIframeLoader();
          break;
        case 'timeupdate': {
          const now = Date.now();
          if (now - lastProgressSave > 15000) {
            lastProgressSave = now;
            saveWatchProgress(Number(mediaId), mediaType, ct, dur);
          }
          break;
        }
        case 'pause':
        case 'seeked':
          /* Save immediately on pause/seek so progress isn't lost */
          saveWatchProgress(Number(mediaId), mediaType, ct, dur);
          lastProgressSave = Date.now();
          break;
        case 'ended':
          saveWatchProgress(Number(mediaId), mediaType, ct, dur);
          break;
      }
      return;
    }

    /* ── VidBolt / flat postMessage format ── */
    const { type: evType, time, duration } = event.data;
    switch (evType) {
      case 'ready':
        hideIframeLoader();
        break;
      case 'play':
        hideIframeLoader();
        break;
      case 'timeupdate': {
        if (!time || !mediaId) break;
        const now = Date.now();
        if (now - lastProgressSave > 15000) {
          lastProgressSave = now;
          saveWatchProgress(Number(mediaId), mediaType, time, duration || 0);
        }
        break;
      }
      case 'ended':
        break;
      /* VidFast / PLAYER_EVENT variant */
      case 'PLAYER_EVENT':
        if (event.data.event === 'ready') hideIframeLoader();
        break;
    }
  }

  /* Save watch timestamp to localStorage */
  function saveWatchProgress(id, type, time, duration) {
    try {
      const key = `nm_prog_${type}_${id}`;
      localStorage.setItem(key, JSON.stringify({ time, duration, ts: Date.now() }));
    } catch (_) {}
  }

  /* ══════════════════════════════════════════
     SERVER MODAL
  ══════════════════════════════════════════ */
  function buildServerModalList() {
    const tierLabels = { primary: '🟢', secondary: '🔵', fallback: '🟡', extra: '⚪' };
    elServerModalList.innerHTML = PROVIDERS.map((p, idx) => `
      <button class="server-modal-item${p.key === activeProvider.key ? ' active' : ''}" data-key="${p.key}">
        <div class="server-modal-item-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="5" rx="1"/>
            <rect x="3" y="13" width="18" height="5" rx="1"/>
            <circle cx="7" cy="6.5" r="1" fill="currentColor"/>
            <circle cx="7" cy="15.5" r="1" fill="currentColor"/>
          </svg>
        </div>
        <div class="server-modal-item-info">
          <span class="server-modal-item-name">${tierLabels[p.tier] || ''} ${p.name}</span>
          <span class="server-modal-item-tag">${p.tag}</span>
        </div>
        ${idx === 0 ? '<span class="server-modal-rec">Recommended</span>' : ''}
      </button>
    `).join('');

    elServerModalList.querySelectorAll('.server-modal-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const prov = PROVIDERS.find(p => p.key === btn.dataset.key);
        if (!prov) return;
        selectProvider(prov);
        closeServerModal();
        /* If player is already open, switch immediately */
        if (playerOpen) {
          showIframeLoader(prov.name);
          elOverlayIframe.src = buildEmbedUrl(prov);
        }
      });
    });
  }

  function selectProvider(prov) {
    activeProvider = prov;
    updateServerLabels();
    /* Mark active in list */
    elServerModalList.querySelectorAll('.server-modal-item').forEach(b => {
      b.classList.toggle('active', b.dataset.key === prov.key);
    });
  }

  function updateServerLabels() {
    elServerName.textContent = activeProvider.name;
    if (elHeroServerLabel) elHeroServerLabel.textContent = activeProvider.name;
    if (elPlayerActiveServer) elPlayerActiveServer.textContent = activeProvider.name;
  }

  function openServerModal()  { elServerModal.classList.add('open');    elServerModal.setAttribute('aria-hidden', 'false'); }
  function closeServerModal() { elServerModal.classList.remove('open'); elServerModal.setAttribute('aria-hidden', 'true');  }

  /* ══════════════════════════════════════════
     UTILITY ACTIONS
  ══════════════════════════════════════════ */
  function toggleMyList() {
    if (!detailsData || !mediaId) return;
    const item = {
      id:     Number(mediaId),
      type:   mediaType,
      title:  getTitle(detailsData),
      poster: detailsData.poster_path,
      rating: detailsData.vote_average?.toFixed(1) || null,
      year:   getYear(detailsData)
    };
    const saved = togglePlaylist(item);
    const btn   = document.getElementById('util-mylist');
    const svg   = btn.querySelector('svg');
    svg.style.fill   = saved ? 'currentColor' : 'none';
    svg.style.stroke = saved ? 'none' : 'currentColor';
    btn.querySelector('span').textContent = saved ? 'Saved' : 'My List';
    showToast(saved ? 'Added to My List' : 'Removed from My List');
  }

  function handleShare() {
    if (!detailsData) return;
    const title = getTitle(detailsData);
    if (navigator.share) {
      navigator.share({ title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href)
        .then(() => showToast('Link copied!'))
        .catch(() => showToast('Copy the URL from your browser'));
    }
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

})();
