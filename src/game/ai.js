// CPU opponents. The AI "presses buttons" on a virtual controller so it
// plays by exactly the same rules as a human.
//
// Level 0 is a passive training dummy; 1-9 scale reaction time, defence,
// combo follow-ups and recovery quality.
'use strict';
(function () {
  class AI {
    constructor(f, m, level) {
      this.f = f;
      this.m = m;
      this.level = SB.clamp(level === undefined ? 5 : level, 0, 9);
      this.sx = 0;
      this.sy = 0;
      this.hold = {};
      this.cool = 0;
      this.target = null;
      this.ledgeWait = 0;
      this.shieldT = 0;
      this.plan = null;
      this.lastBtn = {};
      this.retreatT = 0;
      this.dawdle = 0;
      this.rnd = Math.random;
    }

    press(btn, frames = 1) {
      if (this.lastBtn[btn]) return; // needs a release frame between presses
      this.hold[btn] = frames;
    }

    think() {
      const f = this.f;
      const v = SB.input.blankState();
      this.sx = this.sx || 0;
      this.sy = this.sy || 0;
      if (this.level > 0 && f.isAlive()) {
        try {
          this.decide();
        } catch (e) {
          this.sx = this.sy = 0;
        }
      } else {
        this.sx = this.sy = 0;
        if (this.level === 0 && f.state === 'respawn' && f.sf > 60) this.press('jump');
      }
      v.x = SB.clamp(this.sx, -1, 1);
      v.y = SB.clamp(this.sy, -1, 1);
      for (const b of ['attack', 'special', 'jump', 'shield', 'grab', 'smash']) {
        v[b] = this.hold[b] > 0;
        this.lastBtn[b] = v[b];
        if (this.hold[b] > 0) this.hold[b]--;
      }
      f.ctl.virtual = v;
    }

    pickTarget() {
      const f = this.f;
      let best = null;
      let bd = Infinity;
      for (const o of this.m.fighters) {
        if (o === f || !o.isAlive() || o.out) continue;
        let d = Math.hypot(o.x - f.x, o.y - f.y);
        if (o.state === 'respawn') d += 800;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      return best;
    }

    stageInfo() {
      const st = this.m.stage;
      const L = st.ledges;
      const left = L.length ? Math.min(...L.map((l) => l.x)) : -400;
      const right = L.length ? Math.max(...L.map((l) => l.x)) : 400;
      return { left, right, top: L.length ? L[0].y : 0 };
    }

    decide() {
      const f = this.f;
      const m = this.m;
      const lv = this.level;
      const S = f.state;
      const info = this.stageInfo();
      this.target = this.pickTarget();
      const t = this.target;
      if (this.cool > 0) this.cool--;

      // ---- situations that always need handling ----
      if (S === 'grabbed') {
        this.sx = m.frame % 4 < 2 ? 1 : -1;
        if (m.frame % 3 === 0) this.press(m.frame % 6 === 0 ? 'attack' : 'jump');
        return;
      }
      if (S === 'respawn') {
        this.sx = 0;
        if (f.sf > 40 + (9 - lv) * 8) this.sx = f.x > 0 ? -1 : 1;
        return;
      }
      if (S === 'ledge') return this.onLedge(info);
      if (S === 'down') {
        if (f.sf > 14 + this.rnd() * 20) {
          const r = this.rnd();
          if (r < 0.35) this.press('attack');
          else if (r < 0.7) this.sx = f.x > 0 ? -1 : 1;
          else this.sy = -1;
        }
        return;
      }
      if (S === 'dizzy') {
        if (m.frame % 3 === 0) this.press('attack');
        this.sx = m.frame % 6 < 3 ? 1 : -1;
        return;
      }
      if (S === 'tumble' || S === 'hitstun') {
        // DI toward the stage and try to tech on landing.
        this.sx = f.x > 0 ? -1 : 1;
        this.sy = -0.5;
        if (f.y > -70 && f.vy + f.kby > 2 && this.rnd() < lv * 0.06) this.press('shield');
        if (f.hitstun <= 0 && this.offstage(f, info)) this.recover(info);
        return;
      }
      if (f.grabbing && S === 'grabhold') return this.throwChoice(info);
      if (S === 'shield' || S === 'shieldstun') return this.inShield(info);

      // ---- offstage: recover first ----
      if (this.offstage(f, info)) {
        this.recover(info);
        return;
      }
      this.sy = 0;
      if (!t) {
        this.sx = f.x > 50 ? -0.6 : f.x < -50 ? 0.6 : 0;
        return;
      }

      // Final Smash!
      if (f.finalReady && Math.abs(t.x - f.x) < 450 && Math.abs(t.y - f.y) < 200 && t.state !== 'respawn') {
        this.sx = SB.sign(t.x - f.x) * 0.2;
        this.press('special');
        return;
      }

      // Busy (mid-move / lag): only keep holding charge or drift.
      const actionable = ['idle', 'walk', 'dash', 'run', 'crouch', 'air', 'skid', 'land'].includes(S) || (S === 'tumble' && f.hitstun <= 0);
      if (S === 'move') {
        this.duringMove(t, info);
        return;
      }
      if (!actionable) {
        this.sx = 0;
        return;
      }

      // Items
      if (this.handleItems(t, info)) return;

      // Defence: react to incoming attacks.
      if (this.cool === 0 && this.defend(t, info)) return;

      this.offense(t, info);
    }

    offstage(f, info) {
      return f.x < info.left - 5 || f.x > info.right + 5 || (f.y > info.top + 30 && !f.grounded);
    }

    recover(info) {
      const f = this.f;
      const edgeX = f.x < 0 ? info.left : info.right;
      const toward = SB.sign(-f.x) || 1;
      const dx = Math.abs(f.x - edgeX);
      const below = f.y - info.top; // positive = below ledge height
      // Underneath the stage: drift out past the ledge first or we'd hit the underside.
      const under = below > 10 && f.x > info.left - 25 && f.x < info.right + 25;
      this.sx = under ? -toward : toward;
      this.sy = 0;
      if (f.state !== 'air' && f.state !== 'tumble') return;
      const lv = this.level;
      // Double jump when falling and low enough / far enough.
      if (f.jumps > 0 && f.vy > -2 && (below > -60 || dx > 260)) {
        this.press('jump');
        return;
      }
      // Side special for horizontal distance.
      if (dx > 220 && below < 60 && !f.airUsed.side && ['blaze', 'aria', 'volt', 'titan'].includes(f.def.id) && this.rnd() < 0.4 + lv * 0.05) {
        this.sx = toward;
        this.press('special');
        return;
      }
      // Up special when out of jumps (or low).
      if ((f.jumps === 0 && f.vy > 0 && (below > -110 || dx > 150)) || below > 120) {
        if (f.def.id === 'volt') {
          const tx = under ? edgeX - toward * 60 : edgeX - toward * 10;
          const ty = info.top - 40;
          const l = Math.hypot(tx - f.x, ty - f.y) || 1;
          this.sx = (tx - f.x) / l;
          this.sy = (ty - f.y) / l;
          if (this.sy > -0.3) this.sy = -0.5;
        } else this.sy = -1;
        this.press('special');
      }
    }

    onLedge(info) {
      const f = this.f;
      if (!this.ledgeWait) this.ledgeWait = 8 + Math.floor(this.rnd() * (40 - this.level * 3));
      if (f.sf < this.ledgeWait) {
        this.sx = this.sy = 0;
        return;
      }
      this.ledgeWait = 0;
      const r = this.rnd();
      const toward = -f.ledge.side;
      if (r < 0.4) this.sx = toward;
      else if (r < 0.65) this.press('jump');
      else if (r < 0.85) this.press('shield');
      else this.press('attack');
      void info;
    }

    inShield(info) {
      const f = this.f;
      const t = this.target;
      this.sx = 0;
      this.hold.shield = 2;
      if (this.shieldT > 0) this.shieldT--;
      // Punish: attacker is in endlag close by.
      if (t && f.state === 'shield' && t.state === 'move' && t.move && t.mf > this.lastHitboxFrame(t.move) && Math.abs(t.x - f.x) < 90) {
        this.hold.shield = 0;
        if (this.rnd() < 0.5) this.press('grab');
        else {
          this.sy = -1;
          this.press('special');
        }
        return;
      }
      if (this.shieldT <= 0 || f.shieldHP < 15) {
        this.hold.shield = 0;
        if (this.rnd() < 0.3 && t) {
          this.sx = SB.sign(f.x - t.x) || 1;
          if (f.x + this.sx * 120 < info.left || f.x + this.sx * 120 > info.right) this.sx = -this.sx;
        }
      }
    }

    lastHitboxFrame(m) {
      return m.hit.length ? Math.max(...m.hit.map((h) => h.f[1])) : 0;
    }

    throwChoice(info) {
      const f = this.f;
      const t = f.grabbing;
      if (f.sf < 8 + Math.floor(this.rnd() * 10)) {
        if (this.level > 5 && f.sf % 12 === 0 && this.rnd() < 0.5) this.press('attack');
        return;
      }
      const nearL = f.x - info.left < 180;
      const nearR = info.right - f.x < 180;
      let dir;
      if (t.damage > 90 && (nearL || nearR)) {
        const edgeDir = nearL ? -1 : 1;
        dir = edgeDir === f.facing ? 'f' : 'b';
      } else if (t.damage < 60) dir = this.rnd() < 0.6 ? 'd' : 'u';
      else dir = this.rnd() < 0.5 ? 'u' : this.rnd() < 0.5 ? 'f' : 'b';
      this.sx = dir === 'f' ? f.facing : dir === 'b' ? -f.facing : 0;
      this.sy = dir === 'u' ? -1 : dir === 'd' ? 1 : 0;
    }

    duringMove(t, info) {
      const f = this.f;
      const m = f.move;
      // Hold smash charges a little (longer at high level vs. distant targets).
      if (m.charge && f.charging) {
        const want = Math.abs(t.x - f.x) > 70 ? 20 + this.level * 3 : 4;
        if (f.charge < want) {
          if (m.charge.btn === 'attack') this.hold.attack = 2;
          else this.hold[m.charge.btn] = 2;
        }
      }
      // Drift toward target with aerials, but never drift offstage when low.
      if (!f.grounded) {
        let dir = SB.sign(t.x - f.x);
        if ((f.x < info.left + 20 && dir < 0) || (f.x > info.right - 20 && dir > 0)) dir = f.y > info.top - 150 ? -dir : dir;
        this.sx = dir * 0.8;
        if (this.offstage(f, info)) this.sx = SB.sign(-f.x);
      } else this.sx = 0;
      this.sy = 0;
    }

    handleItems(t, info) {
      const f = this.f;
      const m = this.m;
      if (f.item) {
        const dx = t.x - f.x;
        if (Math.abs(dx) < 400 && Math.abs(t.y - f.y) < 120 && this.rnd() < 0.08) {
          this.sx = SB.sign(dx) * 0.5;
          this.press('attack');
          return true;
        }
        return false;
      }
      for (const it of m.items) {
        if (it.dead || it.holder) continue;
        const d = Math.abs(it.x - f.x);
        if (it.type === 'heart' && f.damage > 40 && d < 500 && it.grounded) {
          this.walkTo(it.x, info);
          return true;
        }
        if (it.type === 'bomb' && it.grounded && d < 250 && this.rnd() < 0.5) {
          if (d < 20 && f.grounded) this.press('attack');
          else this.walkTo(it.x, info);
          return true;
        }
        if (it.type === 'orb' && d < 350 && this.level >= 3) {
          const dy = it.y - (f.y - f.h / 2);
          this.sx = SB.sign(it.x - f.x);
          if (dy < -60 && f.grounded) this.press('jump', 6);
          else if (Math.hypot(it.x - f.x, dy) < 90) {
            this.sy = dy < -40 ? -1 : 0;
            this.press('attack');
          }
          return true;
        }
      }
      return false;
    }

    walkTo(x, info) {
      const f = this.f;
      const d = x - f.x;
      this.sx = Math.abs(d) < 8 ? 0 : SB.sign(d);
      if (f.x < info.left + 15 && this.sx < 0) this.sx = 0;
      if (f.x > info.right - 15 && this.sx > 0) this.sx = 0;
    }

    defend(t, info) {
      const f = this.f;
      const lv = this.level;
      let threat = false;
      for (const o of this.m.fighters) {
        if (o === f || !o.isAlive()) continue;
        if (o.state === 'move' && o.move && o.move.hit.length && !o.move.hit[0].grab) {
          const first = o.move.hit[0].f[0];
          const d = Math.hypot(o.x - f.x, o.y - f.y);
          if (d < 130 + (o.def.prop.weapon || 0) && o.mf < first + 2 && SB.sign(f.x - o.x) === o.facing) threat = true;
        }
      }
      for (const p of this.m.projectiles) {
        if (p.owner === f || p.dead) continue;
        const dx = f.x - p.x;
        if (Math.abs(dx) < 150 && SB.sign(dx) === SB.sign(p.vx || 1) && Math.abs(p.y - (f.y - f.h / 2)) < 70) threat = true;
      }
      if (!threat) return false;
      this.cool = Math.max(4, 22 - lv * 2);
      if (this.rnd() > 0.12 + lv * 0.08) return false;
      const r = this.rnd();
      if (f.grounded) {
        if (r < 0.55) {
          this.hold.shield = 12 + Math.floor(this.rnd() * 10);
          this.shieldT = 14;
          this.sx = 0;
        } else if (r < 0.75) {
          this.hold.shield = 3;
          this.sy = 1;
        } else if (r < 0.9) {
          this.press('jump', 5);
        } else {
          const away = SB.sign(f.x - t.x) || 1;
          if (f.x + away * 150 > info.left && f.x + away * 150 < info.right) {
            this.hold.shield = 3;
            this.sx = away;
          }
        }
      } else if (!f.airUsed.dodge && r < 0.5) {
        this.press('shield');
      }
      return true;
    }

    offense(t, info) {
      const f = this.f;
      const lv = this.level;
      const dx = t.x - f.x;
      const adx = Math.abs(dx);
      const dy = (t.y - t.h / 2) - (f.y - f.h / 2); // negative: target above
      const dir = SB.sign(dx) || f.facing;
      const reach = f.w / 2 + t.w / 2 + 30 + (f.def.prop.weapon || 0) * 0.6;
      const tOff = this.offstage(t, info);
      const react = Math.max(2, 26 - lv * 2.6);
      const heavy = t.damage > 100;
      const r = this.rnd();

      // Edge-guard: stay near the ledge instead of chasing forever.
      if (tOff && t.y > info.top - 40) {
        const edge = t.x < 0 ? info.left : info.right;
        const stand = edge - SB.sign(edge) * 40;
        if (f.grounded) {
          if (Math.abs(f.x - stand) > 20) this.walkTo(stand, info);
          else {
            this.sx = 0;
            if (f.facing !== SB.sign(edge)) this.sx = SB.sign(edge) * 0.5;
            else if (this.cool === 0 && adx < 300) {
              // Projectile or a jump-out aerial for the brave.
              this.cool = react + 10;
              if (lv >= 6 && r < 0.3 && adx < 200 && t.y < info.top + 150) {
                this.press('jump', 3);
                this.plan = { type: 'aerial', dir: 'f', t: 12 };
              } else if (['blaze', 'aria', 'volt'].includes(f.def.id) && r < 0.6) this.press('special');
              else if (adx < 90) {
                this.sy = 1;
                this.press('smash');
              }
            }
          }
        } else this.sx = SB.sign(edge - f.x) * 0.5 - SB.sign(edge) * 0.8;
        return;
      }

      // Pending short-hop aerial plan
      if (this.plan && this.plan.type === 'aerial') {
        if (--this.plan.t <= 0 || f.grounded) {
          const p = this.plan;
          this.plan = null;
          if (!f.grounded) {
            if (p.dir === 'f') this.sx = f.facing;
            else if (p.dir === 'b') this.sx = -f.facing;
            else if (p.dir === 'u') this.sy = -1;
            else if (p.dir === 'd') this.sy = 1;
            else this.sx = 0;
            this.press('attack');
          }
        } else this.sx = dir * 0.7;
        return;
      }

      // Airborne: aerials at close range, otherwise drift toward.
      if (!f.grounded) {
        this.sx = dir;
        if (this.cool === 0 && adx < reach + 20 && Math.abs(dy) < 110) {
          this.cool = react;
          if (dy < -45) this.sy = -1;
          else if (dy > 45) this.sy = 1;
          else this.sx = SB.sign(dx) === f.facing ? f.facing : -f.facing;
          this.press('attack');
        } else if (dy < -120 && f.jumps > 0 && this.cool === 0 && adx < 200) {
          this.press('jump');
          this.cool = react;
        }
        // Don't drift off the stage.
        if ((f.x < info.left + 30 && this.sx < 0) || (f.x > info.right - 30 && this.sx > 0)) this.sx = 0;
        return;
      }

      // Grounded ----------------------------------------------------------
      // Low levels dawdle: sometimes they just stand around or wander.
      if (this.dawdle > 0) {
        this.dawdle--;
        this.guardEdge(info);
        return;
      }
      if (this.cool === 0 && this.rnd() < (9 - lv) * 0.035) {
        this.dawdle = 20 + Math.floor(this.rnd() * 40);
        this.sx = this.rnd() < 0.5 ? 0 : SB.pick([-0.5, 0.5]);
        return;
      }
      if (this.cool > 0) {
        // spacing while waiting
        if (adx > reach + 40) this.sx = dir;
        else if (adx < reach * 0.5 && lv > 4 && r < 0.05) this.sx = -dir;
        else this.sx = 0;
        this.guardEdge(info);
        return;
      }
      this.cool = react + Math.floor(this.rnd() * react);

      // Target above: anti-air.
      if (dy < -70 && adx < 90) {
        this.sx = 0;
        if (dy > -220) {
          this.sy = -1;
          if (heavy || r < 0.35) this.press('smash');
          else {
            this.sy = -0.6;
            this.press('attack');
          }
        } else {
          this.press('jump', 6);
          this.plan = { type: 'aerial', dir: 'u', t: 10 };
        }
        return;
      }
      // Target on a platform above: hop up.
      if (dy < -90 && adx < 220) {
        this.sx = dir;
        this.press('jump', 8);
        this.plan = { type: 'aerial', dir: SB.sign(dx) === f.facing ? 'f' : 'n', t: 16 };
        return;
      }
      // Face the target before attacking.
      if (f.facing !== dir && adx < reach + 60) {
        this.sx = dir * 0.5;
        this.cool = 2;
        return;
      }

      if (adx <= reach) {
        const shieldy = t.state === 'shield' || t.state === 'shieldstun';
        this.sx = 0;
        if (shieldy && r < 0.3 + lv * 0.06) this.press('grab');
        else if (heavy && r < 0.55) {
          this.sx = dir;
          this.press('smash');
        } else if (r < 0.22) this.press('attack');
        else if (r < 0.42) {
          this.sx = dir * 0.6;
          this.press('attack');
        } else if (r < 0.55) {
          this.sy = 0.8;
          this.press('attack');
        } else if (r < 0.7) this.press('grab');
        else if (r < 0.82) {
          this.press('jump', 3);
          this.plan = { type: 'aerial', dir: r < 0.76 ? 'n' : 'f', t: 5 };
        } else if (r < 0.92) {
          this.sx = dir;
          this.press('smash');
        } else {
          this.sy = SB.pick([-1, 0, 1]);
          this.press('special');
        }
        return;
      }
      // Mid range: projectile or approach.
      if (adx < 520 && Math.abs(dy) < 80 && r < 0.25 && ['blaze', 'aria', 'volt'].includes(f.def.id)) {
        this.sx = 0;
        if (f.facing === dir) this.press('special');
        else this.sx = dir * 0.5;
        return;
      }
      if (adx < reach + 110 && r < 0.3) {
        this.sx = dir;
        this.press('jump', 3);
        this.plan = { type: 'aerial', dir: r < 0.15 ? 'f' : 'n', t: 8 };
        return;
      }
      if (f.state === 'run' && adx < reach + 70 && r < 0.4) {
        this.press('attack');
        return;
      }
      this.sx = dir;
      this.cool = 2;
      this.guardEdge(info);
    }

    guardEdge(info) {
      const f = this.f;
      if (f.x < info.left + 25 && this.sx < 0) this.sx = 0;
      if (f.x > info.right - 25 && this.sx > 0) this.sx = 0;
    }
  }

  SB.AI = AI;
})();
