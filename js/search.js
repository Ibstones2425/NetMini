/* ============================================================
   search.js — Search results page logic.
   Reads ?q= from the URL, calls searchMulti, renders a mixed
   grid with Movie/TV badges per card.
   ============================================================ */

(function () {
  "use strict";

  const state = {
    query: "",
    page: 1,
    results: [],
    totalPages: 1
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const q = getParam("q") || "";
    state.query = q;

    const input = document.getElementById("search-page-input");
    input.value = q;

    // Search form resubmits
    const form = document.getElementById("search-page-form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        window.location.href = `search.html?q=${encodeURIComponent(val)}`;
      }
    });

    const titleEl = document.getElementById("search-query-title");
    if (q) {
      titleEl.textContent = `Results for "${q}"`;
    } else {
      titleEl.textContent = "Search";
      showEmptyState("Enter a search query to find movies, TV shows, and people.");
      return;
    }

    await loadResults();
  }

  async function loadResults() {
    const grid = document.getElementById("search-grid");
    if (state.page === 1) {
      grid.innerHTML = skeletonGrid(12);
    }
    const { data, error } = await searchMulti(state.query, state.page);
    if (error || !data || !data.results) {
      showEmptyState("Failed to load search results. Please try again.");
      return;
    }
    // Filter out results without posters and non-media types
    const items = data.results.filter((i) => {
      if (i.media_type === "person") return false;
      return i.poster_path;
    });
    state.results = state.results.concat(items);
    state.totalPages = data.total_pages;

    if (state.results.length === 0) {
      showEmptyState(`No results found for "${state.query}".`);
      return;
    }

    grid.innerHTML = state.results
      .map((i) => renderPosterCard(i, { showType: true }))
      .join("");
    

    const showMore = document.getElementById("search-show-more");
    if (state.page < state.totalPages) {
      showMore.style.display = "block";
      showMore.textContent = "Show more";
      showMore.onclick = () => {
        state.page++;
        loadResults();
      };
    } else {
      showMore.style.display = "none";
    }
  }

  function showEmptyState(message) {
    const grid = document.getElementById("search-grid");
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <p class="empty-state-text">${escapeHtml(message)}</p>
      </div>`;
    document.getElementById("search-show-more").style.display = "none";
  }
})();
