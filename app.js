/* --- Инициализация Telegram WebApp --- */
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

/* --- Пользователь --- */
const tgUser = tg?.initDataUnsafe?.user;
const USER_ID   = tgUser?.id        || 0;
const USER_NAME = tgUser?.first_name || "Player";

/* --- API URL из config.json --- */
let API_URL = "http://localhost:8080";
async function loadConfig() {
  try {
    const res = await fetch("config.json");
    const cfg = await res.json();
    API_URL = cfg.api_url || API_URL;
  } catch (e) {}
}

/* --- Состояние --- */
let player = {
  coins: 0,
  coins_per_click: 1,
  passive_per_sec: 0,
  total_clicks: 0,
  upgrades: { double: false, triple: false, auto: false },
};

const UPGRADES_CONFIG = [
  { id: "double", label: "Двойной удар", desc: "x2 монеты за каждый клик", price: 500,  icon: "⚡" },
  { id: "triple", label: "Тройной удар", desc: "x3 монеты за каждый клик", price: 2000, icon: "🔥" },
  { id: "auto",   label: "Автокликер",  desc: "+1 монета в секунду",       price: 1000, icon: "🤖" },
];

/* ═══════════════════════════════════════════════════════════════
   УРОВНИ МОНЕТЫ
   ═══════════════════════════════════════════════════════════════ */
const COIN_LEVELS = [
  {
    threshold: 0, name: "Медная",
    grad: ["#d4956a", "#a05a28", "#5a2e0a"],
    stroke: "#5a2e0a", letter: "#3a1500",
    particleColor: "160, 90, 40",
  },
  {
    threshold: 250, name: "Золотая",
    grad: ["#ffe066", "#f0a800", "#b07000"],
    stroke: "#b07000", letter: "#7a4a00",
    particleColor: "240, 168, 0",
  },
  {
    threshold: 500, name: "Серебряная",
    grad: ["#f5f5f5", "#c0c0c0", "#787878"],
    stroke: "#606060", letter: "#303030",
    particleColor: "192, 192, 192",
    extras: `<line x1="36" y1="30" x2="46" y2="52" stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="round"/>`,
  },
  {
    threshold: 1000, name: "Сапфировая",
    grad: ["#90d0ff", "#1a7fd4", "#0a3a8a"],
    stroke: "#0a3a8a", letter: "#d0eeff",
    particleColor: "26, 127, 212",
    extras: `
      <circle cx="30" cy="60" r="3" fill="rgba(255,255,255,0.35)"/>
      <circle cx="90" cy="60" r="3" fill="rgba(255,255,255,0.35)"/>
      <circle cx="60" cy="30" r="3" fill="rgba(255,255,255,0.35)"/>
      <circle cx="60" cy="90" r="3" fill="rgba(255,255,255,0.35)"/>`,
  },
  {
    threshold: 3000, name: "Изумрудная",
    grad: ["#70ff98", "#00b341", "#005a20"],
    stroke: "#005a20", letter: "#c0ffd0",
    particleColor: "0, 179, 65",
    extras: `<polygon points="60,36 72,60 60,84 48,60" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>`,
  },
  {
    threshold: 10000, name: "Аметистовая",
    grad: ["#e090ff", "#9b30ff", "#5a0099"],
    stroke: "#5a0099", letter: "#f0d0ff",
    particleColor: "155, 48, 255",
    extras: `<path d="M42,56 L48,44 L54,52 L60,42 L66,52 L72,44 L78,56 Z" fill="#e090ff" stroke="rgba(255,255,255,0.4)" stroke-width="1" opacity="0.8"/>`,
    letterY: "82",
  },
  {
    threshold: 25000, name: "Рубиновая",
    grad: ["#ff8888", "#cc0000", "#7a0000"],
    stroke: "#7a0000", letter: "#ffe8e8",
    particleColor: "204, 0, 0",
    extras: `<circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,80,80,0.35)" stroke-width="5"/>`,
  },
  {
    threshold: 100000, name: "Легендарная",
    grad: ["#ff6b6b", "#ffd700", "#00ff88"],
    stroke: "#ffd700", letter: "#ffffff",
    particleColor: "255, 215, 0",
    legendary: true,
    extras: `
      <circle cx="24" cy="34" r="2.5" fill="white" opacity="0.75"/>
      <circle cx="96" cy="34" r="2.5" fill="white" opacity="0.75"/>
      <circle cx="24" cy="86" r="2.5" fill="white" opacity="0.75"/>
      <circle cx="96" cy="86" r="2.5" fill="white" opacity="0.75"/>
      <circle cx="60" cy="18" r="2"   fill="white" opacity="0.6"/>`,
  },
];

function getCoinLevel(totalClicks) {
  let level = 0;
  for (let i = 0; i < COIN_LEVELS.length; i++) {
    if (totalClicks >= COIN_LEVELS[i].threshold) level = i;
    else break;
  }
  return level;
}

function getCoinSVG(levelIdx) {
  const lvl = COIN_LEVELS[levelIdx];
  const [c1, c2, c3] = lvl.grad;
  const gradId = `cg${levelIdx}`;
  const letterY = lvl.letterY || "75";

  const gradDef = lvl.legendary
    ? `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#ff6b6b"><animate attributeName="stop-color" values="#ff6b6b;#ffd700;#00ff88;#00bfff;#c84bff;#ff6b6b" dur="3s" repeatCount="indefinite"/></stop>
        <stop offset="50%"  stop-color="#ffd700"><animate attributeName="stop-color" values="#ffd700;#00ff88;#00bfff;#c84bff;#ff6b6b;#ffd700" dur="3s" repeatCount="indefinite"/></stop>
        <stop offset="100%" stop-color="#00ff88"><animate attributeName="stop-color" values="#00ff88;#00bfff;#c84bff;#ff6b6b;#ffd700;#00ff88" dur="3s" repeatCount="indefinite"/></stop>
      </linearGradient>`
    : `<radialGradient id="${gradId}" cx="40%" cy="35%">
        <stop offset="0%"   stop-color="${c1}"/>
        <stop offset="60%"  stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c3}"/>
      </radialGradient>`;

  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradDef}</defs>
    <circle cx="60" cy="60" r="56" fill="url(#${gradId})" stroke="${lvl.stroke}" stroke-width="3"/>
    <circle cx="60" cy="60" r="46" fill="none" stroke="${c1}" stroke-width="2" opacity="0.5"/>
    ${lvl.extras || ""}
    <text x="60" y="${letterY}" text-anchor="middle" font-size="48"
          font-family="Inter,sans-serif" font-weight="700"
          fill="${lvl.letter}">C</text>
  </svg>`;
}

/* Текущий уровень для отслеживания level-up */
let currentCoinLevel = -1;
let currentParticleColor = "240, 168, 0";

function updateCoin() {
  const level = getCoinLevel(player.total_clicks || 0);
  if (level !== currentCoinLevel) {
    if (currentCoinLevel !== -1) showLevelUp(COIN_LEVELS[level].name);
    currentCoinLevel = level;
    document.getElementById("coin-btn").innerHTML = getCoinSVG(level);
    currentParticleColor = COIN_LEVELS[level].particleColor;
    // Обновить цвет glow монеты
    const glow = COIN_LEVELS[level].particleColor;
    document.getElementById("coin-btn").style.filter =
      `drop-shadow(0 0 20px rgba(${glow},0.5))`;
  }
}

function showLevelUp(name) {
  const el = document.createElement("div");
  el.className = "levelup-popup";
  el.innerHTML = `✨ Новый уровень<br><b>${name}</b>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/* ─── HTTP API ─────────────────────────────────────────────── */
async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Ошибка сервера");
  }
  return res.json();
}

/* ─── Загрузка игрока при старте ───────────────────────────── */
async function init() {
  await loadConfig();
  try {
    const data = await apiGet(`/api/player?user_id=${USER_ID}&name=${encodeURIComponent(USER_NAME)}`);
    player = { ...player, ...data };
    updateUI();
    startPassiveIfNeeded();
  } catch (e) {
    showToast("Нет связи с сервером");
  }
}

init();

/* ─── Кликер с батчингом ───────────────────────────────────── */
let pendingClicks = 0;
let flushTimer = null;

document.getElementById("coin-btn").addEventListener("click", (e) => {
  pendingClicks++;
  player.coins += player.coins_per_click;
  player.total_clicks = (player.total_clicks || 0) + 1;
  updateCoinsDisplay();
  updateCoin();
  spawnParticles(e);
  spawnPopup(e, player.coins_per_click);

  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushClicks, 300);
});

async function flushClicks() {
  if (pendingClicks <= 0) return;
  const count = pendingClicks;
  pendingClicks = 0;
  try {
    const data = await apiPost("/api/click", { user_id: USER_ID, count });
    player = { ...player, ...data };
    updateUI();
  } catch (e) {
    console.warn("flush error:", e);
  }
}

/* ─── Автокликер ───────────────────────────────────────────── */
let passiveInterval = null;
let passiveSyncCounter = 0;

function startPassiveIfNeeded() {
  if (player.passive_per_sec > 0 && !passiveInterval) {
    passiveInterval = setInterval(async () => {
      player.coins += player.passive_per_sec;
      updateCoinsDisplay();
      passiveSyncCounter++;
      if (passiveSyncCounter >= 5) {
        passiveSyncCounter = 0;
        try {
          const data = await apiPost("/api/click", { user_id: USER_ID, count: 5 });
          player = { ...player, ...data };
          updateUI();
        } catch (e) {}
      }
    }, 1000);
  }
}

/* ─── UI ───────────────────────────────────────────────────── */
function updateUI() {
  updateCoinsDisplay();
  updateCoin();
  document.getElementById("cpc-value").textContent = player.coins_per_click;
  const passiveEl = document.getElementById("passive-display");
  if (player.passive_per_sec > 0) {
    passiveEl.style.display = "";
    document.getElementById("passive-value").textContent = player.passive_per_sec;
  } else {
    passiveEl.style.display = "none";
  }
  renderShop();
}

function formatCoins(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.floor(n));
}

function updateCoinsDisplay() {
  document.getElementById("coins-value").textContent = formatCoins(player.coins);
}

function renderShop() {
  const list = document.getElementById("shop-list");
  list.innerHTML = "";
  for (const upg of UPGRADES_CONFIG) {
    const owned = player.upgrades[upg.id];
    const canAfford = player.coins >= upg.price;
    const card = document.createElement("div");
    card.className = "shop-card" + (owned ? " owned" : "");
    card.innerHTML = `
      <div class="shop-card-info">
        <h3>${upg.icon} ${upg.label}</h3>
        <p>${upg.desc}</p>
      </div>
      <button class="buy-btn" ${owned || !canAfford ? "disabled" : ""} data-id="${upg.id}">
        ${owned ? "Куплено" : `🪙 ${upg.price}`}
      </button>`;
    if (!owned && canAfford) {
      card.querySelector(".buy-btn").addEventListener("click", () => buyUpgrade(upg.id));
    }
    list.appendChild(card);
  }
}

async function buyUpgrade(upgradeId) {
  try {
    const data = await apiPost("/api/buy", { user_id: USER_ID, upgrade: upgradeId });
    player = { ...player, ...data };
    updateUI();
    startPassiveIfNeeded();
  } catch (e) {
    showToast(e.message || "Ошибка покупки");
  }
}

async function loadLeaders() {
  try {
    const data = await apiGet("/api/leaders");
    renderLeaders(data.top);
  } catch (e) {
    showToast("Не удалось загрузить лидеров");
  }
}

function renderLeaders(top) {
  const list = document.getElementById("leaders-list");
  list.innerHTML = "";
  for (const item of top) {
    const li = document.createElement("li");
    li.className = "leader-row";
    li.innerHTML = `
      <span class="leader-rank"></span>
      <span class="leader-name">${escapeHtml(item.name)}</span>
      <span class="leader-coins">🪙 ${formatCoins(item.coins)}</span>`;
    list.appendChild(li);
  }
}

/* ─── Частицы ──────────────────────────────────────────────── */
const canvas = document.getElementById("particles-canvas");
const ctx = canvas.getContext("2d");
canvas.width = 200;
canvas.height = 200;
const particles = [];

function spawnParticles(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  for (let i = 0; i < 8 + Math.floor(Math.random() * 5); i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 3 + Math.random() * 3,
      alpha: 1,
      decay: 0.025 + Math.random() * 0.02,
    });
  }
  if (particles.length > 0) requestAnimationFrame(animateParticles);
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
    if (p.alpha <= 0) { particles.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${currentParticleColor}, ${p.alpha})`;
    ctx.fill();
  }
  if (particles.length > 0) requestAnimationFrame(animateParticles);
}

/* ─── Всплывающий +N ───────────────────────────────────────── */
function spawnPopup(event, amount) {
  const div = document.createElement("div");
  div.className = "coin-popup";
  div.textContent = `+${amount}`;
  div.style.left = `${event.clientX - 16}px`;
  div.style.top  = `${event.clientY - 20}px`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 800);
}

/* ─── Toast ────────────────────────────────────────────────── */
let toastTimer = null;
const toastEl = (() => {
  const el = document.createElement("div");
  el.id = "toast";
  document.body.appendChild(el);
  return el;
})();

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2000);
}

/* ─── Навигация ────────────────────────────────────────────── */
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
    btn.classList.add("active");
    if (tab === "leaders") loadLeaders();
  });
});

/* ─── Утилиты ──────────────────────────────────────────────── */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
