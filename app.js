/* ================================================================
   ╔══════════════════════════════════════════════════════════════╗
   ║  CONFIGURATION — edit this block, nothing else needs to     ║
   ║  change for a basic setup                                    ║
   ╚══════════════════════════════════════════════════════════════╝

   STEPS:
   1. APP_NAME  → whatever you want to call your site
   2. FIREBASE  → Firebase Console → Project Settings → Your Web App
                  (Enable Email/Password Auth + Firestore first — see README)
   3. TMDB_KEY  → free at themoviedb.org/settings/api
   4. PLAYERS   → embed server URLs, swap if one goes down
================================================================ */

const APP_NAME = 'NetMini';

const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyBADVtX-7uPytV8lfVyws7IBqg3tmKA-0c',
    authDomain:        'netmini-92427.firebaseapp.com',
    projectId:         'netmini-92427',
    storageBucket:     'netmini-92427.firebasestorage.app',
    messagingSenderId: '297392476747',
    appId:             '1:297392476747:web:27ce6f9c08118f334b33ce',
};

const TMDB_KEY = '51a25aa6c9aac627bd65ba2b10b7aafe';

const PLAYER_S1 = 'https://vsembed.ru/embed';    // Legacy query syntax
const PLAYER_S2 = 'https://vidsrc.to/embed';     // Modern path syntax

/* ================================================================
   APP CODE — no need to touch below unless adding features
================================================================ */

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE  = 'https://image.tmdb.org/t/p/';

/* Apply APP_NAME everywhere in the DOM */
document.title = APP_NAME;
['appNameEl','topbarBrandEl'].forEach(id => {
    document.getElementById(id).textContent = APP_NAME;
});

/* ── Firebase init (Firestore only — no auth) ── */
let db;
try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
} catch(e) {
    console.warn('[App] Firebase init failed:', e.message);
}

/* Fixed profile id — since there's no login, everyone who opens this
   site shares this one Firestore document. */
const FIXED_UID = 'default-user';

/* ── Runtime state ── */
let state = {
    view: 'home',
    user: { name: 'Viewer', avatar: 'felix', watchlist: [], history: [] },
    genres: { movie: [], tv: [] },
    currentMedia: null,
    activeServer: 1,
};

/* Boot straight into the app — no login gate */
bootApp().catch(e => {
    console.error('[App] Boot failed:', e);
    document.getElementById('bootScreen').innerHTML =
        `<div style="color:#f55;text-align:center;padding:20px;">Failed to load: ${e.message}</div>`;
});

/* ================================================================
   FIRESTORE
================================================================ */
async function loadUserData(uid) {
    if (!db) {
        const local = localStorage.getItem('sf0_user');
        if (local) Object.assign(state.user, JSON.parse(local));
        return;
    }
    try {
        const snap = await db.collection('users').doc(uid).get();
        if (snap.exists) {
            Object.assign(state.user, snap.data());
        } else {
            await db.collection('users').doc(uid).set(state.user);
        }
    } catch(e) { console.warn('[Firestore] load:', e.message); }
}

async function saveUserData() {
    if (!db) {
        localStorage.setItem('sf0_user', JSON.stringify(state.user));
        return;
    }
    try {
        await db.collection('users').doc(FIXED_UID).set(state.user, { merge: true });
    } catch(e) { console.warn('[Firestore] save:', e.message); }
}

/* ================================================================
   BOOT
================================================================ */
async function bootApp() {
    await loadUserData(FIXED_UID);
    await fetchGenres();
    document.getElementById('userName').textContent      = state.user.name || 'Viewer';
    document.getElementById('inputName').value           = state.user.name   || '';
    document.getElementById('inputAvatar').value         = state.user.avatar || '';
    setupNav();
    showScreen();
    await renderView('home');
}

async function fetchGenres() {
    try {
        const [m, t] = await Promise.all([tmdb('/genre/movie/list'), tmdb('/genre/tv/list')]);
        state.genres.movie = m.genres || [];
        state.genres.tv    = t.genres || [];
    } catch(e) {}
}

/* TMDB fetch helper */
async function tmdb(path, params = {}) {
    const url = new URL(TMDB_BASE + path);
    url.searchParams.set('api_key', TMDB_KEY);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
    return fetch(url).then(r => r.json());
}

/* ================================================================
   NAV
================================================================ */
function setupNav() {
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn =>
        btn.addEventListener('click', () => renderView(btn.dataset.view))
    );
    let t;
    const s = document.getElementById('searchInput');
    s.addEventListener('keydown', e => { if (e.key === 'Enter') renderView('search', s.value.trim()); });
    s.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { if (s.value.trim().length > 2) renderView('search', s.value.trim()); }, 500);
    });
}

function setActiveNav(v) {
    document.querySelectorAll('.nav-btn[data-view]').forEach(b =>
        b.classList.toggle('active', b.dataset.view === v)
    );
}

/* ================================================================
   VIEWS
================================================================ */
async function renderView(viewName, query = '') {
    state.view = viewName;
    setActiveNav(viewName);
    const c = document.getElementById('viewContainer');
    c.innerHTML = `<div class="grid">${Array(12).fill(`<div class="skel" style="aspect-ratio:2/3;"></div>`).join('')}</div>`;

    let html = '';
    if      (viewName === 'home')      html = await buildHome();
    else if (viewName === 'explore')   html = await buildExplore();
    else if (viewName === 'trending')  html = await buildTrending();
    else if (viewName === 'search')    html = await buildSearch(query);
    else if (viewName === 'watchlist') html = buildLibrary('Watchlist', state.user.watchlist);
    else if (viewName === 'history')   html = buildLibrary('Watch History', state.user.history);

  c.innerHTML = html;

    /* ── High-Revenue Universal SPA Ad Lifecycle Management ── */
    const adWrapper = document.getElementById('homeNativeAdWrapper');
    if (adWrapper) {
        // Rebuild structural targets on every route transition to refresh impressions
        adWrapper.innerHTML = `
            <div class="section-head" style="margin-top: 40px;">
                <span class="section-title">Suggested For You</span>
            </div>
            <div class="ad-card-wrapper" id="container-5e44b31349514dceb01e5ede3c9eb1a4"></div>
        `;
        
        const nativeScript = document.createElement('script');
        nativeScript.async = true;
        nativeScript.setAttribute('data-cfasync', 'false');
        nativeScript.src = 'https://pl30305264.effectivecpmnetwork.com/5e44b31349514dceb01e5ede3c9eb1a4/invoke.js';
        
        adWrapper.appendChild(nativeScript);
        adWrapper.style.display = 'block';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}


async function buildHome() {
    const [trending, popular, topTv] = await Promise.all([
        tmdb('/trending/all/day'),
        tmdb('/movie/popular'),
        tmdb('/tv/top_rated'),
    ]);
    const h = trending.results[0];
    return `
        <div class="hero">
            <img src="${IMG_BASE}original${h.backdrop_path}" alt="" loading="lazy">
            <div class="hero-grad"></div>
            <div class="hero-info">
                <span class="hero-badge">Trending Today</span>
                <div class="hero-title">${h.title||h.name}</div>
                <div class="hero-meta">⭐ ${h.vote_average?.toFixed(1)} · ${(h.release_date||h.first_air_date||'').slice(0,4)} · ${(h.media_type||'').toUpperCase()}</div>
                <div class="hero-desc">${h.overview}</div>
                <div class="hero-btns">
                    <button class="btn-watch" onclick="playMedia(${h.id},'${h.media_type}')">▶ Watch Now</button>
                    <button class="btn-add"   onclick="toggleWatchlist(${esc(h)})">+ Watchlist</button>
                </div>
            </div>
        </div>
        <div class="section-head">
            <span class="section-title">Popular Movies</span>
            <a class="section-link" href="#" onclick="renderView('explore');return false;">See all</a>
        </div>
        <div class="grid">${cards(popular.results.slice(0,12), 'movie')}</div>
        <div class="section-head"><span class="section-title">Top Rated Series</span></div>
        <div class="grid">${cards(topTv.results.slice(0,12), 'tv')}</div>`;
}

async function buildExplore() {
    const data  = await tmdb('/discover/movie', { sort_by: 'popularity.desc' });
    const chips = state.genres.movie.map(g =>
        `<div class="chip" onclick="filterGenre(${g.id},this)">${g.name}</div>`
    ).join('');
    return `
        <div class="page-head"><h1>Explore Movies</h1><p>Filter by genre or browse popular titles.</p></div>
        <div class="genre-bar">${chips}</div>
        <div class="grid" id="exploreGrid">${cards(data.results, 'movie')}</div>`;
}

async function buildTrending() {
    const data = await tmdb('/trending/all/week');
    return `
        <div class="page-head"><h1>Weekly Trends</h1><p>What the world is watching.</p></div>
        <div class="grid">${cards(data.results, 'movie')}</div>`;
}

async function buildSearch(query) {
    const data    = await tmdb('/search/multi', { query });
    const results = (data.results||[]).filter(r => r.media_type !== 'person');
    return `
        <div class="page-head"><h1>Search Results</h1><p>${results.length} results for "<em>${query}</em>"</p></div>
        <div class="grid">${results.length
            ? cards(results, 'movie')
            : '<div class="empty"><i class="ph ph-magnifying-glass"></i><p>Nothing found.</p></div>'
        }</div>`;
}

function buildLibrary(title, list) {
    return `
        <div class="page-head"><h1>${title}</h1><p>${list.length} saved item${list.length!==1?'s':''}.</p></div>
        <div class="grid">${list.length
            ? cards(list, 'movie')
            : '<div class="empty"><i class="ph ph-folder-open"></i><p>Nothing here yet.</p></div>'
        }</div>`;
}

function cards(items, defaultType) {
    return items.map(item => {
        const type   = item.media_type || defaultType;
        const title  = item.title || item.name || 'Untitled';
        const poster = item.poster_path
            ? `${IMG_BASE}w300${item.poster_path}`
            : `https://placehold.co/300x450/1a1a1a/666?text=${encodeURIComponent(title)}`;
        const year = (item.release_date || item.first_air_date || '').slice(0,4);
        return `
            <div class="card" onclick="playMedia(${item.id},'${type}')">
                <img src="${poster}" loading="lazy" alt="${title}">
                <span class="card-type">${type.toUpperCase()}</span>
                <div class="card-label">${title}${year?' · '+year:''}</div>
            </div>`;
    }).join('');
}

async function filterGenre(id, el) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    const grid = document.getElementById('exploreGrid');
    grid.innerHTML = Array(12).fill(`<div class="skel" style="aspect-ratio:2/3;"></div>`).join('');
    const data = await tmdb('/discover/movie', { with_genres: id, sort_by: 'popularity.desc' });
    grid.innerHTML = cards(data.results, 'movie');
}

/* ================================================================
   PLAYER
================================================================ */
async function playMedia(id, type) {
    state.currentMedia = { id, type };
    const data = await tmdb(`/${type}/${id}`);
    document.getElementById('playerTitle').textContent = data.title || data.name;

    const epPanel    = document.getElementById('epPanel');
    const seasonPick = document.getElementById('seasonPick');

    if (type === 'tv') {
        epPanel.style.display    = 'flex';
        seasonPick.style.display = 'inline-block';
        seasonPick.innerHTML = (data.seasons||[])
            .filter(s => s.season_number > 0)
            .map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`)
            .join('');
        await loadEpisodes(id, 1);
    } else {
        epPanel.style.display    = 'none';
        seasonPick.style.display = 'none';
        loadStream();
    }

    // 1. Open the player modal
    document.getElementById('playerModal').classList.add('open');
    
    // 2. Add to user history exactly once
    addToHistory(data, type);

    // 3. Hide the static bottom ad wrapper while playing media streams
    const targetAdRow = document.getElementById('homeNativeAdWrapper');
    if (targetAdRow) targetAdRow.style.display = 'none';
}


async function loadEpisodes(id, season) {
    const data = await tmdb(`/tv/${id}/season/${season}`);
    document.getElementById('epList').innerHTML = (data.episodes||[]).map(ep => `
        <div class="ep-item" onclick="playEpisode(${season},${ep.episode_number})">
            <span class="ep-num">E${ep.episode_number}</span>
            <span>${ep.name}</span>
        </div>`).join('');
    playEpisode(season, 1);
}

function playEpisode(s, e) {
    const frame = document.getElementById('streamFrame');
    
    if (state.activeServer === 1) {
        // Server 1 (vsembed) uses query parameters: ?tmdb=ID&season=S&episode=E
        frame.src = `${PLAYER_S1}/tv?tmdb=${state.currentMedia.id}&season=${s}&episode=${e}`;
    } else {
        // Server 2 (vidsrc) uses clean URL paths: /tv/ID/S/E
        frame.src = `${PLAYER_S2}/tv/${state.currentMedia.id}/${s}/${e}`;
    }
}

function loadStream() {
    const frame = document.getElementById('streamFrame');
    
    if (state.activeServer === 1) {
        // Server 1 (vsembed) uses query parameters: ?tmdb=ID
        frame.src = `${PLAYER_S1}/movie?tmdb=${state.currentMedia.id}`;
    } else {
        // Server 2 (vidsrc) uses clean URL paths: /movie/ID
        frame.src = `${PLAYER_S2}/movie/${state.currentMedia.id}`;
    }
}

function setServer(num) {
    state.activeServer = num;
    document.getElementById('srv1Btn').style.color = num === 1 ? 'var(--accent)' : '';
    document.getElementById('srv2Btn').style.color = num === 2 ? 'var(--accent)' : '';
    if (state.currentMedia?.type === 'movie') loadStream();
    else toast('Server changed — pick an episode to reload.');
}

function closePlayer() {
    document.getElementById('playerModal').classList.remove('open');
    document.getElementById('streamFrame').src = '';
    
    /* Bring back the visual banner slot for standard navigation pages */
    const targetAdRow = document.getElementById('homeNativeAdWrapper');
    if (targetAdRow) targetAdRow.style.display = 'block';
}



/* ================================================================
   WATCHLIST & HISTORY
================================================================ */
function toggleWatchlist(item) {
    const idx = state.user.watchlist.findIndex(w => w.id === item.id);
    if (idx > -1) { state.user.watchlist.splice(idx, 1); toast('Removed from Watchlist'); }
    else           { state.user.watchlist.unshift(item);  toast('Added to Watchlist'); }
    saveUserData();
}

function addToHistory(item, type) {
    const entry = { ...item, media_type: type, _ts: Date.now() };
    state.user.history = state.user.history.filter(h => h.id !== item.id);
    state.user.history.unshift(entry);
    if (state.user.history.length > 50) state.user.history.length = 50;
    saveUserData();
}

/* ================================================================
   SETTINGS
================================================================ */
function openSettings() {
    document.getElementById('inputName').value   = state.user.name   || '';
    document.getElementById('inputAvatar').value = state.user.avatar || '';
    document.getElementById('settingsModal').classList.add('open');
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }

document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsModal')) closeSettings();
});

async function saveProfile() {
    state.user.name   = document.getElementById('inputName').value.trim()   || state.user.name;
    state.user.avatar = document.getElementById('inputAvatar').value.trim() || state.user.avatar;
    await saveUserData();
    document.getElementById('userName').textContent = state.user.name;
    closeSettings();
    toast('Profile saved');
}

function resetData() {
    if (!confirm('Clear all watchlist and history?')) return;
    state.user.watchlist = [];
    state.user.history   = [];
    saveUserData();
    closeSettings();
    toast('Data cleared');
}

/* ================================================================
   UTILS
================================================================ */
function esc(obj) { return JSON.stringify(obj).replace(/"/g, '&quot;'); }

function showScreen() {
    document.getElementById('bootScreen').classList.add('gone');
    document.getElementById('appScreen').classList.add('active');
}

let _tt;
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_tt);
    _tt = setTimeout(() => el.classList.remove('show'), 2800);
}
