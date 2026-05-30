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
  upgrades: { double: false, triple: false, auto: false },
};

const UPGRADES_CONFIG = [
  { id: "double", label: "Двойной удар", desc: "x2 монеты за каждый клик", price: 500,  icon: "⚡" },
  { id: "triple", label: "Тройной удар", desc: "x3 монеты за каждый клик", price: 2000, icon: "🔥" },
  { id: "auto",   label: "Автокликер",  desc: "+1 монета в секунду",       price: 1000, icon: "🤖" },
];

/* --- HTTP API --- */
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

/* --- Загрузка игрока при старте --- */
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

/* --- Кликер с батчингом --- */
let pendingClicks = 0;
let flushTimer = null;

document.getElementById("coin-btn").addEventListener("click", (e) => {
  pendingClicks++;
  player.coins += player.coins_per_click;
  updateCoinsDisplay();
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
    // клики уже отражены в UI оптимистично — просто логируем
    console.warn("flush error:", e);
  }
}

/* --- Автокликер (пассивный доход на стороне UI) --- */
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

/* --- UI --- */

function updateUI() {
  updateCoinsDisplay();
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
      <button class="buy-btn"
        ${owned || !canAfford ? "disabled" : ""}
        data-id="${upg.id}">
        ${owned ? "Куплено" : `🪙 ${upg.price}`}
      </button>
    `;
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
      <span class="leader-coins">🪙 ${formatCoins(item.coins)}</span>
    `;
    list.appendChild(li);
  }
}

/* --- Частицы на Canvas --- */
const canvas = document.getElementById("particles-canvas");
const ctx = canvas.getContext("2d");
canvas.width = 200;
canvas.height = 200;

const particles = [];

function spawnParticles(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const count = 8 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
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
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;
    if (p.alpha <= 0) { particles.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240, 168, 0, ${p.alpha})`;
    ctx.fill();
  }
  if (particles.length > 0) requestAnimationFrame(animateParticles);
}

/* --- Всплывающий +N --- */
function spawnPopup(event, amount) {
  const div = document.createElement("div");
  div.className = "coin-popup";
  div.textContent = `+${amount}`;
  div.style.left = `${event.clientX - 16}px`;
  div.style.top  = `${event.clientY - 20}px`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 800);
}

/* --- Toast --- */
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

/* --- Навигация --- */
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

/* --- Утилиты --- */
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
