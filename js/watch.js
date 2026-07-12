/* ============================================================
   watch.js — NetMini watch page.
   Providers:
     1. VSEMbed.RU   (primary  — recommended default, broad coverage)
     2. Cinezo       (secondary — best quality, customisable)
     3. VidBolt      (server 3 — postMessage events + sync)
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

  /* ── Iframe load timeout (ms). If the iframe doesn't fire its
     `load` event within this window, we surface the fallback UI
     (Retry / Switch Server / Open in Browser). 10s is long
     enough for legit slow embed providers (Cinezo, VidSrc) but
     short enough to catch blank/blocked iframes fast — which is
     the #1 complaint in installed PWAs. */
  const IFRAME_TIMEOUT_MS = 10000;
  let iframeLoadTimer = null;
  let iframeLoaded = false;
  let iframeStuckShown = false;
  let lastEmbedUrl = '';

  /* ── Anime detection ──
     NetMini's anime experience is in development. The shared
     isAnimeItem() helper (defined in utils.js) is used to
     detect anime titles via genre, language, country, and
     keyword heuristics. When anime is detected we DO NOT open
     the player — instead we show an "anime app in development"
     modal so the user understands why they can't watch. */
  // (isAnimeItem is a global from utils.js — no local copy needed.)

  /* ── Provider preference by content type.
     VSEMbed is the default for everything. Anime titles never
     reach the provider picker — they're intercepted upstream
     in openPlayer(). */
  function pickDefaultProvider(data) {
    return PROVIDERS[0];
  }

  /* ── Dub / Sub preference (legacy — anime was the only consumer).
     Kept as minimal stubs because the dub/sub toggle UI is still
     in the watch.html DOM and init() calls refreshDubSubToggle().
     Since anime is now intercepted with the in-development modal,
     the toggle is never shown and these stubs are effectively
     no-ops. They preserve localStorage compat for the future
     anime app. */
  const DUB_KEY = 'nm_anime_dub_pref';
  function getDubPref() { return localStorage.getItem(DUB_KEY) === 'dub' ? 'dub' : 'sub'; }
  function setDubPref(v) { localStorage.setItem(DUB_KEY, v === 'dub' ? 'dub' : 'sub'); }

  /* dubAvailability is referenced by refreshDubSubToggle() — kept
     as null since anime never reaches the toggle path. */
  let dubAvailability = null;

  /* ── Provider registry ──
     VSEMbed:  query-param URLs, broad coverage, recommended default
     Cinezo:   clean path URLs, rich params, autoplay=true works
     VidBolt:  postMessage events; only movies are officially supported
     VidSrc.to / VidSrc.cc / 2Embed: extra fallbacks */
  const PROVIDERS = [
    {
      key:     'visembed',
      name:    'VSEMbed',
      tag:     'Movies/TV Shows · v1.0.1',
      tier:    'primary',
      /* VSEMbed uses query params (?tmdb=) NOT path routing */
      movieUrl: id      => `https://vsembed.ru/embed/movie?tmdb=${id}`,
      tvUrl:   (id,s,e) => `https://vsembed.ru/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
    },
    {
      key:     'cinezo',
      name:    'Cinezo',
      tag:     'HD · customisable',
      tier:    'secondary',
      movieUrl: id      => `https://player.cinezo.live/embed/movie/${id}?autoplay=true&primarycolor=E50914&secondarycolor=0a0a12&iconcolor=ffffff&poster=true&pip=true&chromecast=true&servericon=true&setting=true`,
      tvUrl:   (id,s,e) => `https://player.cinezo.live/embed/tv/${id}/${s}/${e}?autoplay=true&primarycolor=E50914&secondarycolor=0a0a12&iconcolor=ffffff&poster=true&pip=true&chromecast=true&servericon=true&setting=true`,
    },
    {
      key:     'vidbolt',
      name:    'VidBolt',
      tag:     'Interactive',
      tier:    'secondary',
      movieUrl: id      => `https://vidbolt.xyz/movie/${id}?theme=E50914&autoPlay=true&title=false&poster=false`,
      /* VidBolt TV endpoint mirrors movie for now */
      tvUrl:   (id,s,e) => `https://vidbolt.xyz/movie/${id}?theme=E50914&autoPlay=true`,
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
      elIframeLoader, elIframeLoaderTip, elIframeLoaderFallback,
      elIframeRetryBtn, elIframeSwitchBtn, elIframeOpenExternalBtn,
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
    elIframeLoaderFallback   = document.getElementById('iframe-loader-fallback');
    elIframeRetryBtn         = document.getElementById('iframe-retry-btn');
    elIframeSwitchBtn        = document.getElementById('iframe-switch-btn');
    elIframeOpenExternalBtn  = document.getElementById('iframe-open-external-btn');
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

    /* Fallback button handlers */
    if (elIframeRetryBtn)        elIframeRetryBtn.addEventListener('click', () => {
      hideIframeFallback();
      if (lastEmbedUrl) {
        showIframeLoader(activeProvider.name);
        elOverlayIframe.src = '';
        setTimeout(() => { elOverlayIframe.src = lastEmbedUrl; }, 50);
      }
    });
    if (elIframeSwitchBtn)       elIframeSwitchBtn.addEventListener('click', () => {
      hideIframeFallback();
      closePlayer();
      openServerModal();
    });
    if (elIframeOpenExternalBtn) elIframeOpenExternalBtn.addEventListener('click', () => {
      if (lastEmbedUrl) {
        // Open in the system browser with no restrictions on the
        // request itself. `noopener` is kept as a security measure
        // (prevents the opened page from accessing window.opener),
        // but `noreferrer` is intentionally NOT set so the provider
        // sees a normal referrer and doesn't gatekeep the stream.
        window.open(lastEmbedUrl, '_system', 'noopener');
      }
    });

    /* ── Sub/Dub toggle handler ── (anime only — kept for future use,
       currently no anime reaches the player because we intercept
       upstream in openPlayer(). The toggle UI is never shown.) */
    const subBtn = document.getElementById('dubsub-sub');
    const dubBtn = document.getElementById('dubsub-dub');
    if (subBtn) subBtn.addEventListener('click', () => setDubSub('sub'));
    if (dubBtn) dubBtn.addEventListener('click', () => setDubSub('dub'));

    /* Default provider — VSEMbed (PROVIDERS[0]). */
    activeProvider = PROVIDERS[0];
    updateServerLabels();
    /* Restore the user's saved dub/sub preference into the toggle UI */
    refreshDubSubToggle();

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

    /* Anime interception ── Anime experience is in development.
       We still render the metadata (backdrop, title, synopsis,
       cast) so the user understands what title they reached, but
       the play button is intercepted in openPlayer() and a modal
       explains the situation. We do NOT switch providers or
       start AniList enrichment — those code paths are dead for
       anime now. */
    if (isAnimeItem(data)) {
      // Hide the Sub/Dub toggle (kept in DOM for future use)
      showDubSubToggle(false);
      // Add a visible "anime in development" banner under the title
      showAnimeDevBanner();
    } else {
      showDubSubToggle(false);
    }

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
     ANIME "IN DEVELOPMENT" BANNER + MODAL
     Surfaced when the user lands on an anime title.
     The play button is intercepted in openPlayer().
  ══════════════════════════════════════════ */
  function showAnimeDevBanner() {
    if (document.getElementById('anime-dev-banner')) return;
    const meta = document.getElementById('watch-meta-section');
    if (!meta) return;
    const banner = document.createElement('div');
    banner.id = 'anime-dev-banner';
    banner.className = 'anime-dev-banner';
    banner.innerHTML = `
      <div class="anime-dev-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l2.39 4.84L20 8.27l-4 3.9.94 5.49L12 14.77l-4.94 2.6L8 12.17l-4-3.9 5.61-1.43L12 2z"/>
        </svg>
      </div>
      <div class="anime-dev-text">
        <strong>Our anime app is in development.</strong>
        <span>This title can't be played in NetMini yet — stay tuned.</span>
      </div>`;
    // Insert above the action buttons so it's the first thing the
    // user sees under the meta row.
    const actionRow = meta.querySelector('.watch-action-btns');
    if (actionRow) {
      meta.insertBefore(banner, actionRow);
    } else {
      meta.appendChild(banner);
    }
  }

  function openAnimeDevModal() {
    let modal = document.getElementById('anime-dev-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'anime-dev-modal';
      modal.className = 'anime-dev-modal-overlay';
      modal.innerHTML = `
        <div class="anime-dev-modal-card">
          <button class="anime-dev-modal-close" id="anime-dev-modal-close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <div class="anime-dev-modal-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 2l2.39 4.84L20 8.27l-4 3.9.94 5.49L12 14.77l-4.94 2.6L8 12.17l-4-3.9 5.61-1.43L12 2z"/>
            </svg>
          </div>
          <h3 class="anime-dev-modal-title">Anime app in development</h3>
          <p class="anime-dev-modal-body">
            We're building a dedicated app for anime — Sub, Dub, and
            simulcast — but it's not ready yet. This title can't be
            played inside NetMini right now.
          </p>
          <p class="anime-dev-modal-sub">
            In the meantime, NetMini focuses on movies and TV shows.
            Tap below to keep browsing.
          </p>
          <div class="anime-dev-modal-actions">
            <button class="anime-dev-modal-btn primary" id="anime-dev-back-btn">Back to browse</button>
            <button class="anime-dev-modal-btn" id="anime-dev-close-btn">Close</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      const close = () => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
      };
      modal.addEventListener('click', e => { if (e.target === modal) close(); });
      modal.querySelector('#anime-dev-modal-close').addEventListener('click', close);
      modal.querySelector('#anime-dev-close-btn').addEventListener('click', close);
      modal.querySelector('#anime-dev-back-btn').addEventListener('click', () => {
        close();
        if (document.referrer) {
          window.history.back();
        } else {
          window.location.href = 'index.html';
        }
      });
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
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
     Now async-aware: Cinezo Anime needs an AniList ID lookup
     before the URL can be built. Returns a Promise<String>.
  ══════════════════════════════════════════ */
  async function buildEmbedUrl(provider) {
    if (mediaType === 'tv') {
      const s = document.getElementById('season-select')?.value  || getParam('season')  || 1;
      const e = document.getElementById('episode-select')?.value || getParam('episode') || 1;

      /* Cinezo Anime needs AniList ID + dub flag */
      if (provider.key === 'cinezo-anime') {
        const anilistId = await resolveAniListId();
        if (!anilistId) {
          // Lookup failed — return null so the caller can fall back
          return null;
        }
        return provider.tvUrl(mediaId, s, e, { anilistId, dub: getDubPref() === 'dub' });
      }
      return provider.tvUrl(mediaId, s, e);
    }

    /* Movie path */
    if (provider.key === 'cinezo-anime') {
      const anilistId = await resolveAniListId();
      if (!anilistId) return null;
      return provider.movieUrl(mediaId, { anilistId, dub: getDubPref() === 'dub' });
    }
    return provider.movieUrl(mediaId);
  }

  /* ── Async AniList enrichment (anime only) ──
     1) Resolve the AniList ID for the current title.
     2) Fetch the full AniList Media object (episode count + external links).
     3) Check dub availability via getAniListDubAvailability().
     4) Update the UI:
        - Refresh the episode selector with the AniList episode count
          (authoritative — TMDB's episode_count is often stale for anime).
        - If dub is unavailable, disable the Dub pill and show a hint.
        - If dub is available, surface the streaming services that host it.
     All steps are best-effort and degrade gracefully — if any step
     fails, the user keeps the TMDB-based UI. */
  async function enrichAnimeData(data) {
    try {
      const r = await getAniListIdFromTmdb(data);
      if (!r || !r.id) return;
      anilistIdCache.set(String(mediaId) + ':' + (mediaType || 'movie'), r.id);

      // Fetch full Media (for episodes + externalLinks)
      const media = await getAniListMediaById(r.id);
      if (media) {
        anilistMediaCache.set(r.id, media);
        // Refresh the episode selector with AniList's authoritative count
        if (mediaType === 'tv' && media.episodes) {
          updateEpisodesFromAniList(media.episodes);
        }
      }

      // Check dub availability
      const dubInfo = await getAniListDubAvailability(r.id);
      dubAvailability = dubInfo;
      refreshDubSubToggle();

      if (dubInfo.hasDub && dubInfo.dubSites.length) {
        setLookupStatus(`Dub available on: ${dubInfo.dubSites.join(', ')}`);
      } else if (dubInfo.hasDub) {
        setLookupStatus('Dub likely available');
      } else {
        setLookupStatus('Dub may not be available for this title');
      }
    } catch (e) {
      // Silently fail — UI remains in TMDB-default state
      setLookupStatus('AniList enrichment failed — using TMDB data');
    }
  }

  /* ── Refresh the episode selector with AniList's episode count ──
     Called after enrichAnimeData() resolves. Preserves the
     currently selected episode if it's still within range. */
  function updateEpisodesFromAniList(aniEpCount) {
    const episodeSelect = document.getElementById('episode-select');
    if (!episodeSelect) return;
    const currentEp = Number(episodeSelect.value) || 1;
    const safeCount = Math.max(1, aniEpCount || 1);
    // Only update if AniList says there are MORE episodes than TMDB
    // (we never shorten the list, since TMDB might know about episodes
    // AniList doesn't, e.g. for OVAs/specials bundled into the same show).
    if (safeCount <= episodeSelect.options.length) return;
    episodeSelect.innerHTML = Array.from({ length: safeCount }, (_, i) =>
      `<option value="${i + 1}">Episode ${i + 1}</option>`).join('');
    episodeSelect.value = Math.min(currentEp, safeCount);
    // Show the "via AniList" badge near the selector
    showEpisodeCountBadge(safeCount);
  }

  /* ── Show a small "Episode count via AniList" badge ── */
  function showEpisodeCountBadge(count) {
    let badge = document.getElementById('anilist-ep-badge');
    if (!badge) {
      const selector = document.getElementById('watch-selector');
      if (!selector) return;
      badge = document.createElement('div');
      badge.id = 'anilist-ep-badge';
      badge.className = 'anilist-ep-badge';
      selector.appendChild(badge);
    }
    badge.textContent = `${count} episodes · via AniList 🌸`;
    badge.hidden = false;
  }

  /* ── Resolve AniList ID for the current title ──
     Uses in-memory cache → localStorage cache → AniList GraphQL.
     Returns the numeric AniList ID or null. */
  async function resolveAniListId() {
    if (!detailsData) return null;
    const cacheKey = String(mediaId) + ':' + (mediaType || 'movie');
    if (anilistIdCache.has(cacheKey)) return anilistIdCache.get(cacheKey);

    setLookupStatus('Looking up AniList ID…');
    const result = await getAniListIdFromTmdb(detailsData);
    if (result && result.id) {
      anilistIdCache.set(cacheKey, result.id);
      setLookupStatus(`AniList ID: ${result.id}`);
      return result.id;
    }
    setLookupStatus('AniList ID not found — falling back');
    return null;
  }

  /* ── Update the small status line under the player controls ── */
  function setLookupStatus(text) {
    const el = document.getElementById('anilist-lookup-status');
    if (el) {
      el.textContent = text;
      el.hidden = !text;
    }
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

     Anime titles are intercepted upstream (see openPlayer below)
     and never reach the player — they show the in-development
     modal instead.
  ══════════════════════════════════════════ */
  function openPlayer() {
    if (!mediaId) return;

    /* ── Anime interception ──
       NetMini's anime experience is in development. If the loaded
       title is anime, never open the player — show the in-
       development modal instead. This catches every entry point:
       hero play button, action-row play button, and episode play
       button. The check uses detailsData (already fetched in
       loadDetails()), so there's no extra round-trip. */
    if (detailsData && isAnimeItem(detailsData)) {
      openAnimeDevModal();
      return;
    }

    openPlayerAsync();
  }

  async function openPlayerAsync() {
    if (!mediaId) return;

    let url = await buildEmbedUrl(activeProvider);

    /* Cinezo Anime returned null → AniList lookup failed → fallback */
    if (!url && activeProvider.key === 'cinezo-anime') {
      const fallback = PROVIDERS.find(p => p.key === 'vidsrc');
      if (fallback) {
        showToast('AniList ID not found — using VidSrc.to');
        selectProvider(fallback);
        url = await buildEmbedUrl(fallback);
      }
    }
    if (!url) {
      showToast('Could not build stream URL');
      return;
    }

    lastEmbedUrl = url;

    /* Show loader */
    showIframeLoader(activeProvider.name);

    /* Load the iframe */
    iframeLoaded = false;
    iframeStuckShown = false;
    elOverlayIframe.src = url;

    /* Arm the load-timeout watchdog. */
    clearTimeout(iframeLoadTimer);
    iframeLoadTimer = setTimeout(() => {
      if (!iframeLoaded && !iframeStuckShown) {
        showIframeFallback();
      }
    }, IFRAME_TIMEOUT_MS);

    /* Show overlay */
    elOverlay.classList.add('active');
    document.body.classList.add('player-open');
    playerOpen = true;

    /* Push history so back-button closes overlay */
    window.history.pushState({ playerOpen: true }, '');

    /* Apply CSS-based landscape rotation if needed */
    applySmartLandscape();

    /* Desktop fullscreen */
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
    hideIframeFallback();
    clearTimeout(iframeLoadTimer);
    iframeLoaded = false;
    iframeStuckShown = false;

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

  /* iframe load event — fires when the iframe document fully loads.
     Some embed providers fire `load` very quickly even when the
     actual video hasn't started, so we keep the loader visible
     for a short grace period AND also wait for the provider's
     `play` / `ready` postMessage (see handlePlayerMessage). */
  function onIframeLoad() {
    iframeLoaded = true;
    clearTimeout(iframeLoadTimer);
    /* Small delay so player UI inside the iframe has time to paint */
    setTimeout(hideIframeLoader, 800);
  }

  /* ── Fallback UI ── Revealed when the iframe fails to load
     within IFRAME_TIMEOUT_MS. Gives the user three escape
     hatches: retry, switch server, or open the embed URL in
     the system browser (which always works for embed providers
     that block PWA framing). */
  function showIframeFallback() {
    iframeStuckShown = true;
    if (elIframeLoaderFallback) elIframeLoaderFallback.hidden = false;
    if (elIframeLoaderTip) {
      elIframeLoaderTip.textContent =
        'Stream taking too long. Try another server or open in browser.';
    }
  }

  function hideIframeFallback() {
    if (elIframeLoaderFallback) elIframeLoaderFallback.hidden = true;
    iframeStuckShown = false;
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
    const tierLabels = { primary: '🟢', anime: '🌸', secondary: '🔵', fallback: '🟡', extra: '⚪' };
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
      btn.addEventListener('click', async () => {
        const prov = PROVIDERS.find(p => p.key === btn.dataset.key);
        if (!prov) return;
        selectProvider(prov);
        closeServerModal();
        /* If player is already open, switch immediately */
        if (playerOpen) {
          hideIframeFallback();
          showIframeLoader(prov.name);
          const newUrl = await buildEmbedUrl(prov);
          if (!newUrl) {
            showToast('Could not load this server — try another');
            return;
          }
          lastEmbedUrl = newUrl;
          elOverlayIframe.src = '';
          setTimeout(() => { elOverlayIframe.src = newUrl; }, 50);
          /* Re-arm the load-timeout watchdog for the new provider */
          clearTimeout(iframeLoadTimer);
          iframeLoaded = false;
          iframeStuckShown = false;
          iframeLoadTimer = setTimeout(() => {
            if (!iframeLoaded && !iframeStuckShown) showIframeFallback();
          }, IFRAME_TIMEOUT_MS);
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

  /* ══════════════════════════════════════════
     SUB / DUB TOGGLE (anime only)
  ══════════════════════════════════════════ */
  function showDubSubToggle(show) {
    const wrap = document.getElementById('dubsub-toggle');
    if (!wrap) return;
    wrap.hidden = !show;
  }

  function refreshDubSubToggle() {
    const pref = getDubPref();
    const subBtn = document.getElementById('dubsub-sub');
    const dubBtn = document.getElementById('dubsub-dub');
    if (subBtn) subBtn.classList.toggle('active', pref === 'sub');
    if (dubBtn) {
      dubBtn.classList.toggle('active', pref === 'dub');
      // If we know dub is unavailable, visually disable the Dub pill
      // and add a tooltip explaining why. We still allow the click
      // (the user can override) but warn them first.
      if (dubAvailability && !dubAvailability.hasDub) {
        dubBtn.classList.add('warning');
        const sites = dubAvailability.dubSites && dubAvailability.dubSites.length
          ? dubAvailability.dubSites.join(', ')
          : 'no streaming services';
        dubBtn.title = `Dub may not be available (AniList lists ${sites})`;
      } else {
        dubBtn.classList.remove('warning');
        if (dubAvailability && dubAvailability.dubSites.length) {
          dubBtn.title = `Dub available on: ${dubAvailability.dubSites.join(', ')}`;
        } else {
          dubBtn.title = '';
        }
      }
    }
  }

  function setDubSub(pref) {
    // If user is switching TO dub and we know it's likely unavailable,
    // surface a warning toast (but still allow the switch — Cinezo
    // might have a dub even if AniList doesn't list it).
    if (pref === 'dub' && dubAvailability && !dubAvailability.hasDub) {
      showToast('⚠️ Dub may not be available — try Sub if no audio plays');
    }
    setDubPref(pref);
    refreshDubSubToggle();
    showToast(pref === 'dub' ? 'Switched to English Dub' : 'Switched to Subbed');
    /* If the player is currently open with Cinezo Anime, reload
       with the new dub/sub preference. */
    if (playerOpen && activeProvider.key === 'cinezo-anime') {
      showIframeLoader(activeProvider.name);
      buildEmbedUrl(activeProvider).then(newUrl => {
        if (!newUrl) return;
        lastEmbedUrl = newUrl;
        elOverlayIframe.src = '';
        setTimeout(() => { elOverlayIframe.src = newUrl; }, 50);
        clearTimeout(iframeLoadTimer);
        iframeLoaded = false;
        iframeStuckShown = false;
        iframeLoadTimer = setTimeout(() => {
          if (!iframeLoaded && !iframeStuckShown) showIframeFallback();
        }, IFRAME_TIMEOUT_MS);
      });
    }
  }

})();
