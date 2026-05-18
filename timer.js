/* =========================
   FIREBASE IMPORTS
========================= */
import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================
   CONFIG / CONSTANTS
========================= */

/** Firebase project configuration */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDOQZw95uqm6B4TP_qGKlwqt2LYKfvITXM",
  authDomain:        "eternal-one-timer.firebaseapp.com",
  projectId:         "eternal-one-timer",
  storageBucket:     "eternal-one-timer.firebasestorage.app",
  messagingSenderId: "1010437979682",
  appId:             "1:1010437979682:web:7a23edfd4e45439ba7547b",
  measurementId:     "G-6JR43ZSEN3"
};

/** Rank image paths — index mirrors RANKS array */
const RANK_IMAGES = [
  './rank_png/Bronze_1_Rank.png',    './rank_png/Bronze_3_Rank.png',
  './rank_png/Silver_1_Rank.png',    './rank_png/Silver_3_Rank.png',
  './rank_png/Gold_1_Rank.png',      './rank_png/Gold_3_Rank.png',
  './rank_png/Platinum_1_Rank.png',  './rank_png/Platinum_3_Rank.png',
  './rank_png/Diamond_1_Rank.png',   './rank_png/Diamond_3_Rank.png',
  './rank_png/Ascendant_1_Rank.png', './rank_png/Ascendant_3_Rank.png',
  './rank_png/Immortal_1_Rank.png',  './rank_png/Immortal_3_Rank.png',
  './rank_png/Radiant_Rank.png',
];

/** Rank definitions — pts is the minimum points required to hold that rank */
const RANKS = [
  { name: 'Wanderer I',      pts: 0   },
  { name: 'Wanderer II',     pts: 5   },
  { name: 'Seeker I',        pts: 10  },
  { name: 'Seeker II',       pts: 15  },
  { name: 'Shadow I',        pts: 20  },
  { name: 'Shadow II',       pts: 30  },
  { name: 'Phantom I',       pts: 40  },
  { name: 'Phantom II',      pts: 55  },
  { name: 'Reaper I',        pts: 70  },
  { name: 'Reaper II',       pts: 90  },
  { name: 'Abyss Walker I',  pts: 110 },
  { name: 'Abyss Walker II', pts: 140 },
  { name: 'Eternal I',       pts: 170 },
  { name: 'Eternal II',      pts: 210 },
  { name: 'THE ETERNAL ONE', pts: 250 },
];

/** Theme ids supported by the theme system */
const THEMES = ['dark', 'light', 'redbull'];

/** localStorage key for persisting selected theme */
const THEME_STORAGE_KEY = 'selectedTheme';

/** How often (ms) to auto-sync to Firestore while the timer is running */
const AUTO_SYNC_INTERVAL_MS = 60000;

/** Delay (ms) before triggering a sync after a pause or reset */
const SYNC_DEBOUNCE_MS = 2000;

/** How long (ms) to show the sync-done / sync-error dot state */
const SYNC_DOT_RESET_MS = 3000;

/** How long (ms) to display a rank-up toast */
const TOAST_DURATION_MS = 3200;

/** How long (ms) the high-score flash animation plays */
const HS_FLASH_DURATION_MS = 600;


/* =========================
   APPLICATION STATE
========================= */
let totalStudiedMs = 0;   // Cumulative studied time across all sessions (ms)
let sessionMs      = 0;   // Elapsed time in the current session (ms)
let startTime      = 0;   // performance.now() timestamp when current run began
let running        = false;
let rafId          = null; // requestAnimationFrame handle
let worker         = null; // Background Worker for tab-throttle resilience

let highscore      = 0;   // Best single-session time (ms)
let brokeDuring    = false; // Has the HS been broken in the current session?
let prevRankIdx    = 0;   // Last known rank index — used to detect rank-ups

let currentUsername  = null;
let currentUid       = null;
let firestoreReady   = false;
let syncTimeout      = null; // Debounce handle for scheduleSync
let toastTimer       = null; // Timeout handle for hiding the rank-up toast


/* =========================
   DOM REFERENCES
========================= */
const display      = document.getElementById('display');
const pauseBtn     = document.getElementById('pauseBtn');
const resetBtn     = document.getElementById('resetBtn');

const hsBox        = document.getElementById('hsBox');
const hsTimeEl     = document.getElementById('hsTime');

const rankBtnName  = document.getElementById('rankBtnName');
const heroImg      = document.getElementById('heroImg');
const heroName     = document.getElementById('heroName');
const heroPts      = document.getElementById('heroPts');
const heroHrs      = document.getElementById('heroHrs');
const heroUsername = document.getElementById('heroUsername');
const progressNext = document.getElementById('progressNext');
const progressPct  = document.getElementById('progressPct');
const progressFill = document.getElementById('progressFill');
const progressLabel= document.getElementById('progressLabel');
const rankList     = document.getElementById('rankList');
const rankupToast  = document.getElementById('rankupToast');
const modalOverlay = document.getElementById('modalOverlay');

const settingsBtn  = document.getElementById('settingsBtn');
const settingsPopup= document.getElementById('settingsPopup');
const logoutBtn    = document.getElementById('logoutBtn');

const identityOverlay  = document.getElementById('identityOverlay');
const usernameInput    = document.getElementById('usernameInput');
const identityError    = document.getElementById('identityError');
const identityBeginBtn = document.getElementById('identityBeginBtn');

const syncDot          = document.getElementById('syncDot');

const themesBtn          = document.getElementById('themesBtn');
const themeModalOverlay  = document.getElementById('themeModalOverlay');
const themeModalClose    = document.getElementById('themeModalClose');
const themeCards         = document.querySelectorAll('.theme-card');


/* =========================
   FORMATTING HELPERS
========================= */

/** Zero-pads a number to 2 digits */
function pad(n) {
  return String(Math.floor(n)).padStart(2, '0');
}

/** Converts milliseconds to HH:MM:SS string */
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
}

/** Converts milliseconds to rank points (1 point = 1 hour) */
function msToPoints(ms) {
  return ms / 3600000;
}


/* =========================
   RANK SYSTEM
========================= */

/** Returns the rank name for a given points value */
function getRank(pts) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (pts >= RANKS[i].pts) idx = i;
    else break;
  }
  return RANKS[idx].name;
}

/** Returns the rank array index for a given points value */
function getRankIndex(pts) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (pts >= RANKS[i].pts) idx = i;
    else break;
  }
  return idx;
}

/** Returns progress metadata toward the next rank */
function getRankProgress(pts) {
  const idx  = getRankIndex(pts);
  const cur  = RANKS[idx];
  const next = RANKS[idx + 1];
  if (!next) return { pct: 100, label: 'MAX', nextName: null };
  const pct = ((pts - cur.pts) / (next.pts - cur.pts)) * 100;
  return {
    pct:      Math.min(100, Math.max(0, pct)),
    label:    `${(pts - cur.pts).toFixed(1)} / ${next.pts - cur.pts} pts`,
    nextName: next.name
  };
}

/** Rebuilds the full rank list DOM inside the modal */
function buildRankList(currentIdx) {
  rankList.innerHTML = '';

  RANKS.forEach((r, i) => {
    const isCurrent  = i === currentIdx;
    const isUnlocked = i < currentIdx;
    const isLocked   = i > currentIdx;
    const isEternal  = i === RANKS.length - 1;

    const item = document.createElement('div');
    item.className = 'rank-item' + (isCurrent ? ' current' : '') + (isEternal ? ' eternal' : '');

    // Rank image
    const imgWrap = document.createElement('div');
    imgWrap.className = 'rank-item-img' + (isLocked ? ' locked' : '');
    const img = document.createElement('img');
    img.src = RANK_IMAGES[i] || '';
    img.alt = r.name;
    imgWrap.appendChild(img);

    // Rank name + pts range
    const info  = document.createElement('div');
    info.className = 'rank-item-info';
    const name  = document.createElement('div');
    name.className = 'rank-item-name' + (isLocked ? ' locked' : '');
    name.textContent = r.name;
    const ptsEl = document.createElement('div');
    ptsEl.className = 'rank-item-pts';
    ptsEl.textContent = r.pts + ' pts' + (RANKS[i + 1] ? ' → ' + RANKS[i + 1].pts : '+');
    info.appendChild(name);
    info.appendChild(ptsEl);

    // Status badge
    const status = document.createElement('div');
    status.className = 'rank-item-status ' + (isCurrent ? 'current' : isUnlocked ? 'unlocked' : 'locked');
    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'current-badge';
      badge.textContent = 'current';
      status.appendChild(badge);
    } else {
      status.textContent = isUnlocked ? 'done' : 'locked';
    }

    item.appendChild(imgWrap);
    item.appendChild(info);
    item.appendChild(status);
    rankList.appendChild(item);

    // Scroll current rank into view after render
    if (isCurrent) {
      setTimeout(() => item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100);
    }
  });
}

/** Updates all rank-related UI elements from a points value */
function updateRankUI(pts) {
  const idx      = getRankIndex(pts);
  const rank     = RANKS[idx];
  const prog     = getRankProgress(pts);
  const isEternal = idx === RANKS.length - 1;

  rankBtnName.textContent = rank.name;
  heroName.textContent    = rank.name;
  heroImg.src             = RANK_IMAGES[idx] || '';
  heroImg.alt             = rank.name;
  heroPts.textContent     = pts.toFixed(2);
  heroHrs.textContent     = pts.toFixed(1) + 'h';
  heroUsername.textContent = currentUsername || '—';

  progressNext.textContent  = prog.nextName ? 'next → ' + prog.nextName : 'max rank achieved';
  progressLabel.textContent = prog.nextName ? prog.label : '—';
  progressPct.textContent   = prog.pct.toFixed(1) + '%';
  progressFill.style.width  = prog.pct + '%';

  progressFill.classList.toggle('eternal', isEternal);
  progressPct.classList.toggle('eternal', isEternal);

  buildRankList(idx);

  // Show rank-up toast if the rank index has increased
  if (idx > prevRankIdx) {
    showRankUpToast(rank.name);
    prevRankIdx = idx;
  }
}


/* =========================
   UI CONTROLLERS
========================= */

// ── High Score ──────────────────────────────────────

/** Renders the current high score into the HS box */
function renderHS() {
  if (highscore === 0) {
    hsTimeEl.textContent = '--:--:--';
    hsTimeEl.className   = 'hs-time empty';
    return;
  }
  hsTimeEl.textContent = formatTime(highscore);
  hsTimeEl.className   = 'hs-time';
}

/**
 * Checks if the current session time beats the high score.
 * Triggers the flash animation once per session if broken.
 */
function checkHS(ms) {
  if (ms > highscore) {
    highscore            = ms;
    hsTimeEl.textContent = formatTime(highscore);
    hsTimeEl.className   = 'hs-time';
    if (!brokeDuring) {
      brokeDuring = true;
      hsBox.classList.remove('new');
      void hsBox.offsetWidth; // Force reflow to restart CSS animation
      hsBox.classList.add('new');
      setTimeout(() => hsBox.classList.remove('new'), HS_FLASH_DURATION_MS);
    }
  }
}

// ── Rank-Up Toast ────────────────────────────────────

/** Shows a brief "rank up → [name]" toast notification */
function showRankUpToast(name) {
  rankupToast.textContent = `rank up → ${name}`;
  rankupToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => rankupToast.classList.remove('show'), TOAST_DURATION_MS);
}

// ── Identity Overlay ──────────────────────────────────

/** Shows the username selection screen */
function showIdentityOverlay() {
  identityOverlay.classList.add('visible');
  setTimeout(() => usernameInput.focus(), 600);
}

/**
 * Fades out and hides the identity overlay.
 * Uses inline style for the fade since the overlay is already 'visible'.
 */
function hideIdentityOverlay() {
  identityOverlay.style.transition = 'opacity 0.4s ease';
  identityOverlay.style.opacity    = '0';
  setTimeout(() => { identityOverlay.style.display = 'none'; }, 400);
}

/** Shows a validation error message on the identity overlay */
function showIdentityError(msg) {
  identityError.textContent = msg;
  identityError.classList.add('visible');
}

/** Clears the validation error on the identity overlay */
function clearIdentityError() {
  identityError.classList.remove('visible');
}

// ── Sync Dot ─────────────────────────────────────────

/** Sets the sync status indicator state: '', 'syncing', 'synced', 'error' */
function setSyncState(state) {
  syncDot.className = 'sync-dot ' + state;
}

// ── Zen Mode ─────────────────────────────────────────

function enterZen() { document.body.classList.add('zen'); }
function exitZen()  { document.body.classList.remove('zen'); }


/* =========================
   TIMER ENGINE
========================= */

/**
 * Background Worker source — posts a 'tick' every 500ms.
 * Keeps the timer ticking even when the tab is throttled.
 */
const WORKER_SRC = `
  let iv = null;
  self.onmessage = function(e) {
    if (e.data === 'start') {
      if (!iv) iv = setInterval(() => self.postMessage('tick'), 500);
    } else if (e.data === 'stop') {
      clearInterval(iv);
      iv = null;
    }
  };
`;

/** Shared tick handler — updates display, high score, and rank on every tick */
function onTick() {
  if (!running) return;
  const sesMs     = sessionMs + (performance.now() - startTime);
  const liveTotal = totalStudiedMs + (performance.now() - startTime);

  display.textContent = formatTime(sesMs);
  checkHS(sesMs);

  const pts    = msToPoints(liveTotal);
  const newIdx = getRankIndex(pts);

  // Detect rank-up without opening the modal
  if (newIdx > prevRankIdx) {
    prevRankIdx             = newIdx;
    showRankUpToast(RANKS[newIdx].name);
    rankBtnName.textContent = RANKS[newIdx].name;
  }

  // Live-update modal if it's open
  if (modalOverlay.classList.contains('open')) {
    updateRankUI(pts);
  }
}

/** requestAnimationFrame loop — primary tick source when tab is in focus */
function rafTick() {
  if (!running) return;
  onTick();
  rafId = requestAnimationFrame(rafTick);
}

/** Initializes the background Worker for cross-tab throttle resilience */
function initWorker() {
  try {
    worker = new Worker(
      URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' }))
    );
    worker.onmessage = onTick;
  } catch (e) {
    // Worker unavailable — rAF alone will handle ticking
  }
}


/* =========================
   SYNC HELPERS
========================= */

/**
 * Schedules a debounced Firestore sync.
 * Only fires if Firebase is ready and a user is authenticated.
 */
function scheduleSync() {
  if (!firestoreReady || !currentUid) return;
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    if (typeof window.__syncProfile === 'function') window.__syncProfile();
  }, SYNC_DEBOUNCE_MS);
}


/* =========================
   WINDOW-EXPOSED BRIDGE FUNCTIONS
   Called by Firebase auth/Firestore logic below.
========================= */

/**
 * Loads saved profile data into timer state on login.
 * Called by onAuthStateChanged after fetching the Firestore doc.
 */
window.__loadProfileData = function(data) {
  if (!data) return;
  totalStudiedMs  = (data.totalStudyTime || 0) * 3600000;
  highscore       = (data.highScore || 0) * 3600000;
  currentUsername = data.username || null;
  prevRankIdx     = getRankIndex(data.rankPoints || 0);
  renderHS();
  rankBtnName.textContent = getRank(data.rankPoints || 0);
  prevRankIdx             = getRankIndex(data.rankPoints || 0);
};

/**
 * Returns a snapshot of current timer state for Firestore writes.
 * Always reflects the live (running) value.
 */
window.__getTimerState = function() {
  const liveTotal = totalStudiedMs + (running ? (performance.now() - startTime) : 0);
  const pts       = msToPoints(liveTotal);
  return {
    totalStudyTime: liveTotal / 3600000,
    rankPoints:     pts,
    currentRank:    getRank(pts),
    highScore:      Math.max(highscore, sessionMs) / 3600000
  };
};

/** Marks Firestore as ready and stores the authenticated user's UID */
window.__setFirestoreReady = function(uid) {
  currentUid     = uid;
  firestoreReady = true;
};


/* =========================
   EVENT LISTENERS
========================= */

// ── Timer Controls ───────────────────────────────────

pauseBtn.addEventListener('click', () => {
  if (!running) {
    // Start / Resume
    running   = true;
    startTime = performance.now();
    display.className       = 'running';
    pauseBtn.textContent    = 'Pause';
    if (worker) worker.postMessage('start');
    rafId = requestAnimationFrame(rafTick);
    enterZen();
  } else {
    // Pause
    const delta = performance.now() - startTime;
    sessionMs      += delta;
    totalStudiedMs += delta;
    running = false;
    cancelAnimationFrame(rafId);
    if (worker) worker.postMessage('stop');
    display.className    = 'paused';
    pauseBtn.textContent = 'Resume';
    exitZen();
    scheduleSync();
  }
});

resetBtn.addEventListener('click', () => {
  if (running) {
    totalStudiedMs += performance.now() - startTime;
  }
  running    = false;
  sessionMs  = 0;
  startTime  = 0;
  brokeDuring = false;
  cancelAnimationFrame(rafId);
  if (worker) worker.postMessage('stop');
  display.textContent  = '00:00:00';
  display.className    = 'paused';
  pauseBtn.textContent = 'Start';
  rankBtnName.textContent = RANKS[getRankIndex(msToPoints(totalStudiedMs))].name;
  exitZen();
  scheduleSync();
});

// ── Rank Modal ───────────────────────────────────────

document.getElementById('rankBtn').addEventListener('click', () => {
  updateRankUI(msToPoints(totalStudiedMs));
  modalOverlay.classList.add('open');
});

document.getElementById('modalClose').addEventListener('click', () => {
  modalOverlay.classList.remove('open');
});

modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('open');
});

document.getElementById('leaderboardBtn').addEventListener('click', () => {
  window.open('leaderboard.html', '_blank');
});

document.getElementById('trophyBtn').addEventListener('click', () => {
  window.open('leaderboard.html', '_blank');
});

// ── Zen Mode ─────────────────────────────────────────

// Click anywhere outside the pause button to exit zen
document.body.addEventListener('click', function(e) {
  if (!document.body.classList.contains('zen')) return;
  if (e.target !== pauseBtn) exitZen();
});

// Escape key also exits zen
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.body.classList.contains('zen')) exitZen();
});

// ── Settings Popup ───────────────────────────────────

settingsBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  settingsPopup.classList.toggle('open');
});

// Click outside closes the settings popup
document.addEventListener('click', function(e) {
  if (!settingsPopup.contains(e.target) && e.target !== settingsBtn) {
    settingsPopup.classList.remove('open');
  }
});

logoutBtn.addEventListener('click', function() {
  if (typeof window.__logout === 'function') window.__logout();
  else window.location.href = 'index.html';
});

// ── Identity Overlay ──────────────────────────────────

usernameInput.addEventListener('input', () => clearIdentityError());

usernameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') identityBeginBtn.click();
});

identityBeginBtn.addEventListener('click', async () => {
  const raw = usernameInput.value.trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(raw)) {
    showIdentityError('3–16 chars. Letters, numbers, underscore only.');
    return;
  }
  identityBeginBtn.disabled     = true;
  identityBeginBtn.textContent  = '...';
  clearIdentityError();
  if (typeof window.__saveUsername === 'function') {
    const result = await window.__saveUsername(raw);
    if (result.ok) {
      currentUsername = raw;
      hideIdentityOverlay();
    } else {
      showIdentityError(result.error || 'Error. Try again.');
      identityBeginBtn.disabled    = false;
      identityBeginBtn.textContent = 'BEGIN';
    }
  }
});


/* =========================
   THEME SYSTEM
========================= */
(function() {

  /** Applies a theme by setting/removing the data-theme attribute on <html> */
  function applyTheme(themeId) {
    if (!THEMES.includes(themeId)) themeId = 'dark';
    const root = document.documentElement;
    // Dark theme = no attribute (uses :root defaults); others use data-theme
    root.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    if (themeId !== 'dark') {
      root.setAttribute('data-theme', themeId);
    }
    // Reflect active state on theme cards
    themeCards.forEach(card => {
      card.classList.toggle('active', card.dataset.themeId === themeId);
    });
    try { localStorage.setItem(THEME_STORAGE_KEY, themeId); } catch (e) {}
  }

  /** Returns the persisted theme id, defaulting to 'dark' */
  function getSavedTheme() {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || 'dark'; } catch (e) { return 'dark'; }
  }

  // Apply saved theme immediately on load
  applyTheme(getSavedTheme());

  // Open theme modal
  themesBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    settingsPopup.classList.remove('open');
    themeModalOverlay.classList.add('open');
  });

  // Close theme modal via X button
  themeModalClose.addEventListener('click', function() {
    themeModalOverlay.classList.remove('open');
  });

  // Close theme modal via backdrop click
  themeModalOverlay.addEventListener('click', function(e) {
    if (e.target === themeModalOverlay) themeModalOverlay.classList.remove('open');
  });

  // Close theme modal via Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') themeModalOverlay.classList.remove('open');
  });

  // Theme card click + keyboard selection
  themeCards.forEach(card => {
    card.addEventListener('click', function() {
      applyTheme(this.dataset.themeId);
    });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        applyTheme(this.dataset.themeId);
      }
    });
  });

})();


/* =========================
   FIREBASE / AUTH
========================= */
const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

/**
 * Auth state observer.
 * Redirects unauthenticated users to the login page.
 * On login: bootstraps Firestore state, loads profile, shows identity overlay if needed.
 */
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  window.__setFirestoreReady(user.uid);

  const userRef  = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // New user — create initial Firestore document and prompt for username
    await setDoc(userRef, {
      username:     null,
      usernameLower: null,
      rankPoints:   0,
      currentRank:  'Wanderer I',
      highScore:    0,
      totalStudyTime: 0,
      rankHistory:  [],
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp()
    });
    showIdentityOverlay();
  } else {
    const data = userSnap.data();
    if (!data.username) showIdentityOverlay();
    else hideIdentityOverlay();
    if (typeof window.__loadProfileData === 'function') window.__loadProfileData(data);
  }
});

/**
 * Saves a new username to Firestore after checking uniqueness.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 */
window.__saveUsername = async function(raw) {
  const lower    = raw.toLowerCase();
  const authUser = auth.currentUser;
  if (!authUser) return { ok: false, error: 'Not authenticated.' };

  const q    = query(collection(db, 'users'), where('usernameLower', '==', lower));
  const snap = await getDocs(q);
  if (!snap.empty) return { ok: false, error: 'Identity already taken.' };

  await updateDoc(doc(db, 'users', authUser.uid), {
    username:      raw,
    usernameLower: lower,
    updatedAt:     serverTimestamp()
  });
  return { ok: true };
};

/**
 * Syncs the current timer state to Firestore.
 * Merges rank history if the rank has changed. Only updates highScore if it's a new best.
 */
window.__syncProfile = async function() {
  const authUser = auth.currentUser;
  if (!authUser || typeof window.__getTimerState !== 'function') return;

  setSyncState('syncing');

  try {
    const state   = window.__getTimerState();
    const userRef = doc(db, 'users', authUser.uid);
    const snap    = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() : {};

    const updateData = {
      rankPoints:     state.rankPoints,
      currentRank:    state.currentRank,
      totalStudyTime: state.totalStudyTime,
      updatedAt:      serverTimestamp()
    };

    // Only write highScore if it's a new record
    if (state.highScore > (existing.highScore || 0)) {
      updateData.highScore = state.highScore;
    }

    // Append rank change to history (capped at 50 entries)
    if (existing.currentRank && existing.currentRank !== state.currentRank) {
      const history = existing.rankHistory || [];
      history.push({ rank: state.currentRank, at: new Date().toISOString() });
      updateData.rankHistory = history.slice(-50);
    }

    await updateDoc(userRef, updateData);
    setSyncState('synced');
    setTimeout(() => setSyncState(''), SYNC_DOT_RESET_MS);

  } catch (e) {
    setSyncState('error');
    setTimeout(() => setSyncState(''), SYNC_DOT_RESET_MS);
    console.error('Sync error:', e);
  }
};

/**
 * Syncs profile then signs the user out and redirects to login.
 */
window.__logout = async function() {
  if (typeof window.__syncProfile === 'function') await window.__syncProfile();
  try { await signOut(auth); } catch (e) {}
  window.location.href = 'index.html';
};


/* =========================
   INITIALIZATION
========================= */

// Boot the background worker for throttle-resilient ticking
initWorker();

// Auto-sync every minute while the timer is running
setInterval(() => {
  if (running && firestoreReady) scheduleSync();
}, AUTO_SYNC_INTERVAL_MS);