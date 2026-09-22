// Items: healing hearts, throwable bombs and the Smash Orb that grants a
// character's Final Smash.
'use strict';
(function () {
  const TAU = Math.PI * 2;

  class Item {
    constructor(match, type, x, y) {
      this.m = match;
      this.type = type;
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.t = 0;
      this.dead = false;
      this.holder = null;
      this.thrownBy = null;
      this.grounded = false;
      this.pickable = type === 'bomb';
      this.throwable = type === 'bomb';
      this.r = type === 'orb' ? 26 : type === 'heart' ? 16 : 14;
      this.life = type === 'orb' ? 1200 : 900;
      this.hp = 28;
      this.lastHitter = null;
      this.hitCooldown = new Map();
      this.fuse = 0;
      this.spawnT = 0;
      this.ox = x;
      this.oy = y;
    }

    pickUp(f) {
      this.holder = f;
      f.item = this;
      this.grounded = false;
      SB.audio.play('grab');
    }
    drop(f) {
      this.holder = null;
      this.vx = f.facing * 2;
      this.vy = -3;
    }
    throwFrom(f, vx, vy) {
      this.holder = null;
      this.thrownBy = f;
      this.throwT = 0;
      this.vx = vx;
      this.vy = vy;
      this.grounded = false;
      const h = f.jointWorld('haA');
      this.x = h.x;
      this.y = h.y;
    }

    update() {
      this.t++;
      if (this.spawnT < 20) this.spawnT++;
      if (!this.holder && --this.life <= 0) {
        this.dead = true;
        this.m.fx.spark(this.x, this.y, '#ffffff', 6);
        return;
      }
      const st = this.m.stage;
      if (this.holder) {
        const h = this.holder.jointWorld('haA');
        this.x = h.x;
        this.y = h.y;
        return;
      }
      if (this.type === 'orb') {
        // Drifts around lazily above the stage.
        this.x = this.ox + Math.sin(this.t * 0.011) * 300;
        this.y = this.oy + Math.sin(this.t * 0.023) * 70;
        for (const [k, v] of this.hitCooldown) {
          if (v <= 1) this.hitCooldown.delete(k);
          else this.hitCooldown.set(k, v - 1);
        }
        return;
      }
      if (this.thrownBy) this.throwT++;
      this.vy = Math.min(this.vy + 0.55, 13);
      const px = this.x;
      const py = this.y;
      this.x += this.vx;
      this.y += this.vy;
      // Land on surfaces
      let landed = false;
      for (const s of st.solids) {
        if (this.x > s.x && this.x < s.x + s.w && py <= s.y && this.y >= s.y) {
          this.y = s.y;
          landed = true;
        } else if (this.x > s.x && this.x < s.x + s.w && this.y > s.y && this.y - 10 < s.y + s.h) {
          this.x = px;
          this.vx = -this.vx * 0.3;
        }
      }
      for (const p of st.plats) {
        if (this.x > p.x1 && this.x < p.x2 && py <= p.y + 1 && this.y >= p.y && this.vy >= 0) {
          this.y = p.y;
          landed = true;
        }
      }
      if (landed) {
        if (this.type === 'bomb' && this.thrownBy && Math.abs(this.vy) > 4) {
          this.explode();
          return;
        }
        this.vy = 0;
        this.vx *= 0.8;
        this.grounded = true;
        this.thrownBy = null;
      } else this.grounded = false;
      if (this.y > st.blast.bottom) this.dead = true;
      // Hearts heal on touch.
      if (this.type === 'heart') {
        for (const f of this.m.fighters) {
          if (!f.isAlive() || f.state === 'respawn') continue;
          const hb = f.hurtbox();
          if (SB.circleRect(this.x, this.y - 10, this.r, hb.x, hb.y, hb.w, hb.h)) {
            f.damage = Math.max(0, f.damage - 35);
            this.dead = true;
            this.m.fx.heal(f.x, f.y - f.h / 2);
            this.m.fx.floatText(f.x, f.y - f.h - 20, '-35%', '#5dff8a', 26);
            SB.audio.play('heal');
            return;
          }
        }
      }
      // Thrown bombs explode on contact.
      if (this.type === 'bomb' && this.thrownBy && this.throwT > 2) {
        for (const f of this.m.fighters) {
          if (f === this.thrownBy || !f.isAlive() || f.intangible()) continue;
          const hb = f.hurtbox();
          if (SB.circleRect(this.x, this.y, this.r + 4, hb.x, hb.y, hb.w, hb.h)) {
            this.explode();
            return;
          }
        }
      }
    }

    explode() {
      this.dead = true;
      this.m.explode(this.x, this.y - 10, 80, 16, this.thrownBy);
    }

    // Orb takes hits from attacks.
    takeHit(from, dmg) {
      if (this.type !== 'orb' || this.hitCooldown.has(from)) return false;
      this.hitCooldown.set(from, 12);
      this.hp -= dmg;
      this.lastHitter = from;
      this.m.fx.hitSpark(this.x, this.y, 0.5, '#ffe066', 'punch');
      SB.audio.play('hit', 0.4, 'elec');
      if (this.hp <= 0) {
        this.dead = true;
        from.finalReady = true;
        this.m.fx.explosion(this.x, this.y, 50, '#ffe066');
        this.m.fx.floatText(from.x, from.y - from.h - 30, 'FINAL SMASH READY!', '#ffe066', 26);
        SB.audio.play('power');
      }
      return true;
    }

    draw(ctx) {
      if (this.spawnT < 20 && !this.holder) ctx.globalAlpha = this.spawnT / 20;
      const blink = this.life < 120 && Math.floor(this.life / 5) % 2 === 0;
      if (blink && !this.holder) ctx.globalAlpha = 0.3;
      const x = this.x;
      const y = this.y;
      const t = this.t;
      if (this.type === 'heart') {
        const s = this.r * (1 + Math.sin(t * 0.15) * 0.08);
        const cy = y - s * 0.9;
        ctx.save();
        ctx.translate(x, cy);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.2);
        g.addColorStop(0, 'rgba(255,120,150,0.5)');
        g.addColorStop(1, 'rgba(255,120,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-s * 2.2, -s * 2.2, s * 4.4, s * 4.4);
        ctx.beginPath();
        ctx.moveTo(0, s * 0.8);
        ctx.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.8, -s * 1.1, 0, -s * 0.45);
        ctx.bezierCurveTo(s * 0.8, -s * 1.1, s * 1.3, -s * 0.1, 0, s * 0.8);
        const hg = ctx.createLinearGradient(0, -s, 0, s);
        hg.addColorStop(0, '#ff7a9c');
        hg.addColorStop(1, '#d6134f');
        ctx.fillStyle = hg;
        ctx.fill();
        ctx.strokeStyle = '#6b0a26';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.ellipse(-s * 0.45, -s * 0.45, s * 0.2, s * 0.12, -0.6, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (this.type === 'bomb') {
        const cy = this.holder ? y : y - this.r;
        ctx.save();
        ctx.translate(x, cy);
        ctx.rotate(this.holder ? 0 : this.x * 0.05);
        const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, this.r);
        g.addColorStop(0, '#5a5f7a');
        g.addColorStop(1, '#14151f');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#8a8fa8';
        ctx.fillRect(-4, -this.r - 5, 8, 6);
        ctx.strokeStyle = '#c9a26b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -this.r - 5);
        ctx.quadraticCurveTo(6, -this.r - 12, 3, -this.r - 16);
        ctx.stroke();
        if (t % 6 < 3) {
          ctx.fillStyle = '#ffdd57';
          ctx.beginPath();
          ctx.arc(3, -this.r - 17, 3.5, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      } else if (this.type === 'orb') {
        ctx.save();
        ctx.translate(x, y);
        const hue = (t * 4) % 360;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 2.4);
        g.addColorStop(0, `hsla(${hue},100%,75%,0.8)`);
        g.addColorStop(1, `hsla(${hue},100%,60%,0)`);
        ctx.fillStyle = g;
        ctx.fillRect(-this.r * 2.4, -this.r * 2.4, this.r * 4.8, this.r * 4.8);
        const bg = ctx.createRadialGradient(-8, -8, 2, 0, 0, this.r);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(0.4, `hsl(${hue},100%,70%)`);
        bg.addColorStop(1, `hsl(${(hue + 60) % 360},100%,40%)`);
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, TAU);
        ctx.fill();
        // Emblem: a stylised cross-circle
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 0.55, 0, TAU);
        ctx.moveTo(-this.r * 0.55, this.r * 0.15);
        ctx.lineTo(this.r * 0.55, this.r * 0.15);
        ctx.moveTo(-this.r * 0.1, -this.r * 0.55);
        ctx.lineTo(-this.r * 0.1, this.r * 0.55);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  SB.Item = Item;
})();
