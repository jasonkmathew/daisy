// Stages: collision geometry, blast zones, and layered procedural artwork.
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
        const o = Object.assign({}, s);
        o.surface = { x1: s.x, x2: s.x + s.w, y: s.y, plat: false };
        return o;
      });
      this.plats = def.plats.map((p) => Object.assign({ plat: true, dx: 0, dy: 0, prevY: p.y, ox: (p.x1 + p.x2) / 2, oy: p.y }, p));
      this.ledges = [];
      for (const s of this.solids) {
        if (!s.ledges) continue;
        this.ledges.push({ x: s.x, y: s.y, side: -1, owner: null, surface: s.surface });
        this.ledges.push({ x: s.x + s.w, y: s.y, side: 1, owner: null, surface: s.surface });
      }
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
      const xs = count <= 2 ? [-220, 220] : [-240, 240, -90, 90];
      const x = xs[slot % xs.length];
      return { x, y: this.groundBelow(x, -400) };
    }

    respawnPoint(slot) {
      const xs = [-150, 150, -50, 50];
      return { x: xs[slot % 4], y: this.def.respawnY || -300 };
    }

    // ------------------------------------------------------------ drawing
    drawBack(ctx, cam, W, H) {
      this.def.back(ctx, cam, W, H, this.t, this);
    }
    drawStage(ctx) {
      this.def.body(ctx, this.t, this);
      for (const p of this.plats) this.def.plat(ctx, p, this.t, this);
    }
    drawFront(ctx, cam, W, H) {
      if (this.def.front) this.def.front(ctx, cam, W, H, this.t, this);
    }
  }

  // Helpers --------------------------------------------------------------
  function cached(stage, key, w, h, draw) {
    if (!stage.cache[key]) {
      const c = SB.makeCanvas(w, h);
      draw(c.getContext('2d'), w, h);
      stage.cache[key] = c;
    }
    return stage.cache[key];
  }

  // Draws a pre-rendered layer with parallax. depth 0 = fixed, 1 = moves with world.
  function parallax(ctx, img, cam, W, H, depth, yOff = 0) {
    const s = 1 + (cam.zoom - 1) * depth * 0.5;
    const iw = img.width * s * (W / 1280);
    const ih = img.height * s * (H / 720);
    const x = W / 2 - iw / 2 - cam.x * depth * 0.25 * (W / 1280);
    const y = H / 2 - ih / 2 - cam.y * depth * 0.2 * (H / 720) + yOff * (H / 720);
    ctx.drawImage(img, x, y, iw, ih);
  }

  function mountainPath(ctx, rnd, w, baseY, amp, step) {
    ctx.beginPath();
    ctx.moveTo(0, baseY + amp);
    let y = baseY;
    for (let x = 0; x <= w + step; x += step) {
      y = SB.clamp(y + (rnd() - 0.5) * amp * 0.9, baseY - amp, baseY + amp * 0.4);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, baseY + amp * 4);
    ctx.lineTo(0, baseY + amp * 4);
    ctx.closePath();
  }

  function stoneBlock(ctx, x, y, w, h, top, side, dark) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    void side;
  }

  // Tapered underside piece shared by several stages.
  function underside(ctx, x1, x2, y, depth, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.lineTo(x2 - (x2 - x1) * 0.12, y + depth * 0.55);
    ctx.lineTo((x1 + x2) / 2 + (x2 - x1) * 0.05, y + depth);
    ctx.lineTo((x1 + x2) / 2 - (x2 - x1) * 0.05, y + depth);
    ctx.lineTo(x1 + (x2 - x1) * 0.12, y + depth * 0.55);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // ====================================================================
  // SKY TEMPLE
  // ====================================================================
  const skyTemple = {
    id: 'sky', name: 'Sky Temple', music: 'sky',
    blurb: 'Ancient ruins floating above a sea of clouds. Three platforms.',
    blast: { left: -1150, right: 1150, top: -950, bottom: 700 },
    cam: { left: -900, right: 900, top: -700, bottom: 420 },
    solids: [
      { x: -400, y: 0, w: 800, h: 44, ledges: true },
      { x: -330, y: 44, w: 660, h: 70 },
    ],
    plats: [
      { x1: -270, x2: -110, y: -135 },
      { x1: 110, x2: 270, y: -135 },
      { x1: -85, x2: 85, y: -265 },
    ],
    back(ctx, cam, W, H, t, st) {
      // Sky, sun glow and god rays are static: pre-render them once.
      const sky = cached(st, 'sky', 1280, 720, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#1d2b64');
        g.addColorStop(0.38, '#5d4a9e');
        g.addColorStop(0.62, '#e0789a');
        g.addColorStop(0.8, '#ffb07c');
        g.addColorStop(1, '#ffe2b0');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        const r = SB.seeded(11);
        for (let i = 0; i < 90; i++) {
          c.globalAlpha = r() * 0.7 * (1 - i / 90);
          c.fillStyle = '#ffffff';
          c.fillRect(r() * w, r() * h * 0.35, 1.5, 1.5);
        }
        c.globalAlpha = 1;
        const sx = w * 0.68;
        const sy = h * 0.63;
        const sg = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.55);
        sg.addColorStop(0, 'rgba(255,245,200,0.95)');
        sg.addColorStop(0.12, 'rgba(255,220,150,0.7)');
        sg.addColorStop(0.4, 'rgba(255,160,120,0.2)');
        sg.addColorStop(1, 'rgba(255,140,120,0)');
        c.fillStyle = sg;
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const a = -2.2 + i * 0.35;
          c.fillStyle = `rgba(255,220,170,${0.04 + (i % 2) * 0.02})`;
          c.beginPath();
          c.moveTo(sx, sy);
          c.lineTo(sx + Math.cos(a) * w * 1.5, sy + Math.sin(a) * w * 1.5);
          c.lineTo(sx + Math.cos(a + 0.12) * w * 1.5, sy + Math.sin(a + 0.12) * w * 1.5);
          c.fill();
        }
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#fff6da';
        c.beginPath();
        c.arc(sx, sy, h * 0.07, 0, TAU);
        c.fill();
      });
      ctx.drawImage(sky, 0, 0, W, H);
      const far = cached(st, 'mtnFar', 1600, 900, (c, w, h) => {
        const r = SB.seeded(3);
        c.fillStyle = 'rgba(120,90,160,0.55)';
        mountainPath(c, r, w, h * 0.66, 70, 40);
        c.fill();
        c.fillStyle = 'rgba(90,70,140,0.7)';
        mountainPath(c, r, w, h * 0.74, 55, 30);
        c.fill();
      });
      parallax(ctx, far, cam, W, H, 0.15, 10);
      // Distant floating islands
      const isl = cached(st, 'islands', 1600, 900, (c) => {
        const r = SB.seeded(21);
        for (let i = 0; i < 5; i++) {
          const x = 150 + i * 320 + r() * 80;
          const y = 300 + r() * 180;
          const s = 0.5 + r() * 0.7;
          c.fillStyle = 'rgba(95,80,130,0.8)';
          c.beginPath();
          c.moveTo(x - 70 * s, y);
          c.lineTo(x + 70 * s, y);
          c.lineTo(x + 20 * s, y + 70 * s);
          c.lineTo(x, y + 110 * s);
          c.lineTo(x - 30 * s, y + 60 * s);
          c.closePath();
          c.fill();
          c.fillStyle = 'rgba(120,150,120,0.8)';
          c.fillRect(x - 70 * s, y - 6 * s, 140 * s, 8 * s);
          c.fillStyle = 'rgba(80,70,110,0.9)';
          for (let k = 0; k < 3; k++) c.fillRect(x - 40 * s + k * 30 * s, y - 40 * s, 8 * s, 36 * s);
        }
      });
      parallax(ctx, isl, cam, W, H, 0.3, Math.sin(t * 0.01) * 4);
      // Cloud layers
      drawClouds(ctx, cam, W, H, t, 0.35, H * 0.8, 'rgba(255,215,215,0.55)', 5);
      drawClouds(ctx, cam, W, H, t, 0.6, H * 0.95, 'rgba(255,235,230,0.8)', 9);
    },
    body(ctx, t) {
      // Ruined pillars behind the stage
      for (const px of [-330, -180, 180, 330]) {
        const h = px === -180 || px === 180 ? 150 : 110;
        const g = ctx.createLinearGradient(px - 16, 0, px + 16, 0);
        g.addColorStop(0, '#a89c8a');
        g.addColorStop(0.5, '#e6dccb');
        g.addColorStop(1, '#8f8474');
        ctx.fillStyle = g;
        ctx.fillRect(px - 15, -h, 30, h);
        ctx.fillStyle = '#d9cfbd';
        ctx.fillRect(px - 21, -h - 10, 42, 12);
        ctx.fillStyle = 'rgba(60,50,40,0.25)';
        for (let k = 0; k < 3; k++) ctx.fillRect(px - 15 + k * 10 + 4, -h + 4, 2, h - 8);
      }
      // Lower taper
      underside(ctx, -330, 330, 44, 230, '#6f6457', null);
      let g = ctx.createLinearGradient(0, 44, 0, 274);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      underside(ctx, -330, 330, 44, 230, g, null);
      // Glowing rune ring on the underside
      const pulse = 0.5 + Math.sin(t * 0.05) * 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createRadialGradient(0, 140, 0, 0, 140, 90);
      g.addColorStop(0, `rgba(120,220,255,${0.55 * pulse})`);
      g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 140, 90, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(160,235,255,${0.8 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 140, 34, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = t * 0.01 + (i / 6) * TAU;
        ctx.fillRect(Math.cos(a) * 48 - 3, 140 + Math.sin(a) * 48 - 3, 6, 6);
      }
      ctx.restore();
      // Main slab
      stoneBlock(ctx, -400, 0, 800, 44, '#d8ccb6', '#b3a58e', '#8a7d69');
      // Bricks
      ctx.strokeStyle = 'rgba(80,65,50,0.35)';
      ctx.lineWidth = 2;
      for (let row = 0; row < 2; row++) {
        const y = 14 + row * 15;
        ctx.beginPath();
        ctx.moveTo(-400, y);
        ctx.lineTo(400, y);
        ctx.stroke();
        for (let x = -400 + (row % 2) * 30; x < 400; x += 60) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 15);
          ctx.stroke();
        }
      }
      // Gold trim + grass lip
      ctx.fillStyle = '#c9a44c';
      ctx.fillRect(-400, 40, 800, 5);
      g = ctx.createLinearGradient(0, -6, 0, 10);
      g.addColorStop(0, '#9be36b');
      g.addColorStop(1, '#4f9a3c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-404, 8);
      ctx.lineTo(-404, -2);
      for (let x = -404; x <= 404; x += 12) ctx.lineTo(x + 6, -4 - ((x * 7) % 5));
      ctx.lineTo(404, -2);
      ctx.lineTo(404, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-400, -3, 800, 2);
      // Edge caps
      for (const ex of [-400, 400]) {
        ctx.fillStyle = '#e7dcc6';
        ctx.fillRect(ex - (ex < 0 ? 6 : 0), -2, 6, 48);
      }
    },
    plat(ctx, p, t) {
      const w = p.x2 - p.x1;
      const y = p.y;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(p.x1 + w / 2, y + 30, w * 0.35, 5, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, '#efe6d2');
      g.addColorStop(1, '#a3957f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x1, y);
      ctx.lineTo(p.x2, y);
      ctx.lineTo(p.x2 - 10, y + 14);
      ctx.lineTo(p.x1 + 10, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7fcf5a';
      ctx.fillRect(p.x1, y - 3, w, 4);
      // hanging crystal
      const cx = p.x1 + w / 2;
      const bob = Math.sin(t * 0.05 + p.x1) * 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(cx, y + 26 + bob, 0, cx, y + 26 + bob, 22);
      gg.addColorStop(0, 'rgba(140,230,255,0.8)');
      gg.addColorStop(1, 'rgba(140,230,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(cx - 22, y + 4 + bob, 44, 44);
      ctx.restore();
      ctx.fillStyle = '#9fe8ff';
      ctx.beginPath();
      ctx.moveTo(cx, y + 14 + bob);
      ctx.lineTo(cx + 7, y + 26 + bob);
      ctx.lineTo(cx, y + 40 + bob);
      ctx.lineTo(cx - 7, y + 26 + bob);
      ctx.closePath();
      ctx.fill();
    },
    front(ctx, cam, W, H, t) {
      drawClouds(ctx, cam, W, H, t, 1.1, H * 1.08, 'rgba(255,240,235,0.9)', 13);
    },
  };

  // Soft cloud sprite, rendered once per colour and reused.
  const cloudSprites = {};
  function cloudSprite(color) {
    if (cloudSprites[color]) return cloudSprites[color];
    const c = SB.makeCanvas(360, 130);
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.beginPath();
    x.ellipse(180, 80, 170, 46, 0, 0, TAU);
    x.ellipse(110, 82, 88, 42, 0, 0, TAU);
    x.ellipse(235, 58, 100, 52, 0, 0, TAU);
    x.ellipse(160, 50, 70, 40, 0, 0, TAU);
    x.fill();
    cloudSprites[color] = c;
    return c;
  }

  function drawClouds(ctx, cam, W, H, t, depth, baseY, color, seed) {
    const r = SB.seeded(seed);
    const img = cloudSprite(color);
    const span = W * 1.6;
    for (let i = 0; i < 9; i++) {
      const speed = 0.1 + r() * 0.15;
      const x = ((r() * span + t * speed * depth - cam.x * depth * 0.3) % span + span) % span - W * 0.3;
      const y = baseY - r() * H * 0.12 - cam.y * depth * 0.15;
      const s = ((60 + r() * 90) * (W / 1280) * (0.6 + depth * 0.5)) / 100;
      ctx.drawImage(img, x - 180 * s, y - 80 * s, 360 * s, 130 * s);
    }
  }

  // ====================================================================
  // FINAL FRONTIER
  // ====================================================================
  const frontier = {
    id: 'space', name: 'Final Frontier', music: 'space',
    blurb: 'A single flat stage drifting through deep space. No platforms, no excuses.',
    blast: { left: -1180, right: 1180, top: -950, bottom: 700 },
    cam: { left: -950, right: 950, top: -700, bottom: 420 },
    solids: [
      { x: -460, y: 0, w: 920, h: 48, ledges: true },
      { x: -380, y: 48, w: 760, h: 60 },
    ],
    plats: [],
    back(ctx, cam, W, H, t, st) {
      const sky = cached(st, 'sky', 1280, 720, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#05020f');
        g.addColorStop(0.5, '#120a2e');
        g.addColorStop(1, '#06121f');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        const neb = (x, y, r, col) => {
          const n = c.createRadialGradient(x, y, 0, x, y, r);
          n.addColorStop(0, col);
          n.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = n;
          c.fillRect(0, 0, w, h);
        };
        neb(w * 0.25, h * 0.35, w * 0.4, 'rgba(160,60,200,0.35)');
        neb(w * 0.7, h * 0.25, w * 0.3, 'rgba(40,160,220,0.28)');
        neb(w * 0.55, h * 0.7, w * 0.35, 'rgba(220,70,140,0.22)');
        const r = SB.seeded(5);
        for (let i = 0; i < 500; i++) {
          const s = r();
          c.globalAlpha = 0.3 + r() * 0.7;
          c.fillStyle = s > 0.9 ? '#aee3ff' : s > 0.8 ? '#ffd7a8' : '#ffffff';
          const z = s > 0.97 ? 2.2 : s > 0.8 ? 1.5 : 1;
          c.fillRect(r() * w, r() * h, z, z);
        }
        c.globalAlpha = 1;
        // Galaxy
        c.save();
        c.translate(w * 0.18, h * 0.22);
        c.rotate(-0.4);
        for (let i = 0; i < 400; i++) {
          const a = r() * TAU * 2;
          const d = (a / (TAU * 2)) * 70 + r() * 8;
          c.fillStyle = `rgba(220,200,255,${0.25 + r() * 0.4})`;
          c.fillRect(Math.cos(a) * d * 1.8, Math.sin(a) * d * 0.6, 1.3, 1.3);
        }
        const core = c.createRadialGradient(0, 0, 0, 0, 0, 30);
        core.addColorStop(0, 'rgba(255,240,255,0.9)');
        core.addColorStop(1, 'rgba(255,240,255,0)');
        c.fillStyle = core;
        c.fillRect(-30, -30, 60, 60);
        c.restore();
      });
      ctx.drawImage(sky, 0, 0, W, H);
      // Twinkling stars
      const r = SB.seeded(77);
      for (let i = 0; i < 40; i++) {
        const x = r() * W;
        const y = r() * H;
        const a = 0.5 + Math.sin(t * 0.05 + i * 1.7) * 0.5;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.fillRect(x - 4, y - 0.5, 8, 1);
        ctx.fillRect(x - 0.5, y - 4, 1, 8);
      }
      ctx.globalAlpha = 1;
      // Planet with rings
      const px = W * 0.78 - cam.x * 0.03;
      const py = H * 0.62 - cam.y * 0.03;
      const pr = H * 0.26;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.25);
      ctx.strokeStyle = 'rgba(220,190,255,0.35)';
      ctx.lineWidth = pr * 0.08;
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 1.8, pr * 0.35, 0, Math.PI, TAU);
      ctx.stroke();
      let g = ctx.createRadialGradient(-pr * 0.4, -pr * 0.4, pr * 0.1, 0, 0, pr);
      g.addColorStop(0, '#f2a3ff');
      g.addColorStop(0.5, '#7b3fb8');
      g.addColorStop(1, '#1c0b3a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffd0ff';
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(-pr, i * pr * 0.22, pr * 2, pr * 0.05);
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, TAU);
      ctx.strokeStyle = 'rgba(255,200,255,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,200,255,0.6)';
      ctx.lineWidth = pr * 0.08;
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 1.8, pr * 0.35, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
      // Drifting asteroids
      const ar = SB.seeded(9);
      for (let i = 0; i < 6; i++) {
        const sp = 0.2 + ar() * 0.3;
        const x = ((ar() * W * 1.4 + t * sp) % (W * 1.4)) - W * 0.2 - cam.x * 0.08;
        const y = ar() * H * 0.8 - cam.y * 0.05;
        const s = 6 + ar() * 16;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.01 * sp + i);
        ctx.fillStyle = '#3b3550';
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU;
          const rr = s * (0.7 + ((k * 37 + i * 11) % 10) / 30);
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(180,160,220,0.35)';
        ctx.beginPath();
        ctx.arc(-s * 0.2, -s * 0.2, s * 0.35, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      void g;
    },
    body(ctx, t) {
      // Underside hull
      let g = ctx.createLinearGradient(0, 48, 0, 260);
      g.addColorStop(0, '#2b2f45');
      g.addColorStop(1, '#0d0f1c');
      underside(ctx, -380, 380, 48, 210, g, '#4a5275');
      // Energy core
      const pulse = 0.6 + Math.sin(t * 0.06) * 0.4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createRadialGradient(0, 150, 0, 0, 150, 110);
      g.addColorStop(0, `rgba(80,255,240,${0.7 * pulse})`);
      g.addColorStop(0.3, `rgba(80,180,255,${0.35 * pulse})`);
      g.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-110, 40, 220, 220);
      ctx.restore();
      ctx.fillStyle = '#c8fff8';
      ctx.beginPath();
      ctx.arc(0, 150, 12, 0, TAU);
      ctx.fill();
      // Hull lines (clipped to the hull shape)
      ctx.save();
      underside(ctx, -380, 380, 48, 210, 'rgba(0,0,0,0)', null);
      ctx.clip();
      ctx.strokeStyle = 'rgba(120,200,255,0.45)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(-380, 48 + i * 22);
        ctx.lineTo(380, 48 + i * 22);
        ctx.stroke();
      }
      ctx.restore();
      // Main deck
      g = ctx.createLinearGradient(0, 0, 0, 48);
      g.addColorStop(0, '#5b6285');
      g.addColorStop(0.1, '#3a3f5c');
      g.addColorStop(1, '#1c1f33');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-460, 0);
      ctx.lineTo(460, 0);
      ctx.lineTo(450, 48);
      ctx.lineTo(-450, 48);
      ctx.closePath();
      ctx.fill();
      // Neon edge
      ctx.save();
      ctx.shadowColor = '#5ef2ff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#9ffbff';
      ctx.fillRect(-460, -2, 920, 3);
      ctx.restore();
      // Deck panels
      ctx.fillStyle = 'rgba(160,220,255,0.12)';
      for (let x = -440; x < 440; x += 80) ctx.fillRect(x, 10, 60, 4);
      // Running lights
      for (let i = 0; i < 12; i++) {
        const x = -440 + i * 80;
        const on = (Math.floor(t / 6) + i) % 12 < 3;
        ctx.fillStyle = on ? '#7dfcff' : '#27466b';
        ctx.fillRect(x, 32, 14, 4);
      }
    },
    plat() {},
  };

  // ====================================================================
  // VOLCANO KEEP
  // ====================================================================
  const volcano = {
    id: 'volcano', name: 'Volcano Keep', music: 'volcano',
    blurb: 'An obsidian fortress over a lava sea. The centre platform rises and falls.',
    blast: { left: -1120, right: 1120, top: -950, bottom: 680 },
    cam: { left: -880, right: 880, top: -700, bottom: 400 },
    solids: [
      { x: -390, y: 0, w: 780, h: 50, ledges: true },
      { x: -300, y: 50, w: 600, h: 70 },
    ],
    plats: [
      { x1: -310, x2: -160, y: -120 },
      { x1: 160, x2: 310, y: -120 },
      { x1: -80, x2: 80, y: -210, move: { period: 420, ay: 60 } },
    ],
    respawnY: -330,
    back(ctx, cam, W, H, t, st) {
      const sky = cached(st, 'sky', 1280, 720, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#12040a');
        g.addColorStop(0.45, '#4a0f12');
        g.addColorStop(0.75, '#a3300f');
        g.addColorStop(1, '#ff7a1a');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      });
      ctx.drawImage(sky, 0, 0, W, H);
      const vol = cached(st, 'volcano', 1600, 900, (c, w, h) => {
        const r = SB.seeded(8);
        c.fillStyle = '#2a0c0c';
        mountainPath(c, r, w, h * 0.72, 60, 40);
        c.fill();
        // Big volcano
        c.fillStyle = '#1a0707';
        c.beginPath();
        c.moveTo(w * 0.2, h);
        c.lineTo(w * 0.45, h * 0.36);
        c.lineTo(w * 0.55, h * 0.36);
        c.lineTo(w * 0.85, h);
        c.closePath();
        c.fill();
        // Lava streams
        c.strokeStyle = '#ff6a1a';
        c.lineWidth = 4;
        for (let i = 0; i < 5; i++) {
          c.beginPath();
          let x = w * (0.46 + i * 0.02);
          let y = h * 0.37;
          c.moveTo(x, y);
          for (let k = 0; k < 12; k++) {
            x += (r() - 0.5) * 30 + (i - 2) * 6;
            y += h * 0.05;
            c.lineTo(x, y);
          }
          c.stroke();
        }
        const glow = c.createRadialGradient(w * 0.5, h * 0.36, 0, w * 0.5, h * 0.36, 160);
        glow.addColorStop(0, 'rgba(255,190,80,0.9)');
        glow.addColorStop(1, 'rgba(255,90,20,0)');
        c.fillStyle = glow;
        c.fillRect(0, 0, w, h);
      });
      parallax(ctx, vol, cam, W, H, 0.18, 0);
      // Smoke plume
      const vx = W / 2 - cam.x * 0.045;
      const vy = H * 0.3 - cam.y * 0.036;
      for (let i = 0; i < 10; i++) {
        const k = ((t * 0.4 + i * 40) % 400) / 400;
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.fillStyle = '#2b1515';
        ctx.beginPath();
        ctx.arc(vx + Math.sin(i * 2 + t * 0.01) * 30 * k + k * 80, vy - k * H * 0.4, 30 + k * 90, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Embers
      const r = SB.seeded(31);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 60; i++) {
        const sp = 0.5 + r() * 1.5;
        const x = (r() * W + Math.sin(t * 0.02 + i) * 20 - cam.x * 0.1 + W) % W;
        const y = H - ((r() * H + t * sp) % (H * 1.1));
        ctx.fillStyle = `rgba(255,${120 + Math.floor(r() * 100)},40,${0.4 + r() * 0.5})`;
        ctx.fillRect(x, y, 2.5, 2.5);
      }
      ctx.restore();
    },
    body(ctx, t) {
      // Chains holding the side platforms
      ctx.strokeStyle = '#3a2a2a';
      ctx.lineWidth = 3;
      for (const x of [-300, -170, 170, 300]) {
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x, -120);
        ctx.lineTo(x, -700);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      let g = ctx.createLinearGradient(0, 50, 0, 280);
      g.addColorStop(0, '#2a1a1e');
      g.addColorStop(1, '#0c0608');
      underside(ctx, -300, 300, 50, 230, g, null);
      // Lava cracks
      const pulse = 0.6 + Math.sin(t * 0.07) * 0.4;
      ctx.save();
      ctx.shadowColor = '#ff5a00';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(255,${110 + pulse * 60},20,${0.6 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      const r = SB.seeded(4);
      for (let i = 0; i < 7; i++) {
        let x = -260 + i * 85;
        let y = 55;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (r() - 0.5) * 30;
          y += 25 + r() * 10;
          if (Math.abs(x) > 300 - (y - 50) * 0.8) break;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      // Deck
      g = ctx.createLinearGradient(0, 0, 0, 50);
      g.addColorStop(0, '#4a3a40');
      g.addColorStop(0.15, '#2c2226');
      g.addColorStop(1, '#161013');
      ctx.fillStyle = g;
      ctx.fillRect(-390, 0, 780, 50);
      ctx.fillStyle = '#5c4a50';
      ctx.fillRect(-390, -2, 780, 4);
      // Battlements
      ctx.fillStyle = '#231a1d';
      for (let x = -380; x < 380; x += 50) ctx.fillRect(x, 16, 26, 20);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let x = -380; x < 380; x += 50) {
        const gg = ctx.createLinearGradient(0, 16, 0, 36);
        gg.addColorStop(0, `rgba(255,120,30,${0.25 + pulse * 0.25})`);
        gg.addColorStop(1, 'rgba(255,60,10,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(x + 3, 18, 20, 16);
      }
      ctx.restore();
      // Torches on the stage corners
      for (const x of [-370, 370]) {
        ctx.fillStyle = '#2d2226';
        ctx.fillRect(x - 5, -40, 10, 40);
        const f = Math.sin(t * 0.3 + x) * 3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(x, -50, 0, x, -50, 40 + f);
        gg.addColorStop(0, 'rgba(255,230,140,0.95)');
        gg.addColorStop(0.3, 'rgba(255,120,30,0.6)');
        gg.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(x - 45, -95, 90, 90);
        ctx.restore();
      }
    },
    plat(ctx, p, t) {
      const w = p.x2 - p.x1;
      const moving = !!p.move;
      const g = ctx.createLinearGradient(0, p.y, 0, p.y + 16);
      g.addColorStop(0, moving ? '#6b5a4a' : '#4d3f45');
      g.addColorStop(1, '#1b1316');
      ctx.fillStyle = g;
      ctx.fillRect(p.x1, p.y, w, 14);
      ctx.fillStyle = moving ? '#c2a15a' : '#6a5a60';
      ctx.fillRect(p.x1, p.y - 2, w, 3);
      if (moving) {
        // Glowing magma engine
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = p.x1 + w / 2;
        const gg = ctx.createRadialGradient(cx, p.y + 20, 0, cx, p.y + 20, 40);
        gg.addColorStop(0, 'rgba(255,170,60,0.9)');
        gg.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(cx - 40, p.y, 80, 70);
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.08 + i / 3) % 1);
          ctx.fillStyle = `rgba(255,160,40,${1 - k})`;
          ctx.beginPath();
          ctx.arc(cx + (i - 1) * 16, p.y + 16 + k * 40, 5 * (1 - k) + 1, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    },
    front(ctx, cam, W, H, t) {
      // Lava sea: fixed in world at y ~ 560, so it rises into view when the camera looks down.
      const z = cam.zoom * (H / 720);
      const sy = H / 2 + (560 - cam.y) * z;
      if (sy > H + 40) return;
      ctx.save();
      const g = ctx.createLinearGradient(0, sy - 20, 0, H);
      g.addColorStop(0, '#ffd166');
      g.addColorStop(0.08, '#ff7b00');
      g.addColorStop(0.5, '#c2210c');
      g.addColorStop(1, '#4a0505');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, sy + Math.sin(x * 0.02 + t * 0.05) * 6 * z + Math.sin(x * 0.05 - t * 0.08) * 3 * z);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      const gl = ctx.createLinearGradient(0, sy - 120 * z, 0, sy);
      gl.addColorStop(0, 'rgba(255,90,0,0)');
      gl.addColorStop(1, 'rgba(255,120,20,0.35)');
      ctx.fillStyle = gl;
      ctx.fillRect(0, sy - 120 * z, W, 120 * z);
      ctx.restore();
    },
  };

  // ====================================================================
  // NEON SKYDECK
  // ====================================================================
  const neon = {
    id: 'city', name: 'Neon Skydeck', music: 'city',
    blurb: 'A hover-deck cruising above a sleepless city. A shuttle platform glides across.',
    blast: { left: -1150, right: 1150, top: -950, bottom: 700 },
    cam: { left: -900, right: 900, top: -700, bottom: 420 },
    solids: [
      { x: -420, y: 0, w: 840, h: 46, ledges: true },
      { x: -330, y: 46, w: 660, h: 50 },
    ],
    plats: [
      { x1: -95, x2: 95, y: -165, move: { period: 520, ax: 230 } },
      { x1: -330, x2: -200, y: -95 },
      { x1: 200, x2: 330, y: -95 },
    ],
    back(ctx, cam, W, H, t, st) {
      const sky = cached(st, 'sky', 1280, 720, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#070b1f');
        g.addColorStop(0.5, '#23164a');
        g.addColorStop(0.85, '#6b2463');
        g.addColorStop(1, '#ff5f8f');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        const r = SB.seeded(12);
        for (let i = 0; i < 150; i++) {
          c.globalAlpha = r() * 0.8;
          c.fillStyle = '#ffffff';
          c.fillRect(r() * w, r() * h * 0.55, 1.4, 1.4);
        }
        c.globalAlpha = 1;
        // moon
        const mg = c.createRadialGradient(w * 0.2, h * 0.2, 0, w * 0.2, h * 0.2, 120);
        mg.addColorStop(0, 'rgba(255,240,255,0.5)');
        mg.addColorStop(1, 'rgba(255,240,255,0)');
        c.fillStyle = mg;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#fdf1ff';
        c.beginPath();
        c.arc(w * 0.2, h * 0.2, 44, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(200,170,220,0.45)';
        c.beginPath();
        c.arc(w * 0.2 + 12, h * 0.2 - 8, 9, 0, TAU);
        c.arc(w * 0.2 - 14, h * 0.2 + 12, 6, 0, TAU);
        c.fill();
      });
      ctx.drawImage(sky, 0, 0, W, H);
      // Searchlights
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const bx = W * (0.25 + i * 0.25) - cam.x * 0.05;
        const a = -Math.PI / 2 + Math.sin(t * 0.008 + i * 2) * 0.6;
        const g = ctx.createLinearGradient(bx, H, bx + Math.cos(a) * H, H + Math.sin(a) * H);
        g.addColorStop(0, 'rgba(160,200,255,0.18)');
        g.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx, H);
        ctx.lineTo(bx + Math.cos(a - 0.06) * H * 1.3, H + Math.sin(a - 0.06) * H * 1.3);
        ctx.lineTo(bx + Math.cos(a + 0.06) * H * 1.3, H + Math.sin(a + 0.06) * H * 1.3);
        ctx.fill();
      }
      ctx.restore();
      const layer = (key, seed, col, winCol, baseY, minH, maxH, bw, depth) => {
        const img = cached(st, key, 1800, 900, (c, w, h) => {
          const r = SB.seeded(seed);
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
                if (r() < 0.38) {
                  c.fillStyle = r() < 0.15 ? '#ff7ad9' : winCol;
                  c.globalAlpha = 0.5 + r() * 0.5;
                  c.fillRect(wx, wy, 4, 6);
                }
              }
            }
            c.globalAlpha = 1;
            if (r() < 0.25) {
              c.fillStyle = SB.pick(['#ff3fa4', '#35f2ff', '#b6ff3b', '#ffcc33']);
              c.fillRect(x + 6, top + 14, bwid - 12, 10);
            }
            x += bwid + 4 + r() * 10;
          }
        });
        parallax(ctx, img, cam, W, H, depth, 0);
      };
      layer('far', 2, '#1a1438', '#ffd98a', 700, 120, 420, 60, 0.12);
      layer('mid', 3, '#120e27', '#ffe7b0', 800, 100, 360, 80, 0.25);
      // Flying cars
      for (let i = 0; i < 5; i++) {
        const dir = i % 2 ? 1 : -1;
        const x = ((t * (1.5 + i * 0.4) * dir + i * 400) % (W + 200) + W + 200) % (W + 200) - 100;
        const y = H * (0.45 + i * 0.07) - cam.y * 0.1;
        ctx.fillStyle = i % 2 ? '#ff4fa3' : '#4ff3ff';
        ctx.fillRect(x, y, 14, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(x + (dir > 0 ? 12 : 0), y, 3, 3);
      }
    },
    body(ctx, t) {
      // Thruster glow
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const x of [-220, 0, 220]) {
        const f = 1 + Math.sin(t * 0.4 + x) * 0.15;
        const g = ctx.createLinearGradient(0, 96, 0, 230);
        g.addColorStop(0, 'rgba(120,230,255,0.9)');
        g.addColorStop(1, 'rgba(120,120,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 26, 96);
        ctx.lineTo(x + 26, 96);
        ctx.lineTo(x + 8, 96 + 130 * f);
        ctx.lineTo(x - 8, 96 + 130 * f);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      let g = ctx.createLinearGradient(0, 46, 0, 110);
      g.addColorStop(0, '#2d2f4a');
      g.addColorStop(1, '#141527');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-330, 46);
      ctx.lineTo(330, 46);
      ctx.lineTo(300, 96);
      ctx.lineTo(-300, 96);
      ctx.closePath();
      ctx.fill();
      for (const x of [-220, 0, 220]) {
        ctx.fillStyle = '#3d4263';
        ctx.fillRect(x - 28, 90, 56, 12);
      }
      g = ctx.createLinearGradient(0, 0, 0, 46);
      g.addColorStop(0, '#4b4f73');
      g.addColorStop(0.12, '#303455');
      g.addColorStop(1, '#1d1f36');
      ctx.fillStyle = g;
      ctx.fillRect(-420, 0, 840, 46);
      // Helipad marking
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 22, 90, 12, 0, 0, TAU);
      ctx.stroke();
      // Neon strips cycling colour
      const hue = (t * 0.6) % 360;
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = `hsl(${hue},100%,60%)`;
      ctx.fillStyle = `hsl(${hue},100%,70%)`;
      ctx.fillRect(-420, -2, 840, 3);
      ctx.shadowColor = `hsl(${(hue + 180) % 360},100%,60%)`;
      ctx.fillStyle = `hsl(${(hue + 180) % 360},100%,65%)`;
      ctx.fillRect(-420, 40, 840, 3);
      ctx.restore();
      // Billboard frame behind stage
      ctx.fillStyle = '#1b1b2e';
      ctx.fillRect(-6, -60, 12, 60);
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
  };

  const STAGES = [skyTemple, frontier, volcano, neon];
  SB.STAGES = STAGES;
  SB.Stage = Stage;
  SB.stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
})();
