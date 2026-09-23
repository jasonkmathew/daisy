// Renders a Match: parallax stage, fighters, effects, bloom, anime impact
// frames and a Brawlhalla-style HUD.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const W = SB.W;
  const H = SB.H;
  const FONT = SB.FONT_UI;
  const DISPLAY = SB.FONT_DISPLAY;

  function damageColor(d) {
    const stops = [[0, '#ffffff'], [40, '#fff3b0'], [80, '#ffc233'], [120, '#ff7a1a'], [170, '#ff2e2e'], [250, '#a30015']];
    for (let i = 1; i < stops.length; i++) {
      if (d <= stops[i][0]) return SB.mix(stops[i - 1][1], stops[i][1], (d - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    }
    return stops[stops.length - 1][1];
  }

  let vignette = null;
  function getVignette() {
    if (vignette) return vignette;
    vignette = SB.makeCanvas(W, H);
    const c = vignette.getContext('2d');
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,0,25,0.5)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    return vignette;
  }

  function text(ctx, str, x, y, size, color, align = 'center', stroke = '#111', weight = 400, sw) {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = sw || Math.max(3, size * 0.18);
      ctx.strokeStyle = stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    void weight;
  }

  // Anime/comic banner text: gradient fill, thick outline, drop extrusion.
  function banner(ctx, str, x, y, size, c1, c2, scale = 1, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.font = `${size}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 7; i > 0; i--) {
      ctx.fillStyle = SB.shade(c2, -0.55);
      ctx.fillText(str, i * 0.9, i * 1.3);
    }
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#140d20';
    ctx.strokeText(str, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillText(str, 0, 0);
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeText(str, 0, -size * 0.02);
    ctx.restore();
  }

  // Anime focus lines: thin wedges converging on a point.
  function focusLines(ctx, cx, cy, color, alpha, seed) {
    const r = SB.seeded(seed);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    const R = Math.hypot(W, H);
    for (let i = 0; i < 90; i++) {
      const a = r() * TAU;
      const w = 0.004 + r() * 0.012;
      const inner = 180 + r() * 160;
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
      ctx.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
    }
    ctx.fill();
    ctx.restore();
  }

  let blurCanvas = null;
  let glowCanvas = null;
  function worldTransform(c, m, z, k) {
    c.setTransform(k, 0, 0, k, 0, 0);
    c.translate(W / 2 + m.cam.sx, H / 2 + m.cam.sy);
    c.scale(z, z);
    c.translate(-m.cam.x, -m.cam.y);
  }

  function render(ctx, m) {
    const cam = m.cam;
    const z = cam.zoom * (1 + m.punch);
    const camView = { x: cam.x, y: cam.y, zoom: z };
    const base = ctx.getTransform();
    m.stage.drawBack(ctx, camView, W, H);

    ctx.save();
    ctx.translate(W / 2 + cam.sx, H / 2 + cam.sy);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    m.stage.drawStage(ctx);
    ctx.restore();

    if (m.dim > 0.01) {
      ctx.fillStyle = `rgba(5,0,15,${m.dim})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    ctx.translate(W / 2 + cam.sx, H / 2 + cam.sy);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);
    m.fx.draw(ctx, false);
    for (const it of m.items) if (!it.holder) it.draw(ctx);
    for (const p of m.projectiles) p.draw(ctx);
    const order = [...m.fighters].sort((a, b) => (a.state === 'move') - (b.state === 'move'));
    for (const f of order) SB.FighterRenderer.drawFighter(ctx, f, m);
    for (const it of m.items) if (it.holder) it.draw(ctx);
    for (const fs of m.finals) fs.draw(ctx);
    m.fx.draw(ctx, true);
    if (SB.settings.hitboxes) drawDebug(ctx, m);
    ctx.restore();

    // Bloom: re-draw the glowing layers at quarter resolution, blur that
    // small buffer (cheap) and add it back upscaled.
    if (SB.settings.bloom !== false) {
      const BW = W / 4;
      const BH = H / 4;
      if (!glowCanvas) {
        glowCanvas = SB.makeCanvas(BW, BH);
        blurCanvas = SB.makeCanvas(BW, BH);
      }
      const g = glowCanvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, BW, BH);
      worldTransform(g, m, z, 0.25);
      for (const p of m.projectiles) p.draw(g);
      for (const fs of m.finals) fs.draw(g);
      m.fx.draw(g, true);
      for (const it of m.items) if (it.type !== 'bomb') it.draw(g);
      const b = blurCanvas.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, BW, BH);
      b.filter = 'blur(2px)';
      b.drawImage(glowCanvas, 0, 0);
      b.filter = 'none';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      b.globalCompositeOperation = 'lighter';
      b.globalAlpha = 0.4;
      b.drawImage(glowCanvas, 0, 0);
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(blurCanvas, 0, 0, W, H);
      ctx.restore();
    }

    m.stage.drawFront(ctx, camView, W, H);
    ctx.drawImage(getVignette(), 0, 0);

    // Final smash / big launches: white focus lines.
    if (m.finals.length) focusLines(ctx, W / 2, H / 2, '#ffffff', 0.12 + Math.sin(m.frame * 0.5) * 0.04, m.frame >> 1);

    // Impact frames: inverted flash, then high-contrast focus lines.
    if (m.impact > 0 && SB.settings.impactFrames !== false) {
      const p = m.impactAt || { x: cam.x, y: cam.y };
      const sx = W / 2 + (p.x - cam.x) * z;
      const sy = H / 2 + (p.y - cam.y) * z;
      if (m.impact > 3) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        focusLines(ctx, sx, sy, '#000000', 0.55, m.impact);
      } else {
        ctx.fillStyle = 'rgba(20,0,10,0.25)';
        ctx.fillRect(0, 0, W, H);
        focusLines(ctx, sx, sy, '#ffffff', 0.35, m.impact);
      }
    }

    drawOffscreen(ctx, m, z);
    drawHUD(ctx, m);
    if (m.flashAmt > 0) {
      ctx.fillStyle = `rgba(255,255,255,${SB.settings.impactFrames === false ? m.flashAmt * 0.3 : m.flashAmt})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.setTransform(base);
  }

  function drawDebug(ctx, m) {
    ctx.lineWidth = 1.5;
    for (const f of m.fighters) {
      if (!f.isAlive()) continue;
      const b = f.hurtbox();
      ctx.strokeStyle = f.intangible() ? 'rgba(80,160,255,0.9)' : 'rgba(255,230,0,0.9)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      for (const hb of m.hitboxesOf(f)) {
        ctx.fillStyle = hb.h.grab ? 'rgba(160,80,255,0.45)' : 'rgba(255,40,40,0.45)';
        ctx.beginPath();
        ctx.arc(hb.x, hb.y, hb.r, 0, TAU);
        ctx.fill();
      }
    }
    for (const p of m.projectiles) {
      for (const hb of p.hitboxes()) {
        ctx.fillStyle = 'rgba(255,40,40,0.35)';
        if (hb.rect) ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
        else {
          ctx.beginPath();
          ctx.arc(hb.x, hb.y, hb.r, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = 'rgba(255,0,0,0.6)';
    const b = m.stage.blast;
    ctx.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    for (const L of m.stage.ledges) {
      ctx.fillStyle = L.owner ? '#ff00ff' : '#00ff88';
      ctx.fillRect(L.x - 4, L.y - 4, 8, 8);
    }
  }

  function drawOffscreen(ctx, m, z) {
    for (const f of m.fighters) {
      if (!f.isAlive() || f.state === 'respawn') continue;
      const sx = W / 2 + (f.x - m.cam.x) * z;
      const sy = H / 2 + (f.y - f.h / 2 - m.cam.y) * z;
      const pad = 10;
      if (sx > -pad && sx < W + pad && sy > -pad && sy < H + pad) continue;
      const bx = SB.clamp(sx, 56, W - 56);
      const by = SB.clamp(sy, 150, H - 56);
      const dist = Math.hypot(sx - bx, sy - by);
      const r = SB.clamp(44 - dist * 0.02, 26, 44);
      const ang = Math.atan2(sy - by, sx - bx);
      ctx.save();
      ctx.translate(bx, by);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * (r + 14), Math.sin(ang) * (r + 14));
      ctx.lineTo(Math.cos(ang + 0.45) * r, Math.sin(ang + 0.45) * r);
      ctx.lineTo(Math.cos(ang - 0.45) * r, Math.sin(ang - 0.45) * r);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fillStyle = 'rgba(15,12,30,0.85)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = f.color;
      ctx.stroke();
      ctx.clip();
      const img = SB.FighterRenderer.portrait(f.def, f.palIndex, 96);
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ HUD
  function drawHUD(ctx, m) {
    const n = m.fighters.length;
    const size = 70;
    const gap = 26;
    let x = W - 30 - size / 2 - (n - 1) * (size + gap);
    for (const f of m.fighters) {
      drawPortrait(ctx, f, x, 58, size, m);
      drawCombo(ctx, f, x, 58 + size / 2 + 62);
      x += size + gap;
    }

    if (m.mode === 'time') {
      const s = Math.max(0, Math.ceil(m.timeLeft / 60));
      const str = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      const warn = s <= 10;
      ctx.fillStyle = 'rgba(10,5,25,0.6)';
      SB.roundRect(ctx, W / 2 - 70, 14, 140, 52, 14);
      ctx.fill();
      banner(ctx, str, W / 2, 42, warn ? 44 + Math.sin(m.frame * 0.3) * 4 : 40, warn ? '#ff8080' : '#ffffff', warn ? '#ff2e2e' : '#9fb4ff');
    }
    if (m.training) {
      banner(ctx, 'TRAINING', 100, 36, 32, '#b6fbff', '#35c9ff');
      text(ctx, 'Backspace: reset   Esc: pause', 24, 70, 13, '#dfe7ff', 'left', '#111');
      const me = m.fighters[0];
      if (me && me.def.combos) {
        let yy = 100;
        text(ctx, 'QWER COMBOS (land each hit)', 24, yy, 13, '#ffe066', 'left', '#111');
        for (const seq in me.def.combos) {
          yy += 22;
          text(ctx, seq.split('').join(' ') + '   ' + me.def.combos[seq].name, 24, yy, 13, '#ffffff', 'left', '#111');
        }
      }
    }

    // Match intro: VS splash, then 3-2-1.
    if (m.phase === 'countdown') {
      if (m.phaseT < 95) drawVS(ctx, m);
      else {
        const k = Math.floor((m.phaseT - 95) / 52);
        const u = ((m.phaseT - 95) % 52) / 52;
        if (k < 3) banner(ctx, String(3 - k), W / 2, H / 2 - 20, 200, '#ffe066', '#ff7a1a', 1.6 - SB.easeOut(Math.min(1, u * 2)) * 0.6);
      }
    } else if (m.phase === 'play' && m.phaseT < 50) {
      const u = m.phaseT / 50;
      ctx.globalAlpha = 1 - SB.easeIn(u);
      banner(ctx, 'FIGHT!', W / 2, H / 2 - 20, 190, '#fff27a', '#ff3d3d', 1 + u * 0.4, -0.05);
      ctx.globalAlpha = 1;
    }
    if (m.phase === 'ending') {
      const u = Math.min(1, m.phaseT / 20);
      banner(ctx, m.timeUp ? 'TIME!' : 'GAME!', W / 2, H / 2 - 30, 180, '#ffffff', '#ff4d5e', 2 - SB.easeOut(u), -0.06);
    }
    if (m.announce) drawCutIn(ctx, m);
  }

  // VS splash with each fighter's portrait sliding in.
  function drawVS(ctx, m) {
    const t = m.phaseT;
    const fs = m.fighters;
    const a = t < 80 ? 1 : 1 - (t - 80) / 15;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(8,4,20,0.72)';
    ctx.fillRect(0, 0, W, H);
    focusLines(ctx, W / 2, H / 2, '#ffffff', 0.08, 3);
    const n = fs.length;
    const cw = Math.min(300, (W - 80) / n);
    fs.forEach((f, i) => {
      const u = SB.easeOut(SB.clamp((t - i * 6) / 22, 0, 1));
      const x = 40 + i * cw + cw / 2 + (i < n / 2 ? -1 : 1) * (1 - u) * 600;
      const y = H / 2 - 20;
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(1, 0, -0.12, 1, 0, 0);
      const g = ctx.createLinearGradient(0, -200, 0, 200);
      g.addColorStop(0, SB.rgba(f.color, 0.9));
      g.addColorStop(1, SB.rgba(SB.shade(f.color, -0.7), 0.95));
      ctx.fillStyle = g;
      ctx.fillRect(-cw / 2 + 8, -190, cw - 16, 380);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(-cw / 2 + 8, -190, cw - 16, 380);
      ctx.restore();
      const img = SB.FighterRenderer.portrait(f.def, f.palIndex, 256);
      ctx.drawImage(img, x - cw / 2 + 12, y - 170, cw - 24, cw - 24);
      banner(ctx, f.def.name, x, y + 120, 44, '#ffffff', f.pal.glow);
      text(ctx, f.def.title, x, y + 158, 14, f.pal.glow, 'center', '#111');
      text(ctx, f.tag, x - cw / 2 + 30, y - 160, 18, '#ffffff', 'left', '#111');
    });
    for (let i = 1; i < n; i++) {
      const x = 40 + i * cw;
      banner(ctx, 'VS', x, H / 2 - 20, 70, '#ffe066', '#ff3d3d', 1 + Math.sin(t * 0.3) * 0.05, -0.1);
    }
    ctx.restore();
  }

  // Final Smash anime cut-in: diagonal band with a big portrait.
  function drawCutIn(ctx, m) {
    const a = m.announce;
    const u = 1 - a.t / 90;
    const slide = u < 0.15 ? (1 - u / 0.15) * W : u > 0.85 ? -((u - 0.85) / 0.15) * W : 0;
    const f = a.fighter;
    ctx.save();
    ctx.translate(slide, 0);
    ctx.save();
    ctx.translate(W / 2, H * 0.4);
    ctx.rotate(-0.08);
    const g = ctx.createLinearGradient(0, -90, 0, 90);
    g.addColorStop(0, SB.rgba(SB.shade(a.color, -0.6), 0.95));
    g.addColorStop(0.5, SB.rgba(a.color, 0.95));
    g.addColorStop(1, SB.rgba(SB.shade(a.color, -0.6), 0.95));
    ctx.fillStyle = g;
    ctx.fillRect(-W, -90, W * 2, 180);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-W, -96, W * 2, 5);
    ctx.fillRect(-W, 91, W * 2, 5);
    // Speed streaks in the band
    ctx.globalAlpha = 0.3;
    const r = SB.seeded(m.frame >> 1);
    for (let i = 0; i < 18; i++) ctx.fillRect(-W + r() * W * 2, -80 + r() * 160, 120 + r() * 200, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
    if (f) {
      const img = SB.FighterRenderer.portrait(f.def, f.palIndex, 256);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, H * 0.4 - 60);
      ctx.lineTo(W, H * 0.4 - 140);
      ctx.lineTo(W, H * 0.4 + 60);
      ctx.lineTo(0, H * 0.4 + 140);
      ctx.clip();
      ctx.drawImage(img, 120, H * 0.4 - 190, 380, 380);
      ctx.restore();
    }
    text(ctx, a.sub, W * 0.68, H * 0.4 - 40, 22, '#ffffff', 'center', '#111');
    banner(ctx, a.text, W * 0.68, H * 0.4 + 18, 70, '#ffffff', a.color, 1, -0.08);
    ctx.restore();
  }

  function drawPortrait(ctx, f, x, y, size, m) {
    const r = size / 2;
    const out = f.out;
    const shake = f.flash > 0 ? f.flash * 0.7 : 0;
    const dx = shake ? SB.rand(-shake, shake) : 0;
    const dy = shake ? SB.rand(-shake, shake) : 0;
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.globalAlpha = out ? 0.45 : 1;
    // Portrait disc
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = 'rgba(15,10,30,0.85)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (out) ctx.filter = 'grayscale(1)';
    ctx.drawImage(SB.FighterRenderer.portrait(f.def, f.palIndex, 128), -r - 4, -r - 2, size + 8, size + 8);
    ctx.filter = 'none';
    ctx.restore();
    // Damage ring (Brawlhalla-style colour health)
    const dcol = damageColor(f.damage);
    ctx.save();
    ctx.shadowColor = dcol;
    ctx.shadowBlur = f.damage > 120 ? 16 : 8;
    ctx.strokeStyle = f.state === 'dead' ? '#555' : dcol;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#140d20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, TAU);
    ctx.stroke();
    if (f.finalReady) {
      ctx.strokeStyle = `hsl(${(m.frame * 8) % 360},100%,65%)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 10 + Math.sin(m.frame * 0.3) * 2, 0, TAU);
      ctx.stroke();
    }
    // Player colour tag, riding on top of the ring
    ctx.font = `900 12px ${FONT}`;
    const tw = Math.max(34, ctx.measureText(f.tag).width + 14);
    ctx.fillStyle = f.color;
    SB.roundRect(ctx, -tw / 2, -r - 16, tw, 17, 6);
    ctx.fill();
    ctx.strokeStyle = '#140d20';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, f.tag, 0, -r - 3, 12, '#ffffff', 'center', '#140d20');
    // Stocks
    if (m.mode === 'stock' && !out) {
      const s = Math.max(0, f.stocks);
      ctx.fillStyle = 'rgba(10,5,25,0.85)';
      ctx.beginPath();
      ctx.arc(-r + 4, r - 4, 14, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      text(ctx, String(s), -r + 4, r + 2, 16, '#ffffff', 'center', null);
    } else if (m.mode === 'time') {
      text(ctx, (f.score >= 0 ? '+' : '') + f.score, -r + 4, r + 4, 18, '#ffffff', 'center', '#140d20');
    }
    // Weapon icon
    if (f.weapon) {
      ctx.save();
      ctx.translate(r - 16, r - 4);
      ctx.rotate(-0.8);
      ctx.scale(0.4, 0.4);
      SB.drawWeapon(ctx, f.weapon.type, 60, f.weapon.color);
      ctx.restore();
    }
    // Damage number under the ring
    if (!out && SB.settings.showPercent !== false) {
      const d = f.state === 'dead' ? '--' : Math.floor(f.damage) + '%';
      banner(ctx, d, 0, r + 26, 26, dcol, SB.shade(dcol, -0.4));
    } else if (out) banner(ctx, 'OUT', 0, r + 26, 24, '#dddddd', '#777777');
    ctx.restore();
  }

  // Combo counter under the attacker's portrait.
  function drawCombo(ctx, f, cx, y) {
    const c = f.comboShow;
    if (!c || (!c.name && c.hits < 2)) return;
    const a = Math.min(1, c.t / 20);
    const pop = c.t > 100 ? 1 + (c.t - 100) * 0.02 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, y);
    ctx.scale(pop, pop);
    if (c.hits >= 2) {
      banner(ctx, c.hits + ' HITS', 0, 0, 30, '#fff27a', '#ff8c1a', 1, -0.06);
      text(ctx, Math.round(c.dmg) + '%', 0, 24, 13, '#ffffff', 'center', '#140d20');
    }
    if (c.name) banner(ctx, c.name + '!', 0, c.hits >= 2 ? 48 : 0, 22, '#ffffff', f.pal.glow, 1, -0.06);
    ctx.restore();
  }

  SB.GameRenderer = { render, text, banner, damageColor, focusLines, FONT, DISPLAY };
})();
