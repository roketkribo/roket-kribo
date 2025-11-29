(() => {
  // =========================
  // CONFIG
  // =========================
  const GAME_NAME = "Roket Kribo";
  const LEADERBOARD_URL = ""; // nanti

  const NICK_RE = /^[A-Za-z0-9]{1,10}$/;

  // Difficulty feel (lebih menantang daripada versi kemarin)
  const BASE_SPEED = 195;
  const SPEED_PER_SCORE = 2.6;

  const PIPE_INTERVAL = 1450;   // jarak antar meteor
  const PIPE_W = 86;

  // Gap size
  const GAP_BASE = 235;
  const GAP_MIN  = 185;

  // Random lubang: tetap random tapi nggak lompat mustahil
  const CENTER_SMOOTH = 0.55;   // 0..1 (semakin besar = makin mengikuti random)
  const CENTER_JITTER = 42;     // getaran kecil biar berasa random
  const CENTER_SPIKE_CHANCE = 0.22; // sesekali shift agak jauh
  const CENTER_SPIKE = 85;      // besarnya shift jauh (tetap dibatasi)

  // Double gap (2 lubang)
  const DOUBLE_GAP_CHANCE = 0.14;      // 14% peluang (sesekali)
  const DOUBLE_GAP_COOLDOWN = 2;       // setelah muncul, minimal 2 meteor berikutnya normal
  const DOUBLE_GAP_SEP_EXTRA_MIN = 80; // jarak antar 2 lubang
  const DOUBLE_GAP_SEP_EXTRA_MAX = 140;

  // Physics
  const GRAVITY = 1500;
  const FLAP_V = -520;

  const ROCKET_W = 56;
  const ROCKET_H = 40;

  const SLOWMO_SCALE = 0.62;
  const SLOWMO_MS = 5000;

  // =========================
  // DOM
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const elScore = document.getElementById("score");
  const elCombo = document.getElementById("combo");
  const elBestSession = document.getElementById("bestSession");

  const menu = document.getElementById("menu");
  const go = document.getElementById("gameover");

  const btnStart = document.getElementById("btnStart");
  const btnRetry = document.getElementById("btnRetry");
  const btnBack = document.getElementById("btnBack");
  const btnHow = document.getElementById("btnHow");
  const howBox = document.getElementById("howBox");

  const inputNick = document.getElementById("nickname");
  const nickHint = document.getElementById("nickHint");

  const lbList = document.getElementById("lbList");
  const lbNote = document.getElementById("lbNote");

  const btnSfx = document.getElementById("btnSfx");
  const btnMusic = document.getElementById("btnMusic");

  const clock = document.getElementById("clock");
  const clockFill = document.getElementById("clockFill");

  const finalScore = document.getElementById("finalScore");
  const finalBest = document.getElementById("finalBest");

  const must = [canvas, elScore, elCombo, elBestSession, menu, go, btnStart, btnRetry, btnBack, btnHow, howBox, inputNick, nickHint, lbList, lbNote, btnSfx, btnMusic, clock, clockFill, finalScore, finalBest];
  if (must.some(x => !x)) {
    alert("Ada elemen HTML yang belum ketemu. Pastikan index.html lengkap (id game/score/combo/bestSession/menu/gameover dll).");
    return;
  }

  // =========================
  // CANVAS RESIZE
  // =========================
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // =========================
  // SESSION STORAGE
  // =========================
  const KEY_BEST = "rk_best_session";
  const KEY_SFX = "rk_sfx";
  const KEY_MUSIC = "rk_music";

  let bestSession = Number(sessionStorage.getItem(KEY_BEST) || 0);
  elBestSession.textContent = String(bestSession);

  let sfxOn = sessionStorage.getItem(KEY_SFX);
  sfxOn = (sfxOn === null) ? "1" : sfxOn;

  let musicOn = sessionStorage.getItem(KEY_MUSIC);
  musicOn = (musicOn === null) ? "1" : musicOn;

  function refreshAudioButtons() {
    btnSfx.textContent = (sfxOn === "1") ? "🔊" : "🔇";
    btnMusic.textContent = (musicOn === "1") ? "🎵" : "🚫🎵";
  }
  refreshAudioButtons();

  // =========================
  // AUDIO
  // =========================
  const audio = {
    ctx: null,
    ready: false,
    sfxGain: null,
    musicEl: null,

    unlock() {
      if (this.ready) return;
      const A = window.AudioContext || window.webkitAudioContext;
      this.ctx = new A();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.ctx.destination);
      this.ready = true;

      this.musicEl = new Audio("./roket_kribo_bgm.wav");
      this.musicEl.loop = true;
      this.musicEl.volume = 0.30;
    },

    beep(freq, dur, type = "sine", vol = 0.14) {
      if (!this.ready || sfxOn !== "1") return;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.sfxGain);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    },

    tick() { this.beep(740, 0.05, "square", 0.06); },
    swoop() { this.beep(520, 0.08, "triangle", 0.10); },
    bling() {
      this.beep(880, 0.06, "sine", 0.10);
      setTimeout(() => this.beep(1320, 0.08, "sine", 0.10), 40);
    },
    slow() { this.beep(330, 0.12, "sine", 0.09); },
    boom() {
      if (!this.ready || sfxOn !== "1") return;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(220, t0);
      o.frequency.exponentialRampToValueAtTime(60, t0 + 0.18);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t0); o.stop(t0 + 0.25);
    },

    musicStart() {
      if (!this.ready || !this.musicEl) return;
      if (musicOn !== "1") return;
      this.musicEl.play().catch(() => {});
    },

    musicStop() {
      if (!this.ready || !this.musicEl) return;
      this.musicEl.pause();
    }
  };

  btnSfx.addEventListener("click", () => {
    audio.unlock();
    sfxOn = (sfxOn === "1") ? "0" : "1";
    sessionStorage.setItem(KEY_SFX, sfxOn);
    refreshAudioButtons();
    audio.tick();
  });

  btnMusic.addEventListener("click", () => {
    audio.unlock();
    musicOn = (musicOn === "1") ? "0" : "1";
    sessionStorage.setItem(KEY_MUSIC, musicOn);
    refreshAudioButtons();
    if (musicOn === "1") audio.musicStart();
    else audio.musicStop();
    audio.tick();
  });

  // =========================
  // Nickname helpers
  // =========================
  function sanitizeNick(raw) {
    let v = (raw || "").trim();
    v = v.replace(/[^A-Za-z0-9]/g, "");
    v = v.slice(0, 10);
    if (!v) v = "player" + String(Math.floor(1000 + Math.random() * 9000));
    return v;
  }
  function validateNick(raw) {
    const nick = sanitizeNick(raw);
    return { ok: NICK_RE.test(nick), nick };
  }
  inputNick.addEventListener("input", () => {
    const fixed = sanitizeNick(inputNick.value);
    if (fixed !== inputNick.value) inputNick.value = fixed;
    nickHint.textContent = "";
  });

  // =========================
  // Leaderboard placeholder
  // =========================
  function renderTop5(items) {
    lbList.innerHTML = "";
    if (!items || items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "belum ada skor";
      lbList.appendChild(li);
      return;
    }
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = `${it.nickname} — ${it.score}`;
      lbList.appendChild(li);
    }
  }
  function lbRefresh() {
    if (!LEADERBOARD_URL) {
      lbNote.textContent = "leaderboard belum dihubungkan (nanti pakai Google Sheet gratis)";
      renderTop5([]);
      return;
    }
    lbNote.textContent = "leaderboard aktif (nanti kita sambungkan)";
  }
  lbRefresh();

  // =========================
  // GAME STATE
  // =========================
  let state = "menu";
  let nickname = "player0000";

  let y = 0, vy = 0;
  let score = 0, combo = 0;

  let pipes = [];
  let lastPipeAt = 0;

  let star = null;
  let starPending = false;

  let slowUntil = 0;
  let shake = 0;
  let flash = 0;

  let particles = [];

  let lastCenter = null;
  let doubleCooldown = 0;

  const bgStars = Array.from({ length: 110 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 0.6 + Math.random() * 1.6,
    a: 0.25 + Math.random() * 0.55,
    sp: 8 + Math.random() * 22
  }));

  let earthPhase = 0;

  function setState(next) {
    state = next;
    menu.classList.toggle("show", state === "menu");
    go.classList.toggle("show", state === "gameover");
  }

  function resetGame() {
    const H = window.innerHeight;
    y = H * 0.45;
    vy = 0;
    score = 0;
    combo = 0;
    pipes = [];
    lastPipeAt = 0;
    star = null;
    starPending = false;
    slowUntil = 0;
    shake = 0;
    flash = 0;
    particles = [];
    lastCenter = null;
    doubleCooldown = 0;

    elScore.textContent = "0";
    elCombo.textContent = "0";
    clock.classList.remove("active");
    clockFill.style.transform = "translateY(100%)";
  }

  function setBestSessionIfNeeded() {
    if (score > bestSession) {
      bestSession = score;
      sessionStorage.setItem(KEY_BEST, String(bestSession));
      elBestSession.textContent = String(bestSession);
    }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function currentSpeed() {
    return BASE_SPEED + score * SPEED_PER_SCORE;
  }

  function currentGap() {
    const g = GAP_BASE - score * 0.38;
    return Math.max(GAP_MIN, g);
  }

  // =========================
  // INPUT (flap)
  // =========================
  function flap() {
    if (state !== "playing") return;
    audio.unlock();
    const now = performance.now();
    const inSlow = now < slowUntil;
    vy = inSlow ? (FLAP_V * 0.88) : FLAP_V;
    audio.swoop();
  }
  canvas.addEventListener("pointerdown", () => flap());
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); flap(); }
  });

  // =========================
  // Buttons
  // =========================
  btnHow.addEventListener("click", () => {
    audio.unlock();
    howBox.classList.toggle("show");
    audio.tick();
  });

  btnStart.addEventListener("click", () => {
    audio.unlock();
    const v = validateNick(inputNick.value);
    nickname = v.nick;
    nickHint.textContent = v.ok ? "" : "nickname diperbaiki otomatis (huruf/angka max 10)";
    resetGame();
    setState("playing");
    if (musicOn === "1") audio.musicStart();
    audio.tick();
  });

  btnRetry.addEventListener("click", () => {
    audio.unlock();
    resetGame();
    setState("playing");
    if (musicOn === "1") audio.musicStart();
    audio.tick();
  });

  btnBack.addEventListener("click", () => {
    audio.unlock();
    setState("menu");
    lbRefresh();
    audio.tick();
  });

  // =========================
  // COLLISION
  // =========================
  function rocketRect() {
    const x = window.innerWidth * 0.22;
    return { x, y: y - ROCKET_H / 2, w: ROCKET_W, h: ROCKET_H };
  }
  function hitRect(a, b) {
    return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
  }

  // =========================
  // SPAWN PIPE (single / double gap)
  // =========================
  function spawnPipe(nowMs) {
    const W = window.innerWidth;
    const H = window.innerHeight;

    const gap = currentGap();
    const margin = 110;

    // random base center
    const randCenter = margin + Math.random() * (H - margin * 2);

    // smooth random so it moves up/down naturally (random but fair)
    let center;
    if (lastCenter == null) center = randCenter;
    else {
      center = lastCenter + (randCenter - lastCenter) * CENTER_SMOOTH;
      center += (Math.random() * 2 - 1) * CENTER_JITTER;
      if (Math.random() < CENTER_SPIKE_CHANCE) {
        center += (Math.random() < 0.5 ? -1 : 1) * CENTER_SPIKE;
      }
      center = clamp(center, margin, H - margin);
    }

    // decide double gap (not too early + cooldown)
    let isDouble = false;
    if (score >= 6 && doubleCooldown <= 0 && Math.random() < DOUBLE_GAP_CHANCE) {
      isDouble = true;
      doubleCooldown = DOUBLE_GAP_COOLDOWN;
    } else {
      doubleCooldown = Math.max(0, doubleCooldown - 1);
    }

    const p = {
      x: W + 80,
      w: PIPE_W,
      passed: false,
      solids: [], // meteor blocks to draw + collide
      gaps: [],   // list of gaps {top,bottom,center}
      isDouble
    };

    if (!isDouble) {
      // single gap
      const top = Math.max(40, center - gap / 2);
      const bottomY = center + gap / 2;
      const bottomH = Math.max(40, H - bottomY);

      p.solids.push({ y: 0, h: top });
      p.solids.push({ y: bottomY, h: bottomH });
      p.gaps.push({ top: top, bottom: bottomY, center });

      lastCenter = center;
    } else {
      // two gaps -> three meteor solids
      const safeEdge = gap / 2 + 40;
      const c1 = clamp(center, margin + safeEdge, H - margin - safeEdge);

      const sep = gap + (DOUBLE_GAP_SEP_EXTRA_MIN + Math.random() * (DOUBLE_GAP_SEP_EXTRA_MAX - DOUBLE_GAP_SEP_EXTRA_MIN));
      let sign = (Math.random() < 0.5) ? -1 : 1;
      let c2 = c1 + sign * sep;

      if (c2 < margin + safeEdge || c2 > H - margin - safeEdge) {
        sign *= -1;
        c2 = c1 + sign * sep;
      }
      c2 = clamp(c2, margin + safeEdge, H - margin - safeEdge);

      const topCenter = Math.min(c1, c2);
      const bottomCenter = Math.max(c1, c2);

      const gap1Top = Math.max(40, topCenter - gap / 2);
      const gap1Bottom = topCenter + gap / 2;

      const gap2Top = Math.max(gap1Bottom + 55, bottomCenter - gap / 2); // ensure middle meteor has thickness
      const gap2Bottom = bottomCenter + gap / 2;

      // solids: top, middle, bottom
      p.solids.push({ y: 0, h: gap1Top });

      const midY = gap1Bottom;
      const midH = Math.max(50, gap2Top - gap1Bottom);
      p.solids.push({ y: midY, h: midH });

      const botY = gap2Bottom;
      const botH = Math.max(40, H - botY);
      p.solids.push({ y: botY, h: botH });

      p.gaps.push({ top: gap1Top, bottom: gap1Bottom, center: topCenter });
      p.gaps.push({ top: gap2Top, bottom: gap2Bottom, center: bottomCenter });

      // for next smoothing, use average (keeps motion interesting)
      lastCenter = (topCenter + bottomCenter) / 2;
    }

    // star spawn (choose one available gap)
    if (starPending) {
      const gPick = p.gaps[Math.floor(Math.random() * p.gaps.length)];
      const yStar = clamp(
        gPick.center + (Math.random() * 2 - 1) * (Math.min(70, gap * 0.20)),
        gPick.top + 22,
        gPick.bottom - 22
      );
      star = { x: p.x + p.w * 0.55, y: yStar, r: 14, alive: true };
      starPending = false;
    }

    pipes.push(p);
    lastPipeAt = nowMs;
  }

  // =========================
  // CRASH
  // =========================
  function crash() {
    combo = 0;
    elCombo.textContent = "0";

    audio.boom();
    shake = 14;
    flash = 1;

    const r = rocketRect();
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;

    particles = [];
    for (let i = 0; i < 26; i++) {
      particles.push({
        x: cx, y: cy,
        vx: (Math.random() * 2 - 1) * 420,
        vy: (Math.random() * 2 - 1) * 420,
        r: 3 + Math.random() * 5,
        life: 700 + Math.random() * 500,
        t: 0
      });
    }

    setBestSessionIfNeeded();
    finalScore.textContent = String(score);
    finalBest.textContent = String(bestSession);

    setState("gameover");
  }

  // =========================
  // DRAW HELPERS
  // =========================
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

  function drawStarfield(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    for (const s of bgStars) {
      s.x -= s.sp * dt;
      if (s.x < -10) { s.x = W + 10; s.y = Math.random() * H; }
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEarth(dt) {
    earthPhase += dt * 0.25;
    const W = window.innerWidth, H = window.innerHeight;
    const R = Math.min(W, H) * 0.36;
    const cx = W * 0.86 - Math.sin(earthPhase) * 10;
    const cy = H * 0.82 + Math.cos(earthPhase * 0.8) * 6;

    const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.15, cx, cy, R);
    g.addColorStop(0, "rgba(120,180,255,0.95)");
    g.addColorStop(0.55, "rgba(50,110,220,0.85)");
    g.addColorStop(1, "rgba(12,40,90,0.75)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(80,220,140,0.75)";
    blob(cx - R * 0.2, cy - R * 0.05, R * 0.36, R * 0.18);
    blob(cx + R * 0.12, cy + R * 0.10, R * 0.28, R * 0.14);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "white";
    blob(cx - R * 0.05 + Math.sin(earthPhase) * 10, cy - R * 0.18, R * 0.50, R * 0.10);
    blob(cx + R * 0.08 + Math.cos(earthPhase) * 8, cy + R * 0.02, R * 0.38, R * 0.09);

    ctx.restore();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(140,200,255,0.45)";
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    function blob(x, y, rx, ry) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function hash01(n) {
    const x = Math.sin(n) * 10000;
    return x - Math.floor(x);
  }

  function drawMeteorRect(x, y, w, h) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, "rgba(120,86,55,0.95)");
    grad.addColorStop(1, "rgba(60,40,25,0.95)");
    ctx.fillStyle = grad;
    roundRect(x, y, w, h, 18);
    ctx.fill();

    ctx.globalAlpha = 0.33;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    const seed = Math.floor(x * 7 + y * 13 + w * 3 + h * 5);
    for (let i = 0; i < 9; i++) {
      const px = x + 14 + hash01(seed + i * 11) * (w - 28);
      const py = y + 14 + hash01(seed + i * 17) * (h - 28);
      const pr = 2 + hash01(seed + i * 19) * 4;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    roundRect(x + 2, y + 2, w - 4, h - 4, 16);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawStar(x, y, r, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 0.004) * 0.2);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "rgba(255,235,120,0.95)";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10;
      const rr = (i % 2 === 0) ? r : r * 0.45;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawRocketCute(x, y0, t, thrust) {
    ctx.save();
    ctx.translate(x, y0);
    const wob = Math.sin(t * 0.01) * 0.05;
    ctx.rotate(wob);

    const w = ROCKET_W, h = ROCKET_H;

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.58, w * 0.35, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const bodyGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    bodyGrad.addColorStop(0, "rgba(255,120,160,0.95)");
    bodyGrad.addColorStop(1, "rgba(255,70,120,0.95)");
    ctx.fillStyle = bodyGrad;
    roundRect(-w / 2, -h / 2, w, h, 18);
    ctx.fill();

    ctx.fillStyle = "rgba(255,225,235,0.95)";
    ctx.beginPath();
    ctx.moveTo(w / 2, -h * 0.12);
    ctx.quadraticCurveTo(w / 2 + 14, 0, w / 2, h * 0.12);
    ctx.quadraticCurveTo(w / 2 - 6, 0, w / 2, -h * 0.12);
    ctx.fill();

    ctx.fillStyle = "rgba(170,230,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(-w * 0.10, 0, w * 0.16, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.ellipse(-w * 0.14, -h * 0.06, w * 0.06, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,90,140,0.95)";
    tri(-w * 0.22, h * 0.18, -w * 0.44, h * 0.38, -w * 0.10, h * 0.36);
    tri(-w * 0.22, -h * 0.18, -w * 0.44, -h * 0.38, -w * 0.10, -h * 0.36);

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "white";
    roundRect(-w * 0.15, -h * 0.50, w * 0.08, h, 12);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (thrust) {
      const flick = 0.85 + Math.random() * 0.25;
      ctx.save();
      ctx.translate(-w / 2 - 10, 0);
      ctx.scale(1, flick);
      ctx.globalAlpha = 0.95;
      const flameGrad = ctx.createLinearGradient(-18, 0, 10, 0);
      flameGrad.addColorStop(0, "rgba(255,240,120,0.95)");
      flameGrad.addColorStop(1, "rgba(255,120,60,0.95)");
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-20, -10, -28, 0);
      ctx.quadraticCurveTo(-20, 10, 0, 0);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 2;
    roundRect(-w / 2, -h / 2, w, h, 18);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();

    function tri(x1, y1, x2, y2, x3, y3) {
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
      ctx.closePath(); ctx.fill();
    }
  }

  // =========================
  // LOOP
  // =========================
  let last = performance.now();

  function update(now) {
    const dtRaw = Math.min(0.033, (now - last) / 1000);
    last = now;

    const inSlow = now < slowUntil;
    const timeScale = inSlow ? SLOWMO_SCALE : 1;
    const dt = dtRaw * timeScale;

    if (inSlow) {
      clock.classList.add("active");
      const remain = slowUntil - now;
      const p = clamp(remain / SLOWMO_MS, 0, 1);
      clockFill.style.transform = `translateY(${(1 - p) * 100}%)`;
    } else {
      clock.classList.remove("active");
      clockFill.style.transform = "translateY(100%)";
    }

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);
      shake = Math.max(0, shake - 40 * dtRaw);
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    drawStarfield(dt);
    drawEarth(dt);

    if (state === "playing") {
      vy += GRAVITY * dt;
      y += vy * dt;

      const H = window.innerHeight;
      const r = rocketRect();

      if (r.y < -50 || r.y + r.h > H + 50) crash();

      if (pipes.length === 0 || (now - lastPipeAt) > PIPE_INTERVAL) spawnPipe(now);

      const sp = currentSpeed();
      for (const p of pipes) p.x -= sp * dt;
      pipes = pipes.filter(p => p.x + p.w > -160);

      if (star && star.alive) {
        star.x -= sp * dt;
        if (star.x < -80) star.alive = false;
      }

      // collision + scoring
      const hit = { x: r.x + 8, y: r.y + 6, w: r.w - 16, h: r.h - 12 };

      for (const p of pipes) {
        // collide with all solids (works for single or double gap)
        for (const s of p.solids) {
          const rect = { x: p.x, y: s.y, w: p.w, h: s.h };
          if (hitRect(hit, rect)) { crash(); break; }
        }
        if (state !== "playing") break;

        // passed
        if (!p.passed && p.x + p.w < r.x) {
          p.passed = true;

          score += 1;
          combo += 1;

          elScore.textContent = String(score);
          elCombo.textContent = String(combo);

          audio.tick();

          if (combo % 10 === 0) starPending = true;

          if (score > bestSession) {
            bestSession = score;
            sessionStorage.setItem(KEY_BEST, String(bestSession));
            elBestSession.textContent = String(bestSession);
          }
        }
      }

      // star pickup
      if (star && star.alive) {
        const dx = (r.x + r.w / 2) - star.x;
        const dy = (r.y + r.h / 2) - star.y;
        if ((dx * dx + dy * dy) < (star.r + 16) * (star.r + 16)) {
          star.alive = false;
          slowUntil = now + SLOWMO_MS;
          audio.bling(); audio.slow();
        }
      }

      // draw meteors
      for (const p of pipes) {
        for (const s of p.solids) {
          drawMeteorRect(p.x, s.y, p.w, s.h);
        }
      }

      // draw star
      if (star && star.alive) drawStar(star.x, star.y, star.r, now);

      // draw rocket
      const rx = window.innerWidth * 0.22;
      drawRocketCute(rx, y, now, vy < -55);
    } else {
      const rx = window.innerWidth * 0.22;
      y = window.innerHeight * 0.5 + Math.sin(now * 0.003) * 12;
      drawRocketCute(rx, y, now, false);
    }

    // particles (explosion)
    if (particles.length) {
      const alive = [];
      for (const prt of particles) {
        prt.t += dtRaw * 1000;
        const lifeP = clamp(1 - prt.t / prt.life, 0, 1);
        prt.x += prt.vx * dtRaw;
        prt.y += prt.vy * dtRaw;
        prt.vx *= 0.98;
        prt.vy *= 0.98;

        ctx.globalAlpha = 0.9 * lifeP;
        ctx.fillStyle = (Math.random() < 0.5) ? "rgba(255,235,120,1)" : "rgba(255,120,160,1)";
        ctx.beginPath();
        ctx.arc(prt.x, prt.y, prt.r * (0.6 + lifeP), 0, Math.PI * 2);
        ctx.fill();

        if (prt.t < prt.life) alive.push(prt);
      }
      ctx.globalAlpha = 1;
      particles = alive;
    }

    // flash
    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.25, flash * 0.25);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalAlpha = 1;
      flash = Math.max(0, flash - 2.6 * dtRaw);
    }

    ctx.restore();
    requestAnimationFrame(update);
  }

  // =========================
  // INIT
  // =========================
  setState("menu");
  resetGame();
  requestAnimationFrame(update);
})();
