// Renders a Match: parallax stage, fighters, effects, HUD and overlays.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const W = SB.W;
  const H = SB.H;
  const FONT = '"Segoe UI", "Trebuchet MS", Arial, sans-serif';

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
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    return vignette;
  }

  function text(ctx, str, x, y, size, color, align = 'center', stroke = '#111', weight = 900, sw) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = sw || Math.max(3, size * 0.16);
      ctx.strokeStyle = stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // Big stylised banner text with gradient + extrusion.
  function banner(ctx, str, x, y, size, c1, c2, scale = 1, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.font = `italic 900 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 8; i > 0; i--) {
      ctx.fillStyle = SB.shade(c2, -0.5);
      ctx.fillText(str, i * 0.8, i * 1.2);
    }
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = '#140d20';
    ctx.strokeText(str, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  function render(ctx, m) {
    const cam = m.cam;
    const z = cam.zoom * (1 + m.punch);
    const camView = { x: cam.x, y: cam.y, zoom: z };
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

    m.stage.drawFront(ctx, camView, W, H);
    ctx.drawImage(getVignette(), 0, 0);
    drawOffscreen(ctx, m, z);
    drawHUD(ctx, m);
    if (m.flashAmt > 0) {
      ctx.fillStyle = `rgba(255,255,255,${m.flashAmt})`;
      ctx.fillRect(0, 0, W, H);
    }
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
      const by = SB.clamp(sy, 56, H - 150);
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

  function drawHUD(ctx, m) {
    const n = m.fighters.length;
    const pw = 230;
    const gap = 18;
    const total = n * pw + (n - 1) * gap;
    let x = W / 2 - total / 2;
    const y = H - 104;
    for (const f of m.fighters) {
      drawPanel(ctx, f, x, y, pw, m);
      x += pw + gap;
    }

    // Timer
    if (m.mode === 'time') {
      const s = Math.max(0, Math.ceil(m.timeLeft / 60));
      const str = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      const warn = s <= 10;
      text(ctx, str, W / 2, 52, warn ? 44 + Math.sin(m.frame * 0.3) * 4 : 40, warn ? '#ff5a5a' : '#ffffff');
    }
    if (m.training) {
      text(ctx, 'TRAINING', 24, 40, 26, '#8ff8ff', 'left');
      text(ctx, 'R: reset   Esc: pause', 24, 64, 15, '#dfe7ff', 'left', '#111', 700);
      for (const f of m.fighters) {
        if (f.combo > 1 && f.comboBy && (f.hitstun > 0 || f.state === 'grabbed') ) {
          text(ctx, f.combo + ' HIT COMBO', W - 30, 60, 30, '#ffe066', 'right');
        }
      }
    }

    // Countdown
    if (m.phase === 'countdown') {
      const k = Math.floor(m.phaseT / 60);
      const u = (m.phaseT % 60) / 60;
      const labels = ['3', '2', '1'];
      if (k < 3) banner(ctx, labels[k], W / 2, H / 2 - 30, 190, '#ffe066', '#ff7a1a', 1.6 - SB.easeOut(Math.min(1, u * 2)) * 0.6);
    } else if (m.phase === 'play' && m.phaseT < 50) {
      const u = m.phaseT / 50;
      ctx.globalAlpha = 1 - SB.easeIn(u);
      banner(ctx, 'GO!', W / 2, H / 2 - 30, 200, '#fff27a', '#ff3d3d', 1 + u * 0.4);
      ctx.globalAlpha = 1;
    }
    if (m.phase === 'ending') {
      const u = Math.min(1, m.phaseT / 20);
      banner(ctx, m.timeUp ? 'TIME!' : 'GAME!', W / 2, H / 2 - 40, 170, '#ffffff', '#ff4d5e', 2 - SB.easeOut(u), -0.06);
    }
    if (m.announce) {
      const a = m.announce;
      const u = 1 - a.t / 90;
      const slide = u < 0.15 ? (1 - u / 0.15) * W : u > 0.85 ? -((u - 0.85) / 0.15) * W : 0;
      ctx.save();
      ctx.translate(slide, 0);
      ctx.fillStyle = 'rgba(10,5,25,0.8)';
      ctx.fillRect(0, H * 0.28, W, 110);
      ctx.fillStyle = a.color;
      ctx.fillRect(0, H * 0.28, W, 4);
      ctx.fillRect(0, H * 0.28 + 106, W, 4);
      text(ctx, a.sub, W / 2, H * 0.28 + 34, 22, a.color);
      banner(ctx, a.text, W / 2, H * 0.28 + 72, 54, '#ffffff', a.color);
      ctx.restore();
    }
  }

  function drawPanel(ctx, f, x, y, w, m) {
    const h = 88;
    ctx.save();
    const shake = f.flash > 0 ? f.flash * 0.6 : 0;
    const out = f.out;
    ctx.globalAlpha = out ? 0.45 : 1;
    // Panel body
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, SB.rgba(f.color, 0.95));
    g.addColorStop(1, SB.rgba(SB.shade(f.color, -0.55), 0.95));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 18, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - 18, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#140d20';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(x + 18, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - 4, y + 18);
    ctx.lineTo(x + 12, y + 18);
    ctx.closePath();
    ctx.fill();
    // Portrait
    const px = x + 50;
    const py = y + 42;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 36, 0, TAU);
    ctx.fillStyle = 'rgba(10,8,20,0.6)';
    ctx.fill();
    ctx.clip();
    ctx.drawImage(SB.FighterRenderer.portrait(f.def, f.palIndex, 96), px - 40, py - 40, 80, 80);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(px, py, 36, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#140d20';
    ctx.stroke();
    // Name + tag
    text(ctx, f.def.name, x + 94, y + 20, 15, '#ffffff', 'left', '#140d20', 900, 4);
    text(ctx, f.tag, x + w - 16, y + 20, 14, '#ffffff', 'right', '#140d20', 900, 4);
    // Damage
    if (!out) {
      const d = Math.floor(f.damage);
      const col = damageColor(f.damage);
      const dx = shake ? SB.rand(-shake, shake) : 0;
      const dy = shake ? SB.rand(-shake, shake) : 0;
      if (f.state === 'dead') text(ctx, '---', x + w - 26 + dx, y + 64 + dy, 36, '#ffffff', 'right');
      else {
        ctx.font = `italic 900 46px ${FONT}`;
        const pctW = ctx.measureText('%').width * 0.5;
        text(ctx, String(d), x + w - 34 - pctW + dx, y + 66 + dy, 46, col, 'right', '#140d20', 900, 7);
        text(ctx, '%', x + w - 24 + dx, y + 66 + dy, 24, col, 'right', '#140d20', 900, 5);
      }
    } else text(ctx, 'OUT', x + w - 26, y + 64, 34, '#dddddd', 'right');
    // Stocks / score
    if (m.mode === 'stock') {
      const s = Math.max(0, f.stocks);
      if (s <= 5) {
        for (let i = 0; i < s; i++) {
          const sx = x + 98 + i * 17;
          ctx.beginPath();
          ctx.arc(sx, y + 78, 7, 0, TAU);
          ctx.fillStyle = f.pal.main;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
      } else text(ctx, '● x' + s, x + 94, y + 84, 16, '#ffffff', 'left');
    } else if (m.mode === 'time') {
      text(ctx, (f.score >= 0 ? '+' : '') + f.score, x + 94, y + 84, 18, '#ffffff', 'left');
    }
    if (f.finalReady) {
      const hue = (m.frame * 8) % 360;
      text(ctx, 'FINAL!', x + 94, y + 44, 14, `hsl(${hue},100%,70%)`, 'left');
    }
    ctx.restore();
  }

  SB.GameRenderer = { render, text, banner, damageColor, FONT };
})();
