// Draws the skeletal fighters with a cel-shaded cartoon look: outlined
// tapered limbs, gradient torsos, per-character heads, hair/scarf physics,
// weapons, trails, shields and status effects.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const OUTLINE = '#15121c';

  // Tapered capsule between two points.
  function capsule(ctx, a, b, r1, r2) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath();
    ctx.arc(a.x, a.y, r1, ang + Math.PI / 2, ang - Math.PI / 2);
    ctx.arc(b.x, b.y, r2, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.closePath();
  }

  function limb(ctx, a, b, r1, r2, fill, hl) {
    capsule(ctx, a, b, r1, r2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    if (hl) {
      // Rim highlight for volume.
      const ang = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
      const ox = Math.cos(ang) * r1 * 0.45;
      const oy = Math.sin(ang) * r1 * 0.45;
      ctx.strokeStyle = hl;
      ctx.lineWidth = Math.max(1.5, r1 * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x + ox, a.y + oy);
      ctx.lineTo(b.x + ox * 0.8, b.y + oy * 0.8);
      ctx.stroke();
    }
  }

  function circle(ctx, x, y, r, fill, stroke = true) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  }

  function lerpP(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // Torso: tapered shape from hip to neck.
  function torso(ctx, J, hipW, chestW, fill, fill2) {
    const ux = J.neck.x - J.hip.x;
    const uy = J.neck.y - J.hip.y;
    const l = Math.hypot(ux, uy) || 1;
    const nx = -uy / l;
    const ny = ux / l;
    const h1 = { x: J.hip.x + nx * hipW, y: J.hip.y + ny * hipW };
    const h2 = { x: J.hip.x - nx * hipW, y: J.hip.y - ny * hipW };
    const c1 = { x: J.neck.x + nx * chestW, y: J.neck.y + ny * chestW };
    const c2 = { x: J.neck.x - nx * chestW, y: J.neck.y - ny * chestW };
    const mid = lerpP(J.hip, J.neck, 0.55);
    ctx.beginPath();
    ctx.moveTo(h1.x, h1.y);
    ctx.quadraticCurveTo(mid.x + nx * chestW * 1.18, mid.y + ny * chestW * 1.18, c1.x, c1.y);
    ctx.quadraticCurveTo(J.neck.x + (ux / l) * 6, J.neck.y + (uy / l) * 6, c2.x, c2.y);
    ctx.quadraticCurveTo(mid.x - nx * chestW * 1.1, mid.y - ny * chestW * 1.1, h2.x, h2.y);
    ctx.quadraticCurveTo(J.hip.x - (ux / l) * 5, J.hip.y - (uy / l) * 5, h1.x, h1.y);
    ctx.closePath();
    const g = ctx.createLinearGradient(J.neck.x, J.neck.y, J.hip.x, J.hip.y);
    g.addColorStop(0, fill2 || fill);
    g.addColorStop(1, fill);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    return { nx, ny, ux: ux / l, uy: uy / l, l };
  }

  function eye(ctx, x, y, r, iris, lookX, angry) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.75, r, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.ellipse(x + lookX * r * 0.3, y + r * 0.1, r * 0.48, r * 0.68, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + lookX * r * 0.3 - r * 0.1, y - r * 0.35, r * 0.25, r * 0.25);
    if (angry) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.9, y - r * 1.35);
      ctx.lineTo(x + r * 0.8, y - r * 0.95);
      ctx.stroke();
    }
  }

  // Verlet-ish chain for hair / scarves / capes (world space).
  function updateChain(ch, rootX, rootY, n, seg, gravity, wind) {
    if (!ch.pts || ch.pts.length !== n) {
      ch.pts = [];
      for (let i = 0; i < n; i++) ch.pts.push({ x: rootX - i * seg * wind, y: rootY + i * seg * 0.3, px: rootX - i * seg * wind, py: rootY + i * seg * 0.3 });
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

  function drawChain(ctx, pts, toLocal, w0, w1, fill, fill2) {
    if (!pts || pts.length < 2) return;
    const L = pts.map(toLocal);
    const left = [];
    const right = [];
    for (let i = 0; i < L.length; i++) {
      const a = L[Math.max(0, i - 1)];
      const b = L[Math.min(L.length - 1, i + 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const w = w0 + (w1 - w0) * (i / (L.length - 1));
      left.push({ x: L[i].x + Math.cos(ang) * w, y: L[i].y + Math.sin(ang) * w });
      right.push({ x: L[i].x - Math.cos(ang) * w, y: L[i].y - Math.sin(ang) * w });
    }
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    const g = ctx.createLinearGradient(L[0].x, L[0].y, L[L.length - 1].x, L[L.length - 1].y);
    g.addColorStop(0, fill);
    g.addColorStop(1, fill2 || fill);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  // Colour transform for hit-flash / charge glow / helpless tint.
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

  // ------------------------------------------------------------ characters
  const LOOKS = {
    blaze: {
      back(ctx, J, pal, P, col, o) {
        // Headband tails
        if (o.chain && o.chain.pts) drawChain(ctx, o.chain.pts, o.toLocal, 3, 1.5, col(pal.main), col(SB.shade(pal.main, -0.3)));
      },
      arm(ctx, J, s, pal, P, col, o) {
        const sh = s === 'A' ? J.sh : J.shB;
        const el = J['el' + s];
        const ha = J['ha' + s];
        const r = P.limb * 0.5;
        limb(ctx, sh, el, r * 1.05, r * 0.9, col(pal.skin), col(SB.shade(pal.skin, 0.35)));
        limb(ctx, el, ha, r * 0.9, r * 0.8, col(pal.skin), col(SB.shade(pal.skin, 0.35)));
        // Wrist wrap
        const w = lerpP(el, ha, 0.72);
        circle(ctx, w.x, w.y, r * 0.95, col(pal.main));
        circle(ctx, ha.x, ha.y, r * 1.35, col(o.fireFists ? '#ffcf5a' : SB.shade(pal.main, -0.25)));
        if (o.fireFists) glow(ctx, ha.x, ha.y, 22, pal.glow);
      },
      leg(ctx, J, s, pal, P, col) {
        const hip = s === 'A' ? J.hip : J.hipB;
        const r = P.limb * 0.56;
        limb(ctx, hip, J['kn' + s], r * 1.25, r * 1.0, col(pal.sub), col(SB.shade(pal.sub, 0.25)));
        limb(ctx, J['kn' + s], J['ft' + s], r * 1.0, r * 0.95, col(pal.sub), col(SB.shade(pal.sub, 0.25)));
        foot(ctx, J, s, r * 1.35, col('#2a2226'));
      },
      body(ctx, J, pal, P, col) {
        const t = torso(ctx, J, 11, 14, col(pal.main), col(SB.shade(pal.main, 0.25)));
        // V-neck showing skin
        const n = J.neck;
        ctx.fillStyle = col(pal.skin);
        ctx.beginPath();
        ctx.moveTo(n.x + t.nx * 7, n.y + t.ny * 7);
        ctx.lineTo(n.x - t.nx * 7, n.y - t.ny * 7);
        ctx.lineTo(n.x - t.ux * 12, n.y - t.uy * 12);
        ctx.closePath();
        ctx.fill();
        // Belt
        const b = lerpP(J.hip, J.neck, 0.12);
        ctx.strokeStyle = col('#1d1a22');
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(b.x + t.nx * 12, b.y + t.ny * 12);
        ctx.lineTo(b.x - t.nx * 12, b.y - t.ny * 12);
        ctx.stroke();
      },
      head(ctx, J, pal, P, col, o) {
        const h = J.head;
        const R = P.headR;
        const a = J.ang.head;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(a);
        // Flame hair (behind)
        const fl = o.t * 0.25;
        const spikes = [[-1.9, 1.25], [-1.35, 1.5], [-0.75, 1.6], [-0.15, 1.45], [0.4, 1.15]];
        for (let i = 0; i < spikes.length; i++) {
          const [ang, len] = spikes[i];
          const L = R * (len + Math.sin(fl + i * 1.7) * 0.12);
          const ca = ang - Math.PI / 2 - 0.35;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ca - 0.45) * R * 0.8, Math.sin(ca - 0.45) * R * 0.8);
          ctx.quadraticCurveTo(Math.cos(ca) * L * 0.9 - 4, Math.sin(ca) * L * 0.9, Math.cos(ca) * L - 6, Math.sin(ca) * L);
          ctx.lineTo(Math.cos(ca + 0.45) * R * 0.8, Math.sin(ca + 0.45) * R * 0.8);
          ctx.closePath();
          const g = ctx.createLinearGradient(0, 0, Math.cos(ca) * L, Math.sin(ca) * L);
          g.addColorStop(0, col(pal.hair));
          g.addColorStop(1, col(pal.glow));
          ctx.fillStyle = g;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = OUTLINE;
          ctx.stroke();
        }
        circle(ctx, 0, 0, R, col(pal.skin));
        // Hair fringe
        ctx.fillStyle = col(pal.hair);
        ctx.beginPath();
        ctx.arc(0, 0, R, Math.PI * 1.02, Math.PI * 1.95);
        ctx.quadraticCurveTo(R * 0.4, -R * 0.35, R * 0.1, -R * 0.45);
        ctx.lineTo(-R * 0.1, -R * 0.2);
        ctx.lineTo(-R * 0.4, -R * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
        // Headband
        ctx.strokeStyle = col(pal.main);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.98, Math.PI * 1.08, Math.PI * 1.9);
        ctx.stroke();
        // Face
        eye(ctx, R * 0.45, -R * 0.05, R * 0.24, col(pal.eye), 1, true);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(R * 0.45, R * 0.5);
        ctx.lineTo(R * 0.78, R * 0.42);
        ctx.stroke();
        // Ear
        ctx.fillStyle = col(SB.shade(pal.skin, -0.12));
        ctx.beginPath();
        ctx.ellipse(-R * 0.38, R * 0.12, R * 0.16, R * 0.22, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    },

    aria: {
      back(ctx, J, pal, P, col, o) {
        if (o.chain && o.chain.pts) drawChain(ctx, o.chain.pts, o.toLocal, 7, 3, col(pal.hair), col(SB.shade(pal.hair, 0.25)));
        // Cape from shoulders
        if (o.chain2 && o.chain2.pts) drawChain(ctx, o.chain2.pts, o.toLocal, 9, 13, col(pal.main), col(SB.shade(pal.main, -0.35)));
      },
      arm(ctx, J, s, pal, P, col) {
        const sh = s === 'A' ? J.sh : J.shB;
        const r = P.limb * 0.5;
        limb(ctx, sh, J['el' + s], r * 1.0, r * 0.85, col(pal.sub), col('#ffffff'));
        limb(ctx, J['el' + s], J['ha' + s], r * 0.95, r * 0.9, col(pal.main), col(SB.shade(pal.main, 0.35)));
        circle(ctx, J['ha' + s].x, J['ha' + s].y, r * 1.1, col(pal.skin));
        if (s === 'A') circle(ctx, sh.x, sh.y, r * 1.55, col(SB.shade(pal.main, 0.1)));
      },
      leg(ctx, J, s, pal, P, col) {
        const hip = s === 'A' ? J.hip : J.hipB;
        const r = P.limb * 0.56;
        limb(ctx, hip, J['kn' + s], r * 1.2, r * 0.95, col(pal.sub), col('#ffffff'));
        limb(ctx, J['kn' + s], J['ft' + s], r * 1.05, r * 0.9, col(pal.main), col(SB.shade(pal.main, 0.35)));
        foot(ctx, J, s, r * 1.3, col(SB.shade(pal.main, -0.4)));
      },
      body(ctx, J, pal, P, col) {
        // Skirt / tassets
        const t0 = lerpP(J.hip, J.neck, 0.05);
        const ang = J.ang.torso;
        ctx.save();
        ctx.translate(t0.x, t0.y);
        ctx.rotate(ang);
        ctx.fillStyle = col(pal.main);
        ctx.beginPath();
        ctx.moveTo(-11, -4);
        ctx.lineTo(11, -4);
        ctx.lineTo(16, 16);
        ctx.lineTo(-17, 16);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
        ctx.fillStyle = col(pal.sub);
        ctx.fillRect(-16, 12, 32, 3);
        ctx.restore();
        const t = torso(ctx, J, 9.5, 12, col(pal.sub), col('#ffffff'));
        // Breastplate
        const c = lerpP(J.hip, J.neck, 0.68);
        ctx.fillStyle = col(pal.main);
        ctx.beginPath();
        ctx.ellipse(c.x + t.nx * 1, c.y + t.ny * 1, 11, 9, ang, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = col('#f2d06b');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 7, 5, ang, 0, TAU);
        ctx.stroke();
      },
      head(ctx, J, pal, P, col) {
        const h = J.head;
        const R = P.headR;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(J.ang.head);
        // Back hair volume
        ctx.fillStyle = col(pal.hair);
        ctx.beginPath();
        ctx.ellipse(-R * 0.3, R * 0.1, R * 1.05, R * 1.15, 0.2, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
        circle(ctx, R * 0.08, 0, R * 0.95, col(pal.skin));
        // Bangs
        ctx.fillStyle = col(pal.hair);
        ctx.beginPath();
        ctx.moveTo(-R * 0.9, 0);
        ctx.quadraticCurveTo(-R * 0.6, -R * 1.25, R * 0.4, -R * 1.02);
        ctx.quadraticCurveTo(R * 1.15, -R * 0.7, R * 1.0, -R * 0.1);
        ctx.lineTo(R * 0.7, -R * 0.45);
        ctx.lineTo(R * 0.45, -R * 0.1);
        ctx.lineTo(R * 0.2, -R * 0.5);
        ctx.lineTo(-R * 0.2, -R * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Circlet
        ctx.strokeStyle = col('#f2d06b');
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(R * 0.08, 0, R * 0.98, Math.PI * 1.25, Math.PI * 1.85);
        ctx.stroke();
        circle(ctx, R * 0.55, -R * 0.78, 2.6, col(pal.glow), false);
        eye(ctx, R * 0.5, R * 0.05, R * 0.25, col(pal.eye), 1, false);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(R * 0.55, R * 0.58);
        ctx.lineTo(R * 0.75, R * 0.55);
        ctx.stroke();
        ctx.restore();
      },
      weapon(ctx, J, pal, P, col, o) {
        const h = J.haA;
        const tip = J.wtip;
        const ang = Math.atan2(tip.y - h.y, tip.x - h.x);
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(ang);
        const L = P.weapon;
        // Glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createLinearGradient(0, 0, L, 0);
        gg.addColorStop(0, SB.rgba(pal.glow, 0));
        gg.addColorStop(1, SB.rgba(pal.glow, o.swordGlow || 0.35));
        ctx.fillStyle = gg;
        ctx.fillRect(4, -9, L, 18);
        ctx.restore();
        // Hilt
        ctx.fillStyle = col('#4a3526');
        ctx.fillRect(-12, -2.5, 12, 5);
        circle(ctx, -13, 0, 3.2, col('#f2d06b'));
        // Guard
        ctx.fillStyle = col('#f2d06b');
        ctx.beginPath();
        ctx.moveTo(2, -9);
        ctx.lineTo(6, -9);
        ctx.lineTo(6, 9);
        ctx.lineTo(2, 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        // Blade
        const g = ctx.createLinearGradient(0, -4, 0, 4);
        g.addColorStop(0, col('#ffffff'));
        g.addColorStop(0.5, col('#cfd8e8'));
        g.addColorStop(1, col('#8e9ab3'));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(6, -4);
        ctx.lineTo(L - 10, -4);
        ctx.lineTo(L, 0);
        ctx.lineTo(L - 10, 4);
        ctx.lineTo(6, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = col(pal.glow);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(L - 12, 0);
        ctx.stroke();
        ctx.restore();
      },
    },

    titan: {
      back(ctx, J, pal, P, col, o) {
        // Crystal shards on the back
        const b = lerpP(J.hip, J.neck, 0.75);
        const a = J.ang.torso;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        for (let i = 0; i < 3; i++) {
          const x = -18 - i * 5;
          const y = -12 + i * 12;
          const s = 16 - i * 3;
          ctx.beginPath();
          ctx.moveTo(x, y - 5);
          ctx.lineTo(x - s * 1.2, y - s * 0.6);
          ctx.lineTo(x - 4, y + 5);
          ctx.closePath();
          ctx.fillStyle = col(pal.glow);
          ctx.fill();
          ctx.strokeStyle = OUTLINE;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
        void o;
      },
      arm(ctx, J, s, pal, P, col, o) {
        const sh = s === 'A' ? J.sh : J.shB;
        const r = P.limb * 0.5;
        const base = s === 'A' ? pal.main : SB.shade(pal.main, -0.15);
        limb(ctx, sh, J['el' + s], r * 1.05, r * 0.85, col(base), col(SB.shade(base, 0.3)));
        limb(ctx, J['el' + s], J['ha' + s], r * 0.95, r * 1.05, col(base), col(SB.shade(base, 0.3)));
        rock(ctx, J['ha' + s].x, J['ha' + s].y, r * 1.45, col(SB.shade(base, -0.1)), J.ang['f' + s]);
        if (s === 'A') {
          rock(ctx, sh.x, sh.y - 2, r * 1.5, col(SB.shade(base, 0.1)), 0.4);
          ctx.fillStyle = col(pal.glow);
          ctx.fillRect(sh.x - 3, sh.y - 6, 6, 3);
        }
        if (o.charging && s === 'A') glow(ctx, J.haA.x, J.haA.y, 30 + Math.sin(o.t * 0.5) * 6, pal.glow);
      },
      leg(ctx, J, s, pal, P, col) {
        const hip = s === 'A' ? J.hip : J.hipB;
        const r = P.limb * 0.55;
        const base = s === 'A' ? pal.sub : SB.shade(pal.sub, -0.15);
        limb(ctx, hip, J['kn' + s], r * 1.2, r * 0.95, col(base), col(SB.shade(base, 0.3)));
        limb(ctx, J['kn' + s], J['ft' + s], r * 1.0, r * 1.1, col(base), col(SB.shade(base, 0.3)));
        foot(ctx, J, s, r * 1.45, col(SB.shade(pal.sub, -0.3)));
      },
      body(ctx, J, pal, P, col, o) {
        const t = torso(ctx, J, 17, 24, col(pal.main), col(SB.shade(pal.main, 0.2)));
        // Cracks with glowing core
        const c = lerpP(J.hip, J.neck, 0.55);
        const pulse = 0.6 + Math.sin(o.t * 0.08) * 0.4;
        glow(ctx, c.x, c.y, 10 + pulse * 5, pal.glow);
        ctx.fillStyle = col(SB.mix(pal.glow, '#ffffff', 0.3));
        ctx.beginPath();
        ctx.moveTo(c.x + t.ux * 8, c.y + t.uy * 8);
        ctx.lineTo(c.x + t.nx * 6, c.y + t.ny * 6);
        ctx.lineTo(c.x - t.ux * 8, c.y - t.uy * 8);
        ctx.lineTo(c.x - t.nx * 6, c.y - t.ny * 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = col(SB.shade(pal.main, -0.45));
        ctx.lineWidth = 2;
        ctx.beginPath();
        const a = lerpP(J.hip, J.neck, 0.85);
        ctx.moveTo(a.x + t.nx * 14, a.y + t.ny * 14);
        ctx.lineTo(a.x + t.nx * 4 - t.ux * 6, a.y + t.ny * 4 - t.uy * 6);
        ctx.lineTo(a.x + t.nx * 8 - t.ux * 14, a.y + t.ny * 8 - t.uy * 14);
        ctx.stroke();
      },
      head(ctx, J, pal, P, col) {
        const h = J.head;
        const R = P.headR;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(J.ang.head);
        rock(ctx, 0, 0, R * 1.05, col(SB.shade(pal.main, 0.08)), 0.2);
        // Brow ridge
        ctx.fillStyle = col(SB.shade(pal.main, -0.3));
        ctx.beginPath();
        ctx.moveTo(-R * 0.2, -R * 0.35);
        ctx.lineTo(R * 1.05, -R * 0.3);
        ctx.lineTo(R * 0.95, -R * 0.05);
        ctx.lineTo(-R * 0.1, -R * 0.1);
        ctx.closePath();
        ctx.fill();
        // Glowing eye
        glow(ctx, R * 0.6, R * 0.1, 10, pal.eye);
        ctx.fillStyle = col(pal.eye);
        ctx.beginPath();
        ctx.ellipse(R * 0.6, R * 0.1, R * 0.26, R * 0.15, -0.1, 0, TAU);
        ctx.fill();
        // Jaw line
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(R * 0.3, R * 0.6);
        ctx.lineTo(R * 0.9, R * 0.5);
        ctx.stroke();
        ctx.restore();
      },
    },

    volt: {
      back(ctx, J, pal, P, col, o) {
        if (o.chain && o.chain.pts) drawChain(ctx, o.chain.pts, o.toLocal, 5.5, 3, col(pal.hair), col(SB.shade(pal.hair, -0.2)));
      },
      arm(ctx, J, s, pal, P, col, o) {
        const sh = s === 'A' ? J.sh : J.shB;
        const r = P.limb * 0.5;
        limb(ctx, sh, J['el' + s], r * 1.05, r * 0.9, col(pal.main), col(SB.shade(pal.main, 0.5)));
        limb(ctx, J['el' + s], J['ha' + s], r * 0.9, r * 0.85, col(pal.main), col(SB.shade(pal.main, 0.5)));
        const w = lerpP(J['el' + s], J['ha' + s], 0.65);
        circle(ctx, w.x, w.y, r * 0.95, col(pal.sub));
        circle(ctx, J['ha' + s].x, J['ha' + s].y, r * 1.1, col(pal.sub));
        if (o.sparky && s === 'A' && Math.floor(o.t / 3) % 3 === 0) spark(ctx, J.haA.x, J.haA.y, pal.glow, o.t);
      },
      leg(ctx, J, s, pal, P, col) {
        const hip = s === 'A' ? J.hip : J.hipB;
        const r = P.limb * 0.56;
        limb(ctx, hip, J['kn' + s], r * 1.15, r * 0.9, col(pal.main), col(SB.shade(pal.main, 0.5)));
        limb(ctx, J['kn' + s], J['ft' + s], r * 0.95, r * 0.85, col(pal.main), col(SB.shade(pal.main, 0.5)));
        const w = lerpP(J['kn' + s], J['ft' + s], 0.6);
        circle(ctx, w.x, w.y, r * 0.95, col(pal.sub));
        foot(ctx, J, s, r * 1.2, col(pal.sub));
      },
      body(ctx, J, pal, P, col) {
        const t = torso(ctx, J, 9, 12, col(pal.main), col(SB.shade(pal.main, 0.35)));
        // Sash
        const b = lerpP(J.hip, J.neck, 0.15);
        ctx.strokeStyle = col(pal.hair);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(b.x + t.nx * 11, b.y + t.ny * 11);
        ctx.lineTo(b.x - t.nx * 11, b.y - t.ny * 11);
        ctx.stroke();
        // Chest straps
        ctx.strokeStyle = col(pal.sub);
        ctx.lineWidth = 3;
        const c = lerpP(J.hip, J.neck, 0.9);
        ctx.beginPath();
        ctx.moveTo(c.x + t.nx * 9, c.y + t.ny * 9);
        ctx.lineTo(b.x - t.nx * 8, b.y - t.ny * 8);
        ctx.stroke();
      },
      head(ctx, J, pal, P, col, o) {
        const h = J.head;
        const R = P.headR;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(J.ang.head);
        circle(ctx, 0, 0, R, col(pal.main));
        // Face opening
        ctx.fillStyle = col(pal.skin);
        ctx.beginPath();
        ctx.ellipse(R * 0.45, -R * 0.12, R * 0.5, R * 0.28, 0, 0, TAU);
        ctx.fill();
        // Glowing eye
        glow(ctx, R * 0.55, -R * 0.12, 9, pal.eye);
        ctx.fillStyle = col(pal.eye);
        ctx.beginPath();
        ctx.ellipse(R * 0.58, -R * 0.12, R * 0.2, R * 0.12, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(R * 0.3, -R * 0.33);
        ctx.lineTo(R * 0.85, -R * 0.26);
        ctx.stroke();
        // Headband plate
        ctx.fillStyle = col(pal.hair);
        ctx.fillRect(-R * 0.9, -R * 0.62, R * 1.8, R * 0.3);
        ctx.fillStyle = col('#c9cfdd');
        ctx.fillRect(R * 0.2, -R * 0.68, R * 0.55, R * 0.42);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(R * 0.2, -R * 0.68, R * 0.55, R * 0.42);
        // Ear spikes (hood)
        ctx.fillStyle = col(pal.main);
        ctx.beginPath();
        ctx.moveTo(-R * 0.4, -R * 0.8);
        ctx.lineTo(-R * 0.9, -R * 1.6);
        ctx.lineTo(-R * 0.05, -R * 0.95);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        void o;
      },
    },
  };

  function foot(ctx, J, s, r, fill) {
    const k = J['kn' + s];
    const f = J['ft' + s];
    const ang = Math.atan2(f.y - k.y, f.x - k.x) - Math.PI / 2;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(r * 0.45, -r * 0.1, r * 0.95, r * 0.55, 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.restore();
  }

  function rock(ctx, x, y, r, fill, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (0.82 + ((i * 53) % 7) / 30);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function glow(ctx, x, y, r, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, SB.rgba(color, 0.85));
    g.addColorStop(1, SB.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
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

  // Full body in local space (facing right, feet at 0,0).
  function drawBody(ctx, char, pal, J, o) {
    const L = LOOKS[char.id];
    const P = char.prop;
    const col = makeCol(o);
    L.back && L.back(ctx, J, pal, P, col, o);
    L.arm(ctx, J, 'B', pal, P, col, o);
    L.leg(ctx, J, 'B', pal, P, col, o);
    L.body(ctx, J, pal, P, col, o);
    L.leg(ctx, J, 'A', pal, P, col, o);
    L.head(ctx, J, pal, P, col, o);
    if (L.weapon) L.weapon(ctx, J, pal, P, col, o);
    L.arm(ctx, J, 'A', pal, P, col, o);
  }

  // Secondary motion (hair / scarf / cape) lives on the render state.
  function updateSecondary(rs, char, J, wx, wy, facing, vx, vy) {
    const toWorld = (p) => ({ x: wx + facing * p.x, y: wy + p.y });
    const wind = facing * (1 + SB.clamp(Math.abs(vx) * 0.2, 0, 2)) + vx * 0.1;
    if (char.id === 'blaze') {
      const hd = toWorld({ x: J.head.x - char.prop.headR * 0.95, y: J.head.y - char.prop.headR * 0.4 });
      updateChain(rs.chain, hd.x, hd.y, 5, 6, 0.55, wind * 0.9);
    } else if (char.id === 'aria') {
      const hd = toWorld({ x: J.head.x - char.prop.headR * 0.9, y: J.head.y - char.prop.headR * 0.5 });
      updateChain(rs.chain, hd.x, hd.y, 7, 7, 0.8, wind);
      const sh = toWorld({ x: J.shB.x - 4, y: J.shB.y + 2 });
      updateChain(rs.chain2, sh.x, sh.y, 6, 9, 1.0, wind * 0.8);
    } else if (char.id === 'volt') {
      const nk = toWorld({ x: J.neck.x - 4, y: J.neck.y + 2 });
      updateChain(rs.chain, nk.x, nk.y, 9, 8, 0.45, wind * 1.2);
    }
    void vy;
  }

  // ------------------------------------------------------------ in-game draw
  function drawFighter(ctx, f, m) {
    if (f.state === 'dead') return;
    const rs = f.rs || (f.rs = { pose: Object.assign({}, f.pose), chain: {}, chain2: {} });
    const target = f.pose;
    const k = f.state === 'move' ? 0.75 : f.state === 'tumble' || f.state === 'roll' || f.state === 'airdodge' ? 0.9 : 0.45;
    if (f.hitlag <= 0 || f.state === 'move') SB.Skel.blend(rs.pose, target, k);
    const J = SB.Skel.solve(rs.pose, f.def.prop, rs.J || (rs.J = {}));
    let x = f.x + f.visOff.x;
    let y = f.y + f.visOff.y;
    if (f.hitShake > 0 && f.hitlag > 0) {
      x += SB.rand(-3, 3);
      y += SB.rand(-2, 2);
    }
    const t = m.frame;

    updateSecondary(rs, f.def, J, x, y, f.facing, f.vx + f.kbx, f.vy + f.kby);

    // Ground shadow
    const gy = m.stage.groundBelow(f.x, f.y - 2);
    if (gy - f.y < 400 && f.state !== 'respawn') {
      const h = Math.max(0, gy - f.y);
      const s = SB.clamp(1 - h / 400, 0.2, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.3 * s})`;
      ctx.beginPath();
      ctx.ellipse(f.x, gy + 1, f.w * 0.7 * s, 5 * s, 0, 0, TAU);
      ctx.fill();
    }

    // Respawn halo platform
    if (f.state === 'respawn') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y + 4, 0, x, y + 4, 60);
      g.addColorStop(0, SB.rgba(f.color, 0.8));
      g.addColorStop(1, SB.rgba(f.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 60, y - 40, 120, 80);
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, y + 3, 42, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Weapon / limb swoosh trail
    if (f.trail.length > 2) drawTrail(ctx, f.trail, f.def.trailColor || '#ffffff', f.def.id === 'aria' ? 9 : 7);

    // Final Smash aura
    if (f.finalReady) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const hue = (t * 6) % 360;
      const g = ctx.createRadialGradient(x, y - f.h / 2, 0, x, y - f.h / 2, f.h * 0.95);
      g.addColorStop(0, `hsla(${hue},100%,65%,0.45)`);
      g.addColorStop(1, `hsla(${(hue + 90) % 360},100%,60%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - f.h, y - f.h * 1.5, f.h * 2, f.h * 2);
      ctx.restore();
    }

    let alpha = 1;
    if (f.invisible) alpha = 0.15;
    if (f.state === 'spotdodge' && f.sf > 2 && f.sf < 17) alpha = 0.5;
    if (f.state === 'roll' && f.sf > 3 && f.sf < 18) alpha = 0.6;
    if (f.state === 'airdodge' && f.sf > 2 && f.sf < 26) alpha = 0.55;
    const flicker = f.inv > 0 && f.state !== 'respawn' && t % 6 < 3;

    const o = {
      t, chain: rs.chain, chain2: rs.chain2,
      toLocal: (p) => ({ x: (p.x - x) * f.facing, y: p.y - y }),
      flash: f.flash > 0 ? Math.min(0.85, f.flash / 8) : f.armorFlash > 0 ? 0.35 : 0,
      tint: f.charging ? '#ffe066' : f.armorFlash > 0 ? '#ff5d5d' : null,
      tintAmt: f.charging ? 0.25 + Math.sin(t * 0.6) * 0.2 : 0.4,
      dark: f.state === 'helpless' ? 0.35 : 0,
      fireFists: f.def.id === 'blaze' && f.state === 'move' && f.move && (f.move.special || f.move.smash),
      charging: f.charging,
      sparky: f.def.id === 'volt',
      swordGlow: f.state === 'move' ? 0.7 : 0.3,
    };

    if (f.inv > 0 && f.state !== 'respawn') {
      // Invincibility shimmer (cheap radial glow rather than shadowBlur).
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
    ctx.save();
    ctx.globalAlpha = alpha * (flicker ? 0.75 : 1);
    ctx.translate(x, y);
    ctx.scale(f.facing, 1);
    drawBody(ctx, f.def, f.pal, J, o);
    ctx.restore();

    // Dizzy stars
    if (f.state === 'dizzy') {
      for (let i = 0; i < 3; i++) {
        const a = t * 0.1 + (i * TAU) / 3;
        drawStar(ctx, x + Math.cos(a) * 22, y - f.h - 14 + Math.sin(a) * 6, 6, '#fff27a');
      }
    }

    // Shield bubble
    if (f.shielding()) {
      const c = { x: f.x, y: f.y - f.h / 2 };
      const r = m.shieldRadius(f);
      const low = f.shieldHP < 15;
      ctx.save();
      const g = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, r * 0.1, c.x, c.y, r);
      g.addColorStop(0, SB.rgba('#ffffff', 0.35));
      g.addColorStop(0.7, SB.rgba(f.color, low ? 0.25 + Math.sin(t * 0.5) * 0.15 : 0.35));
      g.addColorStop(1, SB.rgba(f.color, 0.7));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = SB.rgba('#ffffff', 0.7);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Player tag above head
    if (f.state !== 'respawn' || f.sf > 10) {
      const hy = y - f.h - 26 + (f.state === 'crouch' ? 20 : 0);
      ctx.save();
      ctx.font = '900 15px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#111';
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
    ctx.strokeStyle = '#6b5a10';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawTrail(ctx, pts, color, width) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const k = i / pts.length;
      ctx.strokeStyle = SB.rgba(color, k * 0.75);
      ctx.lineWidth = width * k * 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[Math.max(0, pts.length - 4)].x, pts[Math.max(0, pts.length - 4)].y);
    for (let i = Math.max(0, pts.length - 4); i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
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
    if (!rs) previewState.set(k, (rs = { chain: {}, chain2: {} }));
    // Secondary motion in preview space (unscaled local coords around 0,0).
    updateSecondary(rs, char, J, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawBody(ctx, char, pal, J, { t, chain: rs.chain, chain2: rs.chain2, toLocal: (p) => p, swordGlow: 0.4, sparky: char.id === 'volt' });
    ctx.restore();
  }

  // Head-only portrait for HUD / stock icons.
  const portraitCache = new Map();
  function portrait(char, palIndex, size) {
    const key = char.id + ':' + palIndex + ':' + size;
    if (portraitCache.has(key)) return portraitCache.get(key);
    const c = SB.makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const pal = char.palettes[palIndex % char.palettes.length];
    const pose = SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, char.base, { lean: 0.05, head: 0 }), char.prop);
    const J = SB.Skel.solve(pose, char.prop, {});
    const s = size / (char.prop.headR * 4.2);
    ctx.translate(size / 2 - J.head.x * s, size / 2 - J.head.y * s + size * 0.06);
    ctx.scale(s, s);
    const L = LOOKS[char.id];
    const col = (x) => x;
    const o = { t: 0, toLocal: (p) => p };
    if (char.id === 'aria') {
      // Short static ponytail for the icon
      ctx.fillStyle = pal.hair;
      ctx.beginPath();
      ctx.ellipse(J.head.x - char.prop.headR * 1.1, J.head.y + char.prop.headR * 0.6, char.prop.headR * 0.45, char.prop.headR * 0.9, 0.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    L.body(ctx, J, pal, char.prop, col, o);
    L.head(ctx, J, pal, char.prop, col, o);
    portraitCache.set(key, c);
    return c;
  }

  SB.FighterRenderer = { drawFighter, drawPreview, portrait, drawBody, drawStar };
})();
