// Projectiles & transient hitbox entities (fireballs, sword beams, shurikens,
// shockwaves, lightning bolts and dash lines).
'use strict';
(function () {
  const TAU = Math.PI * 2;

  class Projectile {
    constructor(match, owner, type, o) {
      this.m = match;
      this.owner = owner;
      this.type = type;
      Object.assign(this, { x: 0, y: 0, vx: 0, vy: 0, r: 10, life: 60, dmg: 5, ang: 45, bkb: 30, kbg: 50, kind: 'punch', grav: 0, bounce: 0 }, o);
      this.maxLife = this.life;
      this.t = 0;
      this.dead = false;
      this.hitList = new Set();
      this.facing = SB.sign(this.vx) || owner.facing;
      this.color = o.color || owner.pal.glow;
      this.rot = 0;
      this.hist = [];
      // Rect-shaped entities
      this.rect = type === 'bolt' || type === 'dashline';
      this.pierce = type === 'bolt' || type === 'dashline' || type === 'shockwave';
    }

    hitboxes() {
      if (this.dead) return [];
      if (this.type === 'bolt') {
        if (this.t < 3 || this.t > 11) return [];
        return [{ rect: true, x: this.x - this.w / 2, y: this.top, w: this.w, h: this.y - this.top }];
      }
      if (this.type === 'dashline') return [{ rect: true, x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }];
      return [{ x: this.x, y: this.y, r: this.r }];
    }

    update() {
      this.t++;
      if (--this.life <= 0) {
        this.dead = true;
        if (this.type === 'fireball') this.m.fx.explosion(this.x, this.y, 16, this.color);
        return;
      }
      this.hist.push({ x: this.x, y: this.y });
      if (this.hist.length > 8) this.hist.shift();
      if (this.type === 'bolt' || this.type === 'dashline') return;
      this.vy += this.grav;
      this.x += this.vx;
      this.y += this.vy;
      this.rot += 0.45 * this.facing;
      const st = this.m.stage;
      if (this.type === 'shockwave') {
        // Travels along the ground; dies at edges.
        const gy = st.groundBelow(this.x, this.y - 20);
        if (Math.abs(gy - this.y) > 10) this.dead = true;
        if (this.t % 3 === 0) this.m.fx.dust(this.x, this.y, SB.sign(this.vx), 2);
        return;
      }
      if (this.type === 'fireball' && this.t % 2 === 0) this.m.fx.trail(this.x, this.y, 'fire', this.color);
      for (const s of st.solids) {
        if (this.x > s.x && this.x < s.x + s.w && this.y + this.r > s.y && this.y - this.r < s.y + s.h) {
          if (this.bounce && this.vy > 0 && this.y - this.vy + this.r <= s.y + 2) {
            this.y = s.y - this.r;
            this.vy = -Math.max(4, this.vy * this.bounce);
          } else {
            this.dead = true;
            this.m.fx.hitSpark(this.x, this.y, 0.3, this.color, this.kind);
          }
        }
      }
      if (this.bounce) {
        for (const p of st.plats) {
          if (this.x > p.x1 && this.x < p.x2 && this.vy > 0 && this.y + this.r >= p.y && this.y - this.vy + this.r <= p.y + 2) {
            this.y = p.y - this.r;
            this.vy = -Math.max(4, this.vy * this.bounce);
          }
        }
      }
      const b = st.blast;
      if (this.x < b.left || this.x > b.right || this.y > b.bottom || this.y < b.top) this.dead = true;
    }

    onHit() {
      if (!this.pierce) {
        this.dead = true;
      }
    }

    draw(ctx) {
      const t = this.t;
      const a = this.life < 6 ? this.life / 6 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      switch (this.type) {
        case 'fireball': {
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < this.hist.length; i++) {
            const h = this.hist[i];
            const k = i / this.hist.length;
            ctx.fillStyle = SB.rgba('#ff6b1a', k * 0.35);
            ctx.beginPath();
            ctx.arc(h.x, h.y, this.r * (0.5 + k * 0.6), 0, TAU);
            ctx.fill();
          }
          const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 2);
          g.addColorStop(0, '#fffbe0');
          g.addColorStop(0.3, '#ffd23f');
          g.addColorStop(0.6, SB.rgba(this.color, 0.8));
          g.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.r * 2, 0, TAU);
          ctx.fill();
          break;
        }
        case 'wave': {
          ctx.translate(this.x, this.y);
          ctx.scale(this.facing, 1);
          ctx.globalCompositeOperation = 'lighter';
          const s = this.r * (1 + Math.sin(t * 0.5) * 0.05);
          const g = ctx.createLinearGradient(-s, 0, s, 0);
          g.addColorStop(0, SB.rgba(this.color, 0));
          g.addColorStop(1, '#ffffff');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(s * 0.2, -s * 2);
          ctx.quadraticCurveTo(s * 1.6, 0, s * 0.2, s * 2);
          ctx.quadraticCurveTo(s * 0.9, 0, s * 0.2, -s * 2);
          ctx.fill();
          ctx.strokeStyle = this.color;
          ctx.lineWidth = 3;
          ctx.stroke();
          for (let i = 1; i < 4; i++) {
            ctx.globalAlpha = a * (0.4 - i * 0.1);
            ctx.beginPath();
            ctx.moveTo(s * 0.2 - i * 14, -s * 1.8);
            ctx.quadraticCurveTo(s * 1.4 - i * 14, 0, s * 0.2 - i * 14, s * 1.8);
            ctx.stroke();
          }
          break;
        }
        case 'shuriken': {
          ctx.translate(this.x, this.y);
          ctx.rotate(this.rot);
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 2.2);
          g.addColorStop(0, SB.rgba(this.color, 0.8));
          g.addColorStop(1, SB.rgba(this.color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(-this.r * 2.2, -this.r * 2.2, this.r * 4.4, this.r * 4.4);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#d7dbe8';
          ctx.strokeStyle = '#2c2a4a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const rr = i % 2 === 0 ? this.r * 1.3 : this.r * 0.35;
            const an = (i / 8) * TAU;
            ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, TAU);
          ctx.fill();
          break;
        }
        case 'shockwave': {
          ctx.globalCompositeOperation = 'lighter';
          const h = 34 + Math.sin(t * 0.6) * 6;
          const g = ctx.createLinearGradient(0, this.y - h, 0, this.y);
          g.addColorStop(0, SB.rgba(this.color, 0));
          g.addColorStop(1, SB.rgba(this.color, 0.9));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(this.x - 26, this.y);
          ctx.quadraticCurveTo(this.x, this.y - h * 2, this.x + 26, this.y);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#6b5a48';
          for (let i = 0; i < 4; i++) {
            const rx = this.x + Math.sin(i * 2.3 + t) * 16;
            const ry = this.y - 6 - ((t * 3 + i * 9) % 26);
            ctx.fillRect(rx - 3, ry - 3, 6, 6);
          }
          break;
        }
        case 'bolt': {
          const top = this.top;
          const k = this.t < 3 ? this.t / 3 : 1;
          ctx.globalCompositeOperation = 'lighter';
          if (this.t < 3) {
            // Warning marker
            ctx.fillStyle = SB.rgba(this.color, 0.25);
            ctx.fillRect(this.x - this.w / 2, top, this.w, this.y - top);
          }
          const g = ctx.createLinearGradient(this.x - this.w, 0, this.x + this.w, 0);
          g.addColorStop(0, SB.rgba(this.color, 0));
          g.addColorStop(0.5, SB.rgba(this.color, 0.55 * k));
          g.addColorStop(1, SB.rgba(this.color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(this.x - this.w, top, this.w * 2, this.y - top);
          const r = SB.seeded(this.t * 31 + 7);
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass ? '#ffffff' : this.color;
            ctx.lineWidth = pass ? 3 : 9;
            ctx.beginPath();
            let x = this.x;
            ctx.moveTo(x, top);
            for (let y = top; y < this.y; y += 40) {
              x = this.x + (r() - 0.5) * this.w * 0.9;
              ctx.lineTo(x, y);
            }
            ctx.lineTo(this.x, this.y);
            ctx.stroke();
          }
          const gg = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 80);
          gg.addColorStop(0, SB.rgba('#ffffff', 0.8 * k));
          gg.addColorStop(1, SB.rgba(this.color, 0));
          ctx.fillStyle = gg;
          ctx.fillRect(this.x - 80, this.y - 80, 160, 160);
          break;
        }
        case 'dashline': {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createLinearGradient(0, this.y - this.h / 2, 0, this.y + this.h / 2);
          g.addColorStop(0, SB.rgba(this.color, 0));
          g.addColorStop(0.5, SB.rgba('#ffffff', 0.9 * a));
          g.addColorStop(1, SB.rgba(this.color, 0));
          ctx.fillStyle = g;
          ctx.fillRect(this.x - this.w / 2, this.y - this.h * 0.15, this.w, this.h * 0.3);
          break;
        }
      }
      ctx.restore();
    }
  }

  SB.Projectile = Projectile;
})();
