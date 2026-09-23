// Match: owns the fighters, stage, items and projectiles; resolves hits,
// KOs, rules and the camera.
'use strict';
(function () {
  const HIT_COLORS = { fire: '#ff8c1a', slash: '#bfe9ff', elec: '#fff27a', punch: '#ffe066', kick: '#ffe066' };
  const PLAYER_COLORS = ['#ff4d5e', '#3d8bff', '#ffd23f', '#3ddc84'];

  class Match {
    constructor(cfg) {
      this.cfg = cfg;
      this.stage = new SB.Stage(SB.stageById(cfg.stage));
      this.fx = new SB.Effects();
      this.projectiles = [];
      this.items = [];
      this.finals = [];
      this.frame = 0;
      this.phase = 'countdown';
      this.phaseT = 0;
      this.cam = { x: 0, y: -120, zoom: 0.8, sx: 0, sy: 0 };
      this.shakeAmt = 0;
      this.flashAmt = 0;
      this.freeze = 0;
      this.punch = 0;
      this.slow = 0;
      this.training = !!cfg.training;
      this.mode = this.training ? 'training' : cfg.mode;
      this.timeLeft = (cfg.time || 3) * 60 * 60;
      this.itemTimer = SB.randInt(360, 700);
      this.kbMul = 1;
      this.winner = null;
      this.ranking = null;
      this.lastKO = null;
      this.dim = 0;
      this.announce = null;
      this.fighters = cfg.players.map((p, i) => {
        const char = SB.charById(p.char);
        const ctl = new SB.input.Controller(p.type === 'cpu' ? 'cpu' : p.device);
        const f = new SB.Fighter(this, {
          slot: i, char, palette: p.palette, controller: ctl, cpu: p.type === 'cpu', level: p.level,
          color: PLAYER_COLORS[p.slot !== undefined ? p.slot : i], tag: p.type === 'cpu' ? 'CPU' : 'P' + ((p.slot !== undefined ? p.slot : i) + 1),
          stocks: this.mode === 'stock' ? cfg.stocks : 99,
        });
        f.pslot = p.slot !== undefined ? p.slot : i;
        const sp = this.stage.spawnPoint(i, cfg.players.length);
        f.x = sp.x;
        f.y = sp.y;
        f.grounded = true;
        f.ground = this.findSurface(sp.x, sp.y);
        f.state = 'idle';
        f.facing = sp.x > 0 ? -1 : 1;
        if (p.type === 'cpu') f.ai = new SB.AI(f, this, p.level);
        return f;
      });
      this.cam.x = 0;
      this.cam.y = -150;
      this.updateCamera(true);
    }

    findSurface(x, y) {
      for (const s of this.stage.solids) if (Math.abs(s.y - y) < 1 && x >= s.x && x <= s.x + s.w) return s.surface;
      for (const p of this.stage.plats) if (Math.abs(p.y - y) < 1 && x >= p.x1 && x <= p.x2) return p;
      return null;
    }

    // Anime "impact frame": a few inverted / high-contrast frames on big hits.
    impactFrame(x, y) {
      if (SB.settings.impactFrames === false) return;
      this.impact = 6;
      this.impactAt = { x, y };
    }

    shake(a) {
      if (SB.settings.shake) this.shakeAmt = Math.max(this.shakeAmt, a);
    }
    flash(a) {
      this.flashAmt = Math.max(this.flashAmt, a);
    }

    spawnProjectile(owner, type, o) {
      const p = new SB.Projectile(this, owner, type, o);
      this.projectiles.push(p);
      return p;
    }

    startFinal(user) {
      const fs = new SB.FinalSmash(this, user);
      this.finals.push(fs);
      this.announce = { text: fs.name, sub: user.def.fullName || user.def.name, color: user.pal.glow, t: 90, fighter: user };
      this.flash(0.6);
    }

    calcKB(v, d, bkb, kbg, fkb) {
      const w = v.st.weight;
      if (fkb) return fkb * (200 / (w + 100));
      const p = v.damage;
      const kb = ((((p / 10 + (p * d) / 20) * 200) / (w + 100)) * 1.4 + 18) * (kbg / 100) + bkb;
      return kb * this.kbMul;
    }

    // ---------------------------------------------------------------- tick
    step() {
      this.frame++;
      this.phaseT++;
      if (this.announce && --this.announce.t <= 0) this.announce = null;
      if (this.phase === 'countdown') {
        // VS splash (95 frames), then 3-2-1.
        if (this.phaseT === 96 || this.phaseT === 148 || this.phaseT === 200) SB.audio.play('countdown', false);
        if (this.phaseT >= 252) {
          this.phase = 'play';
          this.phaseT = 0;
          SB.audio.play('countdown', true);
        }
      }
      if (this.phase === 'done') return;
      if (this.phase === 'ending') {
        if (this.phaseT >= 200) {
          this.phase = 'done';
          return;
        }
        // Dramatic slow motion right after the final blow.
        if (this.phaseT < 90 && this.phaseT % 4 !== 0) {
          this.fx.update();
          this.updateCamera();
          return;
        }
      }
      if (this.freeze > 0) {
        this.freeze--;
        this.updateCamera();
        return;
      }
      const inputsLive = this.phase === 'play' || this.phase === 'ending';
      for (const f of this.fighters) {
        if (f.ai && inputsLive) f.ai.think();
        if (inputsLive) f.ctl.poll();
        else f.ctl.feed(SB.input.blankState());
      }
      this.stage.update();
      // Carry fighters and items standing on moving platforms.
      for (const f of this.fighters) {
        if (f.grounded && f.ground && f.ground.plat && (f.ground.dx || f.ground.dy)) {
          f.x += f.ground.dx;
          f.y = f.ground.y;
        }
      }
      for (const f of this.fighters) {
        if (f.hitlag > 0) {
          f.tickBuffers();
          f.hitlag--;
          if (f.hitlag === 0 && f.pendingKB) f.applyPendingKB();
          continue;
        }
        f.update();
      }
      for (const fs of this.finals) fs.update();
      this.finals = this.finals.filter((fs) => !fs.dead);
      for (const p of this.projectiles) p.update();
      for (const it of this.items) it.update();
      this.resolveHits();
      this.projectiles = this.projectiles.filter((p) => !p.dead);
      this.items = this.items.filter((i) => !i.dead);
      this.checkBlastZones();
      if (this.phase === 'play') {
        this.spawnItems();
        if (this.mode === 'time') {
          this.timeLeft--;
          if (this.timeLeft <= 0) this.endGame(null, true);
        }
      }
      this.fx.update();
      this.updateCamera();
    }

    // Weapons drop in regularly (Brawlhalla-style), independent of the items rule.
    spawnWeapons() {
      if (this.cfg.weapons === false) return;
      if (this.weaponTimer === undefined) this.weaponTimer = 200;
      if (--this.weaponTimer > 0) return;
      this.weaponTimer = SB.randInt(360, 640);
      const onStage = this.items.filter((i) => i.type === 'weapon').length;
      if (onStage >= 2) return;
      const main = this.stage.solids[0];
      const x = SB.rand(main.x + 60, main.x + main.w - 60);
      const it = new SB.Item(this, 'weapon', x, -560);
      this.items.push(it);
    }

    spawnItems() {
      this.spawnWeapons();
      if (!this.cfg.items || this.training) return;
      if (--this.itemTimer > 0) return;
      this.itemTimer = SB.randInt(480, 900);
      if (this.items.length >= 3) return;
      const orbOk = !this.items.some((i) => i.type === 'orb') && !this.fighters.some((f) => f.finalReady) && !this.finals.length;
      const r = Math.random();
      let type = r < 0.45 ? 'bomb' : r < 0.75 ? 'heart' : 'orb';
      if (type === 'orb' && !orbOk) type = 'bomb';
      const x = SB.rand(-280, 280);
      const it = new SB.Item(this, type, x, type === 'orb' ? -260 : -480);
      if (type === 'orb') {
        it.ox = 0;
        it.oy = -260;
      }
      this.items.push(it);
      this.fx.spark(x, it.y, '#ffffff', 8);
    }

    // ---------------------------------------------------------------- hits
    hitboxesOf(f) {
      if (f.state !== 'move' || !f.move || !f.move.hit.length || f.hitlag > 0) return [];
      const m = f.move;
      const lo = Math.floor(f.prevMf) + 1;
      const hi = Math.floor(f.mf);
      if (hi < lo) return [];
      const out = [];
      const chargeMul = m.charge ? 1 + (f.charge / m.charge.max) * m.charge.dmg : 1;
      for (const h of m.hit) {
        if (Math.max(h.f[0], lo) > Math.min(h.f[1], hi)) continue;
        let x;
        let y;
        if (typeof h.bone === 'string') {
          const j = f.jointWorld(h.bone);
          x = j.x;
          y = j.y;
        } else {
          x = f.x + f.facing * h.bone.x;
          y = f.y + h.bone.y;
        }
        const base = h.dmg === 'counter' ? f.counterDmg : h.dmg;
        let dmg = base * f.st.power * chargeMul;
        const w = f.weapon;
        const armedBone = w && (h.bone === 'haA' || h.bone === 'elA' || h.bone === 'wtip' || h.bone === 'wmid');
        if (armedBone) dmg *= w.dmg;
        out.push({ h, x, y, r: h.r * f.st.hbs, dmg, owner: f });
        // A held weapon extends hand attacks out to the blade.
        if (w && h.bone === 'haA') {
          for (const [bone, k] of [['wtip', 0.9], ['wmid', 0.85]]) {
            const j = f.jointWorld(bone);
            out.push({ h, x: j.x, y: j.y, r: h.r * f.st.hbs * k, dmg, owner: f });
          }
        }
      }
      return out;
    }

    overlapsFighter(hb, v) {
      const b = v.hurtbox();
      if (hb.rect) return SB.rectRect(hb.x, hb.y, hb.w, hb.h, b.x, b.y, b.w, b.h);
      if (SB.circleRect(hb.x, hb.y, hb.r, b.x, b.y, b.w, b.h)) return true;
      if (v.shielding()) {
        const c = v.center();
        const sr = this.shieldRadius(v);
        return SB.dist(hb.x, hb.y, c.x, c.y) < hb.r + sr;
      }
      return false;
    }

    shieldRadius(v) {
      return v.h * 0.52 * (0.35 + 0.65 * (v.shieldHP / SB.Fighter.SHIELD_MAX));
    }

    resolveHits() {
      const F = this.fighters;
      const boxes = new Map();
      for (const f of F) boxes.set(f, this.hitboxesOf(f));

      // Clanks: two grounded attacks meeting cancel each other out.
      for (let i = 0; i < F.length; i++) {
        for (let j = i + 1; j < F.length; j++) {
          const A = F[i];
          const B = F[j];
          const ha = boxes.get(A);
          const hb = boxes.get(B);
          if (!ha.length || !hb.length || !A.grounded || !B.grounded) continue;
          let clank = null;
          for (const a of ha) {
            if (a.h.grab) continue;
            for (const b of hb) {
              if (b.h.grab) continue;
              if (SB.dist(a.x, a.y, b.x, b.y) < a.r + b.r) clank = { a, b };
            }
          }
          if (clank && Math.abs(clank.a.dmg - clank.b.dmg) < 9) {
            for (const f of [A, B]) {
              f.move = null;
              f.state = 'land';
              f.landLag = 16;
              f.sf = 0;
              f.vx = -f.facing * 3;
              f.hitlag = 8;
            }
            boxes.set(A, []);
            boxes.set(B, []);
            this.fx.clank((clank.a.x + clank.b.x) / 2, (clank.a.y + clank.b.y) / 2);
            SB.audio.play('clank');
          }
        }
      }

      for (const A of F) {
        const list = boxes.get(A);
        if (!list.length) continue;
        for (const B of F) {
          if (B === A || !B.isAlive() || B.intangible() || B.grabbedBy === A) continue;
          for (const hb of list) {
            const key = hb.h.grp + ':' + B.uid;
            if (A.hitList.has(key)) continue;
            if (!this.overlapsFighter(hb, B)) continue;
            if (hb.h.grab) {
              const nearGround = B.grounded;
              if (!nearGround || A.grabbing || B.state === 'grabbed' || B.state === 'thrown' || B.state === 'ledge') continue;
              A.hitList.add(key);
              A.grabVictim(B);
              this.fx.spark((A.x + B.x) / 2, B.y - B.h * 0.6, '#ffffff', 3);
              break;
            }
            A.hitList.add(key);
            this.hitFighter(A, B, hb, false);
            break;
          }
          if (A.state !== 'move') break;
        }
        // Attacks can break the Smash Orb and swat projectiles.
        for (const hb of boxes.get(A)) {
          if (hb.h.grab) continue;
          for (const it of this.items) {
            if (it.type === 'orb' && !it.dead && SB.dist(hb.x, hb.y, it.x, it.y) < hb.r + it.r) it.takeHit(A, hb.dmg);
          }
          for (const p of this.projectiles) {
            if (p.owner === A || p.dead || p.pierce) continue;
            if (SB.dist(hb.x, hb.y, p.x, p.y) < hb.r + p.r) {
              p.dead = true;
              this.fx.hitSpark(p.x, p.y, 0.3, p.color, p.kind);
            }
          }
        }
      }

      // Projectiles
      for (const p of this.projectiles) {
        if (p.dead) continue;
        const hbs = p.hitboxes();
        if (!hbs.length) continue;
        for (const B of F) {
          if (B === p.owner || !B.isAlive() || B.intangible() || p.hitList.has(B)) continue;
          let hit = null;
          for (const hb of hbs) if (this.overlapsFighter(hb, B)) hit = hb;
          if (!hit) continue;
          p.hitList.add(B);
          const cx = hit.rect ? SB.clamp(B.x, hit.x, hit.x + hit.w) : hit.x;
          const cy = hit.rect ? SB.clamp(B.y - B.h / 2, hit.y, hit.y + hit.h) : hit.y;
          this.hitFighter(p.owner, B, { h: p, x: cx, y: cy, r: hit.r || 20, dmg: p.dmg * p.owner.st.power, owner: p.owner, proj: p }, true);
          p.onHit(B);
          if (p.dead) break;
        }
        if (p.dead) continue;
        for (const it of this.items) {
          if (it.type === 'orb' && !it.dead && hbs.some((hb) => (hb.rect ? SB.circleRect(it.x, it.y, it.r, hb.x, hb.y, hb.w, hb.h) : SB.dist(hb.x, hb.y, it.x, it.y) < hb.r + it.r))) {
            if (it.takeHit(p.owner, p.dmg)) p.onHit();
          }
        }
        // Projectile vs projectile
        if (!p.pierce) {
          for (const q of this.projectiles) {
            if (q === p || q.dead || q.owner === p.owner || q.pierce) continue;
            if (SB.dist(p.x, p.y, q.x, q.y) < p.r + q.r) {
              p.dead = q.dead = true;
              this.fx.clank((p.x + q.x) / 2, (p.y + q.y) / 2);
            }
          }
        }
      }
    }

    // Core hit resolution (shield, counter, armour, damage + knockback).
    hitFighter(A, B, hb, isProj) {
      const h = hb.h;
      const facing = isProj ? hb.proj.facing : A.facing;
      const dirX = h.auto ? SB.sign(B.x - hb.x) || facing : h.back ? -facing : facing;
      let dmg = hb.dmg;
      const kind = h.kind || 'punch';
      const color = kind === 'elec' ? A.pal.glow : HIT_COLORS[kind] || '#ffe066';
      const hx = (hb.x + B.x) / 2;
      const hy = (hb.y + (B.y - B.h / 2)) / 2;

      // Counter
      const bm = B.move;
      if (B.state === 'move' && bm && bm.counter && B.mf >= bm.counter[0] && B.mf <= bm.counter[1]) {
        B.counterDmg = Math.max(8, dmg * 1.3);
        B.facing = SB.sign(A.x - B.x) || B.facing;
        B.startMove('counterHit');
        if (!isProj) A.hitlag = 22;
        B.hitlag = 10;
        this.fx.ring(B.x, B.y - B.h / 2, '#ffffff', 60);
        this.fx.floatText(B.x, B.y - B.h - 20, 'COUNTER!', B.pal.glow, 24);
        this.flash(0.4);
        SB.audio.play('clank');
        return;
      }
      // Shield
      if (B.shielding()) {
        B.shieldHP -= dmg * 1.19;
        B.state = 'shieldstun';
        B.stun = Math.floor(dmg * 0.6 + 3);
        B.sf = 0;
        B.vx = dirX * Math.min(8, dmg * 0.22 + 1.2);
        const lag = Math.floor(SB.clamp(dmg * 0.3 + 4, 3, 14));
        B.hitlag = lag;
        if (!isProj) {
          A.hitlag = lag;
          if (A.grounded) A.vx = -A.facing * Math.min(5, dmg * 0.12);
        }
        const c = B.center();
        this.fx.ring(c.x, c.y, B.color, this.shieldRadius(B) * 0.8);
        this.fx.spark(hx, hy, '#ffffff', 3);
        SB.audio.play('shield');
        if (B.shieldHP <= 0) B.breakShield();
        return;
      }
      // Staleness (moves used repeatedly get weaker)
      if (!isProj && A.move) {
        const n = A.stale.filter((id) => id === A.move.id).length;
        dmg *= Math.max(0.55, 1 - n * 0.08);
        if (A.hitList.size <= 1) {
          A.stale.push(A.move.id);
          if (A.stale.length > 9) A.stale.shift();
        }
      }
      // Armour
      if (B.state === 'move' && bm && bm.armor && B.mf >= bm.armor[0] && B.mf <= bm.armor[1] && dmg <= bm.armor[2]) {
        B.applyDamage(dmg, A);
        B.armorFlash = 10;
        const lag = Math.floor(SB.clamp(dmg * 0.38 + 5, 3, 18));
        if (!isProj) A.hitlag = lag;
        B.hitlag = lag;
        this.fx.hitSpark(hx, hy, 0.4, color, kind);
        SB.audio.play('hit', 0.4, kind);
        return;
      }

      B.applyDamage(dmg, A);
      let kb = this.calcKB(B, dmg, h.bkb, h.kbg, h.fkb);
      if (B.state === 'crouch') kb *= 0.85;
      let linkHit = false;
      // Mid-combo links (hits that can still become a named combo) keep the
      // opponent close so the finisher can connect.
      if (!isProj && A.move && !A.move.comboMove && A.chainIds && A.chainIds.length >= 2 && A.def.combos) {
        const seq = A.chainSeq;
        if (Object.keys(A.def.combos).some((k) => k.length > seq.length && k.startsWith(seq))) {
          kb = Math.min(kb, 42);
          linkHit = true;
        }
      }
      const lag = Math.floor(SB.clamp((dmg * 0.38 + 5) * (h.hl || 1), 3, 24));
      // Link hits pop the target gently upward so they stay in front of you.
      B.launch(kb, linkHit ? 78 : h.ang, dirX, A, lag);
      if (linkHit) B.hitstun = Math.max(B.hitstun, 22);
      else if (!isProj && A.move && A.chainIds && A.chainIds.length === 1 && A.moveBtn === 'Q' && kb < 60) B.hitstun = Math.max(B.hitstun, 14);
      if (h.drag) B.pendingKB.drag = A;
      B.flash = 8;
      B.hitShake = lag;
      if (!isProj) {
        A.hitlag = lag;
        A.moveHit = true;
      }

      const strength = SB.clamp(kb / 120, 0.2, 2);
      this.fx.hitSpark(hx, hy, strength, color, kind);
      SB.audio.play('hit', strength, kind === 'kick' ? 'punch' : kind);
      if (SB.settings.damageNumbers && dmg >= 1) this.fx.floatText(hx, hy - 30, Math.round(dmg) + '%', '#ffffff', 16 + Math.min(14, dmg));
      if (kb > 90) this.shake(Math.min(18, kb / 14));
      if (h.finisher || kb > 175) this.impactFrame(hx, hy);
      if (h.finisher) {
        // Named combo finishers land with extra impact.
        this.freeze = Math.max(this.freeze, 8);
        this.punch = 0.12;
        this.flash(0.3);
        this.shake(14);
      } else if (kb > 160 && B.damage > 70) {
        // "Smash" hit: brief freeze + zoom punch for a big launch.
        this.freeze = 6;
        this.punch = 0.1;
        this.flash(0.35);
      }
    }

    // A named QWER combo was performed.
    comboCall(f, name) {
      f.comboShow = Object.assign(f.comboShow || { hits: 0, dmg: 0 }, { name, t: 130 });
      this.fx.floatText(f.x, f.y - f.h - 46, name + '!', f.pal.glow, 30);
      this.fx.ring(f.x, f.y - f.h / 2, f.pal.glow, 70);
      f.stats.combos = (f.stats.combos || 0) + 1;
      SB.audio.play('power');
    }

    lockHit(A, B, dmg, kind) {
      if (!B.isAlive() || B.state === 'respawn') return;
      B.applyDamage(dmg, A);
      if (B.grabbing) B.releaseGrab(false);
      if (B.ledge) B.releaseLedge();
      B.move = null;
      B.state = 'hitstun';
      B.hitstun = 14;
      B.sf = 0;
      B.vx = B.vy = B.kbx = B.kby = 0;
      B.pendingKB = null;
      B.flash = 4;
      this.fx.hitSpark(B.x + SB.rand(-10, 10), B.y - B.h / 2 + SB.rand(-20, 20), 0.35, kind === 'elec' ? A.pal.glow : HIT_COLORS[kind], kind);
      SB.audio.play('hit', 0.3, kind);
    }

    finalHit(A, B, dmg, ang, bkb, kbg, dirX, kind) {
      if (!B.isAlive() || B.state === 'respawn') return;
      B.applyDamage(dmg, A);
      const kb = this.calcKB(B, dmg, bkb, kbg);
      B.launch(kb, ang, dirX, A, 16);
      B.flash = 10;
      this.fx.hitSpark(B.x, B.y - B.h / 2, 2, kind === 'elec' ? A.pal.glow : HIT_COLORS[kind], kind);
      this.shake(18);
      SB.audio.play('hit', 1.5, kind);
    }

    explode(x, y, r, dmg, owner) {
      this.fx.explosion(x, y, r * 0.8, '#ff9f1c');
      this.shake(10);
      SB.audio.play('explosion', 1);
      for (const B of this.fighters) {
        if (!B.isAlive() || B.intangible()) continue;
        const b = B.hurtbox();
        if (!SB.circleRect(x, y, r, b.x, b.y, b.w, b.h)) continue;
        const A = owner || B;
        this.hitFighter(A, B, { h: { ang: 55, bkb: 60, kbg: 72, kind: 'fire', auto: true }, x, y, r, dmg, owner: A, proj: { facing: SB.sign(B.x - x) || 1 } }, true);
      }
      for (const it of this.items) {
        // Chain reaction with nearby bombs.
        if (it.type === 'bomb' && !it.dead && !it.holder && SB.dist(it.x, it.y, x, y) < r) it.explode();
      }
    }

    // ---------------------------------------------------------------- KOs
    checkBlastZones() {
      const b = this.stage.blast;
      for (const f of this.fighters) {
        if (!f.isAlive() || f.state === 'respawn') continue;
        const y = f.y - f.h / 2;
        if (f.x < b.left || f.x > b.right || y > b.bottom || y < b.top) this.ko(f);
      }
    }

    ko(f) {
      const killer = f.lastHitBy && f.lastHitBy !== f ? f.lastHitBy : null;
      // Place the blast on-screen at the edge nearest to where they left.
      const view = this.viewRect();
      const px = SB.clamp(f.x, view.x + 30, view.x + view.w - 30);
      const py = SB.clamp(f.y - f.h / 2, view.y + 30, view.y + view.h - 30);
      const vx = f.vx + f.kbx;
      const vy = f.vy + f.kby;
      let ang = Math.atan2(vy, vx);
      if (Math.hypot(vx, vy) < 1) ang = Math.atan2(f.y - f.h / 2 - this.cam.y, f.x - this.cam.x);
      this.fx.koBlast(px, py, ang, f.color);
      this.impactFrame(f.x, f.y - f.h / 2);
      this.shake(20);
      this.flash(0.5);
      this.freeze = 10;
      SB.audio.play('ko');
      f.stats.falls++;
      if (killer) {
        killer.stats.kos++;
        killer.score++;
      } else {
        f.stats.sds++;
        f.score--;
      }
      if (this.mode === 'time' && killer) {
        this.fx.floatText(killer.x, killer.y - killer.h - 30, '+1', killer.color, 30);
      }
      if (this.mode === 'stock') f.stocks--;
      f.die();
      this.lastKO = { f, x: px, y: py, t: this.frame };
      if (this.mode === 'stock' && f.stocks <= 0) {
        f.out = true;
        f.placeT = this.frame;
        const alive = this.fighters.filter((x) => !x.out);
        if (alive.length <= 1 && this.phase === 'play') this.endGame(alive[0] || null, false);
      }
    }

    endGame(winner, timeUp) {
      this.phase = 'ending';
      this.phaseT = 0;
      this.timeUp = timeUp;
      SB.audio.play('game');
      // Ranking
      let rank;
      if (this.mode === 'stock') {
        rank = [...this.fighters].sort((a, b) => {
          if (a.out !== b.out) return a.out ? 1 : -1;
          if (!a.out) return b.stocks - a.stocks || a.damage - b.damage;
          return (b.placeT || 0) - (a.placeT || 0);
        });
      } else {
        rank = [...this.fighters].sort((a, b) => b.score - a.score || a.damage - b.damage);
      }
      this.ranking = rank;
      this.winner = winner || rank[0];
    }

    // -------------------------------------------------------------- camera
    viewRect() {
      const w = SB.W / this.cam.zoom;
      const h = SB.H / this.cam.zoom;
      return { x: this.cam.x - w / 2, y: this.cam.y - h / 2, w, h };
    }

    updateCamera(snap) {
      const cb = this.stage.cam;
      let pts = [];
      for (const f of this.fighters) {
        if (f.state === 'dead' || f.out) continue;
        pts.push({ x: SB.clamp(f.x, cb.left - 150, cb.right + 150), y: SB.clamp(f.y - f.h / 2 + (f.visOff ? f.visOff.y : 0), cb.top - 150, cb.bottom + 100) });
      }
      if (this.phase === 'ending' && this.lastKO && this.phaseT < 90) pts = [{ x: this.lastKO.x, y: this.lastKO.y }];
      if (!pts.length) pts.push({ x: 0, y: -100 });
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const padX = 280;
      const padY = 220;
      let w = Math.max(maxX - minX + padX * 2, (maxY - minY + padY * 2) * (16 / 9), 1000);
      const maxW = Math.min(cb.right - cb.left + 500, 2300);
      if (this.phase === 'ending' && this.phaseT < 90) w = 900;
      w = Math.min(w, maxW);
      const h = w * (9 / 16);
      let tx = (minX + maxX) / 2;
      let ty = (minY + maxY) / 2 + 10;
      // Keep the view inside the camera bounds.
      const left = cb.left - 200;
      const right = cb.right + 200;
      const top = cb.top - 150;
      const bottom = cb.bottom + 150;
      tx = w >= right - left ? (left + right) / 2 : SB.clamp(tx, left + w / 2, right - w / 2);
      ty = h >= bottom - top ? (top + bottom) / 2 : SB.clamp(ty, top + h / 2, bottom - h / 2);
      const tz = SB.W / w;
      const k = snap ? 1 : 0.075;
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.cam.zoom += (tz - this.cam.zoom) * (snap ? 1 : 0.06);
      if (this.punch > 0) this.punch *= 0.85;
      if (this.shakeAmt > 0.3) {
        this.cam.sx = SB.rand(-1, 1) * this.shakeAmt;
        this.cam.sy = SB.rand(-1, 1) * this.shakeAmt;
        this.shakeAmt *= 0.86;
      } else {
        this.cam.sx = this.cam.sy = 0;
        this.shakeAmt = 0;
      }
      if (this.flashAmt > 0) this.flashAmt = Math.max(0, this.flashAmt - 0.04);
      if (this.impact > 0) this.impact--;
      const wantDim = this.finals.length ? 0.45 : 0;
      this.dim += (wantDim - this.dim) * 0.08;
    }
  }

  Match.PLAYER_COLORS = PLAYER_COLORS;
  SB.Match = Match;
})();
