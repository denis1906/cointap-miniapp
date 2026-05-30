/* --- Инициализация Telegram WebApp --- */
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

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

/* --- Отправка данных в бот --- */
function sendAction(payload) {
  if (tg) {
    tg.sendData(JSON.stringify(payload));
  }
}

/* --- Приём ответов от бота --- */
if (tg) {
  tg.onEvent("message", (msg) => {
    try {
      const data = JSON.parse(msg.text);
      if (data.type === "player") {
        player = { ...player, ...data };
        updateUI();
        startPassiveIfNeeded();
      } else if (data.type === "leaders") {
        renderLeaders(data.top);
      } else if (data.type === "error") {
        showToast(data.msg);
      }
    } catch (e) {}
  });
}

sendAction({ action: "init" });

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
  flushTimer = setTimeout(() => {
    if (pendingClicks > 0) {
      sendAction({ action: "click", count: pendingClicks });
      pendingClicks = 0;
    }
  }, 300);
});

/* --- Автокликер (пассивный доход на стороне UI) --- */
let passiveInterval = null;
let passiveSyncCounter = 0;

function startPassiveIfNeeded() {
  if (player.passive_per_sec > 0 && !passiveInterval) {
    passiveInterval = setInterval(() => {
      player.coins += player.passive_per_sec;
      updateCoinsDisplay();
      passiveSyncCounter++;
      if (passiveSyncCounter >= 5) {
        sendAction({ action: "click", count: 5 });
        passiveSyncCounter = 0;
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
      card.querySelector(".buy-btn").addEventListener("click", () => {
        sendAction({ action: "buy", upgrade: upg.id });
      });
    }
    list.appendChild(card);
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
    if (tab === "leaders") sendAction({ action: "leaders" });
  });
});

/* --- Утилиты --- */
function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
