/* ============================================================
   discover.js — Discover page logic.
   Search bar, full filter chip row, curated sections (default),
   and filtered grid when a filter chip is applied.
   ============================================================ */

(function () {
  "use strict";

  const PROVIDERS = [
    { id: 8,   name: "Netflix" },
    { id: 350, name: "Apple TV+" },
    { id: 9,   name: "Prime Video" },
    { id: 15,  name: "Hulu" },
    { id: 337, name: "Disney+" },
    { id: 119, name: "Amazon Video" },
    { id: 358, name: "Apple TV Store" },
    { id: 283, name: "Crunchyroll" },
    { id: 257, name: "fuboTV" },
    { id: 384, name: "HBO Max" }
  ];

  const NETWORKS = [
    { id: 213, name: "Netflix" },
    { id: 1024, name: "Prime Video" },
    { id: 2554, name: "Apple TV+" },
    { id: 2739, name: "Disney+" },
    { id: 49,  name: "HBO" },
    { id: 67,  name: "Showtime" },
    { id: 453, name: "Hulu" },
    { id: 4,   name: "BBC One" },
    { id: 19,  name: "FOX" },
    { id: 6,   name: "NBC" }
  ];

  const state = {
    trendingType: "movie",
    popularType: "movie",
    topRatedType: "movie",
    activeProvider: 8,
    activeNetwork: 213,
    activeFilter: null,
    filteredPage: 1,
    filteredType: "movie",
    filteredGenreId: null,
    filteredResults: []
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    setupSearchForm();
    setupFilterChips();
    setupSectionToggles();
    renderProviderChips();
    renderNetworkChips();
    attachRowArrows();

    // Check URL params for deep-link (type, genre)
    const type = getParam("type");
    const genre = getParam("genre");
    if (type && genre) {
      state.activeFilter = type === "tv" ? "tv-genres" : "movie-genres";
      state.filteredType = type;
      state.filteredGenreId = Number(genre);
      activateFilterChip(type === "tv" ? "tv-genres" : "movie-genres");
      showFilteredView(`${type === "tv" ? "TV Shows" : "Movies"} Genre`);
      loadFilteredGenre();
    } else if (type) {
      // Just set the type toggle
      setTypeToggle("d-trending-chips", type);
      setTypeToggle("d-popular-chips", type);
      setTypeToggle("d-top-rated-chips", type);
      state.trendingType = type;
      state.popularType = type;
      state.topRatedType = type;
      loadCuratedSections();
    } else {
      loadCuratedSections();
    }
  }

  function setTypeToggle(containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll("[data-type-toggle]").forEach((c) => {
      c.classList.toggle("active", c.dataset.typeToggle === type);
    });
  }

  /* ── Search form ── */
  function setupSearchForm() {
    const form = document.getElementById("discover-search-form");
    const input = document.getElementById("discover-search-input");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      }
    });
  }

  /* ── Filter chips ── */
  function setupFilterChips() {
    const chips = document.querySelectorAll("#discover-chips .chip");
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const filter = chip.dataset.filter;
        // Toggle off if clicking the same active filter
        if (state.activeFilter === filter) {
          state.activeFilter = null;
          chip.classList.remove("active");
          showDefaultView();
          return;
        }
        chips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.activeFilter = filter;
        handleFilterClick(filter);
      });
    });
  }

  function activateFilterChip(filter) {
    const chips = document.querySelectorAll("#discover-chips .chip");
    chips.forEach((c) => {
      c.classList.toggle("active", c.dataset.filter === filter);
    });
  }

  function handleFilterClick(filter) {
    switch (filter) {
      case "movie":
        state.filteredType = "movie";
        state.filteredGenreId = null;
        showFilteredView("Popular Movies");
        loadFilteredPopular("movie");
        break;
      case "tv":
        state.filteredType = "tv";
        state.filteredGenreId = null;
        showFilteredView("Popular TV Shows");
        loadFilteredPopular("tv");
        break;
      case "playlists":
        showFilteredView("Top Playlists");
        loadFilteredPlaylists();
        break;
      case "people":
        showFilteredView("Popular People");
        loadFilteredPeople();
        break;
      case "networks":
        showFilteredView("Network Productions");
        loadFilteredNetworks();
        break;
      case "companies":
        showFilteredView("Companies");
        loadFilteredCompanies();
        break;
      case "movie-genres":
        showFilteredView("Movie Genres");
        loadFilteredGenres("movie");
        break;
      case "tv-genres":
        showFilteredView("TV Shows Genres");
        loadFilteredGenres("tv");
        break;
      case "filters":
        // Filters just shows the default curated view
        showDefaultView();
        state.activeFilter = null;
        activateFilterChip("");
        break;
    }
  }

  function showDefaultView() {
    document.getElementById("discover-default").hidden = false;
    document.getElementById("discover-filtered").hidden = true;
  }

  function showFilteredView(title) {
    document.getElementById("discover-default").hidden = true;
    document.getElementById("discover-filtered").hidden = false;
    document.getElementById("filtered-title").textContent = title;
    document.getElementById("filtered-grid").innerHTML = skeletonGrid(12);
    document.getElementById("show-more-btn").style.display = "none";
    state.filteredPage = 1;
    state.filteredResults = [];
  }

  /* ── Filtered: Popular by type ── */
  async function loadFilteredPopular(type) {
    state.filteredType = type;
    state.filteredGenreId = null;
    const { data, error } = await getPopular(type, 1);
    renderFilteredResults(data, error);
  }

  /* ── Filtered: Playlists (localStorage) ── */
  function loadFilteredPlaylists() {
    const playlist = getPlaylist();
    const grid = document.getElementById("filtered-grid");
    if (!playlist.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h12v18l-6-4-6 4z"/><line x1="12" y1="8" x2="12" y2="14"/><line x1="9" y1="11" x2="15" y2="11"/></svg>
          <p class="empty-state-text">No playlists yet. Browse and add titles!</p>
        </div>`;
      document.getElementById("show-more-btn").style.display = "none";
      return;
    }
    grid.innerHTML = playlist.map((i) => renderPosterCard(i)).join("");
    
    document.getElementById("show-more-btn").style.display = "none";
  }

  /* ── Filtered: People ── */
  async function loadFilteredPeople() {
    const grid = document.getElementById("filtered-grid");
    grid.innerHTML = skeletonGrid(12);
    const { data, error } = await getPopularPeople(1);
    if (error || !data || !data.results) {
      grid.innerHTML = `<p class="text-muted">Failed to load.</p>`;
      return;
    }
    // Render as avatar-style cards in the grid
    grid.innerHTML = data.results
      .filter((p) => p.profile_path)
      .map((p) => `
        <div class="poster-card">
          <div class="poster-card-img-wrap" style="aspect-ratio:2/3;border-radius:50%;overflow:hidden">
            <img src="${profileUrl(p.profile_path)}" alt="${escapeHtml(p.name)}" loading="lazy" style="object-position:center top">
          </div>
          <div class="poster-card-title">${escapeHtml(p.name)}</div>
        </div>`)
      .join("");
    
    document.getElementById("show-more-btn").style.display = "none";
  }

  /* ── Filtered: Networks ── */
  async function loadFilteredNetworks() {
    state.filteredType = "tv";
    state.filteredGenreId = null;
    state.filteredNetworkId = 213;
    const { data, error } = await getDiscoverByNetwork(213, 1);
    renderFilteredResults(data, error, { type: "tv", mode: "network" });
  }

  /* ── Filtered: Companies (use provider as proxy) ── */
  async function loadFilteredCompanies() {
    state.filteredType = "movie";
    state.filteredGenreId = null;
    state.filteredProviderId = 8;
    const { data, error } = await getDiscoverByProvider("movie", 8, 1);
    renderFilteredResults(data, error, { type: "movie", mode: "provider" });
  }

  /* ── Filtered: Genres ── */
  async function loadFilteredGenres(type) {
    state.filteredType = type;
    state.filteredGenreId = null;
    // Fetch genres, then load the first genre as a preview
    const { data, error } = await getGenres(type);
    if (error || !data || !data.genres) {
      document.getElementById("filtered-grid").innerHTML = `<p class="text-muted">Failed to load genres.</p>`;
      return;
    }
    // Render genre chips inside the grid area
    const grid = document.getElementById("filtered-grid");
    grid.innerHTML = `
      <div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
        ${data.genres.map((g) =>
          renderChip(g.name, { dataKey: "genreid", dataValue: g.id })
        ).join("")}
      </div>`;
    grid.querySelectorAll("[data-genreid]").forEach((chip) => {
      chip.addEventListener("click", () => {
        grid.querySelectorAll("[data-genreid]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        state.filteredGenreId = Number(chip.dataset.genreid);
        loadFilteredGenre();
      });
    });
    document.getElementById("show-more-btn").style.display = "none";
  }

  async function loadFilteredGenre() {
    const grid = document.getElementById("filtered-grid");
    grid.innerHTML = skeletonGrid(12);
    const { data, error } = await getDiscoverByGenre(
      state.filteredType,
      state.filteredGenreId,
      state.filteredPage
    );
    renderFilteredResults(data, error, { type: state.filteredType, mode: "genre" });
  }

  /* ── Render filtered results into grid ── */
  function renderFilteredResults(data, error, opts = {}) {
    const grid = document.getElementById("filtered-grid");
    const showMore = document.getElementById("show-more-btn");
    if (error || !data || !data.results) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          <p class="empty-state-text">Failed to load results.</p>
        </div>`;
      showMore.style.display = "none";
      return;
    }
    const items = data.results.filter((i) => i.poster_path);
    state.filteredResults = state.filteredResults.concat(items);
    grid.innerHTML = state.filteredResults
      .map((i) => renderPosterCard(i, { type: opts.type || state.filteredType }))
      .join("");
    
    // Show more button
    if (data.page < data.total_pages) {
      showMore.style.display = "block";
      showMore.onclick = async () => {
        state.filteredPage++;
        let res;
        if (opts.mode === "genre") {
          res = await getDiscoverByGenre(state.filteredType, state.filteredGenreId, state.filteredPage);
        } else if (opts.mode === "network") {
          res = await getDiscoverByNetwork(state.filteredNetworkId, state.filteredPage);
        } else if (opts.mode === "provider") {
          res = await getDiscoverByProvider(state.filteredType, state.filteredProviderId, state.filteredPage);
        } else {
          res = await getPopular(state.filteredType, state.filteredPage);
        }
        renderFilteredResults(res.data, res.error, opts);
      };
    } else {
      showMore.style.display = "none";
    }
  }

  /* ── Section toggles (curated view) ── */
  function setupSectionToggles() {
    bindTypeToggle("d-trending-chips", (type) => {
      state.trendingType = type;
      loadTrending();
    });
    bindTypeToggle("d-popular-chips", (type) => {
      state.popularType = type;
      loadPopular();
    });
    bindTypeToggle("d-top-rated-chips", (type) => {
      state.topRatedType = type;
      loadTopRated();
    });
  }

  function bindTypeToggle(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll("[data-type-toggle]").forEach((chip) => {
      chip.addEventListener("click", () => {
        container.querySelectorAll("[data-type-toggle]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        callback(chip.dataset.typeToggle);
      });
    });
  }

  /* ── Curated sections (default view) ── */
  async function loadCuratedSections() {
    loadTrending();
    renderProviderChips();
    renderNetworkChips();
    loadStreaming();
    loadNetwork();
    loadNowPlaying();
    loadUpcoming();
    loadPopular();
    loadTopRated();
    loadPeople();
    loadAiringToday();
    loadOnTV();
  }

  async function loadTrending() {
    const row = document.getElementById("d-trending-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getTrending(state.trendingType, "week");
    if (error || !data) return;
    row.innerHTML = data.results
      .filter((i) => i.media_type !== "person")
      .map((i) => renderPosterCard(i, { type: state.trendingType }))
      .join("");
    attachRowArrows();
    
  }

  function renderProviderChips() {
    const container = document.getElementById("d-streaming-chips");
    container.innerHTML = PROVIDERS.map((p) =>
      renderChip(p.name, { active: p.id === state.activeProvider, dataKey: "provider", dataValue: p.id })
    ).join("");
    container.querySelectorAll("[data-provider]").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.activeProvider = Number(chip.dataset.provider);
        container.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        loadStreaming();
      });
    });
  }

  async function loadStreaming() {
    const row = document.getElementById("d-streaming-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getDiscoverByProvider("tv", state.activeProvider);
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: "tv" })).join("");
    attachRowArrows();
    
  }

  function renderNetworkChips() {
    const container = document.getElementById("d-network-chips");
    container.innerHTML = NETWORKS.map((n) =>
      renderChip(n.name, { active: n.id === state.activeNetwork, dataKey: "network", dataValue: n.id })
    ).join("");
    container.querySelectorAll("[data-network]").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.activeNetwork = Number(chip.dataset.network);
        container.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        loadNetwork();
      });
    });
  }

  async function loadNetwork() {
    const row = document.getElementById("d-network-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getDiscoverByNetwork(state.activeNetwork);
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: "tv" })).join("");
    attachRowArrows();
    
  }

  async function loadNowPlaying() {
    const row = document.getElementById("d-now-playing-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getNowPlaying();
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: "movie" })).join("");
    attachRowArrows();
    
  }

  async function loadUpcoming() {
    const row = document.getElementById("d-upcoming-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getUpcoming();
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: "movie" })).join("");
    attachRowArrows();
    
  }

  async function loadPopular() {
    const row = document.getElementById("d-popular-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getPopular(state.popularType);
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: state.popularType })).join("");
    attachRowArrows();
    
  }

  async function loadTopRated() {
    const row = document.getElementById("d-top-rated-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getTopRated(state.topRatedType);
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: state.topRatedType })).join("");
    attachRowArrows();
    
  }

  async function loadPeople() {
    const row = document.getElementById("d-people-row");
    row.innerHTML = skeletonAvatarCards(8);
    const { data, error } = await getPopularPeople();
    if (error || !data) return;
    row.innerHTML = renderAvatarRow(data.results.slice(0, 15));
    attachRowArrows();
    
  }

  async function loadAiringToday() {
    const row = document.getElementById("d-airing-today-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getAiringToday();
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: "tv" })).join("");
    attachRowArrows();
    
  }

  async function loadOnTV() {
    const row = document.getElementById("d-on-tv-row");
    row.innerHTML = skeletonRowCards(8);
    const { data, error } = await getOnTheAir();
    if (error || !data) return;
    row.innerHTML = data.results.filter(i => i.poster_path).map((i) => renderPosterCard(i, { type: "tv" })).join("");
    attachRowArrows();
    
  }
})();
