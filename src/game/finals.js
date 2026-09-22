// Final Smash cinematics. Each one is a scripted entity that holds victims
// with small "lock" hits before a huge launching blow.
'use strict';
(function () {
  const TAU = Math.PI * 2;

  class FinalSmash {
    constructor(match, user) {
      this.m = match;
      this.user = user;
      this.type = user.def.final.type;
      this.name = user.def.final.name;
      this.t = 0;
      this.dead = false;
      this.color = user.pal.glow;
      this.facing = user.facing;
      this.trapped = [];
      this.len = { beam: 150, blades: 150, quake: 150, storm: 165 }[this.type];
      this.bolts = [];
      this.rocks = [];
      SB.audio.play('power');
      match.shake(6);
    }

    victims() {
      return this.m.fighters.filter((f) => f !== this.user && f.isAlive() && f.state !== 'respawn' && !(f.inv > 0));
    }

    beamRect() {
      const u = this.user;
      const hand = u.jointWorld('haA');
      const w = 1500;
      return { x: this.facing > 0 ? hand.x : hand.x - w, y: hand.y - 60, w, h: 120, cy: hand.y };
    }

    update() {
      const t = ++this.t;
      const u = this.user;
      const m = this.m;
      if (!u.isAlive()) {
        this.finish();
        return;
      }
      u.state = 'final';
      u.facing = this.facing;
      switch (this.type) {
        case 'beam': {
          if (t < 30) {
            if (t % 2 === 0) u.fxCharge();
          } else if (t < 130) {
            const r = this.beamRect();
            if (t === 30) {
              m.shake(14);
              SB.audio.play('explosion', 1.5);
            }
            if (t % 3 === 0) m.shake(4);
            if (t % 6 === 0) {
              for (const v of this.victims()) {
                const hb = v.hurtbox();
                if (SB.rectRect(r.x, r.y, r.w, r.h, hb.x, hb.y, hb.w, hb.h)) {
                  m.lockHit(u, v, 1.6, 'fire');
                  v.y += (r.cy + v.h / 2 - v.y) * 0.3;
                  v.x += this.facing * 3;
                }
              }
            }
          } else if (t === 130) {
            const r = this.beamRect();
            for (const v of this.victims()) {
              const hb = v.hurtbox();
              if (SB.rectRect(r.x, r.y - 40, r.w, r.h + 80, hb.x, hb.y, hb.w, hb.h)) m.finalHit(u, v, 20, 35, 95, 100, this.facing, 'fire');
            }
          }
          break;
        }
        case 'blades': {
          if (t === 18) {
            // Catch everyone in a wide area in front.
            const x0 = this.facing > 0 ? u.x - 40 : u.x - 560;
            for (const v of this.victims()) {
              const hb = v.hurtbox();
              if (SB.rectRect(x0, u.y - 260, 600, 340, hb.x, hb.y, hb.w, hb.h)) this.trapped.push(v);
            }
            u.x += this.facing * 60;
            if (!this.trapped.length) this.t = this.len - 20;
            SB.audio.play('swing', 1);
          }
          if (t > 18 && t < 118) {
            for (const v of this.trapped) {
              if (!v.isAlive()) continue;
              v.vx = v.vy = v.kbx = v.kby = 0;
              v.state = 'hitstun';
              v.hitstun = 10;
              if (t % 5 === 0) {
                m.lockHit(u, v, 1.7, 'slash');
                m.fx.add({ type: 'slash', x: v.x + SB.rand(-30, 30), y: v.y - v.h / 2 + SB.rand(-30, 30), size: 90, life: 10, color: this.color, rot: SB.rand(0, 3) }, true);
                if (t % 10 === 0) SB.audio.play('swing', 0.8);
              }
            }
            u.invisible = t % 4 < 2;
            if (t % 5 === 0 && this.trapped[0]) {
              const v = this.trapped[0];
              u.x = v.x + SB.rand(-80, 80);
            }
          }
          if (t === 120) {
            for (const v of this.trapped) if (v.isAlive()) m.finalHit(u, v, 20, 40, 100, 100, this.facing, 'slash');
            m.flash(0.8);
          }
          break;
        }
        case 'quake': {
          if (t < 30) {
            if (t % 3 === 0) u.fxCharge();
          } else if (t < 122) {
            m.shake(9);
            if (t % 3 === 0) {
              const cam = m.cam;
              this.rocks.push({ x: cam.x + SB.rand(-700, 700), y: cam.y - 500, vy: SB.rand(4, 8), s: SB.rand(8, 22), r: SB.rand(0, 6) });
            }
            if (t % 8 === 0) {
              for (const v of this.victims()) {
                const gy = m.stage.groundBelow(v.x, v.y - 5);
                if (v.y > gy - 200) {
                  m.lockHit(u, v, 2, 'punch');
                  v.kby = -2;
                }
              }
              m.fx.dust(u.x + SB.rand(-400, 400), 0, 0, 5);
            }
          } else if (t === 124) {
            for (const v of this.victims()) m.finalHit(u, v, 17, 85, 95, 92, SB.sign(v.x - u.x) || 1, 'punch');
            m.flash(0.6);
          }
          for (const r of this.rocks) {
            r.y += r.vy;
            r.vy += 0.3;
            r.r += 0.1;
          }
          this.rocks = this.rocks.filter((r) => r.y < 800);
          break;
        }
        case 'storm': {
          if (t >= 25 && t <= 125 && t % 20 === 5) {
            for (const v of this.victims()) {
              const gy = m.stage.groundBelow(v.x, v.y - 40);
              this.bolts.push({ x: v.x, y: Math.min(gy, v.y + 20), t: 0 });
              m.lockHit(u, v, 5, 'elec');
            }
            m.shake(8);
            SB.audio.play('hit', 1, 'elec');
          }
          if (t === 145) {
            for (const v of this.victims()) {
              this.bolts.push({ x: v.x, y: v.y + 20, t: 0, big: true });
              m.finalHit(u, v, 16, 80, 90, 95, SB.sign(v.x - u.x) || 1, 'elec');
            }
            m.flash(0.9);
          }
          for (const b of this.bolts) b.t++;
          this.bolts = this.bolts.filter((b) => b.t < 14);
          break;
        }
      }
      if (this.t >= this.len) this.finish();
    }

    finish() {
      if (this.dead) return;
      this.dead = true;
      const u = this.user;
      if (u.state === 'final') {
        u.state = u.grounded ? 'idle' : 'air';
        u.sf = 0;
        u.inv = 30;
      }
    }

    drawBack(ctx) {
      void ctx;
    }

    draw(ctx) {
      const t = this.t;
      const u = this.user;
      ctx.save();
      switch (this.type) {
        case 'beam': {
          const hand = u.jointWorld('haA');
          if (t < 30) {
            const r = 20 + t * 2;
            const g = ctx.createRadialGradient(hand.x, hand.y, 0, hand.x, hand.y, r);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.4, SB.rgba(this.color, 0.9));
            g.addColorStop(1, SB.rgba(this.color, 0));
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(hand.x, hand.y, r, 0, TAU);
            ctx.fill();
          } else if (t < 136) {
            const r = this.beamRect();
            const k = t > 125 ? (136 - t) / 11 : Math.min(1, (t - 30) / 6);
            const h = r.h * k * (1 + Math.sin(t * 0.8) * 0.06);
            ctx.globalCompositeOperation = 'lighter';
            const x0 = hand.x;
            const x1 = hand.x + this.facing * r.w;
            const g = ctx.createLinearGradient(0, r.cy - h, 0, r.cy + h);
            g.addColorStop(0, SB.rgba('#ff3d00', 0));
            g.addColorStop(0.3, SB.rgba(this.color, 0.8));
            g.addColorStop(0.5, 'rgba(255,255,240,1)');
            g.addColorStop(0.7, SB.rgba(this.color, 0.8));
            g.addColorStop(1, SB.rgba('#ff3d00', 0));
            ctx.fillStyle = g;
            ctx.fillRect(Math.min(x0, x1), r.cy - h, r.w, h * 2);
            const gg = ctx.createRadialGradient(hand.x, hand.y, 0, hand.x, hand.y, h * 1.4);
            gg.addColorStop(0, '#ffffff');
            gg.addColorStop(1, SB.rgba(this.color, 0));
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(hand.x, hand.y, h * 1.4, 0, TAU);
            ctx.fill();
            for (let i = 0; i < 6; i++) {
              const px = hand.x + this.facing * (((t * 25 + i * 250) % r.w));
              ctx.fillStyle = 'rgba(255,255,220,0.5)';
              ctx.beginPath();
              ctx.ellipse(px, r.cy, 60, h * 0.5, 0, 0, TAU);
              ctx.fill();
            }
          }
          break;
        }
        case 'blades': {
          if (t < 18) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = SB.rgba(this.color, 0.8);
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(u.x, u.y - u.h / 2, 30 + t * 4, 0, TAU);
            ctx.stroke();
          }
          if (t > 18 && t < 118 && this.trapped.length) {
            ctx.globalCompositeOperation = 'lighter';
            for (const v of this.trapped) {
              const r = SB.seeded(t * 13 + v.uid);
              for (let i = 0; i < 4; i++) {
                const a = r() * TAU;
                const l = 90 + r() * 80;
                const cx = v.x;
                const cy = v.y - v.h / 2;
                ctx.strokeStyle = i % 2 ? '#ffffff' : this.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx - Math.cos(a) * l, cy - Math.sin(a) * l);
                ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
                ctx.stroke();
              }
            }
          }
          break;
        }
        case 'quake': {
          for (const r of this.rocks) {
            ctx.save();
            ctx.translate(r.x, r.y);
            ctx.rotate(r.r);
            ctx.fillStyle = '#6b5a48';
            ctx.strokeStyle = '#2d241b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * TAU;
              ctx.lineTo(Math.cos(a) * r.s, Math.sin(a) * r.s * 0.8);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          if (t > 30 && t < 124) {
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createLinearGradient(0, -60, 0, 10);
            g.addColorStop(0, SB.rgba(this.color, 0));
            g.addColorStop(1, SB.rgba(this.color, 0.35 + Math.sin(t * 0.5) * 0.15));
            ctx.fillStyle = g;
            ctx.fillRect(-1200, -60, 2400, 70);
          }
          break;
        }
        case 'storm': {
          const top = this.m.stage.blast.top;
          ctx.globalCompositeOperation = 'lighter';
          for (const b of this.bolts) {
            const r = SB.seeded(b.t * 17 + Math.floor(b.x));
            const w = b.big ? 90 : 50;
            const k = 1 - b.t / 14;
            for (let pass = 0; pass < 2; pass++) {
              ctx.strokeStyle = pass ? SB.rgba('#ffffff', k) : SB.rgba(this.color, k);
              ctx.lineWidth = (pass ? 3 : 12) * (b.big ? 1.8 : 1);
              ctx.beginPath();
              ctx.moveTo(b.x, top);
              for (let y = top; y < b.y; y += 50) ctx.lineTo(b.x + (r() - 0.5) * w, y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 120);
            g.addColorStop(0, SB.rgba('#ffffff', k));
            g.addColorStop(1, SB.rgba(this.color, 0));
            ctx.fillStyle = g;
            ctx.fillRect(b.x - 120, b.y - 120, 240, 240);
          }
          break;
        }
      }
      ctx.restore();
    }
  }

  SB.FinalSmash = FinalSmash;
})();
