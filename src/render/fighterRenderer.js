// Anime-style fighter renderer.
//
// Characters are drawn from the skeletal rig with cel shading (two-tone
// shadows + rim highlights), coloured line art, 3/4-view anime faces with
// glossy eyes and expressions, layered hair with highlight bands, cloth and
// hair physics, weapons, battle auras and motion afterimages.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  // Key light comes from the upper front of the character (local space).
  const LX = 0.45;
  const LY = -0.89;

  // ---------------------------------------------------------- colour utils
  const shadeCache = new Map();
  function tone(c, kind) {
    const key = c + kind;
    let v = shadeCache.get(key);
    if (v) return v;
    if (kind === 'sh') v = SB.mix(SB.shade(c, -0.3), '#4a2a7a', 0.16); // cool anime shadow
    else if (kind === 'dk') v = SB.mix(SB.shade(c, -0.52), '#2a1540', 0.2);
    else if (kind === 'hi') v = SB.shade(c, 0.42);
    else if (kind === 'line') v = SB.mix(SB.shade(c, -0.78), '#1a0f24', 0.5);
    shadeCache.set(key, v);
    return v;
  }

  function makeCol(o) {
    if (!o.flash && !o.tint && !o.dark) return (c) => c;
    return (c) => {
      let r = c;
      if (o.dark) r = SB.mix(r, '#3a3050', o.dark);
      if (o.tint) r = SB.mix(r, o.tint, o.tintAmt || 0.4);
      if (o.flash) r = SB.mix(r, '#ffffff', o.flash);
      return r;
    };
  }

  // ---------------------------------------------------------- primitives
  function capsulePath(ctx, a, b, r1, r2) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath();
    ctx.arc(a.x, a.y, r1, ang + Math.PI / 2, ang - Math.PI / 2);
    ctx.arc(b.x, b.y, r2, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.closePath();
  }

  // Cel-shaded limb segment: base, hard shadow on the side away from the
  // light, rim highlight on the lit side, then coloured line art.
  function celLimb(ctx, a, b, r1, r2, base, col, line) {
    const c = col(base);
    capsulePath(ctx, a, b, r1, r2);
    ctx.fillStyle = c;
    ctx.fill();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l;
    let ny = dx / l;
    if (nx * LX + ny * LY > 0) (nx = -nx), (ny = -ny); // n points away from the light
    const r = Math.max(r1, r2);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = col(tone(base, 'sh'));
    ctx.beginPath();
    const o = r * 0.18;
    ctx.moveTo(a.x + nx * o - (dx / l) * r, a.y + ny * o - (dy / l) * r);
    ctx.lineTo(b.x + nx * o + (dx / l) * r, b.y + ny * o + (dy / l) * r);
    ctx.lineTo(b.x + nx * r * 3 + (dx / l) * r, b.y + ny * r * 3 + (dy / l) * r);
    ctx.lineTo(a.x + nx * r * 3 - (dx / l) * r, a.y + ny * r * 3 - (dy / l) * r);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col(tone(base, 'hi'));
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1.2, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x - nx * r1 * 0.62, a.y - ny * r1 * 0.62);
    ctx.lineTo(b.x - nx * r2 * 0.62, b.y - ny * r2 * 0.62);
    ctx.stroke();
    ctx.restore();
    capsulePath(ctx, a, b, r1, r2);
    ctx.strokeStyle = col(line);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Filled shape with a hard cel shadow along one side (dir = shadow offset).
  function celShape(ctx, pathFn, base, col, line, sx = -3, sy = 4, lw = 2) {
    pathFn();
    ctx.fillStyle = col(tone(base, 'sh'));
    ctx.fill();
    ctx.save();
    pathFn();
    ctx.clip();
    ctx.translate(-sx, -sy);
    pathFn();
    ctx.fillStyle = col(base);
    ctx.fill();
    ctx.restore();
    pathFn();
    ctx.strokeStyle = col(line);
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  function lerpP(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

  // Head-local point (face toward +x) -> body-local coordinates.
  function headPt(J, lx, ly) {
    const p = rot(lx, ly, J.ang.head);
    return { x: J.head.x + p.x, y: J.head.y + p.y };
  }

  function glow(ctx, x, y, r, color, a = 0.85) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, SB.rgba(color, a));
    g.addColorStop(1, SB.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // ------------------------------------------------------------ physics
  function updateChain(ch, rootX, rootY, n, seg, gravity, wind) {
    if (!ch.pts || ch.pts.length !== n) {
      ch.pts = [];
      for (let i = 0; i < n; i++) ch.pts.push({ x: rootX - i * seg * Math.sign(wind || 1), y: rootY + i * seg * 0.3, px: rootX - i * seg * Math.sign(wind || 1), py: rootY + i * seg * 0.3 });
    }
    const P = ch.pts;
    P[0].x = rootX;
    P[0].y = rootY;
    for (let i = 1; i < n; i++) {
      const p = P[i];
      const vx = (p.x - p.px) * 0.86;
      const vy = (p.y - p.py) * 0.86;
      p.px = p.x;
      p.py = p.y;
      p.x += vx - wind * 0.35;
      p.y += vy + gravity;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < n; i++) {
        const a = P[i - 1];
        const b = P[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - seg) / d;
        b.x -= dx * diff;
        b.y -= dy * diff;
      }
    }
  }

  function ribbon(ctx, pts, toLocal, w0, w1, base, col, line, pointed) {
    if (!pts || pts.length < 2) return;
    const L = pts.map(toLocal);
    const left = [];
    const right = [];
    for (let i = 0; i < L.length; i++) {
      const a = L[Math.max(0, i - 1)];
      const b = L[Math.min(L.length - 1, i + 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      let w = w0 + (w1 - w0) * (i / (L.length - 1));
      if (pointed && i === L.length - 1) w = 0.5;
      left.push({ x: L[i].x + Math.cos(ang) * w, y: L[i].y + Math.sin(ang) * w });
      right.push({ x: L[i].x - Math.cos(ang) * w, y: L[i].y - Math.sin(ang) * w });
    }
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) {
        const m = lerpP(left[i - 1], left[i], 0.5);
        ctx.quadraticCurveTo(left[i - 1].x, left[i - 1].y, m.x, m.y);
      }
      ctx.lineTo(left[left.length - 1].x, left[left.length - 1].y);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
    };
    path();
    const g = ctx.createLinearGradient(L[0].x, L[0].y, L[L.length - 1].x, L[L.length - 1].y);
    g.addColorStop(0, col(base));
    g.addColorStop(1, col(tone(base, 'sh')));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = col(line);
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // ------------------------------------------------------------- weapons
  // Draws a weapon along +x starting at the grip (0,0).
  function drawWeapon(ctx, type, len, color, col = (c) => c, glowAmt = 0) {
    const line = '#1a1024';
    if (glowAmt > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, SB.rgba(color, 0));
      g.addColorStop(1, SB.rgba(color, glowAmt));
      ctx.fillStyle = g;
      ctx.fillRect(8, -10, len, 20);
      ctx.restore();
    }
    if (type === 'katana') {
      // Wrapped hilt
      ctx.fillStyle = col('#1d1830');
      ctx.fillRect(-16, -3, 18, 6);
      ctx.strokeStyle = col('#e8e0c8');
      ctx.lineWidth = 1;
      for (let x = -14; x < 0; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x, -3);
        ctx.lineTo(x + 2, 3);
        ctx.moveTo(x + 2, -3);
        ctx.lineTo(x, 3);
        ctx.stroke();
      }
      // Tsuba
      ctx.fillStyle = col('#d8b24a');
      ctx.beginPath();
      ctx.ellipse(3, 0, 3, 8, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = col(line);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Curved blade
      const g = ctx.createLinearGradient(0, -4, 0, 4);
      g.addColorStop(0, col('#ffffff'));
      g.addColorStop(0.45, col('#dfe6f5'));
      g.addColorStop(1, col('#8793b3'));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(6, -3.5);
      ctx.quadraticCurveTo(len * 0.6, -6, len, -9);
      ctx.quadraticCurveTo(len * 0.6, 1, 6, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = col(color);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.quadraticCurveTo(len * 0.6, -4.8, len - 3, -7.6);
      ctx.stroke();
    } else if (type === 'hammer') {
      ctx.fillStyle = col('#6b4424');
      ctx.fillRect(-12, -3, len - 4, 6);
      ctx.strokeStyle = col(line);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-12, -3, len - 4, 6);
      ctx.fillStyle = col('#3a2a1e');
      ctx.fillRect(-14, -4, 8, 8);
      const hx = len - 14;
      const g = ctx.createLinearGradient(0, -16, 0, 16);
      g.addColorStop(0, col('#e6e9f2'));
      g.addColorStop(0.5, col('#9aa3b8'));
      g.addColorStop(1, col('#50566a'));
      ctx.fillStyle = g;
      ctx.fillRect(hx, -16, 22, 32);
      ctx.strokeRect(hx, -16, 22, 32);
      ctx.fillStyle = col(color);
      ctx.fillRect(hx - 2, -16, 4, 32);
      ctx.fillRect(hx + 20, -16, 4, 32);
    } else if (type === 'spear') {
      ctx.fillStyle = col('#7a4e2b');
      ctx.fillRect(-20, -2.5, len - 8, 5);
      ctx.strokeStyle = col(line);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-20, -2.5, len - 8, 5);
      ctx.fillStyle = col('#d33a2a');
      ctx.beginPath();
      ctx.moveTo(len - 30, 0);
      ctx.lineTo(len - 42, 10);
      ctx.lineTo(len - 36, 0);
      ctx.lineTo(len - 42, -10);
      ctx.closePath();
      ctx.fill();
      const g = ctx.createLinearGradient(0, -6, 0, 6);
      g.addColorStop(0, col('#ffffff'));
      g.addColorStop(1, col('#8793b3'));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(len - 30, -5);
      ctx.quadraticCurveTo(len - 12, -8, len + 4, 0);
      ctx.quadraticCurveTo(len - 12, 8, len - 30, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = col(color);
      ctx.beginPath();
      ctx.moveTo(len - 26, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
    }
  }
  SB.drawWeapon = (ctx, type, len, color) => drawWeapon(ctx, type, len, color);

  // --------------------------------------------------------------- faces
  // Anime eye in head-local space. far = the eye on the far side of the face.
  function animeEye(ctx, x, y, R, iris, col, o) {
    const w = R * (o.far ? 0.13 : 0.3);
    const h = R * (o.far ? 0.4 : 0.5);
    const shut = o.expr === 'hurt' || o.blink;
    const line = '#1f1026';
    if (shut) {
      ctx.strokeStyle = col(line);
      ctx.lineWidth = R * 0.08;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (o.expr === 'hurt') {
        ctx.moveTo(x - w, y - h * 0.3);
        ctx.lineTo(x + w * 0.2, y);
        ctx.lineTo(x - w, y + h * 0.3);
      } else {
        ctx.moveTo(x - w, y);
        ctx.quadraticCurveTo(x, y + h * 0.25, x + w, y);
      }
      ctx.stroke();
      return;
    }
    ctx.save();
    // White of the eye
    ctx.beginPath();
    ctx.ellipse(x, y, w, h * 0.5, 0, 0, TAU);
    ctx.fillStyle = col('#ffffff');
    ctx.fill();
    ctx.clip();
    // Iris with vertical gradient
    const ix = x + w * 0.25;
    const g = ctx.createLinearGradient(0, y - h * 0.5, 0, y + h * 0.5);
    g.addColorStop(0, col(tone(iris, 'dk')));
    g.addColorStop(0.55, col(iris));
    g.addColorStop(1, col(tone(iris, 'hi')));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(ix, y + h * 0.04, w * 0.78, h * 0.46, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col(tone(iris, 'dk'));
    ctx.beginPath();
    ctx.ellipse(ix, y, w * 0.34, h * 0.24, 0, 0, TAU);
    ctx.fill();
    // Upper-lid shadow
    ctx.fillStyle = 'rgba(40,20,60,0.25)';
    ctx.fillRect(x - w, y - h * 0.5, w * 2, h * 0.2);
    ctx.restore();
    // Highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ix - w * 0.25, y - h * 0.16, w * 0.24, h * 0.13, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix + w * 0.3, y + h * 0.2, w * 0.1, 0, TAU);
    ctx.fill();
    // Lash line (thick upper, flick at the outer corner)
    ctx.strokeStyle = col(line);
    ctx.lineCap = 'round';
    ctx.lineWidth = R * (o.far ? 0.07 : 0.1);
    ctx.beginPath();
    ctx.moveTo(x - w * 1.25, y - h * 0.12);
    ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.68, x + w * 1.05, y - h * 0.4);
    ctx.stroke();
    if (!o.far) {
      ctx.lineWidth = R * 0.05;
      ctx.beginPath();
      ctx.moveTo(x - w * 1.2, y - h * 0.14);
      ctx.lineTo(x - w * 1.55, y - h * 0.34);
      ctx.moveTo(x - w * 0.5, y + h * 0.5);
      ctx.lineTo(x + w * 0.7, y + h * 0.44);
      ctx.stroke();
    }
    // Brow
    ctx.lineWidth = R * 0.07;
    ctx.beginPath();
    const by = y - h * (o.expr === 'angry' ? 0.78 : 0.9);
    if (o.expr === 'angry') {
      ctx.moveTo(x - w * 1.2, by - h * 0.18);
      ctx.lineTo(x + w * 1.1, by + h * 0.12);
    } else {
      ctx.moveTo(x - w * 1.1, by);
      ctx.quadraticCurveTo(x, by - h * 0.18, x + w * 1.05, by + h * 0.02);
    }
    ctx.stroke();
  }

  function mouth(ctx, R, expr, col) {
    const line = '#3a1426';
    ctx.strokeStyle = col(line);
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.06;
    const x = R * 0.62;
    const y = R * 0.6;
    if (expr === 'shout') {
      ctx.fillStyle = col('#7a1f2e');
      ctx.beginPath();
      ctx.moveTo(x - R * 0.12, y - R * 0.06);
      ctx.lineTo(x + R * 0.2, y - R * 0.08);
      ctx.lineTo(x + R * 0.1, y + R * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col('#ffffff');
      ctx.fillRect(x - R * 0.06, y - R * 0.07, R * 0.2, R * 0.04);
    } else if (expr === 'hurt') {
      ctx.beginPath();
      ctx.moveTo(x - R * 0.1, y);
      ctx.lineTo(x, y - R * 0.05);
      ctx.lineTo(x + R * 0.1, y + R * 0.02);
      ctx.lineTo(x + R * 0.18, y - R * 0.04);
      ctx.stroke();
    } else if (expr === 'smile') {
      ctx.beginPath();
      ctx.moveTo(x - R * 0.1, y - R * 0.04);
      ctx.quadraticCurveTo(x + R * 0.04, y + R * 0.08, x + R * 0.18, y - R * 0.06);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - R * 0.04, y);
      ctx.lineTo(x + R * 0.14, y - R * 0.02);
      ctx.stroke();
    }
  }

  // Skull + jaw in 3/4 view (face toward +x).
  function facePath(ctx, R) {
    ctx.beginPath();
    ctx.moveTo(-R * 0.55, R * 0.72);
    ctx.bezierCurveTo(-R * 1.08, R * 0.3, -R * 1.02, -R * 0.95, 0, -R * 1.0);
    ctx.bezierCurveTo(R * 0.72, -R * 1.0, R * 1.02, -R * 0.45, R * 0.98, R * 0.05);
    ctx.bezierCurveTo(R * 0.96, R * 0.42, R * 0.84, R * 0.66, R * 0.52, R * 0.92);
    ctx.bezierCurveTo(R * 0.32, R * 1.02, R * 0.02, R * 0.95, -R * 0.55, R * 0.72);
    ctx.closePath();
  }

  function drawFace(ctx, R, pal, col, o, style) {
    const line = tone(pal.skin, 'line');
    celShape(ctx, () => facePath(ctx, R), pal.skin, col, line, -R * 0.22, R * 0.08, 2);
    // Ear (mostly hidden by hair)
    ctx.fillStyle = col(tone(pal.skin, 'sh'));
    ctx.beginPath();
    ctx.ellipse(-R * 0.3, R * 0.22, R * 0.1, R * 0.16, 0.2, 0, TAU);
    ctx.fill();
    // Blush
    if (style.blush) {
      ctx.fillStyle = 'rgba(255,120,140,0.35)';
      ctx.beginPath();
      ctx.ellipse(R * 0.52, R * 0.42, R * 0.16, R * 0.07, 0, 0, TAU);
      ctx.fill();
    }
    if (!style.mask) {
      // Nose tick + mouth
      ctx.strokeStyle = col(line);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(R * 0.95, R * 0.24);
      ctx.lineTo(R * 0.86, R * 0.34);
      ctx.stroke();
      mouth(ctx, R, o.expr, col);
    }
    const eyeCol = pal.eye;
    ctx.save();
    facePath(ctx, R);
    ctx.clip();
    animeEye(ctx, R * 0.93, R * 0.1, R, eyeCol, col, { far: true, expr: o.expr, blink: o.blink });
    ctx.restore();
    animeEye(ctx, R * 0.44, R * 0.1, R, eyeCol, col, { expr: o.expr, blink: o.blink });
  }

  // Hair highlight "angel ring" arc clipped to the hair shape.
  function hairShine(ctx, R, hair, col, pathFn) {
    ctx.save();
    pathFn();
    ctx.clip();
    ctx.strokeStyle = col(tone(hair, 'hi'));
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = R * 0.16;
    ctx.beginPath();
    ctx.arc(0, -R * 0.02, R * 0.78, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
    ctx.restore();
  }

  function spikePath(ctx, R, spikes) {
    // Spikes: [angle, length] around the back/top of the head.
    ctx.beginPath();
    ctx.moveTo(R * 0.7, -R * 0.55);
    for (const [a, len, w] of spikes) {
      const aw = w || 0.24;
      const p0 = { x: Math.cos(a - aw) * R * 0.92, y: Math.sin(a - aw) * R * 0.92 };
      const tip = { x: Math.cos(a) * R * len, y: Math.sin(a) * R * len };
      const p1 = { x: Math.cos(a + aw) * R * 0.92, y: Math.sin(a + aw) * R * 0.92 };
      ctx.lineTo(p0.x, p0.y);
      ctx.quadraticCurveTo((p0.x + tip.x) / 2 + 2, (p0.y + tip.y) / 2 - 2, tip.x, tip.y);
      ctx.quadraticCurveTo((p1.x + tip.x) / 2, (p1.y + tip.y) / 2, p1.x, p1.y);
    }
    ctx.lineTo(-R * 0.55, R * 0.55);
    ctx.lineTo(R * 0.1, R * 0.1);
    ctx.closePath();
  }

  // ------------------------------------------------------ character looks
  // Each look draws: back (behind everything), arm(side), leg(side), body,
  // head, and optional front details. All in local space (facing +x).
  const LOOKS = {};

  // ================================================================ KAI
  LOOKS.blaze = {
    style: {},
    back(ctx, J, pal, P, col, o) {
      const line = tone(pal.main, 'line');
      // Coat tails
      if (o.chain2 && o.chain2.pts) ribbon(ctx, o.chain2.pts, o.toLocal, 8, 5, pal.main, col, line, true);
      if (o.chain3 && o.chain3.pts) ribbon(ctx, o.chain3.pts, o.toLocal, 6, 3, tone(pal.main, 'sh'), col, line, true);
      // Headband tails
      if (o.chain && o.chain.pts) ribbon(ctx, o.chain.pts, o.toLocal, 2.8, 1.6, pal.main, col, line, true);
    },
    arm(ctx, J, s, pal, P, col, o) {
      const sh = s === 'A' ? J.sh : J.shB;
      const el = J['el' + s];
      const ha = J['ha' + s];
      const r = P.limb * 0.5;
      const line = tone(pal.main, 'line');
      const back = s === 'B';
      const jacket = back ? tone(pal.main, 'sh') : pal.main;
      celLimb(ctx, sh, el, r * 1.18, r * 1.0, jacket, col, line);
      // Rolled sleeve cuff
      const cuff = lerpP(sh, el, 0.95);
      celLimb(ctx, lerpP(sh, el, 0.8), cuff, r * 1.22, r * 1.18, SB.shade(jacket, -0.1), col, line);
      celLimb(ctx, el, ha, r * 0.9, r * 0.82, back ? tone(pal.skin, 'sh') : pal.skin, col, tone(pal.skin, 'line'));
      // Hand wraps
      celLimb(ctx, lerpP(el, ha, 0.62), ha, r * 0.92, r * 0.9, '#f1ece2', col, tone(pal.skin, 'line'));
      celLimb(ctx, ha, ha, r * 1.3, r * 1.3, o.fireFists ? '#ffd27a' : '#f1ece2', col, tone(pal.skin, 'line'));
      if (o.fireFists) glow(ctx, ha.x, ha.y, 24, pal.glow);
    },
    leg(ctx, J, s, pal, P, col) {
      const hip = s === 'A' ? J.hip : J.hipB;
      const r = P.limb * 0.58;
      const pants = s === 'B' ? tone(pal.sub, 'sh') : pal.sub;
      const line = tone(pal.sub, 'line');
      celLimb(ctx, hip, J['kn' + s], r * 1.3, r * 1.05, pants, col, line);
      celLimb(ctx, J['kn' + s], J['ft' + s], r * 1.05, r * 0.98, pants, col, line);
      shoe(ctx, J, s, r * 1.5, pal.main, '#f4f4f8', col, line);
    },
    body(ctx, J, pal, P, col) {
      const line = tone(pal.main, 'line');
      // Inner shirt
      const t = torsoShape(ctx, J, 10.5, 12.5, pal.accent, col, tone(pal.accent, 'line'));
      // Open jacket panels on each side of the shirt
      const nk = J.neck;
      const hp = J.hip;
      for (const side of [1, -1]) {
        const path = () => {
          ctx.beginPath();
          const w = side > 0 ? 13 : 11;
          ctx.moveTo(nk.x + t.nx * w * side, nk.y + t.ny * w * side);
          ctx.lineTo(nk.x + t.nx * 3 * side, nk.y + t.ny * 3 * side);
          ctx.lineTo(hp.x + t.nx * 4 * side - t.ux * 4, hp.y + t.ny * 4 * side - t.uy * 4);
          ctx.lineTo(hp.x + t.nx * 12 * side - t.ux * 6, hp.y + t.ny * 12 * side - t.uy * 6);
          ctx.closePath();
        };
        celShape(ctx, path, side > 0 ? pal.main : tone(pal.main, 'sh'), col, line, -2, 3, 1.8);
      }
      // Popped collar
      ctx.fillStyle = col(tone(pal.main, 'hi'));
      ctx.beginPath();
      ctx.moveTo(nk.x - t.nx * 10, nk.y - t.ny * 10);
      ctx.lineTo(nk.x + t.ux * 9 - t.nx * 4, nk.y + t.uy * 9 - t.ny * 4);
      ctx.lineTo(nk.x + t.nx * 3, nk.y + t.ny * 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = col(line);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Belt
      const b = lerpP(J.hip, J.neck, 0.08);
      ctx.strokeStyle = col('#2a1d1a');
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x + t.nx * 11, b.y + t.ny * 11);
      ctx.lineTo(b.x - t.nx * 11, b.y - t.ny * 11);
      ctx.stroke();
      ctx.fillStyle = col('#e8c35a');
      ctx.fillRect(b.x - 2.5, b.y - 2.5, 5, 5);
    },
    head(ctx, J, pal, P, col, o) {
      const R = P.headR;
      const hair = pal.hair;
      const line = tone(hair, 'line');
      ctx.save();
      ctx.translate(J.head.x, J.head.y);
      ctx.rotate(J.ang.head);
      const fl = Math.sin(o.t * 0.2) * 0.04;
      const spikes = [
        [-2.9 + fl, 1.75, 0.26], [-2.55, 1.95], [-2.15 + fl, 1.9], [-1.78, 1.75], [-1.4 + fl, 1.55], [-1.05, 1.35], [-0.72, 1.22, 0.2],
        [2.7, 1.45, 0.3], [2.3, 1.2, 0.3],
      ];
      const hairPath = () => spikePath(ctx, R, spikes);
      hairPath();
      const g = ctx.createLinearGradient(-R * 0.6, R * 0.4, R * 0.4, -R * 1.9);
      g.addColorStop(0, col(tone(hair, 'sh')));
      g.addColorStop(0.55, col(hair));
      g.addColorStop(1, col(SB.mix(hair, pal.glow, 0.6)));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = col(line);
      ctx.lineWidth = 2;
      ctx.stroke();
      drawFace(ctx, R, pal, col, o, this.style);
      // Front bangs
      const bangs = () => {
        ctx.beginPath();
        ctx.moveTo(-R * 0.35, -R * 0.95);
        ctx.quadraticCurveTo(R * 0.6, -R * 1.2, R * 1.08, -R * 0.55);
        ctx.lineTo(R * 1.12, -R * 0.02);
        ctx.lineTo(R * 0.82, -R * 0.38);
        ctx.lineTo(R * 0.74, R * 0.1);
        ctx.lineTo(R * 0.5, -R * 0.42);
        ctx.lineTo(R * 0.3, -R * 0.05);
        ctx.lineTo(R * 0.16, -R * 0.5);
        ctx.lineTo(-R * 0.2, -R * 0.35);
        ctx.closePath();
      };
      celShape(ctx, bangs, hair, col, line, -2, 3, 2);
      hairShine(ctx, R, hair, col, bangs);
      // Headband
      ctx.strokeStyle = col(pal.main);
      ctx.lineWidth = R * 0.2;
      ctx.beginPath();
      ctx.arc(0, -R * 0.02, R * 0.99, Math.PI * 1.02, Math.PI * 1.78);
      ctx.stroke();
      ctx.fillStyle = col('#d9dde8');
      ctx.fillRect(R * 0.35, -R * 1.02, R * 0.36, R * 0.22);
      ctx.restore();
    },
  };

  // ================================================================ AOI
  LOOKS.aria = {
    style: { blush: true },
    back(ctx, J, pal, P, col, o) {
      const line = tone(pal.hair, 'line');
      if (o.chain && o.chain.pts) ribbon(ctx, o.chain.pts, o.toLocal, 7.5, 2, pal.hair, col, line, true);
      if (o.chain2 && o.chain2.pts) ribbon(ctx, o.chain2.pts, o.toLocal, 2.5, 2, pal.accent, col, tone(pal.accent, 'line'), false);
      // Sheath at the waist
      const hp = J.hip;
      const a = J.ang.torso;
      const p0 = { x: hp.x + 4, y: hp.y - 6 };
      const p1 = { x: p0.x - Math.cos(a) * 34, y: p0.y + 16 };
      celLimb(ctx, p0, p1, 3.5, 3, '#1d1830', col, '#0a0612');
    },
    arm(ctx, J, s, pal, P, col) {
      const sh = s === 'A' ? J.sh : J.shB;
      const el = J['el' + s];
      const ha = J['ha' + s];
      const r = P.limb * 0.5;
      const back = s === 'B';
      const top = back ? tone(pal.main, 'sh') : pal.main;
      const line = tone(pal.sub, 'line');
      // Wide kimono sleeve hanging under the upper arm
      const dir = { x: el.x - sh.x, y: el.y - sh.y };
      const hang = () => {
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(el.x + dir.x * 0.2, el.y + dir.y * 0.2);
        ctx.quadraticCurveTo(el.x + 2, el.y + 16, el.x - dir.x * 0.4 + 2, el.y - dir.y * 0.4 + 18);
        ctx.closePath();
      };
      celShape(ctx, hang, top, col, line, -2, 2, 1.6);
      celLimb(ctx, sh, el, r * 1.3, r * 1.25, top, col, line);
      ctx.strokeStyle = col(pal.accent);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lerpP(sh, el, 0.9).x, lerpP(sh, el, 0.9).y + 4);
      ctx.lineTo(el.x, el.y + 6);
      ctx.stroke();
      // Forearm guard
      celLimb(ctx, el, ha, r * 0.95, r * 0.88, back ? tone(pal.sub, 'sh') : pal.sub, col, line);
      celLimb(ctx, ha, ha, r * 1.1, r * 1.1, back ? tone(pal.skin, 'sh') : pal.skin, col, tone(pal.skin, 'line'));
    },
    leg(ctx, J, s, pal, P, col) {
      const hip = s === 'A' ? J.hip : J.hipB;
      const r = P.limb * 0.6;
      const hak = s === 'B' ? tone(pal.sub, 'sh') : pal.sub;
      const line = tone(pal.sub, 'line');
      // Wide hakama trousers
      celLimb(ctx, hip, J['kn' + s], r * 1.55, r * 1.7, hak, col, line);
      celLimb(ctx, J['kn' + s], lerpP(J['kn' + s], J['ft' + s], 0.75), r * 1.7, r * 1.55, hak, col, line);
      celLimb(ctx, lerpP(J['kn' + s], J['ft' + s], 0.72), J['ft' + s], r * 0.7, r * 0.7, '#f4f4f8', col, line);
      shoe(ctx, J, s, r * 1.2, '#2a1d1a', '#f4f4f8', col, line);
    },
    body(ctx, J, pal, P, col) {
      const line = tone(pal.sub, 'line');
      const t = torsoShape(ctx, J, 10, 11.5, pal.main, col, line);
      // Crossed kimono collar (V)
      const nk = J.neck;
      const c = lerpP(J.hip, J.neck, 0.45);
      ctx.strokeStyle = col(pal.accent);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(nk.x - t.nx * 7, nk.y - t.ny * 7);
      ctx.lineTo(c.x + t.nx * 3, c.y + t.ny * 3);
      ctx.lineTo(nk.x + t.nx * 7, nk.y + t.ny * 7);
      ctx.stroke();
      // Chest plate
      const cp = lerpP(J.hip, J.neck, 0.72);
      celShape(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(cp.x + t.nx * 3, cp.y + t.ny * 3, 7, 9, J.ang.torso, 0, TAU);
      }, pal.sub, col, line, -2, 2, 1.6);
      // Obi sash
      const b = lerpP(J.hip, J.neck, 0.14);
      ctx.strokeStyle = col(pal.accent);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(b.x + t.nx * 11, b.y + t.ny * 11);
      ctx.lineTo(b.x - t.nx * 11, b.y - t.ny * 11);
      ctx.stroke();
      ctx.strokeStyle = col(tone(pal.accent, 'line'));
      ctx.lineWidth = 1.2;
      ctx.stroke();
    },
    head(ctx, J, pal, P, col, o) {
      const R = P.headR;
      const hair = pal.hair;
      const line = tone(hair, 'line');
      ctx.save();
      ctx.translate(J.head.x, J.head.y);
      ctx.rotate(J.ang.head);
      // Back hair falling to the shoulders
      const backHair = () => {
        ctx.beginPath();
        ctx.moveTo(R * 0.6, -R * 0.9);
        ctx.bezierCurveTo(-R * 1.4, -R * 1.5, -R * 1.5, R * 0.5, -R * 1.05, R * 1.7);
        ctx.lineTo(-R * 0.6, R * 1.25);
        ctx.lineTo(-R * 0.4, R * 1.6);
        ctx.lineTo(-R * 0.1, R * 0.9);
        ctx.lineTo(R * 0.2, R * 0.4);
        ctx.closePath();
      };
      celShape(ctx, backHair, hair, col, line, 2, 3, 2);
      drawFace(ctx, R, pal, col, o, this.style);
      // Straight bangs + side lock
      const bangs = () => {
        ctx.beginPath();
        ctx.moveTo(-R * 0.55, -R * 0.75);
        ctx.bezierCurveTo(-R * 0.2, -R * 1.25, R * 0.9, -R * 1.2, R * 1.08, -R * 0.35);
        ctx.lineTo(R * 1.05, -R * 0.08);
        ctx.lineTo(R * 0.86, -R * 0.3);
        ctx.lineTo(R * 0.78, -R * 0.05);
        ctx.lineTo(R * 0.6, -R * 0.32);
        ctx.lineTo(R * 0.45, -R * 0.08);
        ctx.lineTo(R * 0.3, -R * 0.4);
        ctx.lineTo(R * 0.12, R * 0.9);
        ctx.lineTo(-R * 0.08, R * 1.05);
        ctx.lineTo(-R * 0.1, -R * 0.3);
        ctx.closePath();
      };
      celShape(ctx, bangs, hair, col, line, -2, 3, 2);
      hairShine(ctx, R, hair, col, bangs);
      // Crescent moon hair pin
      ctx.fillStyle = col(pal.glow);
      ctx.beginPath();
      ctx.arc(-R * 0.35, -R * 0.82, R * 0.2, 0.6, 5.2);
      ctx.arc(-R * 0.28, -R * 0.86, R * 0.16, 5.2, 0.6, true);
      ctx.fill();
      glow(ctx, -R * 0.35, -R * 0.82, R * 0.5, pal.glow, 0.5);
      ctx.restore();
    },
  };

  // =============================================================== GORO
  LOOKS.titan = {
    style: {},
    back(ctx, J, pal, P, col, o) {
      // Rope with shide tassels flapping behind the waist
      if (o.chain2 && o.chain2.pts) ribbon(ctx, o.chain2.pts, o.toLocal, 7, 4, pal.sub, col, tone(pal.sub, 'line'), true);
    },
    arm(ctx, J, s, pal, P, col, o) {
      const sh = s === 'A' ? J.sh : J.shB;
      const el = J['el' + s];
      const ha = J['ha' + s];
      const r = P.limb * 0.5;
      const back = s === 'B';
      const skin = back ? tone(pal.skin, 'sh') : pal.skin;
      const line = tone(pal.skin, 'line');
      celLimb(ctx, sh, el, r * 1.2, r * 0.95, skin, col, line);
      // Iron gauntlet
      const metal = back ? tone(pal.accent, 'sh') : pal.accent;
      celLimb(ctx, el, ha, r * 1.08, r * 1.22, metal, col, '#141018');
      ctx.fillStyle = col(tone(pal.accent, 'hi'));
      for (let k = 0.2; k < 0.9; k += 0.3) {
        const p = lerpP(el, ha, k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, TAU);
        ctx.fill();
      }
      // Big fist with spikes
      celLimb(ctx, ha, ha, r * 1.55, r * 1.55, metal, col, '#141018');
      ctx.fillStyle = col('#d9dde8');
      const a = J.ang['f' + s];
      for (const d of [-0.7, 0, 0.7]) {
        const dx = Math.sin(a + d);
        const dy = Math.cos(a + d);
        ctx.beginPath();
        ctx.moveTo(ha.x + dx * r * 1.4 - dy * 3, ha.y + dy * r * 1.4 + dx * 3);
        ctx.lineTo(ha.x + dx * r * 2.2, ha.y + dy * r * 2.2);
        ctx.lineTo(ha.x + dx * r * 1.4 + dy * 3, ha.y + dy * r * 1.4 - dx * 3);
        ctx.fill();
      }
      if (o.charging && s === 'A') glow(ctx, ha.x, ha.y, 34 + Math.sin(o.t * 0.5) * 6, pal.glow);
    },
    leg(ctx, J, s, pal, P, col) {
      const hip = s === 'A' ? J.hip : J.hipB;
      const r = P.limb * 0.55;
      const pants = s === 'B' ? tone(pal.main, 'sh') : pal.main;
      const line = tone(pal.main, 'line');
      celLimb(ctx, hip, J['kn' + s], r * 1.45, r * 1.3, pants, col, line);
      celLimb(ctx, J['kn' + s], J['ft' + s], r * 1.2, r * 1.0, s === 'B' ? tone(pal.skin, 'sh') : pal.skin, col, tone(pal.skin, 'line'));
      // Shin wraps
      celLimb(ctx, lerpP(J['kn' + s], J['ft' + s], 0.55), lerpP(J['kn' + s], J['ft' + s], 0.9), r * 1.08, r * 1.02, '#e9e1cc', col, line);
      shoe(ctx, J, s, r * 1.45, '#3a2a1e', '#e9e1cc', col, line);
    },
    body(ctx, J, pal, P, col) {
      const line = tone(pal.skin, 'line');
      const t = torsoShape(ctx, J, 18, 25, pal.skin, col, line);
      // Muscle definition
      ctx.strokeStyle = col(tone(pal.skin, 'dk'));
      ctx.lineWidth = 1.6;
      const c = lerpP(J.hip, J.neck, 0.72);
      ctx.beginPath();
      ctx.moveTo(c.x + t.nx * 14, c.y + t.ny * 14);
      ctx.quadraticCurveTo(c.x + t.nx * 4 - t.ux * 8, c.y + t.ny * 4 - t.uy * 8, c.x - t.nx * 8, c.y - t.ny * 8);
      for (let k = 0; k < 3; k++) {
        const p = lerpP(J.hip, J.neck, 0.22 + k * 0.13);
        ctx.moveTo(p.x + t.nx * 7, p.y + t.ny * 7);
        ctx.lineTo(p.x - t.nx * 3, p.y - t.ny * 3);
      }
      ctx.stroke();
      // Tiger-stripe waist wrap
      const b = lerpP(J.hip, J.neck, 0.1);
      ctx.strokeStyle = col(pal.sub);
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(b.x + t.nx * 19, b.y + t.ny * 19);
      ctx.lineTo(b.x - t.nx * 19, b.y - t.ny * 19);
      ctx.stroke();
      ctx.strokeStyle = col('#1a1210');
      ctx.lineWidth = 2.5;
      for (let k = -2; k <= 2; k++) {
        const p = { x: b.x + t.nx * k * 7, y: b.y + t.ny * k * 7 };
        ctx.beginPath();
        ctx.moveTo(p.x - t.ux * 5, p.y - t.uy * 5);
        ctx.lineTo(p.x + t.ux * 3 + t.nx * 2, p.y + t.uy * 3 + t.ny * 2);
        ctx.stroke();
      }
      // Prayer beads
      const nk = J.neck;
      ctx.fillStyle = col('#5a3522');
      for (let k = 0; k < 9; k++) {
        const u = k / 8;
        const px = nk.x + t.nx * (-16 + u * 32) - t.ux * (10 + Math.sin(u * Math.PI) * 10);
        const py = nk.y + t.ny * (-16 + u * 32) - t.uy * (10 + Math.sin(u * Math.PI) * 10);
        ctx.beginPath();
        ctx.arc(px, py, k === 4 ? 4.5 : 3.2, 0, TAU);
        ctx.fill();
      }
    },
    head(ctx, J, pal, P, col, o) {
      const R = P.headR;
      const hair = pal.hair;
      const line = tone(hair, 'line');
      ctx.save();
      ctx.translate(J.head.x, J.head.y);
      ctx.rotate(J.ang.head);
      const fl = Math.sin(o.t * 0.12) * 0.05;
      const mane = () => spikePath(ctx, R, [[-3.0, 1.6, 0.3], [-2.6 + fl, 1.9, 0.3], [-2.2, 1.8], [-1.8 + fl, 1.6], [-1.45, 1.4], [2.8, 1.8, 0.3], [2.35 + fl, 1.6, 0.3], [1.95, 1.3, 0.3]]);
      celShape(ctx, mane, hair, col, line, 2, 3, 2);
      // Horns
      for (const [hx, s] of [[-R * 0.1, 0.8], [R * 0.45, 1]]) {
        const horn = () => {
          ctx.beginPath();
          ctx.moveTo(hx - R * 0.14 * s, -R * 0.8);
          ctx.quadraticCurveTo(hx - R * 0.05, -R * 1.5 * s, hx + R * 0.35 * s, -R * 1.85 * s);
          ctx.quadraticCurveTo(hx + R * 0.05, -R * 1.35 * s, hx + R * 0.16 * s, -R * 0.8);
          ctx.closePath();
        };
        celShape(ctx, horn, '#f3ead2', col, '#3a2a1e', -1, 2, 1.6);
      }
      drawFace(ctx, R, pal, col, Object.assign({}, o, { expr: o.expr === 'neutral' ? 'angry' : o.expr }), this.style);
      // Fangs
      ctx.fillStyle = col('#ffffff');
      ctx.beginPath();
      ctx.moveTo(R * 0.55, R * 0.62);
      ctx.lineTo(R * 0.6, R * 0.78);
      ctx.lineTo(R * 0.66, R * 0.62);
      ctx.fill();
      // Oni markings
      ctx.strokeStyle = col(pal.glow);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(R * 0.2, R * 0.3);
      ctx.lineTo(R * 0.35, R * 0.5);
      ctx.stroke();
      glow(ctx, R * 0.5, R * 0.1, R * 0.5, pal.eye, 0.35);
      const fringe = () => {
        ctx.beginPath();
        ctx.moveTo(-R * 0.4, -R * 0.95);
        ctx.quadraticCurveTo(R * 0.5, -R * 1.2, R * 1.0, -R * 0.62);
        ctx.lineTo(R * 0.72, -R * 0.52);
        ctx.lineTo(R * 0.55, -R * 0.3);
        ctx.lineTo(R * 0.34, -R * 0.55);
        ctx.lineTo(-R * 0.2, -R * 0.45);
        ctx.closePath();
      };
      celShape(ctx, fringe, hair, col, line, -2, 3, 2);
      ctx.restore();
    },
  };

  // ============================================================= HAYATE
  LOOKS.volt = {
    style: { mask: true },
    back(ctx, J, pal, P, col, o) {
      if (o.chain && o.chain.pts) ribbon(ctx, o.chain.pts, o.toLocal, 5.5, 3.5, pal.accent, col, tone(pal.accent, 'line'), false);
      if (o.chain2 && o.chain2.pts) ribbon(ctx, o.chain2.pts, o.toLocal, 2, 1.5, pal.main, col, tone(pal.main, 'line'), true);
    },
    arm(ctx, J, s, pal, P, col, o) {
      const sh = s === 'A' ? J.sh : J.shB;
      const el = J['el' + s];
      const ha = J['ha' + s];
      const r = P.limb * 0.5;
      const back = s === 'B';
      const suit = back ? tone(pal.main, 'sh') : pal.main;
      const line = tone(pal.main, 'line');
      celLimb(ctx, sh, el, r * 1.15, r * 0.95, suit, col, line);
      celLimb(ctx, el, ha, r * 0.95, r * 0.85, suit, col, line);
      // Arm guard
      celLimb(ctx, lerpP(el, ha, 0.2), lerpP(el, ha, 0.85), r * 1.12, r * 1.02, back ? tone(pal.sub, 'sh') : '#8a93b0', col, line);
      celLimb(ctx, ha, ha, r * 1.15, r * 1.15, suit, col, line);
      if (o.sparky && s === 'A' && Math.floor(o.t / 3) % 3 === 0) spark(ctx, ha.x, ha.y, pal.glow, o.t);
    },
    leg(ctx, J, s, pal, P, col) {
      const hip = s === 'A' ? J.hip : J.hipB;
      const r = P.limb * 0.6;
      const suit = s === 'B' ? tone(pal.main, 'sh') : pal.main;
      const line = tone(pal.main, 'line');
      celLimb(ctx, hip, J['kn' + s], r * 1.2, r * 0.95, suit, col, line);
      celLimb(ctx, J['kn' + s], J['ft' + s], r * 0.95, r * 0.85, suit, col, line);
      // Leg wraps
      for (let k = 0.45; k < 0.95; k += 0.16) {
        const p = lerpP(J['kn' + s], J['ft' + s], k);
        ctx.fillStyle = col(tone(pal.sub, 'hi'));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.95, 0, TAU);
        ctx.fill();
      }
      shoe(ctx, J, s, r * 1.2, pal.sub, pal.sub, col, line);
    },
    body(ctx, J, pal, P, col) {
      const line = tone(pal.main, 'line');
      const t = torsoShape(ctx, J, 9, 11.5, pal.main, col, line);
      // Chest guard + belt with kunai
      const c = lerpP(J.hip, J.neck, 0.68);
      celShape(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(c.x + t.nx * 10 + t.ux * 8, c.y + t.ny * 10 + t.uy * 8);
        ctx.lineTo(c.x - t.nx * 7 + t.ux * 8, c.y - t.ny * 7 + t.uy * 8);
        ctx.lineTo(c.x - t.nx * 5 - t.ux * 8, c.y - t.ny * 5 - t.uy * 8);
        ctx.lineTo(c.x + t.nx * 9 - t.ux * 10, c.y + t.ny * 9 - t.uy * 10);
        ctx.closePath();
      }, '#8a93b0', col, line, -2, 2, 1.5);
      const b = lerpP(J.hip, J.neck, 0.12);
      ctx.strokeStyle = col(pal.accent);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x + t.nx * 10, b.y + t.ny * 10);
      ctx.lineTo(b.x - t.nx * 10, b.y - t.ny * 10);
      ctx.stroke();
      ctx.fillStyle = col('#c9cfdd');
      for (let k = 0; k < 3; k++) {
        const p = { x: b.x - t.nx * (2 + k * 4), y: b.y - t.ny * (2 + k * 4) };
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - t.ux * 12, p.y - t.uy * 12);
        ctx.lineTo(p.x + 2, p.y + 2);
        ctx.fill();
      }
    },
    head(ctx, J, pal, P, col, o) {
      const R = P.headR;
      const hair = pal.hair;
      const line = tone(hair, 'line');
      ctx.save();
      ctx.translate(J.head.x, J.head.y);
      ctx.rotate(J.ang.head);
      const spikes = () => spikePath(ctx, R, [[-2.7, 1.6], [-2.3, 1.75], [-1.9, 1.65], [-1.5, 1.5], [-1.15, 1.3, 0.2], [2.7, 1.3, 0.3]]);
      celShape(ctx, spikes, hair, col, line, 2, 3, 2);
      drawFace(ctx, R, pal, col, o, this.style);
      // Face mask over nose & mouth
      const mask = () => {
        ctx.beginPath();
        ctx.moveTo(-R * 0.3, R * 0.25);
        ctx.lineTo(R * 1.05, R * 0.2);
        ctx.bezierCurveTo(R * 1.0, R * 0.55, R * 0.8, R * 0.9, R * 0.45, R * 1.0);
        ctx.bezierCurveTo(R * 0.1, R * 1.05, -R * 0.3, R * 0.85, -R * 0.3, R * 0.25);
        ctx.closePath();
      };
      celShape(ctx, mask, pal.main, col, tone(pal.main, 'line'), -2, 3, 1.8);
      // Headband with a lightning plate
      ctx.fillStyle = col(pal.accent);
      ctx.beginPath();
      ctx.moveTo(-R * 0.95, -R * 0.45);
      ctx.lineTo(R * 1.02, -R * 0.52);
      ctx.lineTo(R * 1.0, -R * 0.28);
      ctx.lineTo(-R * 0.98, -R * 0.2);
      ctx.closePath();
      ctx.fill();
      celShape(ctx, () => {
        ctx.beginPath();
        ctx.rect(R * 0.28, -R * 0.58, R * 0.56, R * 0.36);
      }, '#c9cfdd', col, '#2a2e44', -1, 1, 1.4);
      ctx.strokeStyle = col(pal.glow);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(R * 0.62, -R * 0.54);
      ctx.lineTo(R * 0.5, -R * 0.4);
      ctx.lineTo(R * 0.62, -R * 0.4);
      ctx.lineTo(R * 0.5, -R * 0.26);
      ctx.stroke();
      // Front spikes
      const front = () => {
        ctx.beginPath();
        ctx.moveTo(-R * 0.3, -R * 0.95);
        ctx.quadraticCurveTo(R * 0.6, -R * 1.25, R * 1.15, -R * 0.75);
        ctx.lineTo(R * 0.8, -R * 0.62);
        ctx.lineTo(R * 0.9, -R * 0.5);
        ctx.lineTo(R * 0.4, -R * 0.58);
        ctx.lineTo(-R * 0.1, -R * 0.55);
        ctx.closePath();
      };
      celShape(ctx, front, hair, col, line, -2, 2, 2);
      hairShine(ctx, R, hair, col, front);
      ctx.restore();
    },
  };

  // ------------------------------------------------------ shared pieces
  function torsoShape(ctx, J, hipW, chestW, base, col, line) {
    const ux = J.neck.x - J.hip.x;
    const uy = J.neck.y - J.hip.y;
    const l = Math.hypot(ux, uy) || 1;
    const nx = -uy / l;
    const ny = ux / l;
    const h1 = { x: J.hip.x + nx * hipW, y: J.hip.y + ny * hipW };
    const h2 = { x: J.hip.x - nx * hipW, y: J.hip.y - ny * hipW };
    const c1 = { x: J.neck.x + nx * chestW, y: J.neck.y + ny * chestW };
    const c2 = { x: J.neck.x - nx * chestW, y: J.neck.y - ny * chestW };
    const mid = lerpP(J.hip, J.neck, 0.6);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(h1.x, h1.y);
      ctx.quadraticCurveTo(mid.x + nx * chestW * 1.12, mid.y + ny * chestW * 1.12, c1.x, c1.y);
      ctx.quadraticCurveTo(J.neck.x + (ux / l) * 6, J.neck.y + (uy / l) * 6, c2.x, c2.y);
      ctx.quadraticCurveTo(mid.x - nx * chestW * 1.05, mid.y - ny * chestW * 1.05, h2.x, h2.y);
      ctx.quadraticCurveTo(J.hip.x - (ux / l) * 5, J.hip.y - (uy / l) * 5, h1.x, h1.y);
      ctx.closePath();
    };
    celShape(ctx, path, base, col, line, 4, 2, 2);
    return { nx, ny, ux: ux / l, uy: uy / l, l };
  }

  function shoe(ctx, J, s, r, base, sole, col, line) {
    const k = J['kn' + s];
    const f = J['ft' + s];
    const ang = Math.atan2(f.y - k.y, f.x - k.x) - Math.PI / 2;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(ang);
    celShape(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.5);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.8, r * 1.3, -r * 0.1);
      ctx.quadraticCurveTo(r * 1.45, r * 0.35, r * 1.1, r * 0.45);
      ctx.lineTo(-r * 0.6, r * 0.45);
      ctx.closePath();
    }, base, col, line, -1, 2, 1.8);
    ctx.fillStyle = col(sole);
    ctx.fillRect(-r * 0.6, r * 0.25, r * 1.8, r * 0.22);
    ctx.restore();
  }

  function spark(ctx, x, y, color, t) {
    const r = SB.seeded(Math.floor(t / 3) + 5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let px = x;
      let py = y;
      ctx.moveTo(px, py);
      for (let k = 0; k < 3; k++) {
        px += (r() - 0.5) * 16;
        py += (r() - 0.5) * 16;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Flame-tongue battle aura around the body.
  function aura(ctx, J, color, t, strength) {
    const cx = J.body.x;
    const cy = J.body.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
    g.addColorStop(0, SB.rgba(color, 0.3 * strength));
    g.addColorStop(1, SB.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - 80, cy - 90, 160, 180);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const ph = t * 0.25 + i * 1.7;
      const bx = cx + Math.cos(a) * 26;
      const by = cy + Math.sin(a) * 42 + 10;
      const h = (34 + Math.sin(ph) * 14) * strength;
      ctx.fillStyle = SB.rgba(color, 0.22 * strength);
      ctx.beginPath();
      ctx.moveTo(bx - 10, by);
      ctx.quadraticCurveTo(bx - 6 + Math.sin(ph) * 6, by - h * 0.6, bx + Math.sin(ph * 1.3) * 8, by - h);
      ctx.quadraticCurveTo(bx + 6, by - h * 0.5, bx + 10, by);
      ctx.fill();
    }
    ctx.restore();
  }

  // Full body in local space (facing right, feet at 0,0).
  function drawBody(ctx, char, pal, J, o) {
    const L = LOOKS[char.id];
    const P = o.prop || char.prop;
    const col = makeCol(o);
    if (o.aura) aura(ctx, J, pal.glow, o.t, o.aura);
    L.back && L.back(ctx, J, pal, P, col, o);
    L.arm(ctx, J, 'B', pal, P, col, o);
    L.leg(ctx, J, 'B', pal, P, col, o);
    L.body(ctx, J, pal, P, col, o);
    L.leg(ctx, J, 'A', pal, P, col, o);
    // Neck
    const nb = headPt(J, -P.headR * 0.05, P.headR * 0.6);
    celLimb(ctx, J.neck, nb, P.headR * 0.28, P.headR * 0.26, pal.skin, col, tone(pal.skin, 'line'));
    L.head(ctx, J, pal, P, col, o);
    // Weapon in the front hand (Aoi's own katana, or a picked-up weapon)
    const wtype = o.weapon || (char.id === 'aria' ? 'katana' : null);
    if (wtype) {
      const h = J.haA;
      const tip = J.wtip;
      const len = Math.hypot(tip.x - h.x, tip.y - h.y);
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(Math.atan2(tip.y - h.y, tip.x - h.x));
      const wcol = o.weapon ? SB.WEAPONS[o.weapon].color : pal.glow;
      drawWeapon(ctx, wtype, len, wcol, col, o.swordGlow || 0.3);
      ctx.restore();
    }
    L.arm(ctx, J, 'A', pal, P, col, o);
  }

  // Secondary motion (hair / scarf / coat tails) lives on the render state.
  function updateSecondary(rs, char, J, wx, wy, facing, vx) {
    const toWorld = (p) => ({ x: wx + facing * p.x, y: wy + p.y });
    const wind = facing * (1 + SB.clamp(Math.abs(vx) * 0.2, 0, 2)) + vx * 0.1;
    const R = char.prop.headR;
    if (char.id === 'blaze') {
      const band = toWorld(headPt(J, -R * 0.95, -R * 0.35));
      updateChain(rs.chain, band.x, band.y, 5, 6, 0.55, wind * 0.9);
      const tail = toWorld({ x: J.hipB.x - 6, y: J.hipB.y - 4 });
      updateChain(rs.chain2, tail.x, tail.y, 5, 8, 1.0, wind * 0.6);
      const tail2 = toWorld({ x: J.hipB.x - 2, y: J.hipB.y - 2 });
      updateChain(rs.chain3, tail2.x, tail2.y, 5, 7, 1.0, wind * 0.5);
    } else if (char.id === 'aria') {
      const top = toWorld(headPt(J, -R * 0.7, -R * 0.75));
      updateChain(rs.chain, top.x, top.y, 8, 7.5, 0.8, wind);
      updateChain(rs.chain2, top.x, top.y, 4, 5, 0.9, wind * 0.9);
    } else if (char.id === 'titan') {
      const tail = toWorld({ x: J.hipB.x - 14, y: J.hipB.y - 2 });
      updateChain(rs.chain2, tail.x, tail.y, 4, 9, 1.0, wind * 0.6);
    } else if (char.id === 'volt') {
      const nk = toWorld({ x: J.neck.x - 4, y: J.neck.y + 2 });
      updateChain(rs.chain, nk.x, nk.y, 10, 8.5, 0.45, wind * 1.25);
      const hb = toWorld(headPt(J, -R * 0.95, -R * 0.35));
      updateChain(rs.chain2, hb.x, hb.y, 4, 6, 0.5, wind);
    }
  }

  function expression(f) {
    if (f.state === 'hitstun' || f.state === 'tumble' || f.state === 'dizzy' || f.state === 'grabbed' || f.state === 'thrown') return 'hurt';
    if (f.state === 'move' || f.state === 'final' || f.charging) return 'shout';
    if (f.state === 'run' || f.state === 'dash' || f.state === 'air') return 'angry';
    return 'neutral';
  }

  // ------------------------------------------------------------ in-game
  function drawFighter(ctx, f, m) {
    if (f.state === 'dead') return;
    const rs = f.rs || (f.rs = { pose: Object.assign({}, f.pose), chain: {}, chain2: {}, chain3: {}, ghosts: [], blink: 0 });
    const target = f.pose;
    const k = f.state === 'move' ? 0.75 : f.state === 'tumble' || f.state === 'roll' || f.state === 'airdodge' ? 0.9 : 0.45;
    if (f.hitlag <= 0 || f.state === 'move') SB.Skel.blend(rs.pose, target, k);
    const prop = f.prop || f.def.prop;
    const J = SB.Skel.solve(rs.pose, prop, rs.J || (rs.J = {}));
    let x = f.x + f.visOff.x;
    let y = f.y + f.visOff.y;
    if (f.hitShake > 0 && f.hitlag > 0) {
      x += SB.rand(-3, 3);
      y += SB.rand(-2, 2);
    }
    const t = m.frame;
    updateSecondary(rs, f.def, J, x, y, f.facing, f.vx + f.kbx);

    // Blinking
    if (rs.blink > 0) rs.blink--;
    else if (Math.random() < 0.006) rs.blink = 6;

    // Ground shadow
    const gy = m.stage.groundBelow(f.x, f.y - 2);
    if (gy - f.y < 400 && f.state !== 'respawn') {
      const h = Math.max(0, gy - f.y);
      const s = SB.clamp(1 - h / 400, 0.2, 1);
      ctx.fillStyle = `rgba(20,0,30,${0.32 * s})`;
      ctx.beginPath();
      ctx.ellipse(f.x, gy + 1, f.w * 0.75 * s, 5 * s, 0, 0, TAU);
      ctx.fill();
    }

    if (f.state === 'respawn') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y + 4, 0, x, y + 4, 70);
      g.addColorStop(0, SB.rgba(f.color, 0.8));
      g.addColorStop(1, SB.rgba(f.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 70, y - 50, 140, 100);
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, y + 3, 44, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Motion afterimages
    const speed = Math.hypot(f.vx + f.kbx, f.vy + f.kby);
    const ghosting = speed > 9 || f.state === 'dash' || f.state === 'roll' || (f.state === 'move' && f.move && f.move.special);
    if (ghosting && t % 3 === 0) {
      rs.ghosts.push({ J: JSON.parse(JSON.stringify({ hip: J.hip, neck: J.neck, head: J.head, sh: J.sh, elA: J.elA, haA: J.haA, elB: J.elB, haB: J.haB, knA: J.knA, ftA: J.ftA, knB: J.knB, ftB: J.ftB })), x, y, facing: f.facing, life: 12 });
      if (rs.ghosts.length > 4) rs.ghosts.shift();
    }
    for (const g of rs.ghosts) g.life--;
    rs.ghosts = rs.ghosts.filter((g) => g.life > 0);
    if (rs.ghosts.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const g of rs.ghosts) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.scale(g.facing, 1);
        ctx.globalAlpha = (g.life / 12) * 0.35;
        ctx.strokeStyle = f.pal.glow;
        ctx.lineCap = 'round';
        const Jg = g.J;
        const seg = (a, b, w) => {
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        };
        const P = prop;
        seg(Jg.hip, Jg.neck, P.limb * 2.2);
        seg(Jg.sh, Jg.elA, P.limb);
        seg(Jg.elA, Jg.haA, P.limb * 0.9);
        seg(Jg.sh, Jg.elB, P.limb);
        seg(Jg.elB, Jg.haB, P.limb * 0.9);
        seg(Jg.hip, Jg.knA, P.limb * 1.2);
        seg(Jg.knA, Jg.ftA, P.limb);
        seg(Jg.hip, Jg.knB, P.limb * 1.2);
        seg(Jg.knB, Jg.ftB, P.limb);
        ctx.fillStyle = f.pal.glow;
        ctx.beginPath();
        ctx.arc(Jg.head.x, Jg.head.y, P.headR, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    if (f.trail.length > 2) drawTrail(ctx, f.trail, f.def.trailColor || '#ffffff', f.def.id === 'aria' || f.weapon ? 10 : 7);

    let alpha = 1;
    if (f.invisible) alpha = 0.15;
    if (f.state === 'spotdodge' && f.sf > 2 && f.sf < 17) alpha = 0.5;
    if (f.state === 'roll' && f.sf > 3 && f.sf < 18) alpha = 0.6;
    if (f.state === 'airdodge' && f.sf > 2 && f.sf < 26) alpha = 0.55;
    const flicker = f.inv > 0 && f.state !== 'respawn' && t % 6 < 3;

    if (f.inv > 0 && f.state !== 'respawn') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gy2 = y - f.h / 2;
      const g = ctx.createRadialGradient(x, gy2, 0, x, gy2, f.h * 0.75);
      g.addColorStop(0, `rgba(255,255,255,${flicker ? 0.45 : 0.25})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - f.h, gy2 - f.h, f.h * 2, f.h * 2);
      ctx.restore();
    }

    const o = {
      t, chain: rs.chain, chain2: rs.chain2, chain3: rs.chain3, prop,
      toLocal: (p) => ({ x: (p.x - x) * f.facing, y: p.y - y }),
      flash: f.flash > 0 ? Math.min(0.85, f.flash / 8) : f.armorFlash > 0 ? 0.35 : 0,
      tint: f.charging ? '#ffe066' : f.armorFlash > 0 ? '#ff5d5d' : null,
      tintAmt: f.charging ? 0.25 + Math.sin(t * 0.6) * 0.2 : 0.4,
      dark: f.state === 'helpless' ? 0.35 : 0,
      fireFists: f.def.id === 'blaze' && f.state === 'move' && f.move && (f.move.special || f.move.smash || f.move.comboMove),
      charging: f.charging,
      sparky: f.def.id === 'volt',
      swordGlow: f.state === 'move' ? 0.7 : 0.3,
      expr: expression(f),
      blink: rs.blink > 0,
      weapon: f.weapon ? f.weapon.type : null,
      aura: f.finalReady ? 1 : f.charging ? 0.7 : f.state === 'final' ? 1.2 : f.comboShow && f.comboShow.name && f.comboShow.t > 90 ? 0.6 : 0,
    };

    ctx.save();
    ctx.globalAlpha = alpha * (flicker ? 0.75 : 1);
    ctx.translate(x, y);
    ctx.scale(f.facing, 1);
    drawBody(ctx, f.def, f.pal, J, o);
    ctx.restore();

    if (f.state === 'dizzy') {
      for (let i = 0; i < 3; i++) {
        const a = t * 0.1 + (i * TAU) / 3;
        drawStar(ctx, x + Math.cos(a) * 22, y - f.h - 14 + Math.sin(a) * 6, 6, '#fff27a');
      }
    }

    if (f.shielding()) {
      const c = { x: f.x, y: f.y - f.h / 2 };
      const r = m.shieldRadius(f);
      ctx.save();
      const g = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, r * 0.1, c.x, c.y, r);
      g.addColorStop(0, SB.rgba('#ffffff', 0.35));
      g.addColorStop(0.7, SB.rgba(f.color, 0.35));
      g.addColorStop(1, SB.rgba(f.color, 0.7));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Player tag above the head
    if (f.state !== 'respawn' || f.sf > 10) {
      const hy = y - f.h - 30 + (f.state === 'crouch' ? 20 : 0);
      ctx.save();
      ctx.font = `20px ${SB.FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#140d20';
      ctx.fillStyle = f.color;
      ctx.strokeText(f.tag, x, hy);
      ctx.fillText(f.tag, x, hy);
      ctx.beginPath();
      ctx.moveTo(x - 6, hy + 4);
      ctx.lineTo(x + 6, hy + 4);
      ctx.lineTo(x, hy + 11);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawStar(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = (i / 10) * TAU - Math.PI / 2;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Anime slash arc: a crescent following the attacking limb.
  function drawTrail(ctx, pts, color, width) {
    if (pts.length < 3) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = pts.length;
    const left = [];
    const right = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const w = width * 1.6 * Math.sin((i / (n - 1)) * Math.PI * 0.5 + 0.2);
      left.push({ x: pts[i].x + Math.cos(ang) * w, y: pts[i].y + Math.sin(ang) * w });
      right.push({ x: pts[i].x - Math.cos(ang) * w * 0.3, y: pts[i].y - Math.sin(ang) * w * 0.3 });
    }
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    const g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[n - 1].x, pts[n - 1].y);
    g.addColorStop(0, SB.rgba(color, 0));
    g.addColorStop(0.7, SB.rgba(color, 0.55));
    g.addColorStop(1, SB.rgba('#ffffff', 0.9));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left[Math.max(0, n - 4)].x, left[Math.max(0, n - 4)].y);
    for (let i = Math.max(0, n - 4); i < n; i++) ctx.lineTo(left[i].x, left[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------- menu previews
  const previewState = new Map();
  function drawPreview(ctx, char, palIndex, x, y, scale, t, poseName, key) {
    const pal = char.palettes[palIndex % char.palettes.length];
    let pose;
    if (poseName === 'victory') {
      pose = SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, char.base, SB.Moves.POSES.victory, { by: Math.sin(t * 0.08) * 2 }), char.prop);
      if (char.id === 'aria') pose.wpn = 0.2;
    } else {
      const b = Math.sin(t * 0.07);
      pose = SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, char.base, { by: (char.base.by || 0) + b * 1.3 + 1, aS: 0.25 + b * 0.05 }), char.prop);
    }
    const J = SB.Skel.solve(pose, char.prop, {});
    const k = key || char.id + palIndex;
    let rs = previewState.get(k);
    if (!rs) previewState.set(k, (rs = { chain: {}, chain2: {}, chain3: {}, blink: 0 }));
    updateSecondary(rs, char, J, 0, 0, 1, 0);
    if (rs.blink > 0) rs.blink--;
    else if (Math.random() < 0.01) rs.blink = 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawBody(ctx, char, pal, J, { t, chain: rs.chain, chain2: rs.chain2, chain3: rs.chain3, toLocal: (p) => p, swordGlow: 0.4, sparky: char.id === 'volt', expr: poseName === 'victory' ? 'smile' : 'neutral', blink: rs.blink > 0 });
    ctx.restore();
  }

  // Bust portrait (head + shoulders) for HUD / results.
  const portraitCache = new Map();
  function portrait(char, palIndex, size) {
    const key = char.id + ':' + palIndex + ':' + size;
    if (portraitCache.has(key)) return portraitCache.get(key);
    const c = SB.makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const pal = char.palettes[palIndex % char.palettes.length];
    const pose = SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, char.base, { lean: 0.05, head: 0, aS: 0.1, bS: -0.1 }), char.prop);
    const J = SB.Skel.solve(pose, char.prop, {});
    const s = size / (char.prop.headR * 4.4);
    ctx.translate(size / 2 - J.head.x * s - size * 0.04, size / 2 - J.head.y * s + size * 0.12);
    ctx.scale(s, s);
    const L = LOOKS[char.id];
    const col = (x) => x;
    // Static hair/scarf tails for the icon
    const rs = { chain: {}, chain2: {}, chain3: {} };
    for (let i = 0; i < 40; i++) updateSecondary(rs, char, J, 0, 0, 1, 0);
    const o = { t: 0, toLocal: (p) => p, chain: rs.chain, chain2: rs.chain2, chain3: rs.chain3, expr: 'neutral' };
    L.back && L.back(ctx, J, pal, char.prop, col, o);
    L.body(ctx, J, pal, char.prop, col, o);
    L.head(ctx, J, pal, char.prop, col, o);
    portraitCache.set(key, c);
    return c;
  }

  SB.FighterRenderer = { drawFighter, drawPreview, portrait, drawBody, drawStar, drawWeapon, LOOKS };
})();
