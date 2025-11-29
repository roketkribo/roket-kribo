// ROKET KRIBO – versi canvas + leaderboard + mobile friendly
(() => {
  // =========================
  // CONFIG
  // =========================
  const LEADERBOARD_URL =
    "https://script.google.com/macros/s/AKfycbx8vQnvrzA1YQVd04SMR0_rnT3obkqtwRH0qpX1A9H1r-OKyQf5cEv8ehgsQbI0/exec";

  const GRAVITY = 1900;         // gravitasi px/s^2
  const FLAP_V = -600;          // loncatan roket
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
  const menuEl = document.querySelector(".menu");

  if (!canvas || !ctx || !nickInput || !startBtn || !leaderBox || !menuEl) {
    alert("Elemen HTML belum lengkap (menu, nickname, leaderboard, canvas).");
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
  // AUDIO SEDERHANA (beep)
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
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Response bukan JSON:", text);
        throw e;
      }
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
      console.error("fetchLeaderboard error", e);
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

    // planet
    const R = Math.min(viewW, viewH) * 0.35;
    const cx = viewW * 0.86;
    const cy = viewH * 0.82;
    const g2 = ctx.createRadialGradient(
      cx - R * 0.2,
      cy - R * 0.25,
      R * 0.1,
      cx,
      cy,
      R
    );
    g2.addColorStop(0, "rgba(96,165,250,0.95)");
    g2.addColorStop(0.5, "rgba(37,99,235,0.9)");
    g2.addColorStop(1, "rgba(15,23,42,0.9)");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = g2;
    ctx.fill();

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

    ctx.fillStyle = "#7c4a23";
    roundRect(x, 0, w, pipe.topH, 16);
    ctx.fill();

    roundRect(x, pipe.bottomY, w, pipe.bottomH, 16);
    ctx.fill();

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
      const r = i % 2 === 0 ? s.r : s.r * 0.45;
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
      ctx.save();
      ctx.translate(-w / 2 - 10, 0);
      ctx.scale(1, 0.8 + Math.random() * 0.4);
      const g = ctx.createLinearGradient(-26, 0, 4, 0);
      g.addColorStop(0, "#facc15");
      g.addColorStop(1, "#ef4444");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-24, -10, -30, 0);
      ctx.quadraticCurveTo(-24, 10, 0, 0);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // =========================
  // INPUT
  // =========================
  function startIfReady() {
    const nick = sanitizeNick(nickInput.value);
    if (!nick) {
      alert("Isi nickname dulu (huruf/angka, max 10).");
      return false;
    }
    nickname = nick;
    return true;
  }

  function flap() {
    if (!startIfReady()) return;
    audio.unlock();

    if (gameState === "idle" || gameState === "dead") {
      resetGame();
      gameState = "playing";
      if (menuEl) menuEl.classList.add("playing"); // sembunyikan menu
    }

    if (gameState === "playing") {
      rocketVY = FLAP_V;
      audio.flap();
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    flap();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      flap();
    }
  });

  startBtn.addEventListener("click", () => {
    flap();
  });

  // =========================
  // GAME LOOP
  // =========================
  let lastTime = performance.now();

  function loop(now) {
    const dtRaw = Math.min(0.03, (now - lastTime) / 1000);
    lastTime = now;

    const inSlow = now < slowUntil;
    const dt = dtRaw * (inSlow ? SLOWMO_SCALE : 1);

    ctx.save();
    if (shake > 0) {
      ctx.translate(
        (Math.random() * 2 - 1) * shake,
        (Math.random() * 2 - 1) * shake
      );
      shake = Math.max(0, shake - 60 * dtRaw);
    }

    drawBackground(dt);

    if (gameState === "idle") {
      const x = viewW * 0.22;
      const y = viewH * 0.5 + Math.sin(now * 0.004) * 10;
      drawRocketCute(x, y, now, false);
    } else {
      rocketVY += GRAVITY * dt;
      rocketY += rocketVY * dt;

      const speed = pipeSpeed();
      const pxSpeed = speed * dt;

      if (pipes.length === 0 || now - lastPipeAt > PIPE_INTERVAL) {
        spawnPipe(now);
      }

      for (const p of pipes) {
        p.x -= pxSpeed;
      }
      pipes = pipes.filter((p) => p.x + p.w > -120);

      if (star && star.alive) {
        star.x -= pxSpeed;
        if (star.x < -50) star.alive = false;
      }

      const r = rocketRect();
      const hitBox = {
        x: r.x + 6,
        y: r.y + 4,
        w: r.w - 12,
        h: r.h - 8
      };

      for (const p of pipes) {
        const topRect = { x: p.x, y: 0, w: p.w, h: p.topH };
        const botRect = {
          x: p.x,
          y: p.bottomY,
          w: p.w,
          h: p.bottomH
        };

        if (hitRect(hitBox, topRect) || hitRect(hitBox, botRect)) {
          gameOver();
          break;
        }

        if (!p.passed && p.x + p.w < r.x) {
          p.passed = true;
          score += 1;
          combo += 1;
          audio.score();

          if (score > bestLocal) {
            bestLocal = score;
            localStorage.setItem("rk_best", String(bestLocal));
          }

          if (combo > 0 && combo % 10 === 0) {
            starPending = true;
          }
        }
      }

      if (star && star.alive) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const dx = cx - star.x;
        const dy = cy - star.y;
        if (dx * dx + dy * dy < (star.r + 16) * (star.r + 16)) {
          star.alive = false;
          slowUntil = now + SLOWMO_MS;
          audio.star();
          audio.slow();
        }
      }

      if (rocketY < -60 || rocketY > viewH + 60) {
        gameOver();
      }

      for (const p of pipes) {
        drawMeteor(p);
      }

      if (star && star.alive) {
        drawStarObj(star, now);
      }

      const rx = viewW * 0.22;
      drawRocketCute(rx, rocketY, now, rocketVY < -40);
    }

    // HUD hanya saat main / habis tabrakan
    if (gameState !== "idle") {
      ctx.fillStyle = "rgba(15,23,42,0.7)";
      ctx.fillRect(10, 10, 150, 64);
      ctx.fillStyle = "white";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("score", 18, 28);
      ctx.fillText("best", 18, 50);
      ctx.font = "18px system-ui, sans-serif";
      ctx.fillStyle = "#facc15";
      ctx.fillText(String(score), 70, 28);
      ctx.fillStyle = "#93c5fd";
      ctx.fillText(String(bestLocal), 70, 50);
    }

    if (gameState === "idle") {
      ctx.fillStyle = "rgba(15,23,42,0.75)";
      ctx.fillRect(viewW / 2 - 110, viewH * 0.62 - 30, 220, 60);
      ctx.fillStyle = "white";
      ctx.font = "16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "isi nickname lalu tap untuk start",
        viewW / 2,
        viewH * 0.62
      );
      ctx.textAlign = "start";
    }

    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.3, flash);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalAlpha = 1;
      flash = Math.max(0, flash - 2.5 * dtRaw);
    }

    ctx.restore();
    requestAnimationFrame(loop);
  }

  function gameOver() {
    if (gameState !== "playing") return;
    gameState = "dead";
    audio.boom();
    shake = 16;
    flash = 1;

    if (nickname) {
      submitScore(nickname, score);
    }

    setTimeout(() => {
      if (menuEl) menuEl.classList.remove("playing"); // munculkan menu lagi
    }, 600);
  }

  resetGame();
  requestAnimationFrame(loop);
})();


