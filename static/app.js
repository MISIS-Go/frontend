const app = document.getElementById("app");

const stickers = [
  "rfcyan",
  "rfnavy",
  "rforange",
  "rfpink",
  "rfyellow",
  "rbcyan",
  "rbnavy",
  "rborange",
  "rbpink",
  "rbyellow",
];

let state = {
  me: null,
  player: null,
  world: { width: 2800, height: 1800, hotspots: [], players: [], buildings: [], obstacles: [] },
  chat: [],
  notes: [],
  games: [],
  flags: [],
  wallet: { balance: 0, inventory: [] },
};

let liveSocket = null;
let chatSocket = null;
let renderLoopId = 0;
let localMotion = null;
let activeNote = null;
let activeModal = null;
let profileDraft = null;
const spriteCache = new Map();
const remoteMotion = new Map();
const camera = { x: 0, y: 0, width: 1280, height: 760, targetX: 0, targetY: 0 };
let lastMoveSentAt = 0;
const pressedKeys = new Set();
let controlsBound = false;

function hardReload() {
  window.location.assign("/");
}

function request(path, options = {}) {
  return fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
    return payload;
  });
}

function markdownToHtml(source) {
  return String(source)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\$\$(.+?)\$\$/gs, '<div class="latex-block">$1</div>')
    .replace(/\$(.+?)\$/g, '<span class="latex-inline">$1</span>')
    .replace(/\n/g, "<br />");
}

function stickerPath(name) {
  return `/assets/${stickers.includes(name) ? name : "rfcyan"}.png`;
}

function avatarSrc(profileOrPlayer) {
  return profileOrPlayer?.customAvatar || stickerPath(profileOrPlayer?.avatar || "rfcyan");
}

function spriteFor(entity) {
  const src = avatarSrc(entity);
  if (spriteCache.has(src)) return spriteCache.get(src);
  const image = new Image();
  image.src = src;
  image.onload = () => drawWorld();
  spriteCache.set(src, image);
  return image;
}

function playerById(userId) {
  return state.world.players.find((player) => player.userId === userId);
}

function syncRemoteMotion() {
  const aliveIds = new Set((state.world.players || []).map((player) => player.userId));
  for (const player of state.world.players || []) {
    if (state.me && player.userId === state.me.id) continue;
    const existing = remoteMotion.get(player.userId);
    if (!existing) {
      remoteMotion.set(player.userId, {
        x: player.x,
        y: player.y,
        targetX: player.x,
        targetY: player.y,
        lastFrameAt: performance.now(),
      });
      continue;
    }
    existing.targetX = player.x;
    existing.targetY = player.y;
  }
  for (const userId of remoteMotion.keys()) {
    if (!aliveIds.has(userId)) remoteMotion.delete(userId);
  }
}

function syncLocalMotion() {
  if (!state.player) {
    localMotion = null;
    return;
  }
  if (!localMotion) {
    localMotion = {
      x: state.player.x,
      y: state.player.y,
      targetX: state.player.x,
      targetY: state.player.y,
      pendingNetwork: false,
      lastFrameAt: performance.now(),
    };
    return;
  }
  if (!localMotion.pendingNetwork) {
    localMotion.x = state.player.x;
    localMotion.y = state.player.y;
    localMotion.targetX = state.player.x;
    localMotion.targetY = state.player.y;
  }
}

function currentPlayerPosition(player) {
  if (state.me && localMotion && player.userId === state.me.id) {
    return { x: localMotion.x, y: localMotion.y };
  }
  const remote = remoteMotion.get(player.userId);
  if (remote) {
    return { x: remote.x, y: remote.y };
  }
  return { x: player.x, y: player.y };
}

function openSocket() {
  if (!state.me || liveSocket) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.hostname || "localhost";
  const path = window.BEZUM_CONFIG?.backendWsPath;
  const port = window.BEZUM_CONFIG?.backendWsPort || "18001";
  liveSocket = new WebSocket(path ? `${protocol}//${host}${path}` : `${protocol}//${host}:${port}/ws/chat`);
  liveSocket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "snapshot") {
      state.world = { ...state.world, ...(payload.world || {}), players: payload.players || [] };
      if (payload.me) state.player = payload.me;
      syncLocalMotion();
      syncRemoteMotion();
      render();
      return;
    }
    if (payload.type === "player.update") {
      const existing = playerById(payload.player.userId);
      if (existing) Object.assign(existing, payload.player);
      else state.world.players.push(payload.player);
      if (state.me && payload.player.userId === state.me.id) {
        state.player = payload.player;
        syncLocalMotion();
        if (localMotion) {
          localMotion.targetX = payload.player.x;
          localMotion.targetY = payload.player.y;
          localMotion.pendingNetwork = false;
        }
      }
      syncRemoteMotion();
      if (payload.hotspot?.kind && payload.hotspot.kind !== "flag") {
        activeModal = { kind: payload.hotspot.kind, hotspotId: payload.hotspot.id };
        renderModal();
      }
      renderHud();
      return;
    }
    if (payload.type === "player.leave") {
      state.world.players = state.world.players.filter((player) => player.userId !== payload.userId);
      remoteMotion.delete(payload.userId);
      renderHud();
    }
  };
  liveSocket.onclose = () => {
    liveSocket = null;
    setTimeout(openSocket, 1000);
  };
}

function openChatSocket() {
  if (!state.me || chatSocket) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const host = location.hostname || "localhost";
  const path = window.BEZUM_CONFIG?.chatWsPath;
  const port = window.BEZUM_CONFIG?.chatWsPort || "18007";
  chatSocket = new WebSocket(path ? `${protocol}//${host}${path}` : `${protocol}//${host}:${port}/ws/chat`);
  chatSocket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "snapshot") {
      state.chat = payload.messages || [];
      if (activeModal?.kind === "chat") renderModal();
      return;
    }
    if (payload.type === "chat.message") {
      state.chat.push(payload.message);
      state.chat = state.chat.slice(-80);
      if (activeModal?.kind === "chat") renderModal();
    }
  };
  chatSocket.onclose = () => {
    chatSocket = null;
    setTimeout(openChatSocket, 1000);
  };
}

async function bootstrap() {
  state = await request("/api/bootstrap");
  activeNote = state.notes?.[0] || null;
  syncLocalMotion();
  syncRemoteMotion();
  if (state.me) {
    openSocket();
    openChatSocket();
  }
  render();
}

function authShell() {
  cancelAnimationFrame(renderLoopId);
  renderLoopId = 0;
  app.innerHTML = `
    <section class="auth-stage">
      <div class="auth-billboard">
        <p class="eyebrow">Cartoon CTF MMO</p>
        <h1>Bezum</h1>
        <p class="lede">A large map, realtime players, clickable buildings, notes, a bank, mini-games, and an intentionally vulnerable profile.</p>
        <div class="sticker-row">
          ${stickers.slice(0, 5).map((name) => `<img src="${stickerPath(name)}" alt="" />`).join("")}
        </div>
      </div>
      <div class="auth-columns">
        <form id="register-form" class="panel stack">
          <h2>Register</h2>
          <input name="username" placeholder="Username" maxlength="24" />
          <input name="password" type="password" placeholder="Password" maxlength="64" />
          <button type="submit">Create character</button>
        </form>
        <form id="login-form" class="panel stack">
          <h2>Login</h2>
          <input name="username" placeholder="Username" maxlength="24" />
          <input name="password" type="password" placeholder="Password" maxlength="64" />
          <button type="submit">Enter the map</button>
        </form>
      </div>
      <a class="secret-link" href="/flag">/flag</a>
    </section>
  `;

  document.getElementById("register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      await request("/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      hardReload();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      await request("/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      hardReload();
    } catch (error) {
      alert(error.message);
    }
  });
}

function hudPlayers() {
  return (state.world.players || []).map((player) => `
    <div class="hud-player ${state.me?.id === player.userId ? "active" : ""}">
      <img src="${avatarSrc(player)}" alt="" />
      <span>${player.username}</span>
    </div>
  `).join("");
}

function modalTitle(kind) {
  return kind === "notes"
    ? "Notes House"
    : kind === "bank"
    ? "Popcorn Bank"
    : kind === "games"
    ? "Arcade Pier"
    : kind === "flags"
    ? "Flag Bureau"
    : kind === "profile"
    ? "Profile House"
    : "Chat Fountain";
}

function chatModal() {
  return `
    <div class="chat-feed">${(state.chat || []).slice(-40).reverse().map((message) => `
      <article class="chat-line">
        <strong>${message.username}</strong>
        <p>${message.text}</p>
      </article>
    `).join("")}</div>
    <form id="chat-form" class="chat-form">
      <input name="text" maxlength="400" placeholder="Write to chat..." />
      <button type="submit">Send</button>
    </form>
  `;
}

function notesModal() {
  const noteHtml = activeNote ? markdownToHtml(activeNote.body) : "<p>Select a note on the left.</p>";
  return `
    <div class="notes-layout">
      <div class="note-sidebar">
        ${(state.notes || []).map((note) => `
          <button class="note-chip ${activeNote?.id === note.id ? "active" : ""}" data-note="${note.id}">
            <strong>${note.title}</strong>
            <span>${note.hidden ? "hidden" : note.roomId}</span>
          </button>
        `).join("")}
      </div>
      <div class="note-view">
        <div class="note-render">${noteHtml}</div>
        ${activeNote ? `<button id="hide-note" data-id="${activeNote.id}">Hide note</button>` : ""}
      </div>
    </div>
    <form id="note-form" class="stack">
      <input name="title" maxlength="80" placeholder="Note title" />
      <textarea name="body" rows="8" placeholder="# markdown&#10;&#10;<b>html is welcome</b>&#10;&#10;$E=mc^2$"></textarea>
      <button type="submit">Save note</button>
    </form>
  `;
}

function bankModal() {
  return `
    <div class="bank-balance">Balance: <strong>${state.wallet?.balance ?? 0}</strong> coinz</div>
    <div class="inventory-row">${(state.wallet?.inventory || []).map((item) => `<span>${item}</span>`).join("")}</div>
    <div id="shop-list" class="stack"></div>
    <form id="transfer-form" class="stack">
      <input name="toUserId" placeholder="Recipient user.id" />
      <input name="amount" type="number" min="1" max="300" placeholder="Amount" />
      <button type="submit">Transfer</button>
    </form>
    <form id="preview-form" class="stack">
      <input name="url" placeholder="http://inmemory:8005/internal/flags" />
      <button type="submit">Preview URL</button>
    </form>
    <pre id="preview-log" class="preview-log"></pre>
  `;
}

function gamesModal() {
  return `
    <div class="stack">
      ${(state.games || []).map((game) => `
        <article class="game-card">
          <div>
            <h3>${game.title}</h3>
            <p>${game.summary}</p>
          </div>
          <div class="game-actions">
            <input type="range" min="0" max="100" value="74" data-score="${game.id}" />
            <button data-play="${game.id}">Play</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function flagsModal() {
  return `
    <div class="stack">
      <p class="lede small">Submit flags here. The server throttles attempts and locks brute force.</p>
      <div class="flag-grid">
        ${(state.flags || []).map((flag) => `
          <div class="flag-card ${flag.solved ? "solved" : ""}">
            <strong>${flag.label}</strong>
            <span>${flag.id}</span>
            <small>${flag.difficulty}</small>
          </div>
        `).join("")}
      </div>
      <form id="flag-form" class="stack">
        <select name="challenge_id">
          ${(state.flags || []).map((flag) => `<option value="${flag.id}">${flag.id}</option>`).join("")}
        </select>
        <input name="flag" placeholder="flag{...}" />
        <button type="submit">Submit flag</button>
      </form>
      <pre id="flag-log" class="preview-log"></pre>
    </div>
  `;
}

function profilePreviewMarkup() {
  const preview = profileDraft?.customAvatar || avatarSrc(state.me.profile);
  if (preview && preview.startsWith("data:image/svg+xml")) {
    return `<object class="avatar-object" data="${preview}" type="image/svg+xml"></object>`;
  }
  return `<img src="${preview}" alt="" />`;
}

function profileModal() {
  if (!profileDraft) {
    profileDraft = {
      title: state.me.profile.title,
      color: state.me.profile.color,
      avatar: state.me.profile.avatar,
      customAvatar: state.me.profile.customAvatar,
    };
  }
  return `
    <div class="profile-grid">
      <div class="profile-side">
        <div class="avatar-stage" id="profile-preview">${profilePreviewMarkup()}</div>
        <label>
          <span>Profile label</span>
          <input id="profile-title" maxlength="48" value="${profileDraft.title}" />
        </label>
        <label>
          <span>Color</span>
          <input id="profile-color" value="${profileDraft.color}" />
        </label>
        <label>
          <span>Sticker base</span>
          <select id="profile-avatar">
            ${stickers.map((name) => `<option value="${name}" ${profileDraft.avatar === name ? "selected" : ""}>${name}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Upload avatar up to 50 MB</span>
          <input id="profile-upload" type="file" accept="image/*,.svg" />
        </label>
        <div class="profile-actions">
          <button id="profile-clear" type="button">Clear custom</button>
          <button id="profile-save" type="button">Save</button>
        </div>
      </div>
      <div class="profile-side">
        <p class="lede small">You can draw right here. It is stored as a data URL without proper sanitization.</p>
        <canvas id="paint-canvas" class="paint-canvas" width="280" height="280"></canvas>
        <div class="profile-actions">
          <button id="paint-use" type="button">Use drawing</button>
          <button id="paint-reset" type="button">Clear canvas</button>
        </div>
      </div>
    </div>
  `;
}

function modalMarkup() {
  if (!activeModal) return "";
  const body = activeModal.kind === "notes"
    ? notesModal()
    : activeModal.kind === "bank"
    ? bankModal()
    : activeModal.kind === "games"
    ? gamesModal()
    : activeModal.kind === "flags"
    ? flagsModal()
    : activeModal.kind === "profile"
    ? profileModal()
    : chatModal();
  return `
    <div class="modal-backdrop" id="modal-close-bg">
      <div class="modal-shell">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Building Popup</p>
            <h2>${modalTitle(activeModal.kind)}</h2>
          </div>
          <button id="modal-close">Close</button>
        </div>
        <div class="modal-body">${body}</div>
      </div>
    </div>
  `;
}

function worldShell() {
  app.innerHTML = `
    <section class="world-app">
      <section class="world-stage">
        <canvas id="world-canvas"></canvas>
        <div class="world-overlay top-left">
          <div class="player-hud">
            <img src="${avatarSrc(state.me.profile)}" alt="" />
            <div class="player-hud-copy">
              <strong>${state.me.username}</strong>
              <span>${state.me.profile.title}</span>
            </div>
            <div class="player-hud-stat">
              <span>coins</span>
              <strong>${state.wallet?.balance ?? 0}</strong>
            </div>
            <div class="player-hud-stat">
              <span>online</span>
              <strong>${(state.world.players || []).length}</strong>
            </div>
            <button class="ghost-button" id="logout-button">Logout</button>
          </div>
        </div>
        <div class="world-overlay bottom-right">
          <div class="minimap-shell">
            <canvas id="minimap-canvas" width="220" height="160"></canvas>
            <div class="minimap-caption">
              <strong>Map</strong>
              <span>WASD / click</span>
            </div>
          </div>
        </div>
      </section>
      <div id="modal-root">${modalMarkup()}</div>
    </section>
  `;
  bindWorldShell();
  bindGlobalControls();
  startRenderLoop();
  renderHud();
  renderShop();
}

function renderHud() {
  const hud = document.querySelector(".player-hud");
  if (hud) {
    const onlineStrong = hud.querySelectorAll(".player-hud-stat strong")[1];
    if (onlineStrong) onlineStrong.textContent = String((state.world.players || []).length);
  }
}

function renderModal() {
  const root = document.getElementById("modal-root");
  if (!root) return;
  root.innerHTML = modalMarkup();
  bindModal();
  renderShop();
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(960, Math.floor(rect.width * dpr));
  const height = Math.max(540, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  camera.width = canvas.width;
  camera.height = canvas.height;
}

function updateLocalMotion(now) {
  if (!localMotion) return;
  const dx = localMotion.targetX - localMotion.x;
  const dy = localMotion.targetY - localMotion.y;
  const distance = Math.hypot(dx, dy);
  const delta = Math.min(34, Math.max(10, now - localMotion.lastFrameAt));
  localMotion.lastFrameAt = now;
  const speed = 0.24 * delta;
  if (distance <= speed) {
    localMotion.x = localMotion.targetX;
    localMotion.y = localMotion.targetY;
    return;
  }
  localMotion.x += (dx / distance) * speed;
  localMotion.y += (dy / distance) * speed;
}

function localCollides(x, y, radius = 34) {
  if (x < radius || y < radius || x > state.world.width - radius || y > state.world.height - radius) {
    return true;
  }

  for (const obstacle of state.world.obstacles || []) {
    const nearestX = clamp(x, obstacle.x, obstacle.x + obstacle.width);
    const nearestY = clamp(y, obstacle.y, obstacle.y + obstacle.height);
    if (Math.hypot(x - nearestX, y - nearestY) < radius) {
      return true;
    }
  }

  for (const player of state.world.players || []) {
    if (player.userId === state.me?.id) continue;
    const pos = currentPlayerPosition(player);
    if (Math.hypot(x - pos.x, y - pos.y) < radius * 1.55) {
      return true;
    }
  }

  return false;
}

function keyboardVector() {
  const left = pressedKeys.has("a") || pressedKeys.has("arrowleft");
  const right = pressedKeys.has("d") || pressedKeys.has("arrowright");
  const up = pressedKeys.has("w") || pressedKeys.has("arrowup");
  const down = pressedKeys.has("s") || pressedKeys.has("arrowdown");
  return {
    x: (right ? 1 : 0) - (left ? 1 : 0),
    y: (down ? 1 : 0) - (up ? 1 : 0),
  };
}

function updateKeyboardMotion(now) {
  if (!state.me || !localMotion) return;
  const vector = keyboardVector();
  if (!vector.x && !vector.y) return;

  const length = Math.hypot(vector.x, vector.y) || 1;
  const delta = Math.min(34, Math.max(10, now - localMotion.lastFrameAt));
  const speed = 0.32 * delta;
  const nextX = localMotion.x + (vector.x / length) * speed;
  const nextY = localMotion.y + (vector.y / length) * speed;

  let moved = false;
  if (!localCollides(nextX, localMotion.y)) {
    localMotion.x = nextX;
    moved = true;
  }
  if (!localCollides(localMotion.x, nextY)) {
    localMotion.y = nextY;
    moved = true;
  }

  if (moved) {
    localMotion.targetX = localMotion.x;
    localMotion.targetY = localMotion.y;
    localMotion.pendingNetwork = true;
    state.player = {
      ...(state.player || {}),
      x: localMotion.x,
      y: localMotion.y,
    };
  }
}

function updateRemoteMotion(now) {
  for (const motion of remoteMotion.values()) {
    const dx = motion.targetX - motion.x;
    const dy = motion.targetY - motion.y;
    const distance = Math.hypot(dx, dy);
    const delta = Math.min(34, Math.max(10, now - (motion.lastFrameAt || now)));
    motion.lastFrameAt = now;
    const speed = 0.19 * delta;
    if (distance <= speed) {
      motion.x = motion.targetX;
      motion.y = motion.targetY;
      continue;
    }
    motion.x += (dx / distance) * speed;
    motion.y += (dy / distance) * speed;
  }
}

function sendMoveProgress(now, force = false) {
  if (!localMotion || !localMotion.pendingNetwork) return;
  if (!force && now - lastMoveSentAt < 95) return;
  lastMoveSentAt = now;
  if (liveSocket && liveSocket.readyState === WebSocket.OPEN) {
    liveSocket.send(JSON.stringify({ type: "world.move", x: localMotion.x, y: localMotion.y }));
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateCamera() {
  const player = state.player;
  if (!player) return;
  const x = localMotion ? localMotion.x : player.x;
  const y = localMotion ? localMotion.y : player.y;
  const marginX = camera.width * 0.28;
  const marginY = camera.height * 0.24;
  const screenX = x - camera.x;
  const screenY = y - camera.y;

  if (screenX < marginX) {
    camera.targetX = x - marginX;
  } else if (screenX > camera.width - marginX) {
    camera.targetX = x - (camera.width - marginX);
  }

  if (screenY < marginY) {
    camera.targetY = y - marginY;
  } else if (screenY > camera.height - marginY) {
    camera.targetY = y - (camera.height - marginY);
  }

  camera.targetX = clamp(camera.targetX, 0, state.world.width - camera.width);
  camera.targetY = clamp(camera.targetY, 0, state.world.height - camera.height);
  camera.x += (camera.targetX - camera.x) * 0.12;
  camera.y += (camera.targetY - camera.y) * 0.12;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBackground(ctx) {
  ctx.fillStyle = "#89daff";
  ctx.fillRect(0, 0, state.world.width, state.world.height);

  const cloudSpots = [
    [280, 190, 94],
    [760, 120, 74],
    [1880, 170, 88],
    [2410, 250, 70],
  ];
  for (const [x, y, r] of cloudSpots) {
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.7, y + 8, r * 0.76, 0, Math.PI * 2);
    ctx.arc(x - r * 0.65, y + 14, r * 0.68, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#f9e09d" : "#9cebaf";
    ctx.fillRect(i * 160, 1180 + (i % 3) * 20, 190, 620);
  }

  ctx.fillStyle = "#f3d8a5";
  roundRect(ctx, 720, 810, 1180, 430, 130);
  ctx.fill();
  ctx.fillStyle = "#dfbe70";
  roundRect(ctx, 780, 980, 1060, 120, 54);
  ctx.fill();
  ctx.fillStyle = "#e8cb88";
  roundRect(ctx, 1160, 320, 110, 650, 42);
  ctx.fill();
  roundRect(ctx, 1820, 640, 110, 640, 42);
  ctx.fill();
  ctx.fillStyle = "#bfefff";
  roundRect(ctx, 180, 900, 560, 360, 120);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.44)";
  ctx.lineWidth = 10;
  for (let x = 860; x < 1760; x += 150) {
    ctx.beginPath();
    ctx.moveTo(x, 1040);
    ctx.lineTo(x + 82, 1040);
    ctx.stroke();
  }
  ctx.fillStyle = "#65be72";
  roundRect(ctx, 2220, 340, 330, 330, 80);
  ctx.fill();

  for (const [x, y] of [[210, 760], [580, 760], [2080, 1460], [2280, 760], [2480, 760], [2500, 1230]]) {
    ctx.fillStyle = "#4ea95d";
    ctx.beginPath();
    ctx.arc(x, y, 54, 0, Math.PI * 2);
    ctx.arc(x + 30, y - 24, 46, 0, Math.PI * 2);
    ctx.arc(x - 30, y - 18, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7b5135";
    roundRect(ctx, x - 10, y + 30, 20, 56, 10);
    ctx.fill();
  }

  ctx.strokeStyle = "#d7b16c";
  ctx.lineWidth = 8;
  for (let x = 1080; x < 1620; x += 74) {
    ctx.beginPath();
    ctx.moveTo(x, 760);
    ctx.lineTo(x, 860);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(1050, 760);
  ctx.lineTo(1650, 760);
  ctx.stroke();
}

function drawBuilding(ctx, building, active) {
  ctx.save();
  ctx.shadowColor = "rgba(23,50,76,0.18)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = building.bodyColor;
  ctx.strokeStyle = active ? "#ff7f98" : "rgba(23,50,76,0.22)";
  ctx.lineWidth = active ? 6 : 3;
  roundRect(ctx, building.x, building.y + 62, building.width, building.height - 62, 26);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = building.roofColor;
  ctx.beginPath();
  ctx.moveTo(building.x - 12, building.y + 88);
  ctx.lineTo(building.x + building.width / 2, building.y);
  ctx.lineTo(building.x + building.width + 12, building.y + 88);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(building.x + 30, building.y + 84);
  ctx.lineTo(building.x + building.width / 2, building.y + 22);
  ctx.lineTo(building.x + building.width / 2 + 36, building.y + 46);
  ctx.lineTo(building.x + 54, building.y + 98);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      roundRect(ctx, building.x + 34 + col * 78, building.y + 108 + row * 64, 44, 38, 12);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#7b5135";
  roundRect(ctx, building.x + building.width / 2 - 34, building.y + building.height - 88, 68, 88, 18);
  ctx.fill();
  ctx.fillStyle = "#f3d591";
  ctx.beginPath();
  ctx.arc(building.x + building.width / 2 + 18, building.y + building.height - 42, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4f4f4";
  roundRect(ctx, building.x + building.width - 72, building.y + 46, 26, 92, 14);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.arc(building.x + building.width - 58, building.y + 34, 22, 0, Math.PI * 2);
  ctx.arc(building.x + building.width - 36, building.y + 26, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#72b364";
  ctx.beginPath();
  ctx.arc(building.x + 26, building.y + building.height - 10, 20, 0, Math.PI * 2);
  ctx.arc(building.x + building.width - 26, building.y + building.height - 10, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17324c";
  ctx.font = "700 34px Trebuchet MS";
  ctx.fillText(building.label, building.x + 22, building.y + building.height - 30);
  ctx.restore();
}

function drawWorld() {
  const canvas = document.getElementById("world-canvas");
  if (!canvas) return;
  resizeCanvas(canvas);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  drawBackground(ctx);

  for (const building of state.world.buildings || []) {
    drawBuilding(ctx, building, activeModal && building.hotspotId === `hotspot-${activeModal.kind}`);
  }

  for (const player of state.world.players || []) {
    const pos = currentPlayerPosition(player);
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = player.color || "#55c1ff";
    ctx.arc(pos.x, pos.y, 34, 0, Math.PI * 2);
    ctx.fill();
    const sprite = spriteFor(player);
    if (sprite.complete) ctx.drawImage(sprite, pos.x - 28, pos.y - 28, 56, 56);
    ctx.fillStyle = "#17324c";
    ctx.font = "700 18px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(player.username, pos.x, pos.y + 62);
    ctx.restore();
  }

  ctx.restore();
}

function drawMinimap() {
  const canvas = document.getElementById("minimap-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / state.world.width;
  const scaleY = canvas.height / state.world.height;

  ctx.fillStyle = "rgba(18, 36, 55, 0.82)";
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 18);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 14);
  ctx.clip();

  ctx.fillStyle = "#90dbff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#f0d18b";
  for (const building of state.world.buildings || []) {
    ctx.fillRect(building.x * scaleX, building.y * scaleY, building.width * scaleX, building.height * scaleY);
  }

  ctx.fillStyle = "rgba(28, 66, 92, 0.28)";
  for (const obstacle of state.world.obstacles || []) {
    ctx.fillRect(obstacle.x * scaleX, obstacle.y * scaleY, obstacle.width * scaleX, obstacle.height * scaleY);
  }

  for (const player of state.world.players || []) {
    const pos = currentPlayerPosition(player);
    ctx.beginPath();
    ctx.fillStyle = player.userId === state.me?.id ? "#ff7f98" : "#17324c";
    ctx.arc(pos.x * scaleX, pos.y * scaleY, player.userId === state.me?.id ? 4.2 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(camera.x * scaleX, camera.y * scaleY, camera.width * scaleX, camera.height * scaleY);
  ctx.restore();
}

function renderLoop(now) {
  if (!state.me) return;
  updateKeyboardMotion(now);
  updateLocalMotion(now);
  updateRemoteMotion(now);
  sendMoveProgress(now);
  updateCamera();
  drawWorld();
  drawMinimap();
  renderLoopId = requestAnimationFrame(renderLoop);
}

function startRenderLoop() {
  cancelAnimationFrame(renderLoopId);
  renderLoopId = requestAnimationFrame(renderLoop);
}

function hotspotAtWorld(x, y) {
  return (state.world.hotspots || []).find((spot) =>
    x >= spot.x && x <= spot.x + spot.width && y >= spot.y && y <= spot.y + spot.height
  ) || null;
}

function moveToWorld(x, y) {
  syncLocalMotion();
  if (localMotion) {
    localMotion.targetX = x;
    localMotion.targetY = y;
    localMotion.pendingNetwork = true;
    localMotion.lastFrameAt = performance.now();
  }
  if (liveSocket && liveSocket.readyState === WebSocket.OPEN) {
    liveSocket.send(JSON.stringify({ type: "world.move", x, y }));
    lastMoveSentAt = performance.now();
  } else {
    request("/api/world/move", { method: "POST", body: JSON.stringify({ x, y }) }).then((payload) => {
      state.player = payload.player;
      const existing = playerById(payload.player.userId);
      if (existing) Object.assign(existing, payload.player);
      else state.world.players.push(payload.player);
      syncRemoteMotion();
      if (payload.hotspot?.kind && payload.hotspot.kind !== "flag") {
        activeModal = { kind: payload.hotspot.kind, hotspotId: payload.hotspot.id };
        renderModal();
      }
      syncLocalMotion();
    });
  }
}

function bindWorldShell() {
  document.getElementById("logout-button").addEventListener("click", async () => {
    await request("/auth/logout", { method: "POST" });
    if (liveSocket) liveSocket.close();
    liveSocket = null;
    if (chatSocket) chatSocket.close();
    chatSocket = null;
    activeModal = null;
    profileDraft = null;
      state = {
        me: null,
        player: null,
        world: { width: 2800, height: 1800, hotspots: [], players: [], buildings: [], obstacles: [] },
        chat: [],
        notes: [],
        games: [],
        flags: [],
        wallet: { balance: 0, inventory: [] },
      };
      remoteMotion.clear();
      hardReload();
    });

  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.open;
      if (kind === "flag") {
        location.href = "/flag";
        return;
      }
      activeModal = { kind, hotspotId: `hotspot-${kind}` };
      renderModal();
    });
  });

  document.getElementById("world-canvas").addEventListener("click", (event) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const worldX = camera.x + (event.clientX - rect.left) * scaleX;
    const worldY = camera.y + (event.clientY - rect.top) * scaleY;
    const hotspot = hotspotAtWorld(worldX, worldY);
    if (hotspot) {
      if (hotspot.kind === "flag") {
        location.href = "/flag";
        return;
      }
      activeModal = { kind: hotspot.kind, hotspotId: hotspot.id };
      renderModal();
    }
    moveToWorld(worldX, worldY);
  });

  bindModal();
}

function bindGlobalControls() {
  if (controlsBound) return;
  controlsBound = true;

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      pressedKeys.add(key);
      if (localMotion) {
        localMotion.targetX = localMotion.x;
        localMotion.targetY = localMotion.y;
      }
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.key.toLowerCase());
  });

  window.addEventListener("blur", () => {
    pressedKeys.clear();
  });
}

function renderShop() {
  if (activeModal?.kind !== "bank") return;
  request("/api/bank/shop").then((payload) => {
    const root = document.getElementById("shop-list");
    if (!root) return;
    root.innerHTML = payload.shop.map((item) => `
      <div class="shop-row">
        <span>${item.title}</span>
        <small>${item.price} coinz</small>
        <button data-buy="${item.id}">Buy</button>
      </div>
    `).join("");
    bindModal();
  });
}

function bindPainter() {
  const canvas = document.getElementById("paint-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineWidth = 12;
  ctx.strokeStyle = profileDraft?.color || "#55c1ff";
  let painting = false;

  const coords = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  canvas.addEventListener("pointerdown", (event) => {
    painting = true;
    const point = coords(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!painting) return;
    ctx.strokeStyle = document.getElementById("profile-color").value || "#55c1ff";
    const point = coords(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  });

  const stopPainting = () => {
    painting = false;
  };
  canvas.addEventListener("pointerup", stopPainting);
  canvas.addEventListener("pointerleave", stopPainting);
}

function bindModal() {
  document.getElementById("modal-close")?.addEventListener("click", () => {
    activeModal = null;
    renderModal();
  });
  document.getElementById("modal-close-bg")?.addEventListener("click", (event) => {
    if (event.target.id !== "modal-close-bg") return;
    activeModal = null;
    renderModal();
  });

  if (activeModal?.kind === "chat") {
    document.getElementById("chat-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const text = String(form.get("text") || "");
      if (!text.trim()) return;
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({
          type: "chat.send",
          text,
          userId: state.me.id,
          username: state.me.username,
          roomId: "sunny-plaza",
        }));
      } else {
        await request("/chat/api/chat/send", {
          method: "POST",
          body: JSON.stringify({
            text,
            userId: state.me.id,
            username: state.me.username,
            roomId: "sunny-plaza",
          }),
        });
      }
      event.currentTarget.reset();
    });
  }

  if (activeModal?.kind === "notes") {
    document.querySelectorAll("[data-note]").forEach((button) => {
      button.addEventListener("click", () => {
        activeNote = state.notes.find((note) => note.id === button.dataset.note) || null;
        renderModal();
      });
    });
    document.getElementById("hide-note")?.addEventListener("click", async () => {
      await request(`/api/notes/${document.getElementById("hide-note").dataset.id}/hide`, { method: "POST", body: "{}" });
      await bootstrap();
      activeModal = { kind: "notes", hotspotId: "hotspot-notes" };
      renderModal();
    });
    document.getElementById("note-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await request("/api/notes", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      await bootstrap();
      activeModal = { kind: "notes", hotspotId: "hotspot-notes" };
      renderModal();
    });
  }

  if (activeModal?.kind === "bank") {
    document.getElementById("transfer-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await request("/api/bank/transfer", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      await bootstrap();
      activeModal = { kind: "bank", hotspotId: "hotspot-bank" };
      renderModal();
    });
    document.getElementById("preview-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = await request("/api/bank/preview", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
      document.getElementById("preview-log").textContent = JSON.stringify(payload, null, 2);
    });
    document.querySelectorAll("[data-buy]").forEach((button) => {
      button.addEventListener("click", async () => {
        await request("/api/bank/buy", { method: "POST", body: JSON.stringify({ itemId: button.dataset.buy }) });
        await bootstrap();
        activeModal = { kind: "bank", hotspotId: "hotspot-bank" };
        renderModal();
      });
    });
  }

  if (activeModal?.kind === "games") {
    document.querySelectorAll("[data-play]").forEach((button) => {
      button.addEventListener("click", async () => {
        const score = document.querySelector(`[data-score="${button.dataset.play}"]`).value;
        const payload = await request(`/api/games/play/${button.dataset.play}`, { method: "POST", body: JSON.stringify({ score }) });
        alert(`${payload.gameId}: reward ${payload.reward}, hint: ${payload.hint}`);
        await bootstrap();
        activeModal = { kind: "games", hotspotId: "hotspot-games" };
        renderModal();
      });
    });
  }

  if (activeModal?.kind === "flags") {
    document.getElementById("flag-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const payload = await request("/api/flags/submit", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(form.entries())),
        });
        document.getElementById("flag-log").textContent = JSON.stringify(payload, null, 2);
        await bootstrap();
        activeModal = { kind: "flags", hotspotId: "hotspot-flags" };
        renderModal();
      } catch (error) {
        document.getElementById("flag-log").textContent = error.message;
      }
    });
  }

  if (activeModal?.kind === "profile") {
    bindPainter();
    document.getElementById("profile-upload")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        alert("The file must be smaller than 50 MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        profileDraft.customAvatar = String(reader.result);
        renderModal();
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("profile-clear")?.addEventListener("click", () => {
      profileDraft.customAvatar = null;
      renderModal();
    });

    document.getElementById("paint-use")?.addEventListener("click", () => {
      profileDraft.customAvatar = document.getElementById("paint-canvas").toDataURL("image/png");
      renderModal();
    });

    document.getElementById("paint-reset")?.addEventListener("click", () => {
      const canvas = document.getElementById("paint-canvas");
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    document.getElementById("profile-save")?.addEventListener("click", async () => {
      profileDraft.title = document.getElementById("profile-title").value;
      profileDraft.color = document.getElementById("profile-color").value;
      profileDraft.avatar = document.getElementById("profile-avatar").value;
      await request("/auth/profile", { method: "POST", body: JSON.stringify(profileDraft) });
      await bootstrap();
      activeModal = { kind: "profile", hotspotId: "hotspot-profile" };
      renderModal();
    });
  }
}

function render() {
  if (!state.me) {
    authShell();
    return;
  }
  worldShell();
}

bootstrap().catch(() => {
  authShell();
});
