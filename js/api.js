/* ============================================================
   api.js — All TMDB API fetch functions.
   Every function is async, uses try/catch, and returns
   { data, error } so callers can handle failures cleanly.
   Loaded second on every page (after config.js).
   ============================================================ */

/**
 * Internal helper: builds the full TMDB endpoint URL.
 */
function tmdbEndpoint(path, params = {}) {
  const url = new URL(`${TMDB_CONFIG.BASE_URL}${path}`);
  url.searchParams.set("api_key", TMDB_CONFIG.API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * Internal helper: generic fetch + JSON parse + error wrap.
 */
async function tmdbFetch(path, params = {}) {
  try {
    const res = await fetch(tmdbEndpoint(path, params));
    if (!res.ok) {
      return { data: null, error: `TMDB ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message || "Network error" };
  }
}

/* ── Trending ── */
async function getTrending(mediaType, timeWindow = "day") {
  return tmdbFetch(`/trending/${mediaType}/${timeWindow}`);
}

/* ── Popular ── */
async function getPopular(mediaType, page = 1) {
  return tmdbFetch(`/${mediaType}/popular`, { page });
}

/* ── Top Rated ── */
async function getTopRated(mediaType, page = 1) {
  return tmdbFetch(`/${mediaType}/top_rated`, { page });
}

/* ── Now Playing (movies only) ── */
async function getNowPlaying(page = 1) {
  return tmdbFetch(`/movie/now_playing`, { page });
}

/* ── Upcoming (movies only) ── */
async function getUpcoming(page = 1) {
  return tmdbFetch(`/movie/upcoming`, { page });
}

/* ── Airing Today (TV only) ── */
async function getAiringToday(page = 1) {
  return tmdbFetch(`/tv/airing_today`, { page });
}

/* ── On The Air (TV only) ── */
async function getOnTheAir(page = 1) {
  return tmdbFetch(`/tv/on_the_air`, { page });
}

/* ── Watch Providers (movies or tv) ── */
async function getWatchProviders(mediaType) {
  return tmdbFetch(`/watch/providers/${mediaType}`, { watch_region: "US" });
}

/* ── Discover by Provider ── */
async function getDiscoverByProvider(mediaType, providerId, page = 1) {
  return tmdbFetch(`/discover/${mediaType}`, {
    with_watch_providers: providerId,
    watch_region: "US",
    page,
    sort_by: "popularity.desc"
  });
}

/* ── Networks list ── */
async function getNetworks() {
  return tmdbFetch(`/networks`);
}

/* ── Discover by Network (TV only) ── */
async function getDiscoverByNetwork(networkId, page = 1) {
  return tmdbFetch(`/discover/tv`, {
    with_networks: networkId,
    page,
    sort_by: "popularity.desc"
  });
}

/* ── Genres ── */
async function getGenres(mediaType) {
  return tmdbFetch(`/genre/${mediaType}/list`);
}

/* ── Discover by Genre ── */
async function getDiscoverByGenre(mediaType, genreId, page = 1) {
  return tmdbFetch(`/discover/${mediaType}`, {
    with_genres: genreId,
    page,
    sort_by: "popularity.desc"
  });
}

/* ── Popular People ── */
async function getPopularPeople(page = 1) {
  return tmdbFetch(`/person/popular`, { page });
}

/* ── Multi Search ── */
async function searchMulti(query, page = 1) {
  return tmdbFetch(`/search/multi`, { query, page, include_adult: "false" });
}

/* ── Details (movie or tv) ── */
async function getDetails(type, id) {
  return tmdbFetch(`/${type}/${id}`, { append_to_response: "credits,similar" });
}

/* ── Season details (TV only) ── */
async function getSeasonDetails(tvId, seasonNumber) {
  return tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
}

/* ── Credits (movie or tv) ── */
async function getCredits(type, id) {
  return tmdbFetch(`/${type}/${id}/credits`);
}

/* ── Similar (movie or tv) ── */
async function getSimilar(type, id, page = 1) {
  return tmdbFetch(`/${type}/${id}/similar`, { page });
}
