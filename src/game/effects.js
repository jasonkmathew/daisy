// Particle & visual effects system (hit sparks, dust, explosions, KO blasts).
'use strict';
(function () {
  const MAX = 1400;

  class Effects {
    constructor() {
      this.list = [];
      this.front = []; // drawn above fighters
    }
    add(p, front) {
      const arr = front ? this.front : this.list;
      if (arr.length > MAX) arr.shift();
      p.life = p.max = p.life || 30;
      p.vx = p.vx || 0;
      p.vy = p.vy || 0;
      p.grav = p.grav || 0;
      p.drag = p.drag === undefined ? 0.98 : p.drag;
      p.rot = p.rot || 0;
      p.vr = p.vr || 0;
      arr.push(p);
      return p;
    }

    update() {
      for (const arr of [this.list, this.front]) {
        for (let i = arr.length - 1; i >= 0; i--) {
          const p = arr[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= p.drag;
          p.vy = p.vy * p.drag + p.grav;
          p.rot += p.vr;
          if (--p.life <= 0) arr.splice(i, 1);
        }
      }
    }

    // ------------------------------------------------------------ emitters
    hitSpark(x, y, strength, color, kind) {
      const s = SB.clamp(strength, 0.2, 2);
      this.add({ type: 'flash', x, y, size: 26 + s * 40, life: 7, color: '#ffffff' }, true);
      this.add({ type: 'ring', x, y, size: 10, grow: 5 + s * 5, life: 12, color, width: 5 }, true);
      this.add({ type: 'star', x, y, size: 20 + s * 26, life: 9, color, rot: SB.rand(0, 6) }, true);
      const n = Math.floor(6 + s * 10);
      for (let i = 0; i < n; i++) {
        const a = SB.rand(0, Math.PI * 2);
        const sp = SB.rand(3, 9) * (0.6 + s * 0.5);
        this.add({ type: 'streak', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: SB.rand(2, 4), len: SB.rand(8, 16), life: SB.randInt(8, 16), color: SB.chance(0.5) ? '#ffffff' : color, drag: 0.88 }, true);
      }
      if (kind === 'fire') {
        for (let i = 0; i < 10 + s * 10; i++) {
          this.add({ type: 'flame', x: x + SB.rand(-10, 10), y: y + SB.rand(-10, 10), vx: SB.rand(-3, 3), vy: SB.rand(-4, 0), size: SB.rand(8, 18), life: SB.randInt(14, 28), color: SB.pick(['#ffdd57', '#ff8c1a', '#ff3d00']), drag: 0.93, grav: -0.12 }, true);
        }
      } else if (kind === 'elec') {
        for (let i = 0; i < 3 + s * 3; i++) {
          this.add({ type: 'bolt', x, y, size: 30 + s * 30, life: SB.randInt(5, 10), color, rot: SB.rand(0, 6), seed: SB.randInt(1, 9999) }, true);
        }
      } else if (kind === 'slash') {
        this.add({ type: 'slash', x, y, size: 50 + s * 40, life: 10, color, rot: SB.rand(-0.8, 0.8) }, true);
      }
    }

    clank(x, y) {
      this.add({ type: 'flash', x, y, size: 50, life: 6, color: '#ffffff' }, true);
      for (let i = 0; i < 14; i++) {
        const a = SB.rand(0, Math.PI * 2);
        this.add({ type: 'streak', x, y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, size: 2, len: 10, life: 12, color: '#fff6a0', drag: 0.9 }, true);
      }
    }

    dust(x, y, dir, n) {
      for (let i = 0; i < n; i++) {
        this.add({
          type: 'dust', x: x + SB.rand(-8, 8), y: y - SB.rand(0, 6),
          vx: dir * SB.rand(0.5, 2.5) + SB.rand(-1.2, 1.2), vy: SB.rand(-1.6, -0.3),
          size: SB.rand(6, 12), grow: 0.35, life: SB.randInt(18, 32), color: '#e9e2d0', drag: 0.94,
        });
      }
    }

    ring(x, y, color, size) {
      this.add({ type: 'ring', x, y, size: size * 0.4, grow: size * 0.09, life: 14, color, width: 3, flat: true });
    }

    spark(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        this.add({ type: 'twinkle', x: x + SB.rand(-10, 10), y: y + SB.rand(-10, 10), vx: SB.rand(-1, 1), vy: SB.rand(-1.5, 0.5), size: SB.rand(4, 8), life: SB.randInt(12, 22), color }, true);
      }
    }

    trail(x, y, kind, color) {
      if (kind === 'fire') {
        for (let i = 0; i < 2; i++) this.add({ type: 'flame', x: x + SB.rand(-12, 12), y: y + SB.rand(-18, 18), vx: SB.rand(-1, 1), vy: SB.rand(-2, 0), size: SB.rand(10, 18), life: SB.randInt(12, 22), color: SB.pick(['#ffdd57', '#ff8c1a', '#ff3d00']), drag: 0.92, grav: -0.1 });
      } else if (kind === 'elec') {
        this.add({ type: 'afterimage', x, y, size: 36, life: 10, color });
        if (SB.chance(0.6)) this.add({ type: 'bolt', x: x + SB.rand(-14, 14), y: y + SB.rand(-24, 24), size: 26, life: 5, color, rot: SB.rand(0, 6), seed: SB.randInt(1, 9999) });
      } else {
        this.add({ type: 'twinkle', x, y, size: 6, life: 10, color });
      }
    }

    charge(x, y, color) {
      for (let i = 0; i < 3; i++) {
        const a = SB.rand(0, Math.PI * 2);
        const d = SB.rand(40, 70);
        this.add({ type: 'twinkle', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d / 14, vy: -Math.sin(a) * d / 14, size: SB.rand(4, 7), life: 14, color, drag: 1 }, true);
      }
    }

    explosion(x, y, r, color) {
      this.add({ type: 'flash', x, y, size: r * 2.2, life: 8, color: '#fff8e0' }, true);
      this.add({ type: 'ring', x, y, size: r * 0.5, grow: r * 0.08, life: 16, color, width: 8 }, true);
      for (let i = 0; i < 26; i++) {
        const a = SB.rand(0, Math.PI * 2);
        const sp = SB.rand(1, 6);
        this.add({ type: 'flame', x: x + Math.cos(a) * r * 0.3, y: y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, size: SB.rand(14, 30), life: SB.randInt(16, 32), color: SB.pick(['#fff1a8', '#ffb627', '#ff6b1a', color]), drag: 0.9, grav: -0.08 }, true);
      }
      for (let i = 0; i < 10; i++) {
        const a = SB.rand(0, Math.PI * 2);
        this.add({ type: 'smoke', x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 1, size: SB.rand(16, 26), grow: 0.5, life: SB.randInt(30, 50), color: '#444450', drag: 0.94 });
      }
    }

    launchSmoke(x, y, speed) {
      this.add({ type: 'smoke', x: x + SB.rand(-4, 4), y: y + SB.rand(-4, 4), size: 8 + speed * 0.4, grow: 0.4, life: 26, color: speed > 18 ? '#fff3c4' : '#d8d8e0', drag: 0.95 });
      if (speed > 18 && SB.chance(0.5)) this.add({ type: 'twinkle', x, y, size: 7, life: 14, color: '#ffe066' });
    }

    shieldBreak(x, y, color) {
      for (let i = 0; i < 24; i++) {
        const a = SB.rand(0, Math.PI * 2);
        const sp = SB.rand(3, 9);
        this.add({ type: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, size: SB.rand(6, 14), life: SB.randInt(24, 40), color, rot: SB.rand(0, 6), vr: SB.rand(-0.3, 0.3), grav: 0.25, drag: 0.97 }, true);
      }
      this.add({ type: 'flash', x, y, size: 120, life: 10, color: '#ffffff' }, true);
    }

    koBlast(x, y, ang, color) {
      this.add({ type: 'koBeam', x, y, ang, size: 900, life: 50, color }, true);
      this.add({ type: 'flash', x, y, size: 380, life: 14, color: '#ffffff' }, true);
      for (let i = 0; i < 40; i++) {
        const a = ang + SB.rand(-0.7, 0.7);
        const sp = SB.rand(6, 26);
        this.add({ type: 'streak', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: SB.rand(3, 7), len: SB.rand(20, 50), life: SB.randInt(20, 40), color: SB.chance(0.5) ? '#ffffff' : color, drag: 0.93 }, true);
      }
    }

    floatText(x, y, text, color, size) {
      this.add({ type: 'text', x, y, vy: -1.2, text, size: size || 22, life: 45, color, drag: 0.96 }, true);
    }

    heal(x, y) {
      for (let i = 0; i < 16; i++) {
        this.add({ type: 'plus', x: x + SB.rand(-25, 25), y: y + SB.rand(-50, 10), vy: SB.rand(-2, -0.5), size: SB.rand(6, 12), life: SB.randInt(24, 40), color: '#5dff8a', drag: 0.97 }, true);
      }
    }

    // ----------------------------------------------------------------- draw
    draw(ctx, front) {
      const arr = front ? this.front : this.list;
      for (const p of arr) drawParticle(ctx, p);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function jag(ctx, len, seed, rot) {
    const r = SB.seeded(seed);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    let x = 0;
    let y = 0;
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      x = (len * i) / steps;
      y = (r() - 0.5) * len * 0.35;
      ctx.lineTo(x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot));
    }
  }

  function drawParticle(ctx, p) {
    const t = p.life / p.max; // 1 -> 0
    const age = 1 - t;
    ctx.globalAlpha = 1;
    switch (p.type) {
      case 'flash': {
        const r = p.size * (0.4 + age * 0.8);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, SB.rgba(p.color, 0.95 * t));
        g.addColorStop(1, SB.rgba(p.color, 0));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'ring': {
        const r = p.size + age * p.grow * p.max;
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * t + 1;
        ctx.beginPath();
        if (p.flat) ctx.ellipse(p.x, p.y, r, r * 0.3, 0, 0, Math.PI * 2);
        else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'star': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const r = p.size * (0.6 + age * 0.6);
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const pts = 8;
        for (let i = 0; i < pts * 2; i++) {
          const rr = i % 2 === 0 ? r : r * 0.28;
          const a = (i / (pts * 2)) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        for (let i = 0; i < pts * 2; i++) {
          const rr = i % 2 === 0 ? r * 0.55 : r * 0.16;
          const a = (i / (pts * 2)) * Math.PI * 2 + 0.2;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'streak': {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const l = p.len * Math.min(1, sp / 4);
        ctx.globalAlpha = Math.min(1, t * 1.5);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * t + 0.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * l, p.y - (p.vy / sp) * l);
        ctx.stroke();
        break;
      }
      case 'flame': {
        const r = p.size * (0.3 + t * 0.7);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t * 0.9;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, '#fff6d0');
        g.addColorStop(0.35, p.color);
        g.addColorStop(1, SB.rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'dust':
      case 'smoke': {
        const r = p.size + age * p.grow * p.max;
        ctx.globalAlpha = t * (p.type === 'dust' ? 0.65 : 0.5);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'twinkle': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        const r = p.size * t;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 1.6);
        ctx.lineTo(p.x + r * 0.35, p.y - r * 0.35);
        ctx.lineTo(p.x + r * 1.6, p.y);
        ctx.lineTo(p.x + r * 0.35, p.y + r * 0.35);
        ctx.lineTo(p.x, p.y + r * 1.6);
        ctx.lineTo(p.x - r * 0.35, p.y + r * 0.35);
        ctx.lineTo(p.x - r * 1.6, p.y);
        ctx.lineTo(p.x - r * 0.35, p.y - r * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'bolt': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'miter';
        jag(ctx, p.size, p.seed + p.life, p.rot);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'slash': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = t;
        const w = p.size * (0.5 + age);
        const g = ctx.createLinearGradient(-w, 0, w, 0);
        g.addColorStop(0, SB.rgba('#ffffff', 0));
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, SB.rgba('#ffffff', 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, w, 4 * t + 1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'afterimage': {
        ctx.globalAlpha = t * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 0.45, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.6, p.size * 0.5);
        ctx.lineTo(-p.size * 0.5, p.size * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'koBeam': {
        ctx.save();
        ctx.translate(p.x, p.y);
        // Beam points back toward the stage (opposite to launch direction).
        ctx.rotate(p.ang + Math.PI);
        ctx.globalCompositeOperation = 'lighter';
        const wid = 140 * (0.3 + t * 0.9);
        const len = p.size * (0.6 + age * 0.6);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, SB.rgba('#ffffff', t));
        g.addColorStop(0.15, SB.rgba(p.color, t * 0.95));
        g.addColorStop(1, SB.rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -wid * 0.2);
        ctx.lineTo(len, -wid);
        ctx.lineTo(len, wid);
        ctx.lineTo(0, wid * 0.2);
        ctx.closePath();
        ctx.fill();
        const g2 = ctx.createLinearGradient(0, 0, len * 0.7, 0);
        g2.addColorStop(0, SB.rgba('#ffffff', t));
        g2.addColorStop(1, SB.rgba('#ffffff', 0));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(0, -wid * 0.06);
        ctx.lineTo(len * 0.7, -wid * 0.3);
        ctx.lineTo(len * 0.7, wid * 0.3);
        ctx.lineTo(0, wid * 0.06);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'text': {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.font = `900 ${p.size}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#111';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        break;
      }
      case 'plus': {
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        const s = p.size;
        ctx.fillRect(p.x - s / 2, p.y - s / 6, s, s / 3);
        ctx.fillRect(p.x - s / 6, p.y - s / 2, s / 3, s);
        break;
      }
    }
  }

  SB.Effects = Effects;
})();
