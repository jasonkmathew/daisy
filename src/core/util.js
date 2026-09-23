// Shared namespace + math helpers used by every other module.
'use strict';
const SB = (window.SB = window.SB || {});

SB.W = 1280;
SB.H = 720;
SB.FPS = 60;
// Bundled fonts (assets/fonts, SIL OFL): Bangers for anime-comic display text,
// Russo One for UI text.
SB.FONT_DISPLAY = '"Bangers", "Impact", "Segoe UI", sans-serif';
SB.FONT_UI = '"Russo One", "Segoe UI", Arial, sans-serif';

SB.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
SB.lerp = (a, b, t) => a + (b - a) * t;
SB.invLerp = (a, b, v) => (v - a) / (b - a);
SB.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
SB.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
SB.smooth = (t) => t * t * (3 - 2 * t);
SB.easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
SB.easeIn = (t) => t * t * t;
SB.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
SB.randInt = (a, b) => Math.floor(SB.rand(a, b + 1));
SB.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
SB.deg = (d) => (d * Math.PI) / 180;
SB.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
SB.chance = (p) => Math.random() < p;

// Circle vs axis-aligned rectangle overlap test.
SB.circleRect = (cx, cy, r, rx, ry, rw, rh) => {
  const nx = SB.clamp(cx, rx, rx + rw);
  const ny = SB.clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
};

SB.rectRect = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

// Colour helpers -------------------------------------------------------------
SB.hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
SB.rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => SB.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
// amt > 0 lightens toward white, amt < 0 darkens toward black.
SB.shade = (hex, amt) => {
  const [r, g, b] = SB.hexToRgb(hex);
  if (amt >= 0) return SB.rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return SB.rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
};
SB.mix = (a, b, t) => {
  const A = SB.hexToRgb(a);
  const B = SB.hexToRgb(b);
  return SB.rgbToHex(SB.lerp(A[0], B[0], t), SB.lerp(A[1], B[1], t), SB.lerp(A[2], B[2], t));
};
SB.rgba = (hex, a) => {
  const [r, g, b] = SB.hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

SB.makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

SB.roundRect = (ctx, x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// Seeded RNG so procedurally generated art (stars, buildings) is stable.
SB.seeded = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
};

SB.storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('brawl-legends:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('brawl-legends:' + key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable: settings just won't persist */
    }
  },
};

SB.settings = Object.assign(
  { master: 0.8, music: 0.5, sfx: 0.8, shake: true, hitboxes: false, damageNumbers: true },
  SB.storage.get('settings', {})
);
SB.saveSettings = () => SB.storage.set('settings', SB.settings);
