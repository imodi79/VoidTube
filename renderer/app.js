const mainInputEl = document.getElementById("mainInput");
const searchBtn = document.getElementById("searchBtn");
const playBtn = document.getElementById("playBtn");
const volumeSliderEl = document.getElementById("volumeSlider");
const historyFilterEl = document.getElementById("historyFilter");
const historyListEl = document.getElementById("historyList");
const exportBtnEl = document.getElementById("exportBtn");
const importBtnEl = document.getElementById("importBtn");
const clearHistoryEl = document.getElementById("clearHistory");
const playerArea = document.getElementById("playerArea");
const viewToggleEl = document.getElementById("viewToggle");
const subsListEl = document.getElementById("subsList");
const subsFilterEl = document.getElementById("subsFilter");
const signinScreenEl = document.getElementById("signinScreen");
const signinBtnEl = document.getElementById("signinBtn");
const deviceCodeEl = document.getElementById("deviceCode");
const signOutEl = document.getElementById("signOut");
const signinStatusEl = document.getElementById("signinStatus");

const STORAGE_KEY = "yt-desk-state-v3";
const TOKEN_KEY = "yt-desk-token-v1";
const CHANNEL_CACHE_KEY = "yt-desk-channel-cache-v1";
const SUBS_CACHE_KEY = "yt-desk-subs-cache-v1";
const CHANNEL_CLICKS_KEY = "yt-desk-channel-clicks-v1";
const NEW_WINDOW_MS = 7 * 24 * 3600 * 1000; // 7 nap új jelzéshez
const MAX_HISTORY = 10000;
const CONFIG = window.appBridge?.config || { clientId: "", clientSecret: "", apiKey: "" };
const ICON_EXPAND = '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
const ICON_COMPRESS = '<i class="fa-solid fa-compress" aria-hidden="true"></i>';
const ICON_PLAY = '<i class="fa-solid fa-play" aria-hidden="true"></i>';
const ICON_PAUSE = '<i class="fa-solid fa-pause" aria-hidden="true"></i>';
const ICON_MUTE = '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>';
const ICON_UNMUTE = '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
const ICON_COPY = '<i class="fa-regular fa-copy" aria-hidden="true"></i>';
const ICON_CLOSE = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

const state = loadState();
let player = null;
let playerReady = false;
let positionTimer = null;
let activeLoadId = null;
let ytReadyPromise = null;
let channelCache = loadChannelCache();
let subsCache = loadSubsCache();
let channelClicks = loadChannelClicks();
let lastDeviceCode = "";
let channelQueue = null;
let uiMessage = "";
let playerShellEl = null;
let playerHolderEl = null;
let gridWrapEl = null;
let gridEl = null;
let gridActionsEl = null;
let messageEl = null;
let tokenCache = null;
let tokenInitPromise = null;
let tokenRefreshPromise = null;

function log(...args) {
  // Basic console logging to trace auth/state.
  console.log("[YT]", ...args);
}

function getSubsFilter() {
  if (!subsFilterEl) return "";
  return subsFilterEl.value.trim().toLowerCase();
}

 

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("yt-desk-state-v2");
    if (!raw)
      return {
        videos: [],
        selectedId: null,
        clean: false,
        volume: 70,
        displayThumbs: { items: [], openUrl: null, channelId: null },
        recentChannels: [],
      };
    const parsed = JSON.parse(raw);
    const displayThumbs = parsed.displayThumbs || {};
    return {
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      selectedId: parsed.selectedId || null,
      clean: Boolean(parsed.clean),
      volume: typeof parsed.volume === "number" ? parsed.volume : 70,
      displayThumbs: {
        items: displayThumbs.items || [],
        openUrl: displayThumbs.openUrl || null,
        channelId: displayThumbs.channelId || null,
      },
      recentChannels: parsed.recentChannels || [],
    };
  } catch (e) {
    console.warn("Failed to parse state", e);
    return {
      videos: [],
      selectedId: null,
      clean: false,
      volume: 70,
      displayThumbs: { items: [], openUrl: null, channelId: null },
      recentChannels: [],
    };
  }
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      videos: state.videos,
      selectedId: state.selectedId,
      clean: state.clean,
      volume: state.volume,
      displayThumbs: state.displayThumbs,
      recentChannels: state.recentChannels,
    })
  );
}

function loadTokenFromLocalStorage() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveTokenToLocalStorage(token) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function loadToken() {
  return tokenCache;
}

async function initToken() {
  if (tokenInitPromise) return tokenInitPromise;
  tokenInitPromise = (async () => {
    const stored = await window.appBridge?.getToken?.();
    if (stored) {
      tokenCache = stored;
      saveTokenToLocalStorage(stored);
      return;
    }
    const local = loadTokenFromLocalStorage();
    if (local) {
      tokenCache = local;
      try {
        await window.appBridge?.setToken?.(local);
      } catch (_) {
        // ignore
      }
    }
  })();
  return tokenInitPromise;
}

async function ensureFreshToken() {
  if (tokenRefreshPromise) return tokenRefreshPromise;
  tokenRefreshPromise = (async () => {
    const token = loadToken();
    if (!token || !tokenExpired(token)) return true;
    if (!token.refresh_token) return false;
    const next = await ensureAccessToken();
    return Boolean(next);
  })();
  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

function hasValidSession() {
  const token = loadToken();
  if (!token) return false;
  if (!tokenExpired(token)) return true;
  return Boolean(token.refresh_token);
}

function loadChannelCache() {
  try {
    const raw = localStorage.getItem(CHANNEL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveChannelCache() {
  try {
    localStorage.setItem(CHANNEL_CACHE_KEY, JSON.stringify(channelCache));
  } catch (_) {
    // ignore
  }
}

function loadSubsCache() {
  try {
    const raw = localStorage.getItem(SUBS_CACHE_KEY);
    return raw ? JSON.parse(raw) : { ts: 0, items: [] };
  } catch (_) {
    return { ts: 0, items: [] };
  }
}

function loadChannelClicks() {
  try {
    const raw = localStorage.getItem(CHANNEL_CLICKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveChannelClicks() {
  try {
    localStorage.setItem(CHANNEL_CLICKS_KEY, JSON.stringify(channelClicks));
  } catch (_) {
    // ignore
  }
}

function bumpChannelClick(channelId) {
  if (!channelId) return;
  channelClicks[channelId] = (channelClicks[channelId] || 0) + 1;
  saveChannelClicks();
  if (subsCache.items.length) {
    renderSubscriptions(subsCache.items);
  }
}

function saveSubsCache() {
  try {
    localStorage.setItem(SUBS_CACHE_KEY, JSON.stringify(subsCache));
  } catch (_) {}
}

function saveToken(token) {
  tokenCache = token;
  saveTokenToLocalStorage(token);
  const res = window.appBridge?.setToken?.(token);
  if (res && typeof res.catch === "function") {
    res.catch(() => {});
  }
}

function clearToken() {
  tokenCache = null;
  localStorage.removeItem(TOKEN_KEY);
  const res = window.appBridge?.clearToken?.();
  if (res && typeof res.catch === "function") {
    res.catch(() => {});
  }
}

function tokenExpired(token) {
  if (!token || !token.expires_at) return true;
  return Date.now() > token.expires_at - 10_000;
}

function parseVideoId(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Direct ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "");
    }
    if (url.searchParams.get("v")) {
      return url.searchParams.get("v");
    }
  } catch (_) {
    return null;
  }
  return null;
}

function safeOpenExternal(url) {
  try {
    const fn = window.appBridge && window.appBridge.openExternal;
    if (typeof fn === "function") {
      fn(url);
      return;
    }
  } catch (_) {
    // fall through to window.open
  }
  if (typeof window.open === "function") {
    window.open(url, "_blank");
  }
}

async function fetchTitle(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch (e) {
    console.warn("oEmbed title lookup failed", e);
    return null;
  }
}

function setMessage(msg) {
  uiMessage = msg || "";
  renderPlayerArea();
}

function getHistoryFilter() {
  if (!historyFilterEl) return "";
  return historyFilterEl.value.trim().toLowerCase();
}

function ensurePlayerAreaContainers() {
  if (playerShellEl) return;
  const signinEl = signinScreenEl || document.getElementById("signinScreen");
  playerArea.innerHTML = "";
  playerShellEl = document.createElement("div");
  playerShellEl.className = "player-shell";
  playerHolderEl = document.createElement("div");
  playerHolderEl.id = "main-player";
  playerShellEl.appendChild(playerHolderEl);

  gridWrapEl = document.createElement("div");
  gridWrapEl.className = "thumb-grid-wrap";
  gridEl = document.createElement("div");
  gridEl.className = "thumb-grid";
  gridActionsEl = document.createElement("div");
  gridActionsEl.className = "grid-actions";
  gridWrapEl.appendChild(gridEl);
  gridWrapEl.appendChild(gridActionsEl);

  messageEl = document.createElement("div");
  messageEl.className = "empty-state";

  playerArea.appendChild(playerShellEl);
  playerArea.appendChild(gridWrapEl);
  playerArea.appendChild(messageEl);
  if (signinEl) {
    playerArea.appendChild(signinEl);
  }
}

function normalizeVideoEntry(entry) {
  return {
    id: entry.id,
    title: entry.title || `Video ${entry.id}`,
    channelTitle: entry.channelTitle || "",
    sourceChannelId: entry.sourceChannelId || null,
    lastPosition: Number(entry.lastPosition) || 0,
    lastPlayedAt: entry.lastPlayedAt || Date.now(),
    finished: Boolean(entry.finished),
  };
}

function upsertVideo(entry) {
  const idx = state.videos.findIndex((v) => v.id === entry.id);
  if (idx === -1) {
    const next = normalizeVideoEntry(entry);
    state.videos.unshift(next);
    if (state.videos.length > MAX_HISTORY) {
      state.videos.length = MAX_HISTORY;
    }
    return next;
  }
  const existing = state.videos[idx];
  Object.assign(existing, normalizeVideoEntry({ ...existing, ...entry }));
  return existing;
}

function moveVideoToTop(id) {
  const idx = state.videos.findIndex((v) => v.id === id);
  if (idx <= 0) return;
  const [item] = state.videos.splice(idx, 1);
  state.videos.unshift(item);
}

function setActiveVideo(id) {
  state.selectedId = id;
  moveVideoToTop(id);
}

function getActiveVideo() {
  return state.videos.find((v) => v.id === state.selectedId) || null;
}

function updateRecentChannel(channelId) {
  if (!channelId) return;
  state.recentChannels = [channelId, ...state.recentChannels.filter((c) => c !== channelId)];
}

function recordPosition(force = false) {
  if (!player || !playerReady || !state.selectedId) return;
  const current = getActiveVideo();
  if (!current) return;
  const time = player.getCurrentTime ? player.getCurrentTime() : 0;
  if (!force && (!time || time < 1)) return;
  current.lastPosition = time;
  current.finished = false;
  persist();
}

function startPositionTimer() {
  if (positionTimer) return;
  positionTimer = setInterval(() => {
    if (!player || !playerReady) return;
    const st = player.getPlayerState ? player.getPlayerState() : null;
    if (st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.PAUSED) return;
    recordPosition();
  }, 20000);
}

function handlePlayerReady() {
  playerReady = true;
  if (typeof state.volume === "number") {
    player.setVolume(state.volume);
  }
  startPositionTimer();
  const current = getActiveVideo();
  if (current && activeLoadId !== current.id) {
    void loadVideoByEntry(current, { autoplay: false });
  }
}

function handlePlayerError() {
  const currentId = state.selectedId;
  if (state.selectedId) {
    const idx = state.videos.findIndex((v) => v.id === state.selectedId);
    if (idx !== -1) {
      state.videos.splice(idx, 1);
    }
  }
  state.selectedId = null;
  activeLoadId = null;
  state.displayThumbs = { items: [], openUrl: null, channelId: null };
  persist();
  if (playNextFromQueue(currentId)) {
    return;
  }
  setMessage("Video not found.");
}

function handlePlayerStateChange(event) {
  if (!event || typeof event.data !== "number") return;
  if (event.data === YT.PlayerState.ENDED) {
    const current = getActiveVideo();
    if (current) {
      current.finished = true;
      current.lastPosition = 0;
      persist();
    }
    if (playNextFromQueue(current?.id || null)) return;
  }
  if (event.data === YT.PlayerState.PAUSED) {
    recordPosition(true);
  }
  renderHistoryList();
}

function playNextFromQueue(currentId) {
  if (!channelQueue || !channelQueue.ids.length) return false;
  let baseIndex = channelQueue.index;
  if (currentId) {
    const found = channelQueue.ids.indexOf(currentId);
    if (found !== -1) baseIndex = found;
  }
  const nextIndex = baseIndex + 1;
  if (nextIndex >= channelQueue.ids.length) return false;
  channelQueue.index = nextIndex;
  const nextId = channelQueue.ids[nextIndex];
  const meta = channelQueue.items.find((item) => item.id === nextId);
  void playVideo({
    id: nextId,
    title: meta?.title,
    channelTitle: meta?.channel,
    sourceChannelId: channelQueue.channelId,
  });
  return true;
}

async function ensurePlayer() {
  await ensureYTReady();
  if (player) return player;
  player = new YT.Player(playerHolderEl, {
    videoId: state.selectedId || undefined,
    playerVars: {
      autoplay: 1,
      mute: 0,
      rel: 0,
      modestbranding: 1,
    },
    events: {
      onReady: handlePlayerReady,
      onStateChange: handlePlayerStateChange,
      onError: handlePlayerError,
    },
  });
  return player;
}

async function loadVideoByEntry(entry, { autoplay = true, force = false } = {}) {
  if (!entry) return;
  await ensurePlayer();
  if (!playerReady) return;
  if (!force && activeLoadId === entry.id) return;
  const resume =
    entry.finished || !entry.lastPosition || entry.lastPosition < 1 ? 0 : Math.floor(entry.lastPosition);
  activeLoadId = entry.id;
  if (autoplay) {
    player.loadVideoById({ videoId: entry.id, startSeconds: resume });
  } else {
    player.cueVideoById({ videoId: entry.id, startSeconds: resume });
  }
  if (typeof state.volume === "number") {
    player.setVolume(state.volume);
  }
}

async function playVideo(entry) {
  if (!entry || !entry.id) return;
  recordPosition(true);
  uiMessage = "";
  const now = Date.now();
  const existing = upsertVideo({ ...entry, lastPlayedAt: now, finished: false });
  setActiveVideo(existing.id);
  if (existing.sourceChannelId) {
    bumpChannelClick(existing.sourceChannelId);
    updateRecentChannel(existing.sourceChannelId);
  }
  state.displayThumbs = { items: [], openUrl: null, channelId: null };
  renderHistoryList();
  renderPlayerArea();
  await loadVideoByEntry(existing, { autoplay: true });
  persist();
}

function updateViewToggle() {
  if (!viewToggleEl) return;
  const authed = hasValidSession();
  const hasThumbs = state.displayThumbs?.items?.length > 0;
  const show = authed && !hasThumbs && Boolean(state.selectedId);
  viewToggleEl.style.display = show ? "inline-flex" : "none";
  const label = state.clean ? "Go back" : "View full";
  viewToggleEl.innerHTML = state.clean ? ICON_COMPRESS : ICON_EXPAND;
  viewToggleEl.setAttribute("aria-label", label);
  viewToggleEl.title = label;
}

function setClean(next) {
  state.clean = next;
  document.body.classList.toggle("clean", state.clean);
  playerArea.style.overflow = state.clean ? "hidden" : "auto";
  updateViewToggle();
  persist();
}

function render() {
  const authed = hasValidSession();
  document.body.classList.toggle("clean", state.clean);
  document.body.classList.toggle("unauth", !authed);
  signinScreenEl.style.display = authed ? "none" : "flex";
  if (!authed) {
    state.displayThumbs = { items: [], openUrl: null, channelId: null };
  }
  renderHistoryList();
  renderPlayerArea();
  renderAuthState();
  updateViewToggle();
  persist();
}

function renderHistoryList() {
  if (!historyListEl) return;
  historyListEl.innerHTML = "";
  const query = getHistoryFilter();
  const items = query
    ? state.videos.filter((v) => (v.title || v.id).toLowerCase().includes(query))
    : state.videos;
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = query ? "No matches." : "No videos yet.";
    historyListEl.appendChild(empty);
    return;
  }

  items.forEach((video) => {
    const item = document.createElement("div");
    const isActive = video.id === state.selectedId;
    item.className = `history-item${isActive ? " active" : ""}`;

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = video.title || video.id;
    title.title = video.title || video.id;
    if (!isActive) {
      const row = document.createElement("div");
      row.className = "history-row";
      row.appendChild(title);

      const closeBtn = document.createElement("button");
      closeBtn.className = "history-btn danger";
      closeBtn.innerHTML = ICON_CLOSE;
      closeBtn.title = "Remove";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        removeVideo(video.id);
      };
      row.appendChild(closeBtn);
      item.appendChild(row);
    } else {
      item.appendChild(title);
    }

    if (isActive) {
      const controls = document.createElement("div");
      controls.className = "history-controls";

      const left = document.createElement("div");
      left.className = "left";
      const right = document.createElement("div");
      right.className = "right";

      const playBtn = document.createElement("button");
      playBtn.className = "history-btn";
      const playing = player && playerReady && player.getPlayerState() === YT.PlayerState.PLAYING;
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.title = playing ? "Pause" : "Play";
      playBtn.onclick = (e) => {
        e.stopPropagation();
        togglePlayPause();
        renderHistoryList();
      };

      const muteBtn = document.createElement("button");
      muteBtn.className = "history-btn";
      const muted = player && playerReady && player.isMuted();
      muteBtn.innerHTML = muted ? ICON_UNMUTE : ICON_MUTE;
      muteBtn.title = muted ? "Unmute" : "Mute";
      muteBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMute();
        renderHistoryList();
      };

      const copyBtn = document.createElement("button");
      copyBtn.className = "history-btn";
      copyBtn.innerHTML = ICON_COPY;
      copyBtn.title = "Copy URL";
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        copyVideoUrl(video);
      };

      const closeBtn = document.createElement("button");
      closeBtn.className = "history-btn danger";
      closeBtn.innerHTML = ICON_CLOSE;
      closeBtn.title = "Remove";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        removeVideo(video.id);
      };

      left.appendChild(playBtn);
      left.appendChild(muteBtn);
      left.appendChild(copyBtn);
      right.appendChild(closeBtn);
      controls.appendChild(left);
      controls.appendChild(right);
      item.appendChild(controls);
    } else {
      item.onclick = () => {
        channelQueue = null;
        void playVideo(video);
      };
    }

    historyListEl.appendChild(item);
  });
}

function renderAuthState() {
  const authed = hasValidSession();
  if (authed) {
    log("auth state: logged in");
    if (signinStatusEl) signinStatusEl.textContent = "";
    loadSubscriptions();
    void ensureFreshToken();
    return;
  }
  log("auth state: logged out");
  if (signinStatusEl) signinStatusEl.textContent = "";
}

function ensureYTReady() {
  if (ytReadyPromise) return ytReadyPromise;
  ytReadyPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    window.onYouTubeIframeAPIReady = () => resolve();
    document.head.appendChild(script);
  });
  return ytReadyPromise;
}

function renderPlayerArea() {
  const authed = hasValidSession();
  const hasThumbs = state.displayThumbs?.items?.length > 0;
  ensurePlayerAreaContainers();
  playerArea.style.overflow = "hidden";

  playerShellEl.style.display = "none";
  gridWrapEl.style.display = "none";
  messageEl.style.display = "none";

  if (!authed) {
    return;
  }

  if (hasThumbs) {
    renderThumbGrid();
    if (player && playerReady) {
      player.pauseVideo();
    }
    return;
  }

  const current = getActiveVideo();
  if (current) {
    playerShellEl.style.display = "block";
    void loadVideoByEntry(current, { autoplay: true });
    return;
  }

  messageEl.style.display = "block";
  messageEl.textContent = uiMessage || "Search or paste a YouTube URL to start.";
}

function renderThumbGrid() {
  gridWrapEl.style.display = "block";
  gridEl.innerHTML = "";
  gridActionsEl.innerHTML = "";
  gridActionsEl.style.display = "none";
  playerArea.style.overflow = "auto";

  state.displayThumbs.items.forEach((thumb, idx) => {
    const card = document.createElement("div");
    card.className = "thumb-card";
    const img = document.createElement("img");
    img.src = thumb.thumb;
    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = thumb.title;
    title.title = thumb.title;
    const ch = document.createElement("div");
    ch.className = "channel";
    ch.textContent = thumb.channel || "";
    if (!thumb.channel) {
      ch.style.display = "none";
    }
    meta.appendChild(title);
    meta.appendChild(ch);
    card.appendChild(img);
    card.appendChild(meta);
    card.onclick = () => {
      if (state.displayThumbs?.channelId) {
        channelQueue = {
          channelId: state.displayThumbs.channelId,
          ids: state.displayThumbs.items.map((item) => item.id),
          items: state.displayThumbs.items,
          index: idx,
        };
      } else {
        channelQueue = null;
      }
      void playVideo({
        id: thumb.id,
        title: thumb.title,
        channelTitle: thumb.channel,
        sourceChannelId: state.displayThumbs?.channelId || null,
      });
    };
    gridEl.appendChild(card);
  });

  if (state.displayThumbs.openUrl) {
    const more = document.createElement("button");
    more.className = "ghost-button";
    more.textContent = "Open in browser";
    more.onclick = () => safeOpenExternal(state.displayThumbs.openUrl);
    gridActionsEl.appendChild(more);
    gridActionsEl.style.display = "flex";
  }
}

function togglePlayPause() {
  const current = getActiveVideo();
  if (!player || !playerReady) {
    if (current) void loadVideoByEntry(current, { autoplay: true, force: true });
    return;
  }
  const s = player.getPlayerState();
  if (
    s === YT.PlayerState.PAUSED ||
    s === YT.PlayerState.ENDED ||
    s === YT.PlayerState.UNSTARTED ||
    s === YT.PlayerState.CUED
  ) {
    player.playVideo();
  } else {
    player.pauseVideo();
  }
}

function toggleMute() {
  if (!player || !playerReady) return;
  if (player.isMuted()) player.unMute();
  else player.mute();
}

function buildVideoUrl(id, seconds) {
  const base = `https://www.youtube.com/watch?v=${id}`;
  if (!seconds || seconds < 1) return base;
  return `${base}&t=${Math.floor(seconds)}s`;
}

async function copyVideoUrl(video) {
  if (!video) return;
  const seconds = player && playerReady ? player.getCurrentTime() : video.lastPosition || 0;
  const url = buildVideoUrl(video.id, seconds);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return;
    } catch (_) {
      // fallback below
    }
  }
  const tmp = document.createElement("textarea");
  tmp.value = url;
  document.body.appendChild(tmp);
  tmp.select();
  document.execCommand("copy");
  tmp.remove();
}

function removeVideo(id) {
  const idx = state.videos.findIndex((v) => v.id === id);
  if (idx === -1) return;
  state.videos.splice(idx, 1);
  if (state.selectedId === id) {
    state.selectedId = null;
    activeLoadId = null;
    if (player && playerReady) {
      player.stopVideo();
    }
  }
  persist();
  renderHistoryList();
  renderPlayerArea();
  updateViewToggle();
}

function serializePlaylist() {
  const items = state.videos.map((v) => ({
    id: v.id,
    title: v.title,
    channelTitle: v.channelTitle || null,
    sourceChannelId: v.sourceChannelId || null,
    lastPosition: v.lastPosition || 0,
    finished: Boolean(v.finished),
    lastPlayedAt: v.lastPlayedAt || 0,
  }));
  const channels = {};
  items.forEach((item) => {
    const key = item.channelTitle || "Unknown";
    if (!channels[key]) channels[key] = [];
    channels[key].push(item);
  });
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    selectedId: state.selectedId || null,
    items,
    channels,
  };
}

async function exportPlaylist() {
  recordPosition(true);
  const payload = serializePlaylist();
  const res = await window.appBridge?.exportPlaylist?.(payload);
  if (!res || res.canceled) return;
  if (res.error) {
    alert(`Export failed: ${res.error}`);
  }
}

async function importPlaylist() {
  const res = await window.appBridge?.importPlaylist?.();
  if (!res || res.canceled) return;
  if (res.error) {
    alert(`Import failed: ${res.error}`);
    return;
  }
  const data = res.data || {};
  let items = Array.isArray(data.items) ? data.items : [];
  if (!items.length && data.channels) {
    Object.values(data.channels).forEach((group) => {
      if (Array.isArray(group)) items = items.concat(group);
    });
  }
  if (!items.length) {
    alert("Import file is empty.");
    return;
  }
  const seen = new Set();
  const normalized = [];
  items.forEach((item) => {
    if (!item || !item.id || seen.has(item.id)) return;
    seen.add(item.id);
    normalized.push(
      normalizeVideoEntry({
        id: item.id,
        title: item.title,
        channelTitle: item.channelTitle,
        sourceChannelId: item.sourceChannelId,
        lastPosition: item.lastPosition,
        finished: item.finished,
        lastPlayedAt: item.lastPlayedAt,
      })
    );
  });
  state.videos = normalized.slice(0, MAX_HISTORY);
  state.selectedId = state.videos.find((v) => v.id === data.selectedId)?.id || null;
  channelQueue = null;
  uiMessage = "";
  persist();
  renderHistoryList();
  renderPlayerArea();
  updateViewToggle();
}

async function handleDirectPlay() {
  const raw = mainInputEl?.value || "";
  const id = parseVideoId(raw);
  if (!id) {
    state.displayThumbs = { items: [], openUrl: null, channelId: null };
    setMessage("Video not found.");
    return;
  }
  const title = await fetchTitle(id);
  if (!title) {
    state.displayThumbs = { items: [], openUrl: null, channelId: null };
    setMessage("Video not found.");
    return;
  }
  channelQueue = null;
  await playVideo({ id, title });
}

async function ensureAccessToken() {
  const token = loadToken();
  if (!token) return null;
  if (!tokenExpired(token)) return token.access_token;
  if (!token.refresh_token) return null;
  log("refreshing access token");
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
  });
  if (CONFIG.clientSecret) {
    body.append("client_secret", CONFIG.clientSecret);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const next = {
    access_token: data.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveToken(next);
  return next.access_token;
}

async function startDeviceLogin() {
  if (!CONFIG.clientId) {
    alert("Állítsd be a YT_CLIENT_ID környezeti változót az OAuth-hoz.");
    return;
  }
  log("start device login");
  signinBtnEl.disabled = true;
  if (signinStatusEl) signinStatusEl.textContent = "Waiting for approval…";
  if (signinStatusEl) signinStatusEl.style.display = "block";
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    scope: "https://www.googleapis.com/auth/youtube.readonly",
  });
  const res = await fetch("https://oauth2.googleapis.com/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    alert("Device kód lekérés sikertelen.");
    signinBtnEl.disabled = false;
    if (signinStatusEl) signinStatusEl.textContent = "Failed to start login. Try again.";
    return;
  }
  const data = await res.json();
  if (signinStatusEl)
    signinStatusEl.textContent = `Nyisd meg: ${data.verification_url}, kód: ${data.user_code}`;
  safeOpenExternal(data.verification_url);
  lastDeviceCode = data.user_code;
  if (deviceCodeEl) deviceCodeEl.textContent = data.user_code;
  if (deviceCodeEl) deviceCodeEl.parentElement.style.display = data.user_code ? "block" : "none";
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(data.user_code);
    } catch (_) {
      // ignore
    }
  }
  log("device code received", data.user_code);

  const poll = async () => {
    const pollBody = new URLSearchParams({
      client_id: CONFIG.clientId,
      device_code: data.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (CONFIG.clientSecret) {
      pollBody.append("client_secret", CONFIG.clientSecret);
    }
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: pollBody,
    });
    const payload = await resp.json();
    if (payload.error === "authorization_pending") {
      log("auth pending");
      if (signinStatusEl) signinStatusEl.textContent = "Approve in browser…";
      if (signinStatusEl) signinStatusEl.style.display = "block";
      setTimeout(poll, data.interval * 1000);
      return;
    }
    if (payload.error) {
      if (signinStatusEl) signinStatusEl.textContent = `Auth hiba: ${payload.error}`;
      log("auth error", payload.error);
      signinBtnEl.disabled = false;
      if (signinStatusEl) signinStatusEl.textContent = `Error: ${payload.error}`;
      if (signinStatusEl) signinStatusEl.style.display = "block";
      return;
    }
    const token = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: Date.now() + payload.expires_in * 1000,
    };
    saveToken(token);
    log("auth success, token stored");
    renderAuthState();
    render();
    signinBtnEl.disabled = false;
    if (signinStatusEl) signinStatusEl.textContent = "Signed in.";
    if (signinStatusEl) signinStatusEl.style.display = "block";
  };
  setTimeout(poll, data.interval * 1000);
}

function logout() {
  log("logout");
  clearToken();
  lastDeviceCode = "";
  if (deviceCodeEl) deviceCodeEl.textContent = "";
  if (deviceCodeEl) deviceCodeEl.parentElement.style.display = "none";
  signinBtnEl.disabled = false;
  if (signinStatusEl) signinStatusEl.textContent = "";
  if (signinStatusEl) signinStatusEl.style.display = "none";
  if (subsFilterEl) subsFilterEl.value = "";
  channelQueue = null;
  uiMessage = "";
  state.displayThumbs = { items: [], openUrl: null, channelId: null };
  state.videos = [];
  state.selectedId = null;
  activeLoadId = null;
  if (player && playerReady) {
    player.stopVideo();
  }
  render();
}

async function ytFetch(path, params = {}, needsAuth = false) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const headers = {};
  if (needsAuth) {
    const token = await ensureAccessToken();
    if (!token) throw new Error("Nincs érvényes token.");
    headers.Authorization = `Bearer ${token}`;
  } else if (CONFIG.apiKey) {
    url.searchParams.set("key", CONFIG.apiKey);
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    let detail = "";
    try {
      const t = await res.json();
      detail = t.error?.message ? ` – ${t.error.message}` : "";
    } catch (_) {}
    throw new Error(`YouTube API hiba: ${res.status}${detail}`);
  }
  return res.json();
}

async function handleSearch() {
  const q = mainInputEl?.value.trim() || "";
  if (!q) return;
  state.displayThumbs = { items: [], openUrl: null, channelId: null };
  setMessage("Searching...");
  try {
    const data = await ytFetch(
      "search",
      {
        part: "snippet",
        q,
        type: "video",
        maxResults: 50,
      },
      false
    );
    const items = data.items || [];
    if (!items.length) {
      setMessage("No results.");
      return;
    }
    state.displayThumbs = {
      items: items.map((v) => ({
        id: v.id.videoId,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        channelId: v.snippet.channelId || null,
        thumb: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.high?.url || "",
      })),
      openUrl: items.length >= 50
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
        : null,
      channelId: null,
    };
    uiMessage = "";
    render();
  } catch (e) {
    setMessage(`Hiba: ${e.message}`);
  }
}

function sortSubscriptions(items) {
  const recentIndex = new Map((state.recentChannels || []).map((id, idx) => [id, idx]));
  return items.slice().sort((a, b) => {
    const aId = a.snippet.resourceId.channelId;
    const bId = b.snippet.resourceId.channelId;
    const aClicks = channelClicks[aId] || 0;
    const bClicks = channelClicks[bId] || 0;
    if (aClicks !== bClicks) return bClicks - aClicks;
    const aRecent = recentIndex.has(aId) ? recentIndex.get(aId) : Number.POSITIVE_INFINITY;
    const bRecent = recentIndex.has(bId) ? recentIndex.get(bId) : Number.POSITIVE_INFINITY;
    if (aRecent !== bRecent) return aRecent - bRecent;
    return a.snippet.title.localeCompare(b.snippet.title);
  });
}

function renderSubscriptions(items) {
  const query = getSubsFilter();
  const filtered = query
    ? items.filter((sub) => sub.snippet.title.toLowerCase().includes(query))
    : items;
  if (!filtered.length) {
    subsListEl.textContent = query ? "No matches." : "No subscriptions.";
    return;
  }
  const ordered = sortSubscriptions(filtered);
  subsListEl.innerHTML = "";
  ordered.forEach((sub) => {
    const div = document.createElement("div");
    div.className = "subs-item";
    const thumb = document.createElement("img");
    thumb.src = sub.snippet.thumbnails?.default?.url || "";
    thumb.alt = sub.snippet.title;
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = sub.snippet.title;
    const cached = channelCache[sub.snippet.resourceId.channelId];
    let count = cached?.newCount || 0;
    if (!count && cached?.items?.length) {
      count = cached.items.filter(
        (v) => Date.now() - new Date(v.snippet.publishedAt).getTime() < NEW_WINDOW_MS
      ).length;
    }
    div.appendChild(thumb);
    div.appendChild(title);
    if (count > 0) {
      const badge = document.createElement("div");
      badge.className = "badge-new";
      badge.textContent = count > 9 ? "9+" : `${count}`;
      div.appendChild(badge);
    }
    div.onclick = () => addLatestFromChannel(sub.snippet.resourceId.channelId, sub.snippet.title);
    subsListEl.appendChild(div);
  });
}

async function loadSubscriptions(pageToken = null, collected = []) {
  const now = Date.now();
  const maxAge = 3 * 60 * 60 * 1000;
  subsListEl.textContent = "Loading...";
  try {
    let items = [];
    if (subsCache.items.length && now - (subsCache.ts || 0) < maxAge) {
      items = subsCache.items;
    } else {
      const data = await ytFetch(
        "subscriptions",
        {
          part: "snippet",
          mine: "true",
          maxResults: 50,
          order: "alphabetical",
          pageToken: pageToken || undefined,
        },
        true
      );
      items = collected.concat(data.items || []);
      if (data.nextPageToken) {
        return loadSubscriptions(data.nextPageToken, items);
      }
      subsCache = { ts: now, items };
      saveSubsCache();
    }

    if (!items.length) {
      subsListEl.textContent = "No subscriptions.";
      return;
    }

    renderSubscriptions(items);
  } catch (e) {
    subsListEl.textContent = `Auth vagy kvóta hiba: ${e.message}`;
  }
}

async function addLatestFromChannel(channelId, channelTitle = "") {
  const cacheHit = channelCache[channelId];
  const now = Date.now();
  const maxAge = 3 * 60 * 60 * 1000; // 3 óra
  let items;
  if (cacheHit && now - cacheHit.ts < maxAge) {
    items = cacheHit.items;
  } else {
    try {
      const data = await ytFetch(
        "search",
        {
          part: "snippet",
          channelId,
          order: "date",
          maxResults: 30,
          type: "video",
        },
        true
      );
      items = data.items || [];
      channelCache[channelId] = { ts: now, items };
      saveChannelCache();
    } catch (e) {
      alert(`Hiba: ${e.message}`);
      return;
    }
  }

  if (!items.length) {
    alert("Nem találtam videót.");
    return;
  }

  // csak thumb listát mutatunk, nem játszunk le azonnal
  state.displayThumbs = {
    items: items.map((v) => ({
      id: v.id.videoId,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      channelId: v.snippet.channelId || channelId,
      thumb: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.high?.url || "",
    })),
    openUrl: items.length >= 30 ? `https://www.youtube.com/channel/${channelId}` : null,
    channelId,
  };
  const freshCount = items.filter(
    (v) => Date.now() - new Date(v.snippet.publishedAt).getTime() < NEW_WINDOW_MS
  ).length;
  channelCache[channelId] = { ...(channelCache[channelId] || {}), newCount: freshCount, ts: now, items };
  saveChannelCache();
  if (channelTitle) {
    state.recentChannels = [channelId, ...state.recentChannels.filter((c) => c !== channelId)];
    persist();
  }
  uiMessage = "";
  render();
}

if (searchBtn) searchBtn.addEventListener("click", handleSearch);
if (playBtn) playBtn.addEventListener("click", handleDirectPlay);
if (mainInputEl)
  mainInputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const id = parseVideoId(mainInputEl.value);
    if (id) {
      handleDirectPlay();
    } else {
      handleSearch();
    }
  });

if (signOutEl) signOutEl.addEventListener("click", logout);
if (signinBtnEl) signinBtnEl.addEventListener("click", startDeviceLogin);
if (deviceCodeEl)
  deviceCodeEl.addEventListener("click", () => {
    if (!lastDeviceCode) return;
    navigator.clipboard?.writeText(lastDeviceCode);
  });

if (volumeSliderEl) {
  volumeSliderEl.value = String(state.volume ?? 70);
  volumeSliderEl.addEventListener("input", () => {
    const next = Number(volumeSliderEl.value);
    state.volume = Number.isFinite(next) ? next : 70;
    if (player && playerReady) {
      player.setVolume(state.volume);
    }
    persist();
  });
}

if (historyFilterEl) historyFilterEl.addEventListener("input", renderHistoryList);

if (exportBtnEl) exportBtnEl.addEventListener("click", () => exportPlaylist());
if (importBtnEl) importBtnEl.addEventListener("click", () => importPlaylist());
if (clearHistoryEl)
  clearHistoryEl.addEventListener("click", () => {
    if (!state.videos.length) return;
    const ok = window.confirm("Clear the entire history? This cannot be undone.");
    if (!ok) return;
    state.videos = [];
    state.selectedId = null;
    activeLoadId = null;
    if (player && playerReady) {
      player.stopVideo();
    }
    if (historyFilterEl) historyFilterEl.value = "";
    persist();
    renderHistoryList();
    renderPlayerArea();
  });

if (subsFilterEl)
  subsFilterEl.addEventListener("input", () => {
    if (!subsCache.items.length) return;
    renderSubscriptions(subsCache.items);
  });

if (viewToggleEl)
  viewToggleEl.addEventListener("click", () => {
    setClean(!state.clean);
  });

window.addEventListener("keydown", (e) => {
  const target = e.target;
  const isTyping =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable === true);
  if (!isTyping) {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
      renderHistoryList();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      toggleMute();
      renderHistoryList();
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      mainInputEl?.focus();
      return;
    }
  }
  if (e.key === "Escape" && state.clean) {
    setClean(false);
  }
});

window.addEventListener("beforeunload", () => {
  recordPosition(true);
});

async function initApp() {
  await initToken();
  await ensureFreshToken();
  if (state.selectedId && !state.videos.find((v) => v.id === state.selectedId)) {
    state.selectedId = null;
  }
  if (state.selectedId) {
    moveVideoToTop(state.selectedId);
  }
  render();
}

initApp();
