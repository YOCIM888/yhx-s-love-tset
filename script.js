/* ==========================================================
   致近萧靳 · 表白页交互
   ========================================================== */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

/* ================= SHA-256（哈希校验，不存明文） ================= */
const PASSWORD_HASH = '6a42340b8ddffe4115d63076108b67ec0e737abc5375577d2d09bd6571a42a11';

async function sha256(text) {
  // 优先使用浏览器原生 Web Crypto（file:// 与 https 下均为安全上下文）
  if (window.crypto && crypto.subtle && window.isSecureContext) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { /* 落入下方纯 JS 实现 */ }
  }
  return sha256Sync(unescape(encodeURIComponent(text)));
}

/* 纯 JS SHA-256 兜底实现（素数表动态生成，逐次独立计算） */
function sha256Sync(ascii) {
  const maxWord = Math.pow(2, 32);
  const H0 = [], K = [];
  {
    const composite = {};
    let pc = 0;
    for (let cand = 2; pc < 64; cand++) {
      if (!composite[cand]) {
        for (let i = 0; i < 313; i += cand) composite[i] = cand;
        if (pc < 8) H0[pc] = (Math.pow(cand, 0.5) * maxWord) | 0;
        K[pc++] = (Math.pow(cand, 1 / 3) * maxWord) | 0;
      }
    }
  }

  const bitLen = ascii.length * 8;
  ascii += String.fromCharCode(0x80);
  while (ascii.length % 64 !== 56) ascii += String.fromCharCode(0);

  const words = [];
  for (let i = 0; i < ascii.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (ascii.charCodeAt(i) << ((3 - (i % 4)) * 8));
  }
  words[words.length] = Math.floor(bitLen / maxWord);
  words[words.length] = bitLen;

  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const hash = H0.slice();

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3);
      const s1 = rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0;
  }

  let out = '';
  for (let i = 0; i < 8; i++) {
    for (let jn = 3; jn >= 0; jn--) {
      const byte = (hash[i] >> (jn * 8)) & 255;
      out += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return out;
}

/* ================= 心形/星空粒子引擎 ================= */
const HEART_COLORS = ['#ff5e8a', '#ff8fb1', '#ff4d6d', '#b892ff', '#ffd76e', '#ff6fa5'];

function drawHeart(ctx, x, y, size, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot || 0);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.34);
  ctx.bezierCurveTo(-size * 0.62, -size * 0.16, -size * 0.38, -size * 0.6, 0, -size * 0.24);
  ctx.bezierCurveTo(size * 0.38, -size * 0.6, size * 0.62, -size * 0.16, 0, size * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

class FX {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = Object.assign({ stars: 60, hearts: 12, shooting: true, interactive: false, maxParts: 220 }, opts);
    this.parts = [];
    this.running = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.lastTrail = 0;
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
    if (this.o.interactive) this.bindPointer();
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = Math.max(1, r.width * this.dpr);
    this.c.height = Math.max(1, r.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.initAmbient();
  }

  initAmbient() {
    this.parts = this.parts.filter((p) => p.type !== 'star');
    for (let i = 0; i < this.o.stars; i++) {
      this.parts.push({
        type: 'star',
        x: rand(0, this.w), y: rand(0, this.h),
        r: rand(0.4, 1.7), phase: rand(0, Math.PI * 2),
        speed: rand(0.02, 0.06), tint: Math.random() < 0.25 ? '#ffb8cf' : '#ffffff',
      });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this._loop);
  }
  stop() { this.running = false; }

  spawnHeart(x, y, opt = {}) {
    this.parts.push({
      type: 'heart',
      x: x ?? rand(0, this.w), y: y ?? this.h + rand(10, 90),
      size: opt.size ?? rand(8, 22),
      vy: opt.vy ?? rand(0.35, 1.05),
      vx: opt.vx ?? 0,
      rot: rand(-0.4, 0.4), seed: rand(0, 100),
      color: opt.color ?? HEART_COLORS[(Math.random() * HEART_COLORS.length) | 0],
      alpha: opt.alpha ?? rand(0.45, 0.9),
      life: opt.life ?? null, t: 0,
    });
  }

  burst(x, y, n = 16) {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(1.4, 5.4);
      this.spawnHeart(x, y, {
        size: rand(6, 17), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.6,
        life: rand(55, 115), alpha: rand(0.7, 1),
      });
    }
  }

  heartRain(n = 60) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.spawnHeart(rand(0, this.w), -30, {
        size: rand(9, 20), vy: rand(1.6, 3.6),
        life: rand(160, 260), alpha: rand(0.6, 1),
      }), i * 28);
    }
  }

  spawnShooter() {
    this.parts.push({
      type: 'shooter',
      x: rand(this.w * 0.2, this.w), y: rand(0, this.h * 0.35),
      vx: rand(-7, -4.5), vy: rand(2.2, 3.6), life: rand(40, 70), t: 0,
    });
  }

  bindPointer() {
    window.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (now - this.lastTrail < 42) return;
      this.lastTrail = now;
      if (this.parts.length < this.o.maxParts) {
        this.spawnHeart(e.clientX + rand(-4, 4), e.clientY + rand(-4, 4), {
          size: rand(5, 11), vy: rand(-1.9, -0.8), vx: rand(-0.3, 0.3),
          life: rand(32, 60), alpha: rand(0.55, 0.95),
        });
      }
    });
    window.addEventListener('pointerdown', (e) => this.burst(e.clientX, e.clientY, 14));
  }

  _loop = () => {
    if (!this.running) return;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t++;

      if (p.type === 'star') {
        const tw = 0.5 + 0.5 * Math.sin(p.t * p.speed * 4 + p.phase);
        ctx.globalAlpha = 0.25 + 0.75 * tw;
        ctx.fillStyle = p.tint;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (p.type === 'heart') {
        if (p.life != null) {
          p.life--;
          if (p.life <= 0) { this.parts.splice(i, 1); continue; }
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.965; p.vy = p.vy * 0.965 - 0.015;
          p.rot += 0.01;
          ctx.globalAlpha = Math.min(1, p.life / 50) * p.alpha;
        } else {
          p.y -= p.vy;
          p.x += Math.sin(p.t * 0.018 + p.seed) * 0.55;
          p.rot = Math.sin(p.t * 0.014 + p.seed) * 0.35;
          if (p.y < -40) { this.parts.splice(i, 1); continue; }
          const fadeIn = Math.min(1, p.t / 55);
          const fadeOut = Math.min(1, p.y / (h * 0.22));
          ctx.globalAlpha = p.alpha * fadeIn * Math.max(0, fadeOut);
        }
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        drawHeart(ctx, p.x, p.y, p.size, p.rot);
        ctx.shadowBlur = 0;
        continue;
      }

      if (p.type === 'shooter') {
        p.life--;
        if (p.life <= 0) { this.parts.splice(i, 1); continue; }
        p.x += p.vx; p.y += p.vy;
        const grad = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 9, p.y - p.vy * 9);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = Math.min(1, p.life / 30);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 9, p.y - p.vy * 9);
        ctx.stroke();
        continue;
      }
    }

    // 补充环境粒子
    const ambientHearts = this.parts.filter((p) => p.type === 'heart' && p.life == null).length;
    if (this.o.hearts > 0 && ambientHearts < this.o.hearts && Math.random() < 0.12) this.spawnHeart();
    if (this.o.shooting && Math.random() < 0.0045) this.spawnShooter();

    ctx.globalAlpha = 1;
    requestAnimationFrame(this._loop);
  };
}

/* ================= 锁屏逻辑 ================= */
const lockScreen = $('#lock-screen');
const lockCard = $('#lock-card');
const pwdInput = $('#pwd');
const unlockBtn = $('#unlock-btn');
const lockError = $('#lock-error');
const inputWrap = $('#input-wrap');
const mainEl = $('#main');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const lockFX = new FX($('#lock-canvas'), {
  stars: reducedMotion ? 40 : 80,
  hearts: reducedMotion ? 0 : 12,
  shooting: !reducedMotion,
});
lockFX.start();

let failCount = 0;
let unlocking = false;

function showError(msg) {
  lockError.textContent = msg;
  lockError.classList.remove('pop');
  void lockError.offsetWidth;
  lockError.classList.add('pop');
  inputWrap.classList.add('error');
  lockCard.classList.remove('shake');
  void lockCard.offsetWidth;
  lockCard.classList.add('shake');
}

pwdInput.addEventListener('input', () => {
  inputWrap.classList.remove('error');
  lockError.textContent = '';
});

$('#toggle-pwd').addEventListener('click', () => {
  const show = pwdInput.type === 'password';
  pwdInput.type = show ? 'text' : 'password';
  $('#toggle-pwd').textContent = show ? '🙈' : '👁';
  pwdInput.focus();
});

pwdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
unlockBtn.addEventListener('click', tryUnlock);

async function tryUnlock() {
  if (unlocking) return;
  const val = pwdInput.value.trim();
  if (!val) { showError('先输入密码嘛～ 我等你'); return; }

  unlocking = true;
  unlockBtn.disabled = true;
  unlockBtn.textContent = '解锁中…';

  // 紧贴用户手势触发播放，避免浏览器自动播放策略拦截
  startBgm();

  await sleep(480); // 一点点悬念感

  const hash = await sha256(val);
  if (hash === PASSWORD_HASH) {
    unlock();
  } else {
    failCount++;
    bgm.pause();
    const hints = [
      '咦，不对哦～ 再想想',
      '还是不对耶，悄悄说：和她有关系',
      '最后一杯提示：名字拼音缩写 + 520',
    ];
    showError(hints[Math.min(failCount - 1, hints.length - 1)]);
    unlockBtn.disabled = false;
    unlockBtn.textContent = '开启心意';
    unlocking = false;
  }
}

function unlock() {
  const rect = lockCard.getBoundingClientRect();
  lockFX.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, 46);
  lockCard.classList.add('unlocked');
  lockScreen.classList.add('fade');
  lockFX.stop();
  setTimeout(() => {
    lockScreen.style.display = 'none';
    mainEl.hidden = false;
    requestAnimationFrame(() => {
      mainEl.classList.add('active');
      initMain();
    });
  }, 950);
}

/* ================= 主页面 ================= */
let mainFX = null;
let typewriterStarted = false;

const QUOTES = [
  '我没什么特别的，就是特别喜欢你。',
  '我的爱藏在风里，风吹过山川湖海，只为遇见你。',
  '老婆天下第一好！',
];

function initMain() {
  mainFX = new FX($('#fx-canvas'), {
    stars: reducedMotion ? 40 : 90,
    hearts: reducedMotion ? 0 : 14,
    shooting: !reducedMotion,
    interactive: !reducedMotion,
  });
  mainFX.start();

  // 进场动画
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('visible');
        io.unobserve(en.target);
      }
    }),
    { threshold: 0.15 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // 打字机
  if (!typewriterStarted) {
    typewriterStarted = true;
    setTimeout(typeTick, 900);
  }
}

function typeTick() {
  const el = $('#type-text');
  let qi = 0, ci = 0, deleting = false;
  (function tick() {
    const cur = QUOTES[qi];
    if (!deleting) {
      ci++;
      el.textContent = cur.slice(0, ci);
      if (ci >= cur.length) {
        deleting = true;
        setTimeout(tick, 2400);
        return;
      }
      setTimeout(tick, 90 + Math.random() * 70);
    } else {
      ci--;
      el.textContent = cur.slice(0, ci);
      if (ci <= 0) {
        deleting = false;
        qi = (qi + 1) % QUOTES.length;
        setTimeout(tick, 600);
        return;
      }
      setTimeout(tick, 38);
    }
  })();
}

/* —— 鼠标视差 —— */
window.addEventListener('pointermove', (e) => {
  document.body.style.setProperty('--mx', (e.clientX / innerWidth - 0.5).toFixed(3));
  document.body.style.setProperty('--my', (e.clientY / innerHeight - 0.5).toFixed(3));
});

/* ================= 背景音乐 ================= */
const bgm = $('#bgm');
const musicBtn = $('#music-btn');
bgm.volume = 0.65;

function startBgm() {
  bgm.play().catch(() => { /* 被拦截时用户可点右上角按钮手动开启 */ });
}

musicBtn.addEventListener('click', () => {
  if (bgm.paused) startBgm();
  else bgm.pause();
});
bgm.addEventListener('play', () => musicBtn.classList.add('playing'));
bgm.addEventListener('pause', () => musicBtn.classList.remove('playing'));

/* ================= 惊喜彩蛋 ================= */
const surprise = $('#surprise');

$('#surprise-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  surprise.hidden = false;
  requestAnimationFrame(() => surprise.classList.add('show'));
  if (mainFX) {
    mainFX.heartRain(70);
    [0, 260, 520].forEach((d, i) =>
      setTimeout(() => mainFX.burst(innerWidth * (0.3 + 0.2 * i), innerHeight * rand(0.3, 0.5), 34), d)
    );
  }
});

function closeSurprise() {
  surprise.classList.remove('show');
  setTimeout(() => { surprise.hidden = true; }, 420);
}
surprise.addEventListener('click', closeSurprise);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !surprise.hidden) closeSurprise();
});
