// Stages: collision geometry, blast zones and painted anime-style artwork.
//
// Every stage is a floating island with tall side walls you can cling to and
// wall-jump off (Brawlhalla style) plus pass-through platforms.
'use strict';
(function () {
  const TAU = Math.PI * 2;

  class Stage {
    constructor(def) {
      this.def = def;
      this.id = def.id;
      this.name = def.name;
      this.blast = Object.assign({}, def.blast);
      this.cam = Object.assign({}, def.cam);
      this.solids = def.solids.map((s) => {
        const o = Object.assign({ wall: true }, s);
        o.surface = { x1: s.x, x2: s.x + s.w, y: s.y, plat: false };
        return o;
      });
      this.plats = def.plats.map((p) => Object.assign({ plat: true, dx: 0, dy: 0, prevY: p.y, ox: (p.x1 + p.x2) / 2, oy: p.y }, p));
      // Brawlhalla has no ledge grabbing: walls are climbed instead.
      this.ledges = [];
      this.t = 0;
      this.cache = {};
    }

    update() {
      this.t++;
      for (const p of this.plats) {
        p.prevY = p.y;
        if (p.move) {
          const ph = (this.t / p.move.period) * TAU;
          const cx = p.ox + Math.sin(ph) * (p.move.ax || 0);
          const cy = p.oy + Math.sin(ph * (p.move.fy || 1)) * (p.move.ay || 0);
          const half = (p.x2 - p.x1) / 2;
          const nx1 = cx - half;
          p.dx = nx1 - p.x1;
          p.dy = cy - p.y;
          p.x1 = nx1;
          p.x2 = cx + half;
          p.y = cy;
        }
      }
    }

    groundBelow(x, y) {
      let best = null;
      for (const s of this.solids) if (x >= s.x && x <= s.x + s.w && s.y >= y && (best === null || s.y < best)) best = s.y;
      for (const p of this.plats) if (x >= p.x1 && x <= p.x2 && p.y >= y && (best === null || p.y < best)) best = p.y;
      return best === null ? this.blast.bottom : best;
    }

    spawnPoint(slot, count) {
      const xs = count <= 2 ? [-220, 220] : [-250, 250, -90, 90];
      const x = xs[slot % xs.length];
      return { x, y: this.groundBelow(x, -400) };
    }

    respawnPoint(slot) {
      const xs = [-150, 150, -50, 50];
      return { x: xs[slot % 4], y: this.def.respawnY || -320 };
    }

    drawBack(ctx, cam, W, H) {
      this.def.back(ctx, cam, W, H, this.t, this);
    }
    drawStage(ctx) {
      this.def.body(ctx, this.t, this);
      for (const p of this.plats) this.def.plat(ctx, p, this.t, this);
    }
    drawFront(ctx, cam, W, H) {
      if (this.def.front) this.def.front(ctx, cam, W, H, this.t, this);
      if (this.def.ambient) this.def.ambient(ctx, cam, W, H, this.t, this);
    }
  }

  // ================================================================ helpers
  function cached(stage, key, w, h, draw) {
    if (!stage.cache[key]) {
      const c = SB.makeCanvas(w, h);
      draw(c.getContext('2d'), w, h);
      stage.cache[key] = c;
    }
    return stage.cache[key];
  }
  // Global caches shared between Stage instances (menus re-create stages).
  const globalCache = {};
  function gcached(key, w, h, draw) {
    if (!globalCache[key]) {
      const c = SB.makeCanvas(w, h);
      draw(c.getContext('2d'), w, h);
      globalCache[key] = c;
    }
    return globalCache[key];
  }

  // Draw a pre-rendered layer with parallax (depth 0 = fixed, 1 = world).
  function parallax(ctx, img, cam, W, H, depth, yOff = 0) {
    const s = 1 + (cam.zoom - 1) * depth * 0.5;
    const iw = img.width * s * (W / 1280);
    const ih = img.height * s * (H / 720);
    const x = W / 2 - iw / 2 - cam.x * depth * 0.25 * (W / 1280);
    const y = H / 2 - ih / 2 - cam.y * depth * 0.2 * (H / 720) + yOff * (H / 720);
    ctx.drawImage(img, x, y, iw, ih);
  }

  function vgrad(c, y0, y1, stops) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  }

  // Anime-style cumulus cloud: flat-bottomed puffs with three cel tones.
  function paintCloud(c, cx, cy, size, rnd, tones) {
    const n = 6 + Math.floor(rnd() * 4);
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const arch = Math.sin(u * Math.PI);
      puffs.push({
        x: cx + (u - 0.5) * size * 2.2 + (rnd() - 0.5) * size * 0.2,
        y: cy - arch * size * 0.45 + (rnd() - 0.5) * size * 0.1,
        r: size * (0.3 + arch * 0.38 + rnd() * 0.08),
      });
    }
    c.save();
    c.beginPath();
    c.rect(cx - size * 3, cy - size * 3, size * 6, size * 3 + size * 0.28);
    c.clip();
    const fill = (col, dy, k, dx = 0) => {
      c.fillStyle = col;
      c.beginPath();
      for (const p of puffs) {
        c.moveTo(p.x + dx * p.r + p.r * k, p.y - dy * p.r);
        c.arc(p.x + dx * p.r, p.y - dy * p.r, p.r * k, 0, TAU);
      }
      c.fill();
    };
    fill(tones[0], 0, 1);
    fill(tones[1], 0.16, 0.9, -0.04);
    fill(tones[2], 0.36, 0.62, -0.16);
    if (tones[3]) fill(tones[3], 0.5, 0.34, -0.24);
    c.restore();
  }

  function paintMountain(c, x, base, w, h, rnd, body, shade, snow) {
    const peak = { x: x + w * (0.45 + rnd() * 0.1), y: base - h };
    const left = [];
    const right = [];
    const steps = 7;
    for (let i = 1; i < steps; i++) {
      const u = i / steps;
      left.push({ x: peak.x - (peak.x - x) * u + (rnd() - 0.5) * 14, y: peak.y + h * u + (rnd() - 0.5) * 10 });
      right.push({ x: peak.x + (x + w - peak.x) * u + (rnd() - 0.5) * 14, y: peak.y + h * u + (rnd() - 0.5) * 10 });
    }
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(x, base);
    for (let i = left.length - 1; i >= 0; i--) c.lineTo(left[i].x, left[i].y);
    c.lineTo(peak.x, peak.y);
    right.forEach((p) => c.lineTo(p.x, p.y));
    c.lineTo(x + w, base);
    c.closePath();
    c.fill();
    // shaded right face
    c.fillStyle = shade;
    c.beginPath();
    c.moveTo(peak.x, peak.y);
    right.forEach((p) => c.lineTo(p.x, p.y));
    c.lineTo(x + w, base);
    c.lineTo(peak.x + w * 0.05, base);
    c.closePath();
    c.fill();
    if (snow) {
      c.fillStyle = snow;
      c.beginPath();
      c.moveTo(peak.x, peak.y);
      const sh = h * 0.28;
      c.lineTo(peak.x + w * 0.16, peak.y + sh);
      for (let i = 0; i < 6; i++) c.lineTo(peak.x + w * 0.16 - (i * w * 0.32) / 6, peak.y + sh + (i % 2 ? -sh * 0.25 : sh * 0.12));
      c.lineTo(peak.x - w * 0.16, peak.y + sh);
      c.closePath();
      c.fill();
    }
  }

  function paintTree(c, x, base, s, rnd, tones, trunk) {
    c.strokeStyle = trunk;
    c.lineCap = 'round';
    c.lineWidth = 9 * s;
    c.beginPath();
    c.moveTo(x, base);
    c.quadraticCurveTo(x - 10 * s, base - 60 * s, x + 6 * s, base - 110 * s);
    c.stroke();
    c.lineWidth = 5 * s;
    c.beginPath();
    c.moveTo(x + 2 * s, base - 80 * s);
    c.quadraticCurveTo(x + 40 * s, base - 110 * s, x + 70 * s, base - 120 * s);
    c.moveTo(x - 2 * s, base - 70 * s);
    c.quadraticCurveTo(x - 40 * s, base - 95 * s, x - 66 * s, base - 110 * s);
    c.stroke();
    const blobs = [];
    for (let i = 0; i < 14; i++) blobs.push({ x: x + (rnd() - 0.5) * 170 * s, y: base - 120 * s + (rnd() - 0.5) * 60 * s, r: (22 + rnd() * 18) * s });
    for (const [col, dy, k] of [[tones[0], 0, 1], [tones[1], 0.2, 0.85], [tones[2], 0.4, 0.5]]) {
      c.fillStyle = col;
      c.beginPath();
      for (const b of blobs) {
        c.moveTo(b.x + b.r * k, b.y - b.r * dy);
        c.arc(b.x - b.r * dy * 0.3, b.y - b.r * dy, b.r * k, 0, TAU);
      }
      c.fill();
    }
  }

  function torii(ctx, x, base, s) {
    const red = '#d6361f';
    const dark = '#2a1512';
    // pillars
    const pw = 16 * s;
    const ph = 190 * s;
    const span = 130 * s;
    for (const d of [-1, 1]) {
      const px = x + d * span;
      const g = ctx.createLinearGradient(px - pw / 2, 0, px + pw / 2, 0);
      g.addColorStop(0, '#f0553a');
      g.addColorStop(0.6, red);
      g.addColorStop(1, '#8e1e10');
      ctx.fillStyle = g;
      ctx.fillRect(px - pw / 2, base - ph, pw, ph);
      ctx.fillStyle = dark;
      ctx.fillRect(px - pw * 0.7, base - 12 * s, pw * 1.4, 12 * s);
    }
    // nuki (lower beam)
    ctx.fillStyle = red;
    ctx.fillRect(x - span - 30 * s, base - ph + 34 * s, (span + 30 * s) * 2, 12 * s);
    // plaque
    ctx.fillStyle = dark;
    ctx.fillRect(x - 14 * s, base - ph + 6 * s, 28 * s, 30 * s);
    ctx.strokeStyle = '#e8c35a';
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(x - 11 * s, base - ph + 9 * s, 22 * s, 24 * s);
    // kasagi (curved top beam)
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(x - span - 50 * s, base - ph - 6 * s);
    ctx.quadraticCurveTo(x, base - ph + 8 * s, x + span + 50 * s, base - ph - 6 * s);
    ctx.lineTo(x + span + 40 * s, base - ph + 8 * s);
    ctx.quadraticCurveTo(x, base - ph + 20 * s, x - span - 40 * s, base - ph + 8 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x - span - 58 * s, base - ph - 16 * s);
    ctx.quadraticCurveTo(x, base - ph - 2 * s, x + span + 58 * s, base - ph - 16 * s);
    ctx.lineTo(x + span + 50 * s, base - ph - 4 * s);
    ctx.quadraticCurveTo(x, base - ph + 8 * s, x - span - 50 * s, base - ph - 4 * s);
    ctx.closePath();
    ctx.fill();
  }

  function lantern(ctx, x, base, s, t) {
    const stone = '#9a958c';
    const dark = '#5d5953';
    ctx.fillStyle = dark;
    ctx.fillRect(x - 14 * s, base - 8 * s, 28 * s, 8 * s);
    ctx.fillStyle = stone;
    ctx.fillRect(x - 6 * s, base - 40 * s, 12 * s, 32 * s);
    ctx.fillRect(x - 16 * s, base - 46 * s, 32 * s, 7 * s);
    ctx.fillStyle = '#433f3a';
    ctx.fillRect(x - 12 * s, base - 70 * s, 24 * s, 24 * s);
    const f = 0.8 + Math.sin(t * 0.21 + x) * 0.12 + Math.sin(t * 0.57 + x) * 0.06;
    ctx.fillStyle = `rgba(255,200,110,${f})`;
    ctx.fillRect(x - 8 * s, base - 66 * s, 16 * s, 16 * s);
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(x - 24 * s, base - 70 * s);
    ctx.lineTo(x + 24 * s, base - 70 * s);
    ctx.lineTo(x + 8 * s, base - 84 * s);
    ctx.lineTo(x - 8 * s, base - 84 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, base - 88 * s, 5 * s, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, base - 58 * s, 0, x, base - 58 * s, 60 * s);
    g.addColorStop(0, `rgba(255,190,90,${0.45 * f})`);
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 60 * s, base - 118 * s, 120 * s, 120 * s);
    ctx.restore();
  }

  function pagoda(c, x, base, s, col) {
    c.fillStyle = col;
    let w = 60 * s;
    let y = base;
    for (let i = 0; i < 5; i++) {
      c.fillRect(x - w * 0.35, y - 20 * s, w * 0.7, 20 * s);
      c.beginPath();
      c.moveTo(x - w * 0.75, y - 18 * s);
      c.quadraticCurveTo(x, y - 30 * s, x + w * 0.75, y - 18 * s);
      c.lineTo(x + w * 0.45, y - 28 * s);
      c.lineTo(x - w * 0.45, y - 28 * s);
      c.closePath();
      c.fill();
      y -= 28 * s;
      w *= 0.85;
    }
    c.fillRect(x - 2 * s, y - 30 * s, 4 * s, 30 * s);
  }

  // Rocky underside hanging below a floating island (decorative only).
  function underside(ctx, x1, x2, y, depth, top, bottom, rnd) {
    ctx.beginPath();
    ctx.moveTo(x1, y);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const d = Math.sin(u * Math.PI) * depth * (0.7 + rnd() * 0.3);
      ctx.lineTo(x1 + (x2 - x1) * u, y + d);
    }
    ctx.lineTo(x2, y);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, y, y + depth, [[0, top], [1, bottom]]);
    ctx.fill();
  }

  // Screen-space falling particles (petals, embers, snow...). Stateless: the
  // position is a function of time so no bookkeeping is needed.
  function driftParticles(ctx, W, H, t, cam, n, seed, draw, opts) {
    const r = SB.seeded(seed);
    for (let i = 0; i < n; i++) {
      const sx = r();
      const sp = opts.speed * (0.5 + r());
      const ph = r() * 1000;
      const sway = opts.sway * (0.5 + r());
      const depth = 0.4 + r() * 0.8;
      let y = ((r() * H + (t + ph) * sp * opts.dir) % (H + 60) + H + 60) % (H + 60) - 30;
      let x = ((sx * W + Math.sin((t + ph) * 0.02) * sway + t * opts.wind * depth - cam.x * 0.2 * depth) % (W + 60) + W + 60) % (W + 60) - 30;
      draw(x, y, depth, (t + ph) * 0.05, i);
    }
  }

  function petal(ctx, x, y, s, rot, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, Math.abs(Math.sin(rot * 1.7)) * 0.7 + 0.3);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -5 * s);
    ctx.quadraticCurveTo(5 * s, -1 * s, 0, 5 * s);
    ctx.quadraticCurveTo(-5 * s, -1 * s, 0, -5 * s);
    ctx.fill();
    ctx.restore();
  }

  function stoneWall(ctx, x, y, w, h, base, mortar, rnd) {
    // Irregular cut-stone wall (castle / cliff), cel shaded.
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = mortar;
    ctx.lineWidth = 2;
    let row = 0;
    for (let yy = y + 2; yy < y + h; yy += 22) {
      let xx = x + (row % 2 ? -18 : 0);
      while (xx < x + w) {
        const bw = 30 + rnd() * 26;
        const bx = Math.max(x, xx);
        const ew = Math.min(xx + bw, x + w) - bx;
        if (ew > 4) {
          ctx.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.06})`;
          ctx.fillRect(bx + 2, yy + 2, ew - 4, 7);
          ctx.strokeRect(bx, yy, ew, 22);
        }
        xx += bw;
      }
      row++;
    }
  }

  // ======================================================== SAKURA SHRINE
  const shrine = {
    id: 'sky', name: 'Sakura Shrine', music: 'sky',
    blurb: 'A floating shrine at sunset. Cherry blossoms, three platforms and climbable walls.',
    blast: { left: -1250, right: 1250, top: -1000, bottom: 820 },
    cam: { left: -950, right: 950, top: -720, bottom: 470 },
    solids: [{ x: -420, y: 0, w: 840, h: 230 }],
    plats: [
      { x1: -285, x2: -125, y: -140 },
      { x1: 125, x2: 285, y: -140 },
      { x1: -90, x2: 90, y: -275 },
    ],
    back(ctx, cam, W, H, t, st) {
      const sky = gcached('shrine-sky', 1280, 720, (c, w, h) => {
        c.fillStyle = vgrad(c, 0, h, [[0, '#23286b'], [0.3, '#6b3f9e'], [0.55, '#e0698f'], [0.75, '#ffa56b'], [1, '#ffe3a1']]);
        c.fillRect(0, 0, w, h);
        const r = SB.seeded(4);
        for (let i = 0; i < 70; i++) {
          c.globalAlpha = r() * 0.8 * (1 - i / 70);
          c.fillStyle = '#fff';
          c.fillRect(r() * w, r() * h * 0.3, 1.6, 1.6);
        }
        c.globalAlpha = 1;
        // Sun with rays
        const sx = w * 0.62;
        const sy = h * 0.66;
        let g = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.7);
        g.addColorStop(0, 'rgba(255,248,215,0.95)');
        g.addColorStop(0.1, 'rgba(255,220,160,0.75)');
        g.addColorStop(0.35, 'rgba(255,150,120,0.25)');
        g.addColorStop(1, 'rgba(255,120,120,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 12; i++) {
          const a = -Math.PI + (i / 11) * Math.PI;
          c.fillStyle = `rgba(255,225,180,${0.035 + (i % 2) * 0.025})`;
          c.beginPath();
          c.moveTo(sx, sy);
          c.lineTo(sx + Math.cos(a - 0.05) * w, sy + Math.sin(a - 0.05) * w);
          c.lineTo(sx + Math.cos(a + 0.05) * w, sy + Math.sin(a + 0.05) * w);
          c.fill();
        }
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#fff4d6';
        c.beginPath();
        c.arc(sx, sy, h * 0.08, 0, TAU);
        c.fill();
        // High wispy clouds
        const cr = SB.seeded(9);
        for (let i = 0; i < 6; i++) {
          c.fillStyle = `rgba(255,200,220,${0.25 + cr() * 0.2})`;
          const y = h * (0.12 + cr() * 0.25);
          const x = cr() * w;
          c.beginPath();
          c.ellipse(x, y, 160 + cr() * 140, 6 + cr() * 6, -0.05, 0, TAU);
          c.fill();
        }
      });
      ctx.drawImage(sky, 0, 0, W, H);
      const mtn = gcached('shrine-mtn', 1600, 900, (c, w, h) => {
        const r = SB.seeded(21);
        paintMountain(c, w * 0.18, h * 0.8, w * 0.6, h * 0.42, r, '#6c5aa8', '#56458c', '#f5ecff');
        c.fillStyle = 'rgba(120,80,150,0.9)';
        c.beginPath();
        c.moveTo(0, h * 0.8);
        for (let x = 0; x <= w; x += 40) c.lineTo(x, h * 0.74 + Math.sin(x * 0.01) * 20 + Math.sin(x * 0.037) * 10);
        c.lineTo(w, h);
        c.lineTo(0, h);
        c.fill();
        pagoda(c, w * 0.2, h * 0.76, 1.1, 'rgba(70,40,95,0.95)');
        pagoda(c, w * 0.82, h * 0.75, 0.8, 'rgba(70,40,95,0.95)');
      });
      parallax(ctx, mtn, cam, W, H, 0.12, 20);
      const clouds = gcached('shrine-clouds', 1800, 900, (c, w, h) => {
        const r = SB.seeded(33);
        for (let i = 0; i < 8; i++) {
          paintCloud(c, r() * w, h * (0.55 + r() * 0.25), 60 + r() * 70, r, ['#b0628f', '#f08fa8', '#ffc3b5', '#fff0dc']);
        }
      });
      parallax(ctx, clouds, cam, W, H, 0.25, 30 + Math.sin(t * 0.004) * 6);
      const near = gcached('shrine-near', 2000, 1000, (c, w, h) => {
        const r = SB.seeded(55);
        for (let i = 0; i < 9; i++) {
          paintCloud(c, r() * w, h * (0.78 + r() * 0.2), 90 + r() * 90, r, ['#8f5d9c', '#e79bb6', '#ffd2c4', '#fff6e8']);
        }
      });
      parallax(ctx, near, cam, W, H, 0.45, 60);
      // Birds
      for (let i = 0; i < 5; i++) {
        const x = ((t * (0.6 + i * 0.1) + i * 260) % (W + 200)) - 100;
        const y = H * 0.3 + Math.sin(t * 0.02 + i) * 14 + i * 12;
        const f = Math.sin(t * 0.3 + i) * 4;
        ctx.strokeStyle = 'rgba(60,30,70,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - f);
        ctx.quadraticCurveTo(x - 3, y - 3, x, y);
        ctx.quadraticCurveTo(x + 3, y - 3, x + 7, y - f);
        ctx.stroke();
      }
    },
    body(ctx, t, st) {
      const r = SB.seeded(7);
      // Hanging rock + roots under the island
      underside(ctx, -420, 420, 225, 230, '#5b4a57', '#2a2233', r);
      ctx.strokeStyle = '#3b2a26';
      ctx.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const x = -360 + i * 90;
        ctx.beginPath();
        ctx.moveTo(x, 230);
        ctx.bezierCurveTo(x + 10, 280, x - 14, 320, x + 6, 360 + (i % 3) * 30);
        ctx.stroke();
      }
      // Glowing crystals under the island
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.6 + Math.sin(t * 0.05) * 0.3;
      for (const [x, y] of [[-150, 320], [60, 380], [210, 300]]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
        g.addColorStop(0, `rgba(255,150,210,${0.6 * pulse})`);
        g.addColorStop(1, 'rgba(255,150,210,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 70, y - 70, 140, 140);
      }
      ctx.restore();
      for (const [x, y] of [[-150, 320], [60, 380], [210, 300]]) {
        ctx.fillStyle = '#ffc4e6';
        ctx.beginPath();
        ctx.moveTo(x, y - 26);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x, y + 22);
        ctx.lineTo(x - 10, y);
        ctx.closePath();
        ctx.fill();
      }
      // Cliff walls: layered stone
      stoneWall(ctx, -420, 18, 840, 212, '#7c6a70', 'rgba(40,25,35,0.45)', SB.seeded(3));
      ctx.fillStyle = vgrad(ctx, 18, 230, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(30,10,40,0.55)']]);
      ctx.fillRect(-420, 18, 840, 212);
      // Moss drips on the upper wall
      ctx.fillStyle = '#5f9a55';
      for (let x = -420; x < 420; x += 18) {
        const d = 10 + Math.abs((x * 13) % 17);
        ctx.beginPath();
        ctx.ellipse(x + 9, 20, 10, d, 0, 0, Math.PI);
        ctx.fill();
      }
      // Wall edge highlights (these are the climbable walls)
      ctx.fillStyle = 'rgba(255,220,240,0.35)';
      ctx.fillRect(-420, 18, 4, 212);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(416, 18, 4, 212);
      // Cherry trees behind the play area
      for (const [x, s] of [[-350, 1.05], [360, 0.95]]) {
        const tree = gcached('shrine-tree' + x, 300, 260, (c) => paintTree(c, 150, 250, s, SB.seeded(x + 999), ['#d8759c', '#f6a8c6', '#ffe0ec'], '#4a2a2a'));
        ctx.drawImage(tree, x - 150, -250);
      }
      torii(ctx, 0, 0, 1);
      lantern(ctx, -230, 0, 1, t);
      lantern(ctx, 230, 0, 1, t);
      // Shrine floor: wooden planks + red lacquer trim
      ctx.fillStyle = vgrad(ctx, -4, 20, [[0, '#d9a066'], [1, '#8f5a33']]);
      ctx.fillRect(-424, -4, 848, 22);
      ctx.strokeStyle = 'rgba(80,40,20,0.45)';
      ctx.lineWidth = 2;
      for (let x = -420; x < 420; x += 38) {
        ctx.beginPath();
        ctx.moveTo(x, -4);
        ctx.lineTo(x, 18);
        ctx.stroke();
      }
      ctx.fillStyle = '#c92f1f';
      ctx.fillRect(-428, 14, 856, 8);
      ctx.fillStyle = '#f4d28a';
      ctx.fillRect(-428, 14, 856, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(-424, -4, 848, 2);
    },
    plat(ctx, p, t) {
      const w = p.x2 - p.x1;
      const y = p.y;
      // Floating wooden bridge with paper charms
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(p.x1 + w / 2, y + 34, w * 0.4, 5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, y, y + 16, [[0, '#e5ad72'], [1, '#8a5530']]);
      ctx.beginPath();
      ctx.moveTo(p.x1 - 6, y);
      ctx.lineTo(p.x2 + 6, y);
      ctx.lineTo(p.x2 - 4, y + 14);
      ctx.lineTo(p.x1 + 4, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c92f1f';
      ctx.fillRect(p.x1 - 6, y + 10, w + 12, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(p.x1 - 6, y, w + 12, 2);
      for (let i = 0; i < 3; i++) {
        const cx = p.x1 + w * (0.2 + i * 0.3);
        const sw = Math.sin(t * 0.05 + i + p.x1) * 0.15;
        ctx.save();
        ctx.translate(cx, y + 15);
        ctx.rotate(sw);
        ctx.fillStyle = '#fff6e0';
        ctx.fillRect(-4, 0, 8, 20);
        ctx.fillStyle = '#c92f1f';
        ctx.fillRect(-2, 5, 4, 10);
        ctx.restore();
      }
    },
    ambient(ctx, cam, W, H, t) {
      driftParticles(ctx, W, H, t, cam, 36, 17, (x, y, d, rot, i) => petal(ctx, x, y, 0.9 + d, rot, i % 3 ? '#ffc6da' : '#ff9fc0'), { speed: 0.9, dir: 1, sway: 40, wind: 0.5 });
    },
  };

  // ======================================================= MOONLIT SUMMIT
  const summit = {
    id: 'space', name: 'Moonlit Summit', music: 'space',
    blurb: 'An ancient rune arena under a giant moon. One flat stage, no platforms.',
    blast: { left: -1260, right: 1260, top: -1000, bottom: 820 },
    cam: { left: -960, right: 960, top: -720, bottom: 470 },
    solids: [{ x: -470, y: 0, w: 940, h: 210 }],
    plats: [],
    back(ctx, cam, W, H, t) {
      const sky = gcached('moon-sky', 1280, 720, (c, w, h) => {
        c.fillStyle = vgrad(c, 0, h, [[0, '#050a24'], [0.5, '#162a5c'], [0.85, '#3a4f8c'], [1, '#6d7fb8']]);
        c.fillRect(0, 0, w, h);
        const r = SB.seeded(5);
        for (let i = 0; i < 420; i++) {
          const s = r();
          c.globalAlpha = 0.3 + r() * 0.7;
          c.fillStyle = s > 0.9 ? '#bfe4ff' : '#ffffff';
          const z = s > 0.97 ? 2.4 : s > 0.8 ? 1.6 : 1;
          c.fillRect(r() * w, r() * h * 0.8, z, z);
        }
        c.globalAlpha = 1;
        // Giant moon
        const mx = w * 0.7;
        const my = h * 0.34;
        const mr = h * 0.24;
        let g = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.6);
        g.addColorStop(0, 'rgba(210,230,255,0.5)');
        g.addColorStop(1, 'rgba(160,190,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        g = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.7, '#e3ecff');
        g.addColorStop(1, '#b9c9ef');
        c.fillStyle = g;
        c.beginPath();
        c.arc(mx, my, mr, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(150,170,215,0.35)';
        for (let i = 0; i < 9; i++) {
          c.beginPath();
          c.arc(mx + (r() - 0.5) * mr * 1.4, my + (r() - 0.5) * mr * 1.4, mr * (0.06 + r() * 0.14), 0, TAU);
          c.fill();
        }
      });
      ctx.drawImage(sky, 0, 0, W, H);
      // Aurora ribbons
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const col = ['rgba(90,255,200,', 'rgba(120,160,255,', 'rgba(200,120,255,'][k];
        ctx.beginPath();
        for (let x = 0; x <= W; x += 20) {
          const y = H * (0.18 + k * 0.07) + Math.sin(x * 0.006 + t * 0.01 + k) * 30 + Math.sin(x * 0.017 - t * 0.013) * 12;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = W; x >= 0; x -= 20) {
          const y = H * (0.18 + k * 0.07) + Math.sin(x * 0.006 + t * 0.01 + k) * 30 + Math.sin(x * 0.017 - t * 0.013) * 12 + 60;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, H * 0.1, 0, H * 0.5);
        g.addColorStop(0, col + '0)');
        g.addColorStop(0.5, col + '0.16)');
        g.addColorStop(1, col + '0)');
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
      // Shooting star
      const sp = t % 240;
      if (sp < 30) {
        const sx = ((Math.floor(t / 240) * 397) % W);
        const x = sx + sp * 14;
        const y = 60 + sp * 5;
        const g = ctx.createLinearGradient(x - 120, y - 40, x, y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,0.9)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 120, y - 43);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      const peaks = gcached('moon-peaks', 1700, 900, (c, w, h) => {
        const r = SB.seeded(12);
        for (let i = 0; i < 6; i++) paintMountain(c, i * 280 - 80, h * 0.86, 380, 200 + r() * 160, r, '#2a3f78', '#1d2d5c', '#dfe9ff');
        c.fillStyle = vgrad(c, h * 0.7, h, [[0, 'rgba(120,150,220,0)'], [1, 'rgba(120,150,220,0.55)']]);
        c.fillRect(0, h * 0.7, w, h * 0.3);
      });
      parallax(ctx, peaks, cam, W, H, 0.15, 30);
      const clouds = gcached('moon-clouds', 1900, 900, (c, w, h) => {
        const r = SB.seeded(44);
        for (let i = 0; i < 9; i++) paintCloud(c, r() * w, h * (0.78 + r() * 0.2), 80 + r() * 90, r, ['#243766', '#3d5a9c', '#7f9cd8', '#cfe0ff']);
      });
      parallax(ctx, clouds, cam, W, H, 0.4, 60);
    },
    body(ctx, t) {
      const r = SB.seeded(19);
      underside(ctx, -470, 470, 205, 260, '#2c3566', '#0d1230', r);
      // Hanging chains with crystals
      for (const x of [-300, -100, 140, 330]) {
        ctx.strokeStyle = '#6f7aa8';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, 210);
        ctx.lineTo(x, 330 + (x % 3) * 10);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#9fe8ff';
        ctx.beginPath();
        ctx.moveTo(x, 330);
        ctx.lineTo(x + 9, 350);
        ctx.lineTo(x, 376);
        ctx.lineTo(x - 9, 350);
        ctx.closePath();
        ctx.fill();
      }
      // Arena walls with glowing runes
      ctx.fillStyle = vgrad(ctx, 0, 210, [[0, '#5b6aa6'], [0.15, '#3e4a82'], [1, '#1c2350']]);
      ctx.fillRect(-470, 0, 940, 210);
      stoneWall(ctx, -470, 24, 940, 186, 'rgba(0,0,0,0)', 'rgba(10,15,40,0.35)', SB.seeded(8));
      const pulse = 0.5 + Math.sin(t * 0.05) * 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(110,220,255,${0.6 * pulse + 0.2})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const x = -420 + i * 105;
        ctx.beginPath();
        ctx.arc(x, 110, 22, 0, TAU);
        ctx.moveTo(x - 14, 110);
        ctx.lineTo(x + 14, 110);
        ctx.moveTo(x, 96);
        ctx.lineTo(x, 124);
        ctx.stroke();
      }
      ctx.restore();
      // Crystal spires on each end
      for (const d of [-1, 1]) {
        const x = d * 440;
        ctx.fillStyle = '#7fd6ff';
        ctx.beginPath();
        ctx.moveTo(x - 16, 0);
        ctx.lineTo(x - 4, -90);
        ctx.lineTo(x + 8, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c9f2ff';
        ctx.beginPath();
        ctx.moveTo(x - 4, -90);
        ctx.lineTo(x + 8, 0);
        ctx.lineTo(x, 0);
        ctx.closePath();
        ctx.fill();
      }
      // Floor: polished moonstone with a silver edge
      ctx.fillStyle = vgrad(ctx, -4, 24, [[0, '#dfe8ff'], [0.2, '#a9b7e6'], [1, '#6674b3']]);
      ctx.fillRect(-474, -4, 948, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(-474, -4, 948, 2);
      ctx.save();
      ctx.shadowColor = '#8fe8ff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#b6f3ff';
      ctx.fillRect(-474, 22, 948, 3);
      ctx.restore();
    },
    plat() {},
    ambient(ctx, cam, W, H, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      driftParticles(ctx, W, H, t, cam, 28, 23, (x, y, d, rot) => {
        const a = 0.35 + Math.sin(rot * 3) * 0.3;
        ctx.fillStyle = `rgba(170,230,255,${Math.max(0, a)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + d * 1.5, 0, TAU);
        ctx.fill();
      }, { speed: 0.3, dir: -1, sway: 30, wind: 0.1 });
      ctx.restore();
    },
  };

  // ========================================================== ONI FORTRESS
  const fortress = {
    id: 'volcano', name: 'Oni Fortress', music: 'volcano',
    blurb: 'A castle rampart over a lava sea. The centre platform rises and falls.',
    blast: { left: -1220, right: 1220, top: -1000, bottom: 800 },
    cam: { left: -920, right: 920, top: -720, bottom: 460 },
    solids: [{ x: -400, y: 0, w: 800, h: 220 }],
    plats: [
      { x1: -310, x2: -160, y: -125 },
      { x1: 160, x2: 310, y: -125 },
      { x1: -80, x2: 80, y: -215, move: { period: 420, ay: 60 } },
    ],
    respawnY: -340,
    back(ctx, cam, W, H, t) {
      const sky = gcached('oni-sky', 1280, 720, (c, w, h) => {
        c.fillStyle = vgrad(c, 0, h, [[0, '#14030a'], [0.4, '#4d0d16'], [0.72, '#b3280f'], [1, '#ff8a2a']]);
        c.fillRect(0, 0, w, h);
        const r = SB.seeded(2);
        for (let i = 0; i < 6; i++) {
          c.fillStyle = `rgba(40,5,10,${0.3 + r() * 0.3})`;
          c.beginPath();
          c.ellipse(r() * w, h * (0.1 + r() * 0.3), 200 + r() * 200, 20 + r() * 20, 0, 0, TAU);
          c.fill();
        }
      });
      ctx.drawImage(sky, 0, 0, W, H);
      const vol = gcached('oni-volcano', 1700, 900, (c, w, h) => {
        const r = SB.seeded(8);
        c.fillStyle = '#240609';
        c.beginPath();
        c.moveTo(w * 0.15, h);
        c.lineTo(w * 0.44, h * 0.36);
        c.lineTo(w * 0.56, h * 0.36);
        c.lineTo(w * 0.88, h);
        c.closePath();
        c.fill();
        c.fillStyle = '#34090d';
        c.beginPath();
        c.moveTo(w * 0.5, h * 0.36);
        c.lineTo(w * 0.56, h * 0.36);
        c.lineTo(w * 0.88, h);
        c.lineTo(w * 0.6, h);
        c.closePath();
        c.fill();
        c.strokeStyle = '#ff7a1a';
        c.lineWidth = 4;
        for (let i = 0; i < 5; i++) {
          c.beginPath();
          let x = w * (0.47 + i * 0.015);
          let y = h * 0.37;
          c.moveTo(x, y);
          for (let k = 0; k < 12; k++) {
            x += (r() - 0.5) * 30 + (i - 2) * 6;
            y += h * 0.05;
            c.lineTo(x, y);
          }
          c.stroke();
        }
        const g = c.createRadialGradient(w * 0.5, h * 0.36, 0, w * 0.5, h * 0.36, 200);
        g.addColorStop(0, 'rgba(255,200,90,0.95)');
        g.addColorStop(1, 'rgba(255,90,20,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        // Castle silhouette on a distant ridge
        const cx = w * 0.18;
        const by = h * 0.8;
        c.fillStyle = '#12030a';
        c.fillRect(0, by, w * 0.35, h - by);
        let ww = 170;
        let yy = by;
        for (let i = 0; i < 4; i++) {
          c.fillRect(cx - ww * 0.35, yy - 34, ww * 0.7, 34);
          c.beginPath();
          c.moveTo(cx - ww * 0.62, yy - 30);
          c.quadraticCurveTo(cx, yy - 46, cx + ww * 0.62, yy - 30);
          c.lineTo(cx + ww * 0.4, yy - 44);
          c.lineTo(cx - ww * 0.4, yy - 44);
          c.closePath();
          c.fill();
          yy -= 44;
          ww *= 0.8;
        }
        c.fillStyle = 'rgba(255,160,60,0.8)';
        for (let i = 0; i < 12; i++) c.fillRect(cx - 50 + (i % 6) * 18, by - 22 - Math.floor(i / 6) * 44, 5, 8);
      });
      parallax(ctx, vol, cam, W, H, 0.16, 0);
      // Smoke plume from the crater
      const vx = W / 2 - cam.x * 0.04;
      const vy = H * 0.3 - cam.y * 0.032;
      for (let i = 0; i < 10; i++) {
        const k = ((t * 0.4 + i * 40) % 400) / 400;
        ctx.globalAlpha = (1 - k) * 0.4;
        ctx.fillStyle = '#2b0e12';
        ctx.beginPath();
        ctx.arc(vx + Math.sin(i * 2 + t * 0.01) * 30 * k + k * 90, vy - k * H * 0.4, 30 + k * 100, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    body(ctx, t) {
      // Hanging chains for the side balconies
      ctx.strokeStyle = '#3a2226';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      for (const x of [-300, -170, 170, 300]) {
        ctx.beginPath();
        ctx.moveTo(x, -125);
        ctx.lineTo(x, -760);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      underside(ctx, -400, 400, 215, 220, '#3a1a1e', '#12060a', SB.seeded(4));
      // Ishigaki-style sloped castle wall with lava cracks
      stoneWall(ctx, -400, 20, 800, 200, '#4e3a3c', 'rgba(15,5,8,0.55)', SB.seeded(12));
      ctx.fillStyle = vgrad(ctx, 20, 220, [[0, 'rgba(255,120,40,0.12)'], [1, 'rgba(10,0,5,0.5)']]);
      ctx.fillRect(-400, 20, 800, 200);
      const pulse = 0.6 + Math.sin(t * 0.07) * 0.4;
      ctx.save();
      ctx.shadowColor = '#ff5a00';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(255,${110 + pulse * 60},20,${0.6 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      const r = SB.seeded(4);
      for (let i = 0; i < 7; i++) {
        let x = -350 + i * 110;
        let y = 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (r() - 0.5) * 30;
          y += 30 + r() * 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      // Dark wood + red rampart top with roof tiles
      ctx.fillStyle = vgrad(ctx, -6, 22, [[0, '#5a3a2c'], [1, '#2a1812']]);
      ctx.fillRect(-404, -6, 808, 28);
      ctx.fillStyle = '#b3261e';
      ctx.fillRect(-408, 16, 816, 6);
      ctx.fillStyle = '#e8b64c';
      for (let x = -390; x < 400; x += 60) {
        ctx.beginPath();
        ctx.arc(x, 19, 3, 0, TAU);
        ctx.fill();
      }
      // Oni mask banners on the corners
      for (const d of [-1, 1]) {
        const x = d * 370;
        ctx.fillStyle = '#2b1612';
        ctx.fillRect(x - 3, -110, 6, 110);
        ctx.fillStyle = '#9e1b16';
        ctx.fillRect(x + (d < 0 ? 3 : -33), -106, 30, 56);
        ctx.fillStyle = '#f0d27a';
        ctx.beginPath();
        const mx = x + (d < 0 ? 18 : -18);
        ctx.arc(mx, -82, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#9e1b16';
        ctx.fillRect(mx - 5, -85, 3, 3);
        ctx.fillRect(mx + 2, -85, 3, 3);
        // Torch
        const f = Math.sin(t * 0.3 + x) * 3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, -118, 0, x, -118, 40 + f);
        g.addColorStop(0, 'rgba(255,230,140,0.95)');
        g.addColorStop(0.3, 'rgba(255,120,30,0.6)');
        g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 45, -163, 90, 90);
        ctx.restore();
      }
    },
    plat(ctx, p, t) {
      const w = p.x2 - p.x1;
      const moving = !!p.move;
      ctx.fillStyle = vgrad(ctx, p.y, p.y + 16, [[0, moving ? '#7a4a2e' : '#5a3a2c'], [1, '#21120d']]);
      ctx.fillRect(p.x1, p.y, w, 14);
      ctx.fillStyle = moving ? '#e8b64c' : '#b3261e';
      ctx.fillRect(p.x1, p.y - 2, w, 3);
      // Hanging paper lanterns
      for (let i = 0; i < 2; i++) {
        const lx = p.x1 + w * (0.25 + i * 0.5);
        const sw = Math.sin(t * 0.04 + i + p.x1) * 3;
        ctx.strokeStyle = '#21120d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lx, p.y + 14);
        ctx.lineTo(lx + sw, p.y + 26);
        ctx.stroke();
        ctx.fillStyle = '#e03a24';
        ctx.beginPath();
        ctx.ellipse(lx + sw, p.y + 36, 8, 11, 0, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(lx + sw, p.y + 36, 0, lx + sw, p.y + 36, 26);
        g.addColorStop(0, 'rgba(255,170,80,0.5)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(lx + sw - 26, p.y + 10, 52, 52);
        ctx.restore();
      }
      if (moving) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = p.x1 + w / 2;
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.08 + i / 3) % 1;
          ctx.fillStyle = `rgba(255,160,40,${1 - k})`;
          ctx.beginPath();
          ctx.arc(cx + (i - 1) * 16, p.y + 16 + k * 40, 5 * (1 - k) + 1, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    },
    front(ctx, cam, W, H, t) {
      // Lava sea rising into view when the camera looks down.
      const z = cam.zoom * (H / 720);
      const sy = H / 2 + (600 - cam.y) * z;
      if (sy > H + 40) return;
      ctx.save();
      ctx.fillStyle = vgrad(ctx, sy - 20, H, [[0, '#ffd166'], [0.08, '#ff7b00'], [0.5, '#c2210c'], [1, '#4a0505']]);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, sy + Math.sin(x * 0.02 + t * 0.05) * 6 * z + Math.sin(x * 0.05 - t * 0.08) * 3 * z);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    ambient(ctx, cam, W, H, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      driftParticles(ctx, W, H, t, cam, 50, 31, (x, y, d, rot, i) => {
        ctx.fillStyle = `rgba(255,${120 + (i % 5) * 25},40,${0.5 + d * 0.3})`;
        ctx.fillRect(x, y, 2 + d, 2 + d);
      }, { speed: 1.2, dir: -1, sway: 20, wind: 0.3 });
      ctx.restore();
    },
  };

  // ============================================================= NEO TOKYO
  const neoTokyo = {
    id: 'city', name: 'Neo Tokyo', music: 'city',
    blurb: 'A rooftop in a neon megacity at night. A shuttle platform glides across.',
    blast: { left: -1250, right: 1250, top: -1000, bottom: 820 },
    cam: { left: -950, right: 950, top: -720, bottom: 470 },
    solids: [{ x: -430, y: 0, w: 860, h: 215 }],
    plats: [
      { x1: -95, x2: 95, y: -170, move: { period: 520, ax: 230 } },
      { x1: -330, x2: -200, y: -100 },
      { x1: 200, x2: 330, y: -100 },
    ],
    back(ctx, cam, W, H, t) {
      const sky = gcached('tokyo-sky', 1280, 720, (c, w, h) => {
        c.fillStyle = vgrad(c, 0, h, [[0, '#070a22'], [0.45, '#241650'], [0.8, '#6b2168'], [1, '#ff5f8f']]);
        c.fillRect(0, 0, w, h);
        const r = SB.seeded(12);
        for (let i = 0; i < 120; i++) {
          c.globalAlpha = r() * 0.7;
          c.fillStyle = '#fff';
          c.fillRect(r() * w, r() * h * 0.5, 1.4, 1.4);
        }
        c.globalAlpha = 1;
        const g = c.createRadialGradient(w * 0.18, h * 0.2, 0, w * 0.18, h * 0.2, 140);
        g.addColorStop(0, 'rgba(255,230,255,0.55)');
        g.addColorStop(1, 'rgba(255,230,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fdf1ff';
        c.beginPath();
        c.arc(w * 0.18, h * 0.2, 46, 0, TAU);
        c.fill();
      });
      ctx.drawImage(sky, 0, 0, W, H);
      const layer = (key, seed, col, winCol, baseY, minH, maxH, bw, depth, signs, tower) => {
        const img = gcached(key, 1900, 900, (c, w, h) => {
          const r = SB.seeded(seed);
          if (tower) {
            // Lattice broadcast tower (red / white)
            const tx = w * 0.7;
            const tb = baseY;
            const th = 520;
            for (let i = 0; i < 16; i++) {
              const y0 = tb - (i / 16) * th;
              const y1 = tb - ((i + 1) / 16) * th;
              const w0 = 70 * (1 - i / 16) + 6;
              const w1 = 70 * (1 - (i + 1) / 16) + 6;
              c.strokeStyle = i % 4 < 2 ? '#e0452d' : '#f4f0f0';
              c.lineWidth = 3;
              c.beginPath();
              c.moveTo(tx - w0, y0);
              c.lineTo(tx - w1, y1);
              c.moveTo(tx + w0, y0);
              c.lineTo(tx + w1, y1);
              c.moveTo(tx - w0, y0);
              c.lineTo(tx + w1, y1);
              c.moveTo(tx + w0, y0);
              c.lineTo(tx - w1, y1);
              c.stroke();
            }
            c.fillStyle = '#f4f0f0';
            c.fillRect(tx - 30, tb - th * 0.55, 60, 14);
            c.fillRect(tx - 18, tb - th * 0.82, 36, 10);
          }
          let x = -20;
          while (x < w) {
            const bwid = bw * (0.6 + r() * 0.9);
            const bh = minH + r() * (maxH - minH);
            const top = baseY - bh;
            c.fillStyle = col;
            c.fillRect(x, top, bwid, h - top);
            if (r() < 0.3) c.fillRect(x + bwid * 0.4, top - 30, 4, 30);
            for (let wy = top + 8; wy < h; wy += 12) {
              for (let wx = x + 5; wx < x + bwid - 6; wx += 9) {
                if (r() < 0.36) {
                  c.fillStyle = r() < 0.15 ? '#ff7ad9' : winCol;
                  c.globalAlpha = 0.45 + r() * 0.55;
                  c.fillRect(wx, wy, 4, 6);
                }
              }
            }
            c.globalAlpha = 1;
            if (signs && r() < 0.45) {
              // Vertical neon sign board with glowing glyph blocks
              const sc = SB.pick(['#ff3fa4', '#35f2ff', '#b6ff3b', '#ffcc33', '#ff6a3d']);
              const sx = x + bwid * 0.2;
              const sy = top + 20;
              c.shadowColor = sc;
              c.shadowBlur = 14;
              c.fillStyle = '#0b0b18';
              c.fillRect(sx, sy, 22, 70);
              c.strokeStyle = sc;
              c.lineWidth = 2;
              c.strokeRect(sx, sy, 22, 70);
              c.fillStyle = sc;
              for (let k = 0; k < 4; k++) {
                c.fillRect(sx + 5, sy + 6 + k * 16, 12, 3);
                c.fillRect(sx + 9, sy + 4 + k * 16, 3, 10);
              }
              c.shadowBlur = 0;
            }
            x += bwid + 4 + r() * 10;
          }
        });
        parallax(ctx, img, cam, W, H, depth, 0);
      };
      layer('tokyo-far', 2, '#1a1438', '#ffd98a', 700, 120, 420, 60, 0.12, false, true);
      // Elevated train crossing
      const tx = ((t * 3) % (W + 900)) - 450;
      const ty = H * 0.62 - cam.y * 0.08;
      ctx.fillStyle = '#0d0b1d';
      ctx.fillRect(0, ty + 14, W, 6);
      for (let i = 0; i < 5; i++) {
        const cx = tx + i * 84;
        ctx.fillStyle = '#d9dbe8';
        ctx.fillRect(cx, ty - 8, 80, 22);
        ctx.fillStyle = '#35f2ff';
        ctx.fillRect(cx + 4, ty - 4, 72, 7);
        ctx.fillStyle = '#e0452d';
        ctx.fillRect(cx, ty + 8, 80, 3);
      }
      layer('tokyo-mid', 3, '#120e27', '#ffe7b0', 800, 100, 360, 80, 0.25, true, false);
    },
    body(ctx, t) {
      // Building facade (climbable walls) with lit windows
      ctx.fillStyle = vgrad(ctx, 0, 215, [[0, '#2d2f4f'], [1, '#12132a']]);
      ctx.fillRect(-430, 0, 860, 215);
      const r = SB.seeded(77);
      for (let y = 34; y < 205; y += 30) {
        for (let x = -410; x < 410; x += 34) {
          const on = r() < 0.5;
          ctx.fillStyle = on ? (r() < 0.2 ? '#ff9ad9' : '#ffd98a') : '#1a1c36';
          ctx.globalAlpha = on ? 0.55 + r() * 0.4 : 1;
          ctx.fillRect(x, y, 20, 16);
        }
      }
      ctx.globalAlpha = 1;
      // Vertical neon sign on the facade
      const hue = (t * 0.6) % 360;
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = `hsl(${hue},100%,60%)`;
      ctx.fillStyle = '#0b0b18';
      ctx.fillRect(250, 30, 34, 150);
      ctx.strokeStyle = `hsl(${hue},100%,65%)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(250, 30, 34, 150);
      ctx.fillStyle = `hsl(${hue},100%,70%)`;
      for (let k = 0; k < 5; k++) {
        ctx.fillRect(257, 42 + k * 28, 20, 4);
        ctx.fillRect(265, 38 + k * 28, 4, 16);
      }
      ctx.restore();
      // Rooftop: water tank, AC units, vending machine (background props)
      ctx.fillStyle = '#3a3d63';
      ctx.fillRect(-380, -46, 56, 46);
      ctx.fillStyle = '#4c5080';
      ctx.fillRect(-380, -46, 56, 6);
      ctx.fillStyle = '#2a2c4a';
      ctx.fillRect(-300, -30, 44, 30);
      ctx.beginPath();
      ctx.arc(-278, -15, 10, 0, TAU);
      ctx.fillStyle = '#1b1c33';
      ctx.fill();
      ctx.fillStyle = '#d33a5a';
      ctx.fillRect(330, -70, 40, 70);
      ctx.fillStyle = '#ffe9f0';
      ctx.fillRect(336, -62, 28, 30);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const vg = ctx.createRadialGradient(350, -40, 0, 350, -40, 60);
      vg.addColorStop(0, 'rgba(255,120,170,0.35)');
      vg.addColorStop(1, 'rgba(255,120,170,0)');
      ctx.fillStyle = vg;
      ctx.fillRect(290, -100, 120, 120);
      ctx.restore();
      // Roof surface + neon trim
      ctx.fillStyle = vgrad(ctx, -4, 22, [[0, '#5a5e8f'], [0.2, '#3a3d63'], [1, '#23254a']]);
      ctx.fillRect(-434, -4, 868, 26);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 9, 90, 8, 0, 0, TAU);
      ctx.stroke();
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = `hsl(${hue},100%,60%)`;
      ctx.fillStyle = `hsl(${hue},100%,72%)`;
      ctx.fillRect(-434, -5, 868, 3);
      ctx.shadowColor = `hsl(${(hue + 180) % 360},100%,60%)`;
      ctx.fillStyle = `hsl(${(hue + 180) % 360},100%,65%)`;
      ctx.fillRect(-434, 20, 868, 3);
      ctx.restore();
    },
    plat(ctx, p, t) {
      const w = p.x2 - p.x1;
      const moving = !!p.move;
      ctx.fillStyle = moving ? '#353a63' : '#2a2d4a';
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y);
      ctx.lineTo(p.x2, p.y);
      ctx.lineTo(p.x2 - 12, p.y + 14);
      ctx.lineTo(p.x1 + 12, p.y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = moving ? '#ff4fd8' : '#4ff3ff';
      ctx.fillStyle = moving ? '#ff8ce6' : '#8ff8ff';
      ctx.fillRect(p.x1, p.y - 2, w, 3);
      ctx.restore();
      if (moving) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = p.x1 + w / 2;
        const g = ctx.createLinearGradient(0, p.y + 14, 0, p.y + 60);
        g.addColorStop(0, 'rgba(255,120,230,0.8)');
        g.addColorStop(1, 'rgba(255,120,230,0)');
        ctx.fillStyle = g;
        for (const dx of [-50, 50]) {
          const f = 1 + Math.sin(t * 0.5 + dx) * 0.2;
          ctx.beginPath();
          ctx.moveTo(cx + dx - 10, p.y + 14);
          ctx.lineTo(cx + dx + 10, p.y + 14);
          ctx.lineTo(cx + dx, p.y + 14 + 40 * f);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    },
    ambient(ctx, cam, W, H, t) {
      // Light rain streaks
      ctx.save();
      ctx.strokeStyle = 'rgba(180,200,255,0.22)';
      ctx.lineWidth = 1.2;
      driftParticles(ctx, W, H, t, cam, 70, 41, (x, y, d) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4 * d, y + 16 * d);
        ctx.stroke();
      }, { speed: 9, dir: 1, sway: 0, wind: -1 });
      ctx.restore();
    },
  };

  const STAGES = [shrine, summit, fortress, neoTokyo];
  SB.STAGES = STAGES;
  SB.Stage = Stage;
  SB.stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
})();
