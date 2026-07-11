/* ============================================================
   playlist.js — Playlist page logic.
   Reads the localStorage playlist and renders it as a poster
   grid. Shows an empty state if no items are saved.
   ============================================================ */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    renderPlaylist();
  }

  function renderPlaylist() {
    const playlist = getPlaylist();
    const grid = document.getElementById("playlist-grid");
    const countEl = document.getElementById("playlist-count");

    if (!playlist.length) {
      countEl.textContent = "";
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6 3h12v18l-6-4-6 4z"/>
            <line x1="12" y1="8" x2="12" y2="14"/>
            <line x1="9" y1="11" x2="15" y2="11"/>
          </svg>
          <p class="empty-state-text">There is no playlist yet!</p>
          <a href="discover.html" class="btn-primary" style="max-width:200px;margin-top:8px">Browse Titles</a>
        </div>`;
      return;
    }

    countEl.textContent = `${playlist.length} title${playlist.length === 1 ? "" : "s"} saved`;

    grid.innerHTML = playlist
      .map((item) => {
        const card = renderPosterCard(item, { type: item.type });
        // Add a remove button overlay
        return card.replace(
          '<div class="poster-card-img-wrap">',
          `<div class="poster-card-img-wrap">
           <button class="playlist-remove-btn" data-id="${item.id}" data-type="${item.type}" aria-label="Remove from playlist" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.75);border:none;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:5;transition:background .2s">
             <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
           </button>`
        );
      })
      .join("");

    // Attach remove handlers
    grid.querySelectorAll(".playlist-remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        removeFromPlaylist(id, type);
        renderPlaylist();
      });
    });

    
  }
})();
