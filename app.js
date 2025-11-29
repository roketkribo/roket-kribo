// ROKET KRIBO - versi canvas kartun, support HP + leaderboard Google Sheet
(() => {
  // =========================
  // CONFIG
  // =========================
  const LEADERBOARD_URL =
    "https://script.google.com/macros/s/AKfycbxW9xlYm6Ravhkyz3z1BJB2gryKxFMMmgo96uBDRKTP-d4a-aMv3szcCdTqY2L-xwqy/exec";

  const GRAVITY = 1900;         // gravitasi px/s^2
  const FLAP_V = -600;          // kecepatan loncat
  const PIPE_INTERVAL = 1500;   // ms antar meteor
  const PIPE_WIDTH = 90;
  const GAP_BASE = 260;
  const GAP_MIN = 190;
  const BASE_SPEED = 220;
  const SPEED_PER_SCORE = 3;

  const STAR_RADIUS = 14;
  const SLOWMO_MS = 3000;
  const SLOWMO_SCALE = 0.6;

  const ROCKET_W = 56;
  const ROCKET_H = 40;

  // =========================
  // DOM
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const nickInput = document.getElementById("nick");
  const startBtn = document.getElementById("startBtn");
  const leaderBox = document.getElementById("leader");

  if (!canvas || !ctx || !nickInput || !startBtn || !leaderBox) {
    alert("Elemen HTML belum lengkap (canvas#game, input#nick, button#startBtn, div#leader).");
    return;
  }

  // =========================
  // CANVAS RESIZE (PC & HP)
  // =========================
  let viewW = 0;
  let viewH = 0;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = viewW * dpr;
    canvas.height = viewH * dpr;
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // =========================
  // HELPERS
  // =========================
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function sanitizeNick(raw) {
    let v = String(raw || "").trim();
    v = v.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
    return v;
  }

  // =========================
  // AUDIO (sederhana)
  // =========================
  const audio = {
    ctx: null,
    ready: false,
    sfxGain: null,

    unlock() {
      if (this.ready) return;
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      this.ctx = new A();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.ctx.destination);
      this.ready = true;
    },

    beep(freq, dur, type = "sine", vol = 0.12) {
      if (!this.ready) return;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.sfxGain);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    },

    flap() {
      this.beep(720, 0.08, "square", 0.10);
    },
    score() {
      this.beep(880, 0.06, "sine", 0.10);
    },
    star() {
      this.beep(660, 0.08, "sine", 0.10);
      setTimeout(() => this.beep(1100, 0.08, "sine", 0.10), 60);
    },
    slow() {
      this.beep(330, 0.14, "sine", 0.12);
    },
    boom() {
      if (!this.ready) return;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(260, t0);
      o.frequency.exponentialRampToValueAtTime(70, t0 + 0.18);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.28, t0 + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g);
      g.connect(this.sfxGain);
      o.start(t0);
      o.stop(t0 + 0.27);
    }
  };

  // =========================
  // LEADERBOARD
  // =========================
  async function fetchLeaderboard() {
    leaderBox.textContent = "memuat leaderboard...";
    if (!LEADERBOARD_URL) {
      leaderBox.textContent = "leaderboard belum dihubungkan.";
      return;
    }
    try {
      const res = await fetch(LEADERBOARD_URL);
      const data = await res.json();
      const list = (data && data.top) || [];
      if (!list.length) {
        leaderBox.textContent = "belum ada skor";
        return;
      }
      leaderBox.innerHTML = "";
      list.slice(0, 5).forEach((row, i) => {
        const div = document.createElement("div");
        div.textContent = `${i + 1}. ${row.nickname} — ${row.score}`;
        leaderBox.appendChild(div);
      });
    } catch (e) {
      console.error(e);
      leaderBox.textContent = "gagal memuat leaderboard";
    }
  }

  async function submitScore(nickname, score) {
    if (!LEADERBOARD_URL) return;
    try {
      await fetch(LEADERBOARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, score })
      });
      fetchLeaderboard();
    } catch (e) {
      console.error("submitScore error", e);
    }
  }

  fetchLeaderboard();

  // =========================
  // GAME STATE
  // =========================
  let gameState = "idle"; // "idle" | "playing" | "dead"
  let nickname = "";

  let rocketY = viewH * 0.5;
  let rocketVY = 0;

  let pipes = [];
  let lastPipeAt = 0;
  let score = 0;
  let combo = 0;
  let bestLocal = Number(localStorage.getItem("rk_best") || 0);

  let star = null;
  let starPending = false;
  let slowUntil = 0;
  let shake = 0;
  let flash = 0;

  const bgStars = Array.from({ length: 90 }, () => ({
    x: Math.random() * viewW,
    y: Math.random() * viewH,
    r: 0.5 + Math.random() * 1.8,
    s: 15 + Math.random() * 35,
    a: 0.3 + Math.random() * 0.5
  }));

  function resetGame() {
    rocketY = viewH * 0.5;
    rocketVY = 0;
    pipes = [];
    lastPipeAt = 0;
    score = 0;
    combo = 0;
    star = null;
    starPending = false;
    slowUntil = 0;
    shake = 0;
    flash = 0;
  }

  function rocketRect() {
    const x = viewW * 0.22;
    return { x, y: rocketY - ROCKET_H / 2, w: ROCKET_W, h: ROCKET_H };
  }

  function hitRect(a, b) {
    return !(
      a.x + a.w < b.x ||
      a.x > b.x + b.w ||
      a.y + a.h < b.y ||
      a.y > b.y + b.h
    );
  }

  function pipeSpeed() {
    return BASE_SPEED + score * SPEED_PER_SCORE;
  }

  function currentGap() {
    const g = GAP_BASE - score * 0.6;
    return Math.max(GAP_MIN, g);
  }

  // =========================
  // SPAWN PIPE & STAR
  // =========================
  function spawnPipe(now) {
    const gap = currentGap();
    const margin = 80;
    const center = rand(margin + gap / 2, viewH - margin - gap / 2);

    const pipe = {
      x: viewW + 100,
      w: PIPE_WIDTH,
      topH: center - gap / 2,
      bottomY: center + gap / 2,
      bottomH: viewH - (center + gap / 2),
      passed: false
    };

    if (starPending) {
      const sy = clamp(center + rand(-gap * 0.25, gap * 0.25), 60, viewH - 60);
      star = { x: pipe.x + pipe.w * 0.6, y: sy, r: STAR_RADIUS, alive: true };
      starPending = false;
    }

    pipes.push(pipe);
    lastPipeAt = now;
  }

  // =========================
  // DRAW HELPERS
  // =========================
  function drawBackground(dt) {
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, viewW, viewH);

    // gradient langit
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#020617");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);

    // bintang
    for (const s of bgStars) {
      s.x -= s.s * dt;
      if (s.x < -10) {
        s.x = viewW + 10;
        s.y = Math.random() * viewH;
      }
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // planet bumi di kanan-bawah
    const R = Math.min(viewW, viewH) * 0.35;
    const cx = viewW * 0.86;
    const cy = viewH * 0.82;
    const g2 = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.1, cx, cy, R);
    g2.addColorStop(0, "rgba(96,165,250,0.95)");
    g2.addColorStop(0.5, "rgba(37,99,235,0.9)");
    g2.addColorStop(1, "rgba(15,23,42,0.9)");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = g2;
    ctx.fill();

    // sedikit daratan
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(34,197,94,0.9)";
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.15, cy, R * 0.5, R * 0.25, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawMeteor(pipe) {
    const x = pipe.x;
    const w = pipe.w;

    // atas
    ctx.fillStyle = "#7c4a23";
    roundRect(x, 0, w, pipe.topH, 16);
    ctx.fill();

    // bawah
    roundRect(x, pipe.bottomY, w, pipe.bottomH, 16);
    ctx.fill();

    // tekstur
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let i = 0; i < 5; i++) {
      const px = x + 10 + Math.random() * (w - 20);
      const py = Math.random() * (pipe.topH - 20);
      ctx.beginPath();
      ctx.arc(px, py, 3 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStarObj(s, t) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.sin(t * 0.005) * 0.2);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10;
      const r = (i % 2 === 0) ? s.r : s.r * 0.45;
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(253,224,71,0.95)";
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawRocketCute(x, y, t, thrust) {
    ctx.save();
    ctx.translate(x, y);
    const wob = Math.sin(t * 0.01) * 0.06;
    ctx.rotate(wob);

    const w = ROCKET_W;
    const h = ROCKET_H;

    // shadow
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(0, h * 0.6, w * 0.38, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = "black";
    ctx.fill();
    ctx.globalAlpha = 1;

    // body
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, "#fb7185");
    grad.addColorStop(1, "#f97316");
    ctx.fillStyle = grad;
    roundRect(-w / 2, -h / 2, w, h, 18);
    ctx.fill();

    // window
    ctx.fillStyle = "#bfdbfe";
    ctx.beginPath();
    ctx.ellipse(-w * 0.08, 0, w * 0.14, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(-w * 0.12, -h * 0.08, w * 0.06, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // fins
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.2);
    ctx.lineTo(-w * 0.45, h * 0.42);
    ctx.lineTo(-w * 0.02, h * 0.38);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.2);
    ctx.lineTo(-w * 0.45, -h * 0.42);
    ctx.lineTo(-w * 0.02, -h * 0.38);
    ctx.closePath();
    ctx.fill();

    // nose
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.quadraticCurveTo(w / 2 + 14, -8, w / 2, -h * 0.16);
    ctx.quadraticCurveTo(w / 2 - 4, 0, w / 2, h * 0.16);
    ctx.quadraticCurveTo(w / 2 + 14, 8, w / 2, 0);
    ctx.fill();

    // flame
    if (thrust) {
      ctx.save
