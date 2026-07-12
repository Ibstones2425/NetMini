/* ============================================================
   details.js — Details page logic.
   Reads ?type= and ?id= from URL, fetches full details,
   credits, and similar titles from TMDB.
   ============================================================ */

(function () {
  "use strict";

  let type, id, detailsData;
  const seasonCache = new Map();

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    type = getParam("type") || "movie";
    id = getParam("id");

    if (!id) {
      document.getElementById("details-title").textContent = "Title not found";
      return;
    }

    // Back button
    document.getElementById("back-btn").addEventListener("click", () => {
      if (document.referrer) {
        window.history.back();
      } else {
        window.location.href = "index.html";
      }
    });

    // Playlist button
    document.getElementById("playlist-btn").addEventListener("click", togglePlaylistHandler);

    await loadDetails();
    // Delay trailer fetch by 2s so primary content paints first
    setTimeout(loadInlineTrailer, 2000);
  }

  async function loadDetails() {
    const { data, error } = await getDetails(type, id);
    if (error || !data) {
      document.getElementById("details-title").textContent = "Failed to load";
      document.getElementById("details-overview").textContent =
        "Could not load details. Please check your API key and try again.";
      return;
    }
    detailsData = data;
    renderDetails(data);
    await renderEpisodes(data);
    renderCast(data.credits);
    renderSimilar(data.similar);
    updatePlaylistButton();
    attachRowArrows();
    
  }

  function renderDetails(data) {
    // Backdrop
    const hero = document.getElementById("details-hero");
    const skeleton = document.getElementById("hero-skeleton");
    if (data.backdrop_path) {
      const img = document.createElement("img");
      img.src = backdropUrl(data.backdrop_path);
      img.alt = getTitle(data);
      img.onload = () => {
        skeleton.style.display = "none";
      };
      hero.insertBefore(img, hero.firstChild);
    } else {
      skeleton.style.display = "none";
      hero.innerHTML += `<div class="img-placeholder" style="width:100%;height:100%">No backdrop available</div>`;
    }

    // Title
    document.getElementById("details-title").textContent = getTitle(data);

    // Metadata
    const metaEl = document.getElementById("details-meta");
    const rating = data.vote_average ? data.vote_average.toFixed(1) : null;
    const runtime = type === "movie"
      ? formatRuntime(data.runtime)
      : `${data.number_of_seasons || 0} Seasons`;
    const releaseDate = formatDate(data.release_date || data.first_air_date);

    let metaHtml = `<span class="tmdb-badge">TMDB</span>`;
    if (rating) metaHtml += `<span class="meta-rating">★ ${rating}</span><span class="meta-sep">•</span>`;
    metaHtml += `<span>${runtime}</span><span class="meta-sep">•</span>`;
    metaHtml += `<span>${releaseDate}</span>`;
    metaEl.innerHTML = metaHtml;

    // Genres
    const genresEl = document.getElementById("details-genres");
    if (data.genres && data.genres.length) {
      genresEl.innerHTML = data.genres
        .map((g) => renderChip(g.name, {}))
        .join("");
    }

    // Watch Now button
    const watchBtn = document.getElementById("watch-now-btn");
    const season = data.number_of_seasons ? 1 : "";
    const episode = data.number_of_episodes ? 1 : "";
    const tvParams = type === "tv" ? `&season=${season}&episode=${episode}` : "";
    watchBtn.href = `watch.html?type=${type}&id=${id}${tvParams}`;

    // Tagline
    const taglineEl = document.getElementById("details-tagline");
    if (data.tagline) {
      taglineEl.textContent = `"${data.tagline}"`;
    }

    // Overview
    document.getElementById("details-overview").textContent =
      data.overview || "No overview available.";

    // Information list
    renderInfoList(data);
  }

  async function renderEpisodes(data) {
    const section = document.getElementById("details-episodes-section");
    const seasonTabs = document.getElementById("season-tabs");
    const episodeGrid = document.getElementById("episode-grid");
    const summaryLabel = document.getElementById("episodes-summary-label");

    if (type !== "tv" || !section || !seasonTabs || !episodeGrid) return;

    const seasons = (data.seasons || []).filter(
      (season) => season && season.season_number > 0 && (season.episode_count || 0) > 0
    );

    if (!seasons.length) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    const requestedSeason = Number(getParam("season"));
    const initialSeason = seasons.some((season) => season.season_number === requestedSeason)
      ? requestedSeason
      : seasons[0].season_number;

    renderSeasonTabs(seasons, initialSeason);
    summaryLabel.textContent = `Season ${initialSeason}`;
    await loadSeasonEpisodes(initialSeason);
  }

  function renderSeasonTabs(seasons, activeSeason) {
    const seasonTabs = document.getElementById("season-tabs");
    if (!seasonTabs) return;
    seasonTabs.innerHTML = seasons
      .map(
        (season) => `
          <button
            class="season-tab${season.season_number === activeSeason ? " active" : ""}"
            data-season="${season.season_number}"
            type="button"
          >
            Season ${season.season_number}
          </button>`
      )
      .join("");

    seasonTabs.querySelectorAll("[data-season]").forEach((button) => {
      button.addEventListener("click", async () => {
        const seasonNumber = Number(button.dataset.season);
        seasonTabs.querySelectorAll(".season-tab").forEach((tab) => {
          tab.classList.toggle("active", tab === button);
        });
        document.getElementById("episodes-summary-label").textContent = `Season ${seasonNumber}`;
        await loadSeasonEpisodes(seasonNumber);
      });
    });
  }

  async function loadSeasonEpisodes(seasonNumber) {
    const episodeGrid = document.getElementById("episode-grid");
    if (!episodeGrid) return;

    episodeGrid.innerHTML = Array.from({ length: 6 }, () => `
      <div class="episode-card-skeleton">
        <div class="skeleton episode-card-skeleton-thumb"></div>
        <div class="episode-card-skeleton-lines">
          <div class="skeleton skeleton-text" style="width:78%"></div>
          <div class="skeleton skeleton-text" style="width:52%"></div>
          <div class="skeleton skeleton-text" style="width:92%"></div>
        </div>
      </div>
    `).join("");

    let seasonData = seasonCache.get(seasonNumber);
    if (!seasonData) {
      const { data, error } = await getSeasonDetails(id, seasonNumber);
      if (error || !data) {
        episodeGrid.innerHTML = `<p class="text-muted">Episodes are unavailable right now.</p>`;
        return;
      }
      seasonData = data;
      seasonCache.set(seasonNumber, seasonData);
    }

    const episodes = seasonData.episodes || [];
    if (!episodes.length) {
      episodeGrid.innerHTML = `<p class="text-muted">No episodes found for this season.</p>`;
      return;
    }

    episodeGrid.innerHTML = episodes
      .map((episode) => renderEpisodeCard(seasonNumber, episode))
      .join("");
  }

  function renderEpisodeCard(seasonNumber, episode) {
    const still = episode.still_path
      ? `<img src="${backdropUrl(episode.still_path)}" alt="${escapeHtml(episode.name || `Episode ${episode.episode_number}`)}" loading="lazy" decoding="async" onerror="this.remove()">`
      : `<div class="img-placeholder episode-thumb-placeholder">No Preview</div>`;

    const airDate = episode.air_date ? formatDate(episode.air_date) : "TBA";
    const score = Number.isFinite(episode.vote_average) ? `${Math.round(episode.vote_average * 10)}% score` : "";
    const meta = [airDate, score].filter(Boolean).join(" • ");

    return `
      <a
        class="episode-card"
        href="watch.html?type=tv&id=${id}&season=${seasonNumber}&episode=${episode.episode_number}"
      >
        <div class="episode-thumb-wrap">
          ${still}
          <span class="episode-thumb-label">E${episode.episode_number}</span>
        </div>
        <div class="episode-card-body">
          <div class="episode-card-title-row">
            <h4 class="episode-card-title">${escapeHtml(episode.name || `Episode ${episode.episode_number}`)}</h4>
            <span class="episode-card-number">Episode ${episode.episode_number}</span>
          </div>
          ${meta ? `<div class="episode-card-meta">${escapeHtml(meta)}</div>` : ""}
          <p class="episode-card-overview">${escapeHtml(episode.overview || "No synopsis available.")}</p>
        </div>
      </a>
    `;
  }

  function renderInfoList(data) {
    const list = document.getElementById("details-info-list");
    let items = [];

    items.push({ label: "Original Title", value: data.original_title || data.original_name || "N/A" });
    items.push({ label: "Status", value: data.status || "N/A" });
    items.push({ label: "Release Date", value: formatDate(data.release_date || data.first_air_date) });

    if (type === "movie") {
      items.push({ label: "Runtime", value: formatRuntime(data.runtime) });
    } else {
      items.push({ label: "Seasons", value: data.number_of_seasons || "N/A" });
      items.push({ label: "Episodes", value: data.number_of_episodes || "N/A" });
    }

    items.push({
      label: "Original Language",
      value: data.original_language ? data.original_language.toUpperCase() : "N/A"
    });

    if (data.spoken_languages && data.spoken_languages.length) {
      items.push({
        label: "Spoken Languages",
        value: data.spoken_languages.map((l) => l.english_name || l.name).join(", ")
      });
    }

    if (data.production_countries && data.production_countries.length) {
      items.push({
        label: "Production Countries",
        value: data.production_countries.map((c) => c.name).join(", ")
      });
    }

    if (type === "movie") {
      items.push({
        label: "Budget",
        value: data.budget ? "$" + data.budget.toLocaleString() : "N/A"
      });
      items.push({
        label: "Revenue",
        value: data.revenue ? "$" + data.revenue.toLocaleString() : "N/A"
      });
    }

    if (type === "tv" && data.networks && data.networks.length) {
      items.push({
        label: "Networks",
        value: data.networks.map((n) => n.name).join(", ")
      });
    }

    list.innerHTML = items
      .map(
        (item) => `
      <div class="details-info-item">
        <div class="details-info-label">${escapeHtml(item.label)}</div>
        <div class="details-info-value">${escapeHtml(item.value)}</div>
      </div>`
      )
      .join("");
  }

  function renderCast(credits) {
    const row = document.getElementById("details-cast-row");
    if (!credits || !credits.cast || !credits.cast.length) {
      row.innerHTML = `<p class="text-muted">No cast information available.</p>`;
      return;
    }
    const cast = credits.cast.slice(0, 15);
    row.innerHTML = renderAvatarRow(cast);
    attachRowArrows();
    
  }

  function renderSimilar(similar) {
    const row = document.getElementById("details-similar-row");
    if (!similar || !similar.results || !similar.results.length) {
      row.innerHTML = `<p class="text-muted">No similar titles found.</p>`;
      return;
    }
    const items = similar.results.filter((i) => i.poster_path).slice(0, 15);
    row.innerHTML = items
      .map((i) => renderPosterCard(i, { type }))
      .join("");
    attachRowArrows();
    
  }

  /* ── Playlist toggle ── */
  function togglePlaylistHandler() {
    if (!detailsData) return;
    const item = {
      id: Number(id),
      type: type,
      title: getTitle(detailsData),
      poster: detailsData.poster_path,
      rating: detailsData.vote_average ? detailsData.vote_average.toFixed(1) : null,
      year: getYear(detailsData)
    };
    const saved = togglePlaylist(item);
    updatePlaylistButton(saved);
  }

  function updatePlaylistButton(saved) {
    const btn = document.getElementById("playlist-btn");
    const isSaved = saved !== undefined ? saved : isInPlaylist(id, type);
    btn.classList.toggle("saved", isSaved);
    btn.querySelector("svg").innerHTML = isSaved
      ? '<path d="M6 3h12v18l-6-4-6 4z" fill="currentColor" stroke="currentColor"/>'
      : '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
    btn.setAttribute("aria-label", isSaved ? "Remove from playlist" : "Add to playlist");
  }

  /* ════════════════════════════════════════════════════════════
     INLINE TRAILER (YouTube iframe over backdrop hero)
     Fetches /videos endpoint 2s after page load, finds the best
     official Trailer/Teaser on YouTube, and overlays a muted,
     looping, autoplaying iframe on top of the backdrop image.
     Preserves the existing aspect ratio and edge-fade gradient.
     ════════════════════════════════════════════════════════════ */
  async function loadInlineTrailer() {
    if (!type || !id) return;

    const { data, error } = await getVideos(type, id);
    if (error || !data || !data.results || !data.results.length) return;

    const videos = data.results.filter(v => v.site === "YouTube" && v.key);
    if (!videos.length) return;

    // Priority: Official Trailer > Official Teaser > any Trailer > any Teaser > any Clip
    const pick =
      videos.find(v => v.official && v.type === "Trailer") ||
      videos.find(v => v.official && v.type === "Teaser")    ||
      videos.find(v => v.type === "Trailer")                 ||
      videos.find(v => v.type === "Teaser")                  ||
      videos.find(v => v.type === "Clip")                    ||
      videos[0];

    if (!pick || !pick.key) return;

    const hero      = document.getElementById("details-hero");
    const skeleton  = document.getElementById("hero-skeleton");
    if (!hero) return;

    // Hide any existing backdrop <img> and skeleton behind the iframe
    const existingImg = hero.querySelector("img:not(.details-trailer-iframe)");
    if (existingImg) existingImg.classList.add("details-trailer-hidden");

    if (skeleton) skeleton.style.display = "none";

    // Build the YouTube embed URL
    // - autoplay=1, mute=1 → satisfies browser autoplay policy
    // - loop=1 + playlist=<key> → true loop
    // - controls=0, modestbranding=1, rel=0 → clean UI
    // - playsinline=1 → prevent iOS fullscreen takeover
    // - iv_load_policy=3 → hide annotations
    const videoKey = pick.key;
    const embedSrc = `https://www.youtube.com/embed/${videoKey}` +
                     `?autoplay=1&mute=1&loop=1&playlist=${videoKey}` +
                     `&controls=0&modestbranding=1&rel=0&playsinline=1` +
                     `&iv_load_policy=3&showinfo=0&fs=0&disablekb=1`;

    const iframe = document.createElement("iframe");
    iframe.className = "details-trailer-iframe";
    iframe.src = embedSrc;
    iframe.title = `${getTitle(detailsData || {})} — Trailer`;
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "false");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("aria-hidden", "true");

    // Insert iframe as the first child so it sits beneath the
    // gradient overlay (::after) and the back/playlist buttons.
    hero.insertBefore(iframe, hero.firstChild);

    // Add a tiny "Trailer" badge so the user knows it's playing
    if (!hero.querySelector(".details-trailer-badge")) {
      const badge = document.createElement("div");
      badge.className = "details-trailer-badge";
      badge.textContent = "▶ Trailer";
      hero.appendChild(badge);
    }
  }
})();
