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

  /* ── Anime detection. Cinezo's TV endpoint often doesn't have
     anime in its catalog, so for anime titles we auto-route to a
     provider with better anime coverage (VidSrc.to by default).
     The user can still manually switch back to Cinezo via the
     server modal. */
  const ANIME_GENRE_IDS = new Set([16]);       // 16 = Animation
  const ANIME_KEYWORDS  = ['anime','otaku','shounen','shoujo','isekai','mecha'];
  function isAnime(data) {
    if (!data) return false;
    // 1) Japanese origin + Animation genre → almost certainly anime
    const isJa = (data.original_language || '').toLowerCase() === 'ja';
    const hasAnimGenre = (data.genres || []).some(g => ANIME_GENRE_IDS.has(g.id));
    if (isJa && hasAnimGenre) return true;
    // 2) Production country JP + Animation genre
    const fromJapan = (data.production_countries || []).some(c =>
      (c.iso_3166_1 || '').toUpperCase() === 'JP' ||
      (c.name || '').toLowerCase().includes('japan'));
    if (fromJapan && hasAnimGenre) return true;
    // 3) Keywords contain anime-related terms
    const kws = (data.keywords && data.keywords.keywords) || [];
    if (kws.length && kws.some(k => ANIME_KEYWORDS.some(term =>
      (k.name || '').toLowerCase().includes(term)))) return true;
    // 4) Fallback: type=tv + Animation genre + episode_run_time <= 30
    if (data.first_air_date && hasAnimGenre &&
        (data.episode_run_time || []).some(t => t && t <= 30)) return true;
    return false;
  }

  /* ── Provider preference by content type. Cinezo is the best
     default for movies & regular TV. For anime we now use
     'Cinezo Anime' (AniList ID + dub/sub) as the primary —
     Cinezo's anime endpoint has the best coverage and supports
     dub switching. VidSrc.to remains the fallback if AniList ID
     lookup fails. */
  function pickDefaultProvider(data) {
    if (isAnime(data)) {
      const animeProvider = PROVIDERS.find(p => p.key === 'cinezo-anime') ||
                            PROVIDERS.find(p => p.key === 'vidsrc') ||
                            PROVIDERS[0];
      return animeProvider;
    }
    return PROVIDERS[0];
  }

  /* ── Dub / Sub preference (anime only). Persisted in
     localStorage so the user's choice is remembered across
     sessions. Default: 'sub'. */
  const DUB_KEY = 'nm_anime_dub_pref';
  function getDubPref() { return localStorage.getItem(DUB_KEY) === 'dub' ? 'dub' : 'sub'; }
  function setDubPref(v) { localStorage.setItem(DUB_KEY, v === 'dub' ? 'dub' : 'sub'); }

  /* ── AniList ID cache (in-memory) keyed by TMDB id. Avoids
     re-fetching the AniList ID when the user toggles dub/sub
     or switches episode. */
  const anilistIdCache = new Map();

  /* ── Full AniList Media cache (for episode count + dub avail).
     Keyed by AniList ID. Populated lazily by loadDetails() when
     anime is detected. */
  const anilistMediaCache = new Map();

  /* ── Dub availability for the current title. Populated by
     loadDetails() when anime is detected. Drives whether the
     Dub pill is enabled or shows a warning. */
  let dubAvailability = null;

  /* ── Provider registry ──
     Cinezo:   clean path URLs, rich params, autoplay=true works
     Cinezo-Anime: uses AniList ID + ?dub=true for sub/dub switching.
                  Requires async AniList ID lookup before play.
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
      /* Cinezo Anime — uses AniList ID + ?dub=true.
         buildEmbedUrl() is async-aware: it looks up the AniList ID
         via anilist.js before returning the final URL. */
      key:     'cinezo-anime',
      name:    'Cinezo Anime',
      tag:     'Sub / Dub · AniList',
      tier:    'anime',
      supportsDubSub: true,
      isAsync: true,
      movieUrl: (id, opts) => {
        const anilistId = opts && opts.anilistId;
        if (!anilistId) return null;
        const dub = opts && opts.dub ? 'dub=true' : '';
        const q = dub ? `?${dub}` : '';
        return `https://player.cinezo.live/embed/anime/${anilistId}/1${q}`;
      },
      tvUrl: (id, s, e, opts) => {
        const anilistId = opts && opts.anilistId;
        if (!anilistId) return null;
        const dub = opts && opts.dub ? 'dub=true' : '';
        const q = dub ? `?${dub}` : '';
        // Cinezo anime endpoint uses episode NUMBER, not season/episode split
        // — most anime are single-season on AniList so we pass episode directly.
        return `https://player.cinezo.live/embed/anime/${anilistId}/${e}${q}`;
      },
    },
    {
      key:     'vidbolt',
      name:    'VidBolt',
      tag:     'Server 3 · Interactive',
      tier:    'secondary',
      movieUrl: id      => `https://vidbolt.xyz/movie/${id}?theme=E50914&autoPlay=true&title=false&poster=false`,
      /* VidBolt TV endpoint mirrors movie for now */
      tvUrl:   (id,s,e) => `https://vidbolt.xyz/movie/${id}?theme=E50914&autoPlay=true`,
    },
    {
      key:     'visembed',
      name:    'Visembed',
      tag:     'Server 4 · Classic',
      tier:    'fallback',
      /* NOTE: Visembed uses query params NOT path routing */
      movieUrl: id      => `https://vsembed.ru/embed/movie?tmdb=${id}`,
      tvUrl:   (id,s,e) => `https://vsembed.ru/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
    },
    {
      key:     'vidsrc',
      name:    'VidSrc.to',
      tag:     'Server 5',
      tier:    'extra',
      movieUrl: id      => `https://vidsrc.to/embed/movie/${id}`,
      tvUrl:   (id,s,e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
    },
    {
      key:     'vidsrccc',
      name:    'VidSrc.cc',
      tag:     'Server 6',
      tier:    'extra',
      movieUrl: id      => `https://vidsrc.cc/v2/embed/movie/${id}`,
      tvUrl:   (id,s,e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
    },
    {
      key:     '2embed',
      name:    '2Embed',
      tag:     'Server 7',
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

    /* ── Sub/Dub toggle handler ── */
    const subBtn = document.getElementById('dubsub-sub');
    const dubBtn = document.getElementById('dubsub-dub');
    if (subBtn) subBtn.addEventListener('click', () => setDubSub('sub'));
    if (dubBtn) dubBtn.addEventListener('click', () => setDubSub('dub'));

    /* Default provider — overridden after loadDetails() if anime */
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

    /* Anime routing ── If the title is anime, switch the
       default provider to 'Cinezo Anime' (AniList ID +
       sub/dub). If the user's last session had a different
       provider selected, we still prefer Cinezo Anime as the
       default for anime since it's ad-free and supports dub. */
    if (isAnime(data)) {
      const animeProvider = pickDefaultProvider(data);
      if (animeProvider && animeProvider.key !== activeProvider.key) {
        activeProvider = animeProvider;
        updateServerLabels();
        buildServerModalList();
        // Surface the auto-switch so the user understands why the
        // server changed.
        showToast(`Anime detected — using ${animeProvider.name} (Sub/Dub)`);
      }
      // Show the Sub/Dub toggle for anime
      showDubSubToggle(true);
      // Kick off async AniList enrichment:
      //   1) Fetch the full Media object (episode count + external links)
      //   2) Check dub availability
      //   3) Update the UI when both resolve
      enrichAnimeData(data);
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

     Cinezo Anime needs an AniList ID lookup before the embed URL
     can be built. We surface that lookup in the loader UI, then
     load the iframe. If the lookup fails (e.g. title not on
     AniList), we auto-fallback to VidSrc.to which has broader
     (but ad-supported) coverage.
  ══════════════════════════════════════════ */
  function openPlayer() {
    if (!mediaId) return;
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
