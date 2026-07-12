/* ============================================================
   home.js — Home page: Netflix-style hero + all content sections.
   Hero auto-cycles through top 5 trending titles every 6s.
   ============================================================ */

(function () {
  'use strict';

  /* ── Provider list ── */
  const PROVIDERS = [
    { id: 8,   name: 'Netflix' },
    { id: 350, name: 'Apple TV+' },
    { id: 9,   name: 'Prime Video' },
    { id: 15,  name: 'Hulu' },
    { id: 337, name: 'Disney+' },
    { id: 119, name: 'Amazon Video' },
    { id: 358, name: 'Apple TV Store' },
    { id: 283, name: 'Crunchyroll' },
    { id: 384, name: 'HBO Max' },
  ];

  /* ── Network list ── */
  const NETWORKS = [
    { id: 213, name: 'Netflix' },
    { id: 1024, name: 'Prime Video' },
    { id: 2554, name: 'Apple TV+' },
    { id: 2739, name: 'Disney+' },
    { id: 49,  name: 'HBO' },
    { id: 67,  name: 'Showtime' },
    { id: 453, name: 'Hulu' },
    { id: 4,   name: 'BBC One' },
    { id: 19,  name: 'FOX' },
    { id: 6,   name: 'NBC' },
  ];

  const GENRES_LIST = [
    'Action','Adventure','Comedy','Crime','Drama',
    'Family','Fantasy','Horror','Romance','Science Fiction','War','Western'
  ];

  /* ── Page state ── */
  const state = {
    trendingType:  'movie',
    topTenType:    'movie',
    popularType:   'movie',
    topRatedType:  'movie',
    genreType:     'movie',
    activeProvider: 8,
    activeNetwork:  213,
    genreMap:       { movie: {}, tv: {} },
    heroItems:      [],
    heroIndex:      0,
    heroTimer:      null,
  };

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    renderWatchHistory();
    setupTopChips();
    setupSectionToggles();
    renderProviderChips();
    renderNetworkChips();
    attachRowArrows();

    /* Fire all data loads in parallel */
    await loadHero();          /* hero first so it's visible quickly */
    loadTrending();
    loadTopTen();
    loadStreaming();
    loadNetwork();
    loadNowPlaying();
    loadUpcoming();
    loadPopular();
    loadTopRated();
    loadGenres();
    loadAiringToday();
    loadOnTV();
  }

  /* ── HERO BANNER ──────────────────────────────────────────── */
  async function loadHero() {
    const { data, error } = await getTrending('all', 'week');
    if (error || !data || !data.results || !data.results.length) {
      document.getElementById('hero-section').style.display = 'none';
      return;
    }
    /* pick top 5 that have backdrops, skipping anime (in-development) */
    state.heroItems = data.results
      .filter(i => i.backdrop_path && i.media_type !== 'person')
      .filter(i => !isAnimeItem(i))
      .slice(0, 5);
    renderHero(0);
  }

  function renderHero(index) {
    const section = document.getElementById('hero-section');
    if (!section || !state.heroItems.length) return;
    clearTimeout(state.heroTimer);

    const item  = state.heroItems[index];
    const type  = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const title = item.title || item.name || '';
    const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
    const backSrc = `${TMDB_CONFIG.IMAGE_BASE_URL}original${item.backdrop_path}`;

    const dotsHtml = state.heroItems.map((_, i) =>
      `<button class="hero-dot${i === index ? ' active' : ''}" data-hero-idx="${i}" aria-label="Slide ${i + 1}"></button>`
    ).join('');

    const metaParts = [];
    if (rating) metaParts.push(`<span class="meta-star">★ ${rating}</span>`);
    if (year)   metaParts.push(`<span class="meta-sep">•</span><span>${year}</span>`);
    if (type)   metaParts.push(`<span class="meta-sep">•</span><span>${type === 'tv' ? 'TV Show' : 'Movie'}</span>`);

    /* Netflix-style Play + More Info buttons.
       - Play: white bg, dark text, crisp play icon, hover scale.
       - More Info: semitransparent gray bg, white text, info icon. */
    section.innerHTML = `
      <img class="hero-backdrop" src="${backSrc}" alt="${escapeHtml(title)}" loading="eager" onload="this.classList.add('loaded')">
      <div class="hero-gradient"></div>
      <div class="hero-info">
        <div class="hero-badge">Trending Today</div>
        <div class="hero-title">${escapeHtml(title)}</div>
        <div class="hero-meta">${metaParts.join('')}</div>
        <div class="hero-desc">${escapeHtml(item.overview || '')}</div>
        <div class="hero-btns">
          <a class="btn-play-nf" href="watch.html?type=${type}&id=${item.id}">
            ${ICONS.play} Play
          </a>
          <a class="btn-info-nf" href="details.html?type=${type}&id=${item.id}">
            ${ICONS.info} More Info
          </a>
        </div>
      </div>
      <div class="hero-dots">${dotsHtml}</div>`;

    /* dot click handlers */
    section.querySelectorAll('.hero-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        state.heroIndex = Number(dot.dataset.heroIdx);
        renderHero(state.heroIndex);
      });
    });

    /* auto-cycle */
    if (state.heroItems.length > 1) {
      state.heroTimer = setTimeout(() => {
        state.heroIndex = (index + 1) % state.heroItems.length;
        renderHero(state.heroIndex);
      }, 6000);
    }
  }

  /* ── Watch History ── */
  function renderWatchHistory() {
    const history = getHistory();
    const section = document.getElementById('watch-history-section');
    if (!history.length) { section.hidden = true; return; }
    section.hidden = false;
    document.getElementById('watch-history-row').innerHTML =
      history.map(item => renderPosterCard(item)).join('');
    attachRowArrows();
  }

  /* ── Top chips ── */
  function setupTopChips() {
    document.getElementById('home-filters-chip').addEventListener('click', () => {
      window.location.href = 'discover.html';
    });
    const chips = document.querySelectorAll('#home-top-chips [data-type-toggle]');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        window.location.href = `discover.html?type=${chip.dataset.typeToggle}`;
      });
    });
  }

  /* ── Section-level toggles ── */
  function setupSectionToggles() {
    bindTypeToggle('trending-chips',  type => { state.trendingType  = type; loadTrending();  });
    bindTypeToggle('top-ten-chips',   type => { state.topTenType    = type; loadTopTen();    });
    bindTypeToggle('popular-chips',   type => { state.popularType   = type; loadPopular();   });
    bindTypeToggle('top-rated-chips', type => { state.topRatedType  = type; loadTopRated();  });
    bindTypeToggle('genres-chips',    type => { state.genreType     = type; renderGenreChips(); });
  }

  function bindTypeToggle(containerId, callback) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('[data-type-toggle]').forEach(chip => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('[data-type-toggle]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        callback(chip.dataset.typeToggle);
      });
    });
  }

  /* ── Trending ── */
  async function loadTrending() {
    const row = document.getElementById('trending-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getTrending(state.trendingType, 'week');
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: state.trendingType }))
      .join('');
    attachRowArrows();
  }

  /* ── Top 10 ── */
  async function loadTopTen() {
    const row = document.getElementById('top-ten-row');
    row.innerHTML = skeletonRowCards(10);
    const { data, error } = await getTopRated(state.topTenType);
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .slice(0, 10)
      .map((item, index) => renderTopTenCard(item, index + 1, { type: state.topTenType }))
      .join('');
    attachRowArrows();
  }

  /* ── Streaming (by provider) ── */
  function renderProviderChips() {
    const el = document.getElementById('streaming-chips');
    el.innerHTML = PROVIDERS.map(p => renderChip(p.name, {
      active: p.id === state.activeProvider, dataKey: 'provider', dataValue: p.id
    })).join('');
    el.querySelectorAll('[data-provider]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.activeProvider = Number(chip.dataset.provider);
        el.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        loadStreaming();
      });
    });
  }

  async function loadStreaming() {
    const row = document.getElementById('streaming-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getDiscoverByProvider('tv', state.activeProvider);
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: 'tv' })).join('');
    attachRowArrows();
  }

  /* ── Network Productions ── */
  function renderNetworkChips() {
    const el = document.getElementById('network-chips');
    el.innerHTML = NETWORKS.map(n => renderChip(n.name, {
      active: n.id === state.activeNetwork, dataKey: 'network', dataValue: n.id
    })).join('');
    el.querySelectorAll('[data-network]').forEach(chip => {
      chip.addEventListener('click', () => {
        state.activeNetwork = Number(chip.dataset.network);
        el.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        loadNetwork();
      });
    });
  }

  async function loadNetwork() {
    const row = document.getElementById('network-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getDiscoverByNetwork(state.activeNetwork);
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: 'tv' })).join('');
    attachRowArrows();
  }

  /* ── Now Playing ── */
  async function loadNowPlaying() {
    const row = document.getElementById('now-playing-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getNowPlaying();
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: 'movie' })).join('');
    attachRowArrows();
  }

  /* ── Upcoming ── */
  async function loadUpcoming() {
    const row = document.getElementById('upcoming-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getUpcoming();
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: 'movie' })).join('');
    attachRowArrows();
  }

  /* ── Popular ── */
  async function loadPopular() {
    const row = document.getElementById('popular-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getPopular(state.popularType);
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: state.popularType })).join('');
    attachRowArrows();
  }

  /* ── Top Rated ── */
  async function loadTopRated() {
    const row = document.getElementById('top-rated-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getTopRated(state.topRatedType);
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: state.topRatedType })).join('');
    attachRowArrows();
  }

  /* ── Genres ── */
  async function loadGenres() {
    const [movieRes, tvRes] = await Promise.all([getGenres('movie'), getGenres('tv')]);
    if (movieRes.data?.genres) movieRes.data.genres.forEach(g => (state.genreMap.movie[g.name] = g.id));
    if (tvRes.data?.genres)    tvRes.data.genres.forEach(g   => (state.genreMap.tv[g.name]    = g.id));
    renderGenreChips();
  }

  function renderGenreChips() {
    const el  = document.getElementById('genre-list');
    if (!el) return;
    const map = state.genreMap[state.genreType];
    el.innerHTML = GENRES_LIST.map(name => {
      const id = map[name];
      return id
        ? renderChip(name, { href: `discover.html?type=${state.genreType}&genre=${id}` })
        : renderChip(name, {});
    }).join('');
  }

  /* ── Airing Today ── */
  async function loadAiringToday() {
    const row = document.getElementById('airing-today-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getAiringToday();
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: 'tv' })).join('');
    attachRowArrows();
  }

  /* ── On TV ── */
  async function loadOnTV() {
    const row = document.getElementById('on-tv-row');
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getOnTheAir();
    if (error || !data?.results) { row.innerHTML = errorHtml(); return; }
    row.innerHTML = data.results
      .filter(i => i.poster_path)
      .filter(i => !isAnimeItem(i))   /* hide anime (in-development) */
      .map(i => renderPosterCard(i, { type: 'tv' })).join('');
    attachRowArrows();
  }

  function errorHtml() {
    return `<p class="text-muted" style="padding:var(--sp-3)">Failed to load.</p>`;
  }

})();
