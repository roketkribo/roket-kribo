/* ==========================================================
   ROKET KRIBO - GAME ENGINE
   Fitur:
   - Control roket
   - Meteor random + gap random
   - Kadang 2 lubang
   - Bintang reward
   - Slow motion
   - Efek suara
   - Global leaderboard (Google Sheet)
   ========================================================== */

const LEADERBOARD_URL = "https://script.google.com/macros/s/AKfycbxW9xlYm6Ravhkyz3z1BJB2gryKxFMMmgo96uBDRKTP-d4a-aMv3szcCdTqY2L-xwqy/exec";

// -------------------------------
// GAME CONFIG
// -------------------------------
const GRAVITY = 0.35;
const FLAP = -6.2;

const METEOR_SPEED = 3.2;
const GAP_BASE = 185;      // base gap
const GAP_MIN = 140;       // min gap
const DOUBLE_GAP_CHANCE = 0.18;  // 18% chance ada 2 lubang

const METEOR_DISTANCE = 260; // jarak tiap meteor
const STAR_CHANCE = 0.12;    // peluang muncul bintang
const SLOW_DURATION = 3000;  // 3 detik slow-mo

let canvas, ctx;

// -------------------------------
// GAME STATE
// -------------------------------
let rocket = { x: 100, y: 200, w: 45, h: 45, vy: 0 };
let meteors = [];
let stars = [];
let score = 0;
let bestLocal = 0;
let slowMode = false;
let slowTimer = 0;
let gameStarted = false;
let gameOver = false;
let nickname = "";

// -------------------------------
// AUDIO
// -------------------------------
const audio = {
    flap: new Audio("sfx/flap.wav"),
    crash: new Audio("sfx/explode.wav"),
    star: new Audio("sfx/star.wav"),
    slow: new Audio("sfx/slow.wav"),
    bgm: new Audio("roket_kribo_bgm.wav"),

    init() {
        this.bgm.loop = true;
        this.bgm.volume = 0.4;
    },

    playFlap() { this.flap.currentTime = 0; this.flap.play(); },
    playCrash() { this.crash.currentTime = 0; this.crash.play(); },
    playStar() { this.star.currentTime = 0; this.star.play(); },
    playSlow() { this.slow.currentTime = 0; this.slow.play(); },

    startMusic() {
        this.bgm.play().catch(()=>{});
    },
    stopMusic() {
        this.bgm.pause();
        this.bgm.currentTime = 0;
    }
};

// -------------------------------
// UTIL RANDOM
// -------------------------------
function rand(a,b){ return Math.random()*(b-a)+a; }

// -------------------------------
// START GAME
// -------------------------------
function startGame() {
    rocket.y = 200;
    rocket.vy = 0;

    score = 0;
    gameStarted = true;
    gameOver = false;

    meteors = [];
    stars = [];

    audio.startMusic();
}

// -------------------------------
// GAME LOOP
// -------------------------------
function loop() {
    if (!gameStarted) return requestAnimationFrame(loop);

    ctx.clearRect(0,0,canvas.width,canvas.height);

    // gravity
    rocket.vy += GRAVITY;
    rocket.y += rocket.vy;

    // draw rocket
    drawRocket();

    // spawn meteor
    if (meteors.length === 0 || meteors[meteors.length-1].x < canvas.width - METEOR_DISTANCE) {
        spawnMeteor();
    }

    // update meteors
    meteors.forEach(m => m.x -= slowMode ? METEOR_SPEED * 0.5 : METEOR_SPEED);

    // draw meteors
    meteors.forEach(m => drawMeteor(m));

    // collision meteor
    meteors.forEach(m => {
        if (rocket.x + rocket.w > m.x && rocket.x < m.x + 80) {

            let hitTop = rocket.y < m.topGap;
            let hitBottom = rocket.y + rocket.h > m.bottomGap;

            if (hitTop || hitBottom) {
                endGame();
            }
        }
    });

    // spawn star
    if (Math.random() < STAR_CHANCE / 200) spawnStar();

    // update stars
    stars.forEach(s => s.x -= slowMode ? METEOR_SPEED*0.5 : METEOR_SPEED);

    // draw stars
    stars.forEach(s => drawStar(s));

    // collect star
    stars.forEach((s,i)=>{
        if (collision(rocket,s)) {
            stars.splice(i,1);
            activateSlow();
        }
    });

    // remove off-screen
    meteors = meteors.filter(m => m.x > -100);
    stars = stars.filter(s => s.x > -50);

    // score setiap lewati meteor
    meteors.forEach(m => {
        if (!m.passed && rocket.x > m.x + 80) {
            score++;
            m.passed = true;
        }
    });

    drawHUD();

    requestAnimationFrame(loop);
}

// -------------------------------
// DRAW
// -------------------------------
function drawRocket() {
    ctx.fillStyle = "#ffdd33";
    ctx.fillRect(rocket.x, rocket.y, rocket.w, rocket.h);
}

function drawMeteor(m) {
    ctx.fillStyle = "#9c6430";
    ctx.fillRect(m.x, 0, 80, m.topGap - 80);
    ctx.fillRect(m.x, m.bottomGap, 80, canvas.height - m.bottomGap);
}

function drawStar(s) {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 12, 0, Math.PI*2);
    ctx.fill();
}

function drawHUD() {
    ctx.fillStyle = "#fff";
    ctx.font = "24px Arial";
    ctx.fillText("Score: " + score, 20, 40);
}

// -------------------------------
// SPAWN METEOR
// -------------------------------
function spawnMeteor() {
    let gap = rand(GAP_MIN, GAP_BASE);
    let pos = rand(100, canvas.height-200);

    let doubleGap = Math.random() < DOUBLE_GAP_CHANCE;

    if (!doubleGap) {
        meteors.push({
            x: canvas.width,
            topGap: pos - gap/2,
            bottomGap: pos + gap/2,
            passed: false
        });
    } else {
        let gap2 = rand(GAP_MIN, GAP_BASE);
        meteors.push({
            x: canvas.width,
            topGap: pos - gap/2,
            bottomGap: pos + gap/2,
            passed: false
        });
        meteors.push({
            x: canvas.width + 60,
            topGap: pos + 100,
            bottomGap: pos + 100 + gap2,
            passed: false
        });
    }
}

// -------------------------------
// SPAWN STAR
// -------------------------------
function spawnStar() {
    stars.push({
        x: canvas.width,
        y: rand(80, canvas.height-80),
        w: 24,
        h: 24
    });
}

// -------------------------------
// SLOW-MOTION
// -------------------------------
function activateSlow() {
    slowMode = true;
    slowTimer = Date.now() + SLOW_DURATION;
    audio.playSlow();

    setTimeout(()=>{
        slowMode = false;
    }, SLOW_DURATION);
}

// -------------------------------
// COLLISION
// -------------------------------
function collision(a,b){
    return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    );
}

// -------------------------------
// END GAME
// -------------------------------
function endGame() {
    gameOver = true;
    audio.playCrash();
    audio.stopMusic();

    setTimeout(()=>askNickname(), 300);
}

// -------------------------------
// NICKNAME & SEND SCORE
// -------------------------------
function askNickname() {
    nickname = prompt("Masukkan nickname (max 10 huruf/angka):");

    if (!nickname) return;

    nickname = nickname.replace(/[^A-Za-z0-9]/g,"").slice(0,10);

    sendScore(nickname, score);
}

function sendScore(nick, sc) {
    fetch(LEADERBOARD_URL, {
        method:"POST",
        body: JSON.stringify({ nickname:nick, score:sc }),
        headers:{ "Content-Type":"text/plain" }
    });
}

// -------------------------------
// LOAD TOP 5 LEADERBOARD
// -------------------------------
async function loadLeaderboard() {
    let res = await fetch(LEADERBOARD_URL);
    let json = await res.json();

    let el = document.getElementById("leader");
    el.innerHTML = "";

    json.top.forEach((r,i)=>{
        let row = document.createElement("div");
        row.textContent = `${i+1}. ${r.nickname} — ${r.score}`;
        el.appendChild(row);
    });
}

// -------------------------------
// INIT
// -------------------------------
window.onload = ()=>{
    canvas = document.getElementById("game");
    ctx = canvas.getContext("2d");

    audio.init();
    loadLeaderboard();

    document.addEventListener("keydown", e=>{
        if (e.code==="Space") {
            if (!gameStarted) {
                startGame();
            }
            rocket.vy = FLAP;
            audio.playFlap();
        }
    });

    canvas.addEventListener("mousedown", ()=>{
        if (!gameStarted) {
            startGame();
        }
        rocket.vy = FLAP;
        audio.playFlap();
    });

    loop();
};
