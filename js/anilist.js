/* ============================================================
   anilist.js — AniList GraphQL helper for NetMini.
   Used to look up the AniList ID of an anime title so we can
   call Cinezo's anime embed endpoint
   (https://player.cinezo.live/embed/anime/{anilistId}/{ep}?dub=true).

   Why AniList?
     • Cinezo's anime endpoint REQUIRES an AniList ID (not TMDB).
     • AniList has the most accurate anime catalog with proper
       season / episode mappings and dub/sub availability.
     • The GraphQL API is free, no auth required for reads, and
       rate-limited to ~90 req/min from a single IP — plenty
       for individual user browsing.

   Caching:
     • AniList ID lookups are cached in localStorage for 7 days
       keyed by the TMDB title, so repeat visits are instant
       and we stay well under the rate limit.
   ============================================================ */

const ANILIST_CONFIG = {
  ENDPOINT: 'https://graphql.anilist.co',
  CACHE_KEY: 'nm_anilist_map',      // localStorage: { title_key: {id, expiresAt} }
  CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
  TIMEOUT_MS: 8000,
};

/* ── Internal: run a GraphQL query against AniList ──
   Returns { data, error } — same convention as api.js. */
async function anilistQuery(query, variables) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANILIST_CONFIG.TIMEOUT_MS);
  try {
    const res = await fetch(ANILIST_CONFIG.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { data: null, error: `AniList HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json.errors && json.errors.length) {
      return { data: null, error: json.errors[0].message || 'AniList GraphQL error' };
    }
    return { data: json.data, error: null };
  } catch (err) {
    if (err.name === 'AbortError') return { data: null, error: 'AniList request timed out' };
    return { data: null, error: err.message || 'AniList network error' };
  } finally {
    clearTimeout(timer);
  }
}

/* ── Cache helpers ── */
function anilistCacheGet(key) {
  try {
    const all = JSON.parse(localStorage.getItem(ANILIST_CONFIG.CACHE_KEY) || '{}');
    const hit = all[key];
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  } catch (_) {}
  return null;
}

function anilistCacheSet(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(ANILIST_CONFIG.CACHE_KEY) || '{}');
    all[key] = { value, expiresAt: Date.now() + ANILIST_CONFIG.CACHE_TTL_MS };
    // Trim to most recent 200 entries to avoid unbounded growth
    const keys = Object.keys(all);
    if (keys.length > 200) {
      keys.slice(0, keys.length - 200).forEach(k => delete all[k]);
    }
    localStorage.setItem(ANILIST_CONFIG.CACHE_KEY, JSON.stringify(all));
  } catch (_) {}
}

/* ── Normalise a title for cache key + fuzzy matching ── */
function normalizeTitle(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[\u3000-\u303f]/g, '')   // CJK punctuation
    .replace(/[^\w\s]/g, ' ')          // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Public: search AniList by title and return the best match ──
   Returns { id, idMal, title, episodes, status } or null.

   Strategy:
     1) Search AniList Page.media(search: title, type: ANIME, perPage: 10).
     2) Score each result by how well its romaji / english / native
        title matches the input (exact > starts-with > includes).
     3) Return the highest-scoring result.

   `tmdbItem` is the original TMDB payload (optional) — we use its
   `original_title` / `original_name` as a tiebreaker for Japanese
   titles where the romaji may not match the English spelling. */
async function getAniListId(title, tmdbItem) {
  if (!title) return null;

  const cacheKey = normalizeTitle(title);
  if (!cacheKey) return null;

  // 1) Cache hit?
  const cached = anilistCacheGet(cacheKey);
  if (cached) return cached;

  // 2) GraphQL search
  const query = `
    query ($s: String) {
      Page(perPage: 10) {
        media(search: $s, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          episodes
          status
          format
          season
          seasonYear
          title { romaji english native }
        }
      }
    }`;
  const { data, error } = await anilistQuery(query, { s: title });
  if (error || !data || !data.Page || !data.Page.media || !data.Page.media.length) {
    return null;
  }

  // 3) Score + pick best match
  const originalName = (tmdbItem && (tmdbItem.original_name || tmdbItem.original_title)) || '';
  const originalNorm = normalizeTitle(originalName);
  const inputNorm = cacheKey;

  const scored = data.Page.media.map(m => {
    const romaji  = normalizeTitle((m.title && m.title.romaji)  || '');
    const english = normalizeTitle((m.title && m.title.english) || '');
    const native  = normalizeTitle((m.title && m.title.native)  || '');
    let score = 0;
    // Exact matches are king
    if (romaji  === inputNorm) score = Math.max(score, 100);
    if (english === inputNorm) score = Math.max(score, 100);
    if (native  === inputNorm) score = Math.max(score, 100);
    if (native  === originalNorm && originalNorm) score = Math.max(score, 95);
    // Starts-with
    if (romaji  && inputNorm.startsWith(romaji))  score = Math.max(score, 80);
    if (english && inputNorm.startsWith(english)) score = Math.max(score, 80);
    if (romaji  && romaji.startsWith(inputNorm))  score = Math.max(score, 78);
    if (english && english.startsWith(inputNorm)) score = Math.max(score, 78);
    // Includes
    if (romaji  && (inputNorm.includes(romaji)  || romaji.includes(inputNorm)))  score = Math.max(score, 60);
    if (english && (inputNorm.includes(english) || english.includes(inputNorm))) score = Math.max(score, 60);
    // Native fallback
    if (native  && (inputNorm.includes(native)  || native.includes(inputNorm)))  score = Math.max(score, 55);
    // Search-match baseline
    score = Math.max(score, 30);
    return { item: m, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;

  const result = {
    id:         best.item.id,
    idMal:      best.item.idMal,
    episodes:   best.item.episodes,
    status:     best.item.status,
    format:     best.item.format,
    seasonYear: best.item.seasonYear,
    title:      best.item.title,
    matchScore: best.score,
  };

  // 4) Cache + return
  anilistCacheSet(cacheKey, result);
  return result;
}

/* ── Public: convenience wrapper that takes a TMDB item directly
   and extracts the best title to search with. ── */
async function getAniListIdFromTmdb(tmdbItem) {
  if (!tmdbItem) return null;
  // Prefer the English title, fall back to original, then romaji-friendly names
  const title = tmdbItem.title || tmdbItem.name ||
                tmdbItem.original_title || tmdbItem.original_name || '';
  return getAniListId(title, tmdbItem);
}

/* ════════════════════════════════════════════════════════════
   FEATURE 1 — EPISODE-COUNT SYNC
   Fetch full Media object (including `episodes`, `externalLinks`,
   `description`, etc.) by AniList ID. Used by watch.js to
   override TMDB's sometimes-incomplete episode_count with the
   authoritative count from AniList.
   ════════════════════════════════════════════════════════════ */
async function getAniListMediaById(anilistId) {
  if (!anilistId) return null;

  // Cache hit?
  const cacheKey = 'media:' + anilistId;
  const cached = anilistCacheGet(cacheKey);
  if (cached) return cached;

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        episodes
        duration
        format
        status
        season
        seasonYear
        averageScore
        meanScore
        popularity
        genres
        title { romaji english native }
        description(asHtml: false)
        coverImage { large extraLarge color }
        bannerImage
        externalLinks { id url site type language color icon notes }
      }
    }`;
  const { data, error } = await anilistQuery(query, { id: Number(anilistId) });
  if (error || !data || !data.Media) return null;

  const m = data.Media;
  const result = {
    id:           m.id,
    idMal:        m.idMal,
    episodes:     m.episodes,   // ← the authoritative episode count
    duration:     m.duration,
    format:       m.format,     // TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL, MUSIC
    status:       m.status,
    season:       m.season,
    seasonYear:   m.seasonYear,
    averageScore: m.averageScore,
    meanScore:    m.meanScore,
    popularity:   m.popularity,
    genres:       m.genres,
    title:        m.title,
    description:  m.description ? m.description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '') : '',
    coverImage:   m.coverImage,
    bannerImage:  m.bannerImage,
    externalLinks: m.externalLinks || [],
  };

  anilistCacheSet(cacheKey, result);
  return result;
}

/* ════════════════════════════════════════════════════════════
   FEATURE 2 — DUB AVAILABILITY CHECK
   Inspects AniList's `Media.externalLinks` to determine whether
   an English dub is likely available. AniList tags streaming
   links with `type: "STREAMING"` — the `language` field is
   frequently null in practice, so we rely on the `site` name
   against a curated list of services known to host English dubs
   (Crunchyroll, Hulu, Netflix, Funimation, HBO Max, etc.).

   Returns: { hasDub: bool, dubSites: string[], source: 'anilist' }
   `dubSites` is the list of site names that host the dub (e.g.
   ["Crunchyroll", "Hulu"]). Empty when no dub is detected.
   ════════════════════════════════════════════════════════════ */

/* Streaming sites that commonly host English dubs. The presence
   of ANY of these in externalLinks (type=STREAMING) is treated
   as a strong signal that a dub exists somewhere — even if the
   dub isn't on every listed service. */
const DUB_HOSTING_SITES = new Set([
  'Crunchyroll', 'Funimation', 'Hulu', 'Netflix', 'HBO Max',
  'Adult Swim', 'Amazon', 'Amazon Prime', 'Disney+', 'YouTube',
  'Vrv', 'Wakanim', 'AnimationLabs', 'Bilibili', 'Bilibili TV',
  'Netflix Japan', 'Muse Asia', 'Ani-One', 'BStation',
]);

async function getAniListDubAvailability(anilistIdOrTmdbItem) {
  // Accept either a numeric AniList ID or a TMDB item object
  let anilistId = null;
  if (typeof anilistIdOrTmdbItem === 'number') {
    anilistId = anilistIdOrTmdbItem;
  } else if (anilistIdOrTmdbItem && typeof anilistIdOrTmdbItem === 'object') {
    const r = await getAniListIdFromTmdb(anilistIdOrTmdbItem);
    anilistId = r && r.id;
  }
  if (!anilistId) {
    return { hasDub: false, dubSites: [], source: 'anilist', reason: 'no_anilist_id' };
  }

  const media = await getAniListMediaById(anilistId);
  if (!media) {
    return { hasDub: false, dubSites: [], source: 'anilist', reason: 'no_media_data' };
  }

  const links = media.externalLinks || [];
  // Find all STREAMING links (regardless of language — AniList
  // often leaves language null even for English-speaking services).
  const streamingLinks = links.filter(l => l && l.type === 'STREAMING');

  // Strong signal: any STREAMING link from a known dub-hosting site
  const dubSites = streamingLinks
    .filter(l => DUB_HOSTING_SITES.has(l.site))
    .map(l => l.site);
  const dedupedSites = [...new Set(dubSites)];

  // English-language streaming links (secondary signal — counts
  // services like "HIDIVE" or regional platforms that aren't in
  // our DUB_HOSTING_SITES list but explicitly tag language=English).
  const englishStreaming = streamingLinks.filter(l =>
    (l.language || '').toLowerCase().startsWith('eng')
  );

  // Title localization: an English title is a strong indicator
  // that the show has been licensed for English markets, which
  // almost always coincides with a dub being produced.
  const hasEnglishTitle = !!(media.title && media.title.english);

  // Decision logic:
  //   • STRONG: any link from a known dub-hosting site → hasDub = true
  //   • MEDIUM: any English-language STREAMING link → hasDub = true
  //   • WEAK:   English title + at least 1 streaming link → hasDub = true
  //   • Otherwise → hasDub = false (but UI still lets the user try)
  const hasDub = dedupedSites.length > 0 ||
                 englishStreaming.length > 0 ||
                 (hasEnglishTitle && streamingLinks.length > 0);

  return {
    hasDub,
    dubSites: dedupedSites,
    source: 'anilist',
    anilistId,
    hasEnglishTitle,
    linkCount: streamingLinks.length,
  };
}

/* ════════════════════════════════════════════════════════════
   FEATURE 3 — BROWSE ANILIST TRENDING
   Fetch the top N trending anime from AniList, decoupled from
   TMDB entirely. Each card returns enough data to either:
     (a) link directly to the Cinezo anime endpoint via
         `watch.html?anilist={id}`, OR
     (b) resolve the TMDB ID via title search and link to
         `details.html?type=tv&id={tmdbId}`.

   We use approach (b) so the user lands on the same Netflix-
   style details page they're used to, and the watch page's
   existing isAnime() routing picks up the rest.
   ════════════════════════════════════════════════════════════ */
async function getAniListTrending(limit = 20) {
  const query = `
    query ($perPage: Int) {
      Page(perPage: $perPage) {
        media(sort: TRENDING_DESC, type: ANIME) {
          id
          idMal
          title { romaji english native }
          coverImage { large extraLarge color }
          bannerImage
          averageScore
          meanScore
          popularity
          episodes
          format
          status
          season
          seasonYear
          genres
        }
      }
    }`;
  const { data, error } = await anilistQuery(query, { perPage: Math.min(Math.max(limit, 1), 50) });
  if (error || !data || !data.Page || !data.Page.media) return [];
  return data.Page.media.map(m => ({
    id:         m.id,
    idMal:      m.idMal,
    title:      m.title,
    coverImage: m.coverImage,
    bannerImage: m.bannerImage,
    averageScore: m.averageScore,
    popularity: m.popularity,
    episodes:   m.episodes,
    format:     m.format,
    status:     m.status,
    season:     m.season,
    seasonYear: m.seasonYear,
    genres:     m.genres || [],
  }));
}

/* ── Resolve a TMDB tv id from an AniList title ──
   Uses the existing TMDB /search/tv endpoint to find the matching
   TMDB show. Returns the numeric TMDB id, or null if not found.
   Falls back to /search/multi if /search/tv misses (some anime
   are categorized as movies on TMDB). */
async function findTmdbIdFromAnilistTitle(title) {
  if (!title) return null;
  // Try /search/tv first
  let res = await fetch(
    `${TMDB_CONFIG.BASE_URL}/search/tv?api_key=${TMDB_CONFIG.API_KEY}` +
    `&query=${encodeURIComponent(title)}&include_adult=false&page=1`
  );
  if (res.ok) {
    const json = await res.json();
    if (json.results && json.results.length) {
      // Pick the first result that has a poster (filter out junk)
      const hit = json.results.find(r => r.poster_path) || json.results[0];
      return { id: hit.id, type: 'tv' };
    }
  }
  // Fall back to /search/multi
  res = await fetch(
    `${TMDB_CONFIG.BASE_URL}/search/multi?api_key=${TMDB_CONFIG.API_KEY}` +
    `&query=${encodeURIComponent(title)}&include_adult=false&page=1`
  );
  if (res.ok) {
    const json = await res.json();
    if (json.results && json.results.length) {
      const hit = json.results.find(r => r.media_type === 'tv' && r.poster_path)
        || json.results.find(r => r.media_type === 'movie' && r.poster_path);
      if (hit) return { id: hit.id, type: hit.media_type };
    }
  }
  return null;
}
