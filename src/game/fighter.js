// Fighter: physics, state machine, attacks, damage and knockback.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const BUF = 7; // input buffer window (frames)
  const KB_SPEED = 0.15; // knockback units -> px/frame
  const KB_DECAY = 0.26; // px/frame^2
  const TUMBLE_KB = 80;
  const SHIELD_MAX = 50;
  const LEDGE_TIME = 300;

  const GROUND_STATES = new Set(['idle', 'walk', 'dash', 'run', 'skid', 'crouch', 'jumpsquat', 'land', 'shield', 'shieldstun', 'unshield', 'roll', 'spotdodge', 'down', 'getup', 'tech', 'dizzy', 'grabhold', 'grabbed']);
  // States that stop at platform edges instead of walking off.
  const EDGE_STOP = new Set(['idle', 'crouch', 'land', 'jumpsquat', 'shield', 'shieldstun', 'unshield', 'roll', 'spotdodge', 'down', 'getup', 'tech', 'dizzy', 'grabhold', 'skid']);

  let nextId = 1;

  class Fighter {
    constructor(match, o) {
      this.m = match;
      this.uid = nextId++;
      this.slot = o.slot;
      this.def = o.char;
      this.st = o.char.stats;
      this.palIndex = o.palette || 0;
      this.pal = o.char.palettes[this.palIndex % o.char.palettes.length];
      this.ctl = o.controller;
      this.cpu = !!o.cpu;
      this.level = o.level || 5;
      this.color = o.color;
      this.tag = o.tag;
      this.stocks = o.stocks;
      this.damage = 0;
      this.stats = { kos: 0, falls: 0, sds: 0, dealt: 0, taken: 0, maxCombo: 0 };
      this.out = false;
      this.score = 0;
      this.finalReady = false;
      this.weapon = null;
      this.prop = this.def.prop;
      this.pose = SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, this.def.base), this.def.prop);
      this.J = SB.Skel.solve(this.pose, this.def.prop, {});
      // Hand offset while hanging on a ledge (so the hands line up with the corner).
      const hang = SB.Skel.solve(Object.assign({}, this.def.poses.ledge), this.def.prop, {});
      this.hangHand = { x: (hang.haA.x + hang.haB.x) / 2, y: Math.min(hang.haA.y, hang.haB.y) };
      this.reset();
    }

    reset() {
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.kbx = 0;
      this.kby = 0;
      this.facing = 1;
      this.state = 'air';
      this.sf = 0;
      this.move = null;
      this.mf = 0;
      this.prevMf = 0;
      this.hitList = new Set();
      this.charge = 0;
      this.chargeDone = false;
      this.charging = false;
      this.grounded = false;
      this.ground = null;
      this.jumps = this.st.jumps;
      this.airUsed = {};
      this.hitlag = 0;
      this.hitstun = 0;
      this.pendingKB = null;
      this.shieldHP = SHIELD_MAX;
      this.stun = 0;
      this.inv = 0;
      this.ledge = null;
      this.ledgeCD = 0;
      this.ledgeInvReady = true;
      this.grabbing = null;
      this.grabbedBy = null;
      this.grabTimer = 0;
      this.item = null;
      this.buf = { attack: 0, special: 0, jump: 0, shield: 0, grab: 0 };
      this.bufSmash = false;
      this.cbuf = null;
      this.dropThrough = 0;
      this.fastFall = false;
      this.gmul = 1;
      this.invisible = false;
      this.flash = 0;
      this.lag = 0;
      this.djumpT = 0;
      this.spinT = 0;
      this.lastHitBy = null;
      this.lastHitTimer = 0;
      this.combo = 0;
      this.comboBy = null;
      this.stale = [];
      this.trail = [];
      this.visOff = { x: 0, y: 0 };
      this.counterDmg = 0;
      this.armorFlash = 0;
      this.respawnT = 0;
      this.deadT = 0;
      this.dodgeDir = null;
      this.rollDir = 0;
      this.tapJumped = false;
      this.wasShieldPress = 99;
      this.hitShake = 0;
      this.launchTrail = 0;
      this.teeter = false;
      this.chainSeq = '';
      this.chainIds = [];
      this.chaining = false;
      this.nextLetter = null;
      this.moveBtn = '';
      this.moveHit = false;
      this.comboShow = null;
      this.comboDmg = 0;
      this.dodgeCD = 0;
      this.wallCD = 0;
      this.wallTouch = null;
      this.wallDir = 0;
      if (!this.weapon) this.prop = this.def.prop;
    }

    // ------------------------------------------------------------ helpers
    get c() {
      return this.ctl;
    }
    stickX() {
      return this.ctl.cur.x;
    }
    stickY() {
      return this.ctl.cur.y;
    }
    get w() {
      return this.def.w;
    }
    get h() {
      return this.def.h;
    }
    jointWorld(name) {
      const j = this.J[name] || this.J.body;
      return { x: this.x + this.facing * j.x, y: this.y + j.y };
    }
    hurtbox() {
      const w = this.w;
      let h = this.h;
      if (this.state === 'crouch' || (this.state === 'move' && this.move && this.move.crouch)) h *= 0.68;
      if (this.state === 'down') return { x: this.x - w * 1.1, y: this.y - h * 0.35, w: w * 2.2, h: h * 0.35 };
      if (this.state === 'roll' || this.state === 'tech' || this.state === 'spotdodge') h *= 0.75;
      return { x: this.x - w / 2, y: this.y - h, w, h };
    }
    center() {
      return { x: this.x, y: this.y - this.h * 0.5 };
    }
    isAlive() {
      return this.state !== 'dead' && !this.out;
    }
    intangible() {
      if (this.state === 'dead' || this.state === 'respawn' || this.state === 'final') return true;
      if (this.inv > 0) return true;
      if (this.state === 'move' && this.move && this.move.inv) {
        const [a, b] = this.move.inv;
        if (this.mf >= a && this.mf <= b) return true;
      }
      if (this.state === 'roll' && this.sf >= 3 && this.sf <= 18) return true;
      if (this.state === 'spotdodge' && this.sf >= 2 && this.sf <= 17) return true;
      if (this.state === 'airdodge' && this.sf >= 2 && this.sf <= 26) return true;
      if ((this.state === 'getup' || this.state === 'tech') && this.sf <= 20) return true;
      if (this.state === 'ledge' && this.ledgeInv > 0) return true;
      if (this.state === 'climb' && this.sf <= 20) return true;
      return false;
    }
    shielding() {
      return this.state === 'shield' || this.state === 'shieldstun';
    }
    projCount(type) {
      return this.m.projectiles.filter((p) => p.owner === this && p.type === type && !p.dead).length;
    }
    spawnProj(type, o) {
      const j = this.jointWorld(o.bone || 'haA');
      return this.m.spawnProjectile(this, type, Object.assign({}, o, { x: j.x, y: j.y, vx: o.vx * this.facing, vy: o.vy || 0 }));
    }
    leaveGround(vy) {
      if (this.grounded) {
        this.grounded = false;
        this.ground = null;
      }
      this.vy = vy;
    }
    fxTrail(kind) {
      const b = this.jointWorld('body');
      this.m.fx.trail(b.x, b.y, kind, this.pal.glow);
    }
    fxCharge() {
      const b = this.jointWorld('body');
      this.m.fx.charge(b.x, b.y, this.pal.glow);
    }
    fxDust() {
      this.m.fx.dust(this.x, this.y, -this.facing, 3);
    }
    quakeShock(m) {
      for (const d of [-1, 1]) {
        m.spawnProjectile(this, 'shockwave', { x: this.x + d * 30, y: this.y, vx: d * 8.5, vy: 0, r: 20, life: 34, dmg: 10, ang: 80, bkb: 55, kbg: 60, kind: 'punch', color: this.pal.glow });
      }
      m.shake(12);
      m.fx.dust(this.x, this.y, 0, 14);
      SB.audio.play('explosion', 0.7);
    }

    // ------------------------------------------------------------- input
    tickBuffers() {
      const c = this.ctl;
      for (const b of ['special', 'jump', 'shield', 'grab']) {
        if (c.pressed(b)) this.buf[b] = BUF;
        else if (this.buf[b] > 0) this.buf[b]--;
      }
      if (c.pressed('attack') || c.pressed('smash')) {
        this.buf.attack = BUF;
        this.bufSmash = c.cur.smash || (!c.digital && ((c.xTap < 5 && Math.abs(c.x) > 0.7) || (c.yTap < 5 && Math.abs(c.y) > 0.7)));
      } else if (this.buf.attack > 0) this.buf.attack--;
      // Remember attack presses made during a move (even in hit-freeze) for combo chains.
      if (this.state === 'move') {
        let l = null;
        if (c.pressed('attack') || c.pressed('smash')) l = this.bufSmash ? 'W' : 'Q';
        else if (c.pressed('special')) l = 'E';
        if (l) {
          this.pendingChain = this.pendingChain || [];
          if (this.pendingChain.length < 3) this.pendingChain.push({ letter: l, t: 26 });
        }
      }
      if (c.pressed('shield')) this.wasShieldPress = 0;
      else this.wasShieldPress++;
      // Tap jump: flicking up jumps.
      if ((SB.settings.tapJump !== false || c.digital) && c.yTap === 0 && c.y < -0.7) {
        this.buf.jump = BUF;
        this.tapJump = true;
      } else if (c.pressed('jump')) this.tapJump = false;
      // C-stick (right stick) = instant smash / aerial in that direction.
      const cs = c.cur;
      const pc = c.prev;
      if ((Math.abs(cs.cx) > 0.6 || Math.abs(cs.cy) > 0.6) && Math.abs(pc.cx) < 0.4 && Math.abs(pc.cy) < 0.4) {
        this.cbuf = { x: cs.cx, y: cs.cy, t: BUF };
      } else if (this.cbuf && --this.cbuf.t <= 0) this.cbuf = null;
    }
    use(b) {
      if (this.buf[b] > 0) {
        this.buf[b] = 0;
        return true;
      }
      return false;
    }
    jumpHeld() {
      return this.ctl.cur.jump || (this.tapJump && this.ctl.cur.y < -0.5);
    }

    // ------------------------------------------------------------- moves
    startMove(id, keepVel) {
      let m = this.def.moveset[id];
      if (!this.grounded && this.def.moveset[id + 'Air']) m = this.def.moveset[id + 'Air'];
      if (!m) {
        this.chaining = false;
        return false;
      }
      // Combo chains: the same move can't be used twice in one chain (no infinite loops).
      if (this.chaining && this.chainIds.includes(m.id) && !m.comboMove) {
        this.chaining = false;
        this.nextLetter = null;
        return false;
      }
      if (m.oncePerAir && !this.grounded) {
        if (this.airUsed[m.oncePerAir]) return false;
        this.airUsed[m.oncePerAir] = true;
      }
      this.move = m;
      this.state = 'move';
      this.sf = 0;
      this.mf = 0;
      this.prevMf = -1;
      this.hitList.clear();
      this.charge = 0;
      this.chargeDone = false;
      this.charging = false;
      this.queued = false;
      this.trail.length = 0;
      this.moveRate = m.special || m.throw || id === 'pummel' ? 1 : this.st.speed;
      const letter = this.nextLetter || '';
      const chainStart = this.chaining;
      if (this.chaining) {
        this.chainSeq += letter;
        this.chainIds.push(m.id);
      } else {
        this.chainSeq = letter;
        this.chainIds = [m.id];
      }
      this.chaining = false;
      this.nextLetter = null;
      this.moveBtn = letter || this.moveBtn;
      this.moveHit = false;
      if (!chainStart) this.pendingChain = null;
      if (!keepVel && this.grounded && !m.keepMomentum) this.vx *= 0.5;
      this.fireEvents(-1, 0);
      return true;
    }

    fireEvents(prev, cur) {
      const m = this.move;
      if (!m) return;
      for (let k = Math.floor(prev) + 1; k <= Math.floor(cur); k++) {
        if (m.ev && m.ev[k]) m.ev[k](this, this.m);
        if (m.swing === k) SB.audio.play('swing', m.smash ? 1 : 0.5);
        if (!this.move || this.move !== m) return;
      }
    }

    // Q = light, W = heavy, E = special. After a hit you may cancel into an
    // equal or stronger button; certain sequences are named combo finishers.
    tryChain(m) {
      const c = this.ctl;
      const first = m.hit.length ? Math.min(...m.hit.map((h) => h.f[0])) : 0;
      if (this.mf < first + 1) return false;
      // Presses queued during the move are used strictly in the order pressed.
      let letter = null;
      const fromPending = !!this.pendingChain;
      if (fromPending) letter = this.pendingChain[0].letter;
      else if (this.buf.attack > 0) letter = this.bufSmash ? 'W' : 'Q';
      else if (this.buf.special > 0) letter = 'E';
      if (!letter) return false;
      if (fromPending) this.bufSmash = letter === 'W';
      const TIER = { Q: 1, W: 2, E: 3, R: 4 };
      const seq = this.chainSeq + letter;
      const named = this.def.combos && this.def.combos[seq];
      if (!named) {
        if (TIER[letter] < (TIER[this.moveBtn] || 1) || this.chainIds.length >= 6) return false;
      }
      const jabNext = !named && letter === 'Q' && m.next && Math.abs(c.x) < 0.5 && Math.abs(c.y) < 0.5 && !c.cur.crouch;
      // Live buffers duplicate queued presses, so clear them.
      this.buf.special = 0;
      this.buf.attack = 0;
      if (fromPending) this.pendingChain.shift();
      if (this.pendingChain && !this.pendingChain.length) this.pendingChain = null;
      this.chaining = true;
      this.nextLetter = letter;
      let ok;
      if (named) {
        ok = this.startMove(named.id, true);
        if (ok) this.m.comboCall(this, named.name);
      } else if (jabNext) ok = this.startMove(m.next.id);
      else if (letter === 'E') ok = this.special();
      else ok = this.grounded ? this.groundAttack() : this.airAttack();
      this.chaining = false;
      const nm = this.move;
      if (ok && nm && nm !== m && !named && nm.hit.length) {
        // Chained moves skip most of their wind-up so links are reliable.
        const start = Math.min(...nm.hit.map((h) => h.f[0]));
        if (start > 5) {
          this.mf = start - 5;
          this.prevMf = this.mf - 1;
          this.chargeDone = true;
        }
      }
      return !!ok && nm !== m;
    }

    endMove() {
      const m = this.move;
      this.move = null;
      this.charging = false;
      if (this.grabbing && m && (m.id === 'pummel')) {
        this.state = 'grabhold';
        this.sf = 0;
        return;
      }
      if (this.grounded) {
        this.state = m && m.crouch && (this.ctl.y > 0.5 || this.ctl.cur.crouch) ? 'crouch' : 'idle';
      } else this.state = m && m.helpless ? 'helpless' : 'air';
      this.sf = 0;
    }

    groundAttack() {
      const c = this.ctl;
      let smash = this.bufSmash;
      let sx = c.x;
      let sy = c.y;
      if (this.cbuf) {
        smash = true;
        sx = this.cbuf.x;
        sy = this.cbuf.y;
        this.cbuf = null;
      }
      if (this.item && this.item.throwable) return this.throwItem(sx, sy, smash);
      // Pick up items with the attack button.
      if (!this.item) {
        const it = this.m.items.find((i) => i.pickable && !i.holder && Math.abs(i.x - this.x) < this.w * 0.5 + 22 && Math.abs(i.y - this.y) < 40);
        if (it) {
          it.pickUp(this);
          return true;
        }
      }
      // Shift (crouch) held turns attacks into their downward versions.
      if (c.cur.crouch && Math.abs(sy) < 0.5) {
        sy = 1;
        sx = 0;
      }
      this.nextLetter = smash ? 'W' : 'Q';
      const running = this.state === 'run' || (this.state === 'dash' && this.sf > 6);
      let id;
      if (smash) {
        if (Math.abs(sy) > Math.abs(sx)) id = sy < 0 ? 'usmash' : 'dsmash';
        else {
          if (sx && SB.sign(sx) !== this.facing) this.facing = SB.sign(sx);
          id = 'fsmash';
        }
      } else if (running) id = 'dash';
      else if (sy < -0.5 && Math.abs(sy) >= Math.abs(sx)) id = 'utilt';
      else if (sy > 0.5 && Math.abs(sy) >= Math.abs(sx)) id = 'dtilt';
      else if (Math.abs(sx) > 0.35) {
        this.facing = SB.sign(sx);
        id = 'ftilt';
      } else id = 'jab1';
      return this.startMove(id);
    }

    airAttack() {
      const c = this.ctl;
      let sx = c.x;
      let sy = c.y;
      if (this.cbuf) {
        sx = this.cbuf.x;
        sy = this.cbuf.y;
        this.cbuf = null;
      }
      if (this.item && this.item.throwable) return this.throwItem(sx, sy, false);
      this.nextLetter = this.bufSmash ? 'W' : 'Q';
      // Heavy in the air: down = ground pound, up = recovery (like Brawlhalla).
      if (this.bufSmash && Math.abs(sy) > 0.5 && Math.abs(sy) >= Math.abs(sx)) {
        if (sy > 0) return this.startMove('gpound', true);
        return this.startMove('uspec', true);
      }
      let id;
      if (Math.abs(sy) > 0.5 && Math.abs(sy) >= Math.abs(sx)) id = sy < 0 ? 'uair' : 'dair';
      else if (Math.abs(sx) > 0.35) id = SB.sign(sx) === this.facing ? 'fair' : 'bair';
      else id = 'nair';
      return this.startMove(id, true);
    }

    special() {
      const c = this.ctl;
      if (this.finalReady) return this.startFinal();
      let id;
      if (c.y < -0.5 && Math.abs(c.y) >= Math.abs(c.x)) id = 'uspec';
      else if (c.y > 0.5 && Math.abs(c.y) >= Math.abs(c.x)) id = 'dspec';
      else if (Math.abs(c.x) > 0.35) {
        this.facing = SB.sign(c.x);
        id = 'sspec';
      } else id = 'nspec';
      this.nextLetter = 'E';
      return this.startMove(id, true);
    }

    startFinal() {
      this.finalReady = false;
      this.state = 'final';
      this.sf = 0;
      this.move = null;
      this.vx = 0;
      this.vy = 0;
      this.kbx = this.kby = 0;
      this.m.startFinal(this);
      return true;
    }

    throwItem(sx, sy, smash) {
      const it = this.item;
      let vx = this.facing * 13;
      let vy = -4;
      if (sy < -0.5 && Math.abs(sy) >= Math.abs(sx)) (vx = 0), (vy = -17);
      else if (sy > 0.5 && Math.abs(sy) >= Math.abs(sx)) (vx = 0), (vy = 14);
      else if (Math.abs(sx) > 0.35) {
        this.facing = SB.sign(sx);
        vx = this.facing * 13;
      }
      if (smash) (vx *= 1.4), (vy *= 1.2);
      it.throwFrom(this, vx, vy);
      this.item = null;
      this.startMove('itemThrow', true);
      SB.audio.play('throw');
      return true;
    }

    // Returns true if an action was taken.
    groundActions() {
      const c = this.ctl;
      if (this.finalReady && this.use('special')) return this.startFinal();
      // Up+special pressed together is an up special, not a tap jump.
      if (this.buf.special > 0 && this.tapJump && this.buf.jump > 0) this.buf.jump = 0;
      if (this.use('jump')) {
        this.state = 'jumpsquat';
        this.sf = 0;
        return true;
      }
      if (this.use('grab')) {
        if (this.item) return this.throwItem(c.x, c.y, false);
        if (this.weapon) return this.throwWeapon();
        if (this.tryPickupWeapon()) return true;
        this.nextLetter = 'R';
        return this.startMove('grab');
      }
      // Brawlhalla-style: the dodge button dodges (no shield).
      if (this.buf.shield > 0) {
        if (this.dodgeCD > 0) return false;
        this.buf.shield = 0;
        if (Math.abs(c.x) > 0.4) this.startRoll(SB.sign(c.x));
        else {
          this.state = 'spotdodge';
          this.sf = 0;
          SB.audio.play('dodge');
        }
        this.dodgeCD = 45;
        return true;
      }
      if (this.use('special')) return this.special();
      if (this.use('attack') || this.cbuf) return this.groundAttack();
      return false;
    }

    airActions() {
      if (this.finalReady && this.use('special')) return this.startFinal();
      // Special wins over a simultaneous (tap-)jump so up+special is always up-special.
      if (this.use('special')) {
        this.buf.jump = 0;
        return this.special();
      }
      // A tap jump (flicking up) waits a few frames so up+attack can become an up aerial.
      if (this.tapJump && this.buf.jump > 0) {
        if (this.buf.attack > 0 || this.cbuf) this.buf.jump = 0;
        else if (this.ctl.yTap < 3) return false;
      }
      if (this.use('jump') && this.jumps > 0) {
        this.doubleJump();
        return true;
      }
      if (this.use('attack') || this.cbuf) return this.airAttack();
      if (this.use('grab')) {
        if (this.item) return this.throwItem(this.ctl.x, this.ctl.y, false);
        if (this.weapon) return this.throwWeapon();
        if (this.tryPickupWeapon()) return true;
      }
      if (this.use('shield') && !this.airUsed.dodge) {
        this.airUsed.dodge = true;
        this.state = 'airdodge';
        this.sf = 0;
        const sx = this.ctl.x;
        const sy = this.ctl.y;
        const l = Math.hypot(sx, sy);
        this.dodgeDir = l > 0.3 ? { x: sx / l, y: sy / l } : null;
        if (this.dodgeDir) {
          this.vx = this.dodgeDir.x * 12;
          this.vy = this.dodgeDir.y * 12;
        }
        SB.audio.play('dodge');
        return true;
      }
      return false;
    }

    doubleJump() {
      const j = this.st.jumps - this.jumps; // 1 for first midair jump
      this.jumps--;
      this.vy = -this.st.djump * (j > 1 ? 0.88 : 1);
      this.vx = this.ctl.x * this.st.air;
      this.fastFall = false;
      this.state = 'air';
      this.sf = 0;
      this.djumpT = 22;
      this.m.fx.ring(this.x, this.y - 6, this.pal.glow, 26);
      SB.audio.play('djump');
    }

    airDrift(mul = 1) {
      const sx = this.ctl.x;
      const st = this.st;
      if (Math.abs(sx) > 0.1) {
        const target = sx * st.air;
        if ((sx > 0 && this.vx < target) || (sx < 0 && this.vx > target)) this.vx = SB.approach(this.vx, target, st.airAccel * mul);
      } else this.vx = SB.approach(this.vx, 0, st.airFric);
      // Fast fall: flick down while falling.
      if (!this.fastFall && this.vy > -1 && ((this.ctl.yTap < 3 && this.ctl.y > 0.7) || this.ctl.pressed('crouch'))) {
        this.fastFall = true;
        this.vy = Math.max(this.vy, this.st.ffall * 0.8);
        this.m.fx.spark(this.x, this.y - this.h, '#ffffff', 3);
      }
    }

    friction(mul = 1) {
      this.vx = SB.approach(this.vx, 0, this.st.traction * mul);
    }

    // ---------------------------------------------------------------- update
    update() {
      const c = this.ctl;
      this.tickBuffers();
      if (this.flash > 0) this.flash--;
      if (this.armorFlash > 0) this.armorFlash--;
      if (this.hitShake > 0) this.hitShake--;
      if (this.state === 'dead') return this.updateDead();
      if (this.inv > 0) this.inv--;
      if (this.ledgeCD > 0) this.ledgeCD--;
      if (this.dodgeCD > 0) this.dodgeCD--;
      if (this.wallCD > 0) this.wallCD--;
      if (this.dropThrough > 0) this.dropThrough--;
      if (this.djumpT > 0) this.djumpT--;
      if (this.lastHitTimer > 0 && --this.lastHitTimer === 0) this.lastHitBy = null;
      if (this.launchTrail > 0) this.launchTrail--;
      if (this.comboShow && --this.comboShow.t <= 0) this.comboShow = null;
      if (!this.shielding() && this.shieldHP < SHIELD_MAX) this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + 0.09);
      this.visOff.x *= 0.8;
      this.visOff.y *= 0.8;
      this.gmul = 1;
      this.invisible = false;
      this.sf++;
      if (this.lag > 0) {
        this.lag--;
        this.friction();
      } else this.runState(c);
      this.physics();
      if (!this.grounded && GROUND_STATES.has(this.state) && this.state !== 'grabbed' && this.state !== 'grabhold') {
        this.state = 'air';
        this.sf = 0;
      }
      this.updatePose();
      if (this.grabbing) this.holdVictim();
    }

    runState(c) {
      const st = this.st;
      switch (this.state) {
        case 'idle': {
          this.friction();
          if (this.groundActions()) break;
          if (c.cur.crouch || (c.y > 0.5 && Math.abs(c.y) > Math.abs(c.x))) {
            if (this.tryDrop()) break;
            this.state = 'crouch';
            this.sf = 0;
            break;
          }
          if (Math.abs(c.x) > 0.2) {
            if (SB.sign(c.x) !== this.facing) {
              this.facing = SB.sign(c.x);
            }
            this.state = Math.abs(c.x) > 0.8 ? 'dash' : 'walk';
            this.sf = 0;
            if (this.state === 'dash') {
              this.m.fx.dust(this.x, this.y, -this.facing, 3);
            }
          }
          break;
        }
        case 'walk': {
          if (this.groundActions()) break;
          if (c.cur.crouch || (c.y > 0.5 && Math.abs(c.y) > Math.abs(c.x))) {
            this.state = 'crouch';
            this.sf = 0;
            break;
          }
          if (Math.abs(c.x) < 0.2) {
            this.state = 'idle';
            this.sf = 0;
            break;
          }
          this.facing = SB.sign(c.x);
          if (Math.abs(c.x) > 0.85) {
            this.state = 'dash';
            this.sf = 0;
            break;
          }
          this.vx = SB.approach(this.vx, c.x * st.walk * 1.1, 0.6);
          break;
        }
        case 'dash': {
          if (this.groundActions()) break;
          if (Math.abs(c.x) > 0.5 && SB.sign(c.x) !== this.facing) {
            // dash-dance
            this.facing = SB.sign(c.x);
            this.sf = 0;
            this.m.fx.dust(this.x, this.y, -this.facing, 2);
          }
          this.vx = SB.approach(this.vx, this.facing * st.dashInit, 2);
          if (this.sf >= 11) {
            if (Math.abs(c.x) > 0.5) this.state = 'run';
            else this.state = 'skid';
            this.sf = 0;
          }
          break;
        }
        case 'run': {
          if (this.groundActions()) break;
          if (c.cur.crouch || (c.y > 0.6 && Math.abs(c.y) > Math.abs(c.x))) {
            this.state = 'crouch';
            this.sf = 0;
            break;
          }
          if (Math.abs(c.x) < 0.3 || SB.sign(c.x) !== this.facing) {
            this.state = 'skid';
            this.sf = 0;
            this.skidTurn = Math.abs(c.x) >= 0.3;
            this.m.fx.dust(this.x, this.y, this.facing, 4);
            break;
          }
          this.vx = SB.approach(this.vx, this.facing * st.run, 0.9);
          if (this.sf % 14 === 0) this.m.fx.dust(this.x - this.facing * 10, this.y, -this.facing, 1);
          break;
        }
        case 'skid': {
          this.friction(1.2);
          if (this.groundActions()) break;
          if (this.sf >= 10) {
            if (this.skidTurn) {
              this.facing = -this.facing;
              this.state = Math.abs(c.x) > 0.5 ? 'run' : 'idle';
            } else this.state = 'idle';
            this.skidTurn = false;
            this.sf = 0;
          }
          break;
        }
        case 'crouch': {
          this.friction(1.5);
          if (this.tryDrop()) break;
          if (this.groundActions()) break;
          if (c.y < 0.4 && !c.cur.crouch) {
            this.state = 'idle';
            this.sf = 0;
          }
          break;
        }
        case 'jumpsquat': {
          this.friction(0.5);
          // Up-special / up-smash out of jump squat (keeps tap-jump usable).
          if (this.use('special')) {
            this.special();
            break;
          }
          if (this.buf.attack > 0 && c.y < -0.5) {
            this.buf.attack = 0;
            this.startMove(this.bufSmash ? 'usmash' : 'utilt');
            break;
          }
          if (this.sf >= 4) {
            const full = this.jumpHeld();
            this.leaveGround(-(full ? st.jump : st.hop));
            this.vx = SB.clamp(this.vx * 0.85 + c.x * 1.5, -st.air * 1.1, st.air * 1.1);
            this.state = 'air';
            this.sf = 0;
            this.fastFall = false;
            this.m.fx.dust(this.x, this.y, 0, 4);
            SB.audio.play('jump');
          }
          break;
        }
        case 'land': {
          this.friction();
          if (this.sf >= this.landLag) {
            this.state = 'idle';
            this.sf = 0;
            this.groundActions();
          }
          break;
        }
        case 'air': {
          if (this.airActions()) break;
          this.airDrift();
          this.tryWallCling();
          break;
        }
        case 'helpless': {
          this.airDrift(0.6);
          this.tryWallCling();
          break;
        }
        case 'wall': {
          // Clinging to a wall: slide slowly, jump off, or let go.
          const d = this.wallDir;
          this.facing = -d;
          this.vx = d * 1.5;
          this.gmul = 0.15;
          if (this.vy > 2.6) this.vy = 2.6;
          if (this.sf % 8 === 0) this.m.fx.dust(this.x + d * this.w * 0.5, this.y - this.h * 0.4, -d, 1);
          if (this.use('jump')) {
            this.vx = -d * 4.5;
            this.vy = -this.st.jump * 0.95;
            this.state = 'air';
            this.sf = 0;
            this.wallCD = 14;
            this.djumpT = 0;
            this.m.fx.ring(this.x + d * this.w * 0.5, this.y - this.h * 0.4, '#ffffff', 26);
            SB.audio.play('jump');
            break;
          }
          if (this.buf.attack > 0 || this.buf.special > 0 || this.cbuf || this.buf.shield > 0) {
            this.state = 'air';
            this.wallCD = 10;
            this.airActions();
            break;
          }
          if (this.ctl.x * d < -0.5 || this.ctl.y > 0.7 || (!this.wallTouch && this.sf > 2)) {
            this.state = 'air';
            this.sf = 0;
            this.wallCD = 16;
          }
          break;
        }
        case 'move':
          this.runMove(c);
          break;
        case 'shield': {
          this.friction();
          this.shieldHP -= 0.13;
          if (this.shieldHP <= 0) {
            this.breakShield();
            break;
          }
          if (this.use('jump')) {
            this.state = 'jumpsquat';
            this.sf = 0;
            break;
          }
          if (this.buf.attack > 0 || this.buf.grab > 0) {
            this.buf.attack = this.buf.grab = 0;
            this.startMove('grab');
            break;
          }
          if (this.buf.special > 0 && c.y < -0.5) {
            this.buf.special = 0;
            this.special();
            break;
          }
          if (c.xTap < 4 && Math.abs(c.x) > 0.7) {
            this.startRoll(SB.sign(c.x));
            break;
          }
          if (c.yTap < 4 && c.y > 0.7) {
            if (this.tryDrop()) break;
            this.state = 'spotdodge';
            this.sf = 0;
            SB.audio.play('dodge');
            break;
          }
          if (!c.cur.shield && this.sf > 4) {
            this.state = 'unshield';
            this.sf = 0;
          }
          break;
        }
        case 'shieldstun': {
          this.vx = SB.approach(this.vx, 0, 0.5);
          if (this.sf >= this.stun) {
            this.state = c.cur.shield ? 'shield' : 'unshield';
            this.sf = 0;
          }
          break;
        }
        case 'unshield': {
          this.friction();
          if (this.sf >= 7) {
            this.state = 'idle';
            this.sf = 0;
          }
          break;
        }
        case 'roll': {
          const t = this.sf / 30;
          this.vx = this.rollDir * this.st.roll * Math.sin(Math.min(1, t * 1.2) * Math.PI) * 1.2;
          if (this.sf >= 30) {
            this.vx = 0;
            this.state = 'idle';
            this.sf = 0;
          }
          break;
        }
        case 'spotdodge': {
          this.friction(2);
          if (this.sf >= 24) {
            this.state = 'idle';
            this.sf = 0;
          }
          break;
        }
        case 'airdodge': {
          if (this.dodgeDir) {
            this.gmul = this.sf < 16 ? 0 : 1;
            this.vx *= 0.9;
            this.vy *= 0.9;
          } else this.airDrift(0.5);
          if (this.sf >= 36) {
            this.state = 'air';
            this.sf = 0;
          }
          break;
        }
        case 'hitstun':
        case 'tumble': {
          if (this.grounded) this.friction(0.8);
          else if (this.state === 'tumble' || this.hitstun <= 0) this.vx = SB.approach(this.vx, 0, 0.05);
          if (this.hitstun > 0) {
            this.hitstun--;
            if (this.state === 'tumble') this.spinT += 0.25 * SB.clamp(Math.hypot(this.kbx, this.kby) / 10, 0.2, 1.4);
            if (this.hitstun === 0 && this.state === 'hitstun') {
              this.state = this.grounded ? 'idle' : 'air';
              this.sf = 0;
            }
          } else {
            // Tumble: actionable, drifts slowly until it does something.
            if (this.grounded) {
              this.state = 'idle';
              this.sf = 0;
            } else if (this.airActions()) {
              this.spinT = 0;
            } else if (Math.abs(c.x) > 0.3 || c.y > 0.7) {
              this.state = 'air';
              this.sf = 0;
              this.airDrift();
            } else this.airDrift(0.5);
          }
          break;
        }
        case 'down': {
          this.friction(1.5);
          if (this.sf > 12) {
            if (this.use('attack')) {
              this.startMove('getupAtk');
              break;
            }
            if (Math.abs(c.x) > 0.6) {
              this.startRoll(SB.sign(c.x));
              break;
            }
            if (c.y < -0.6 || this.use('jump') || this.use('shield') || this.sf > 70) {
              this.state = 'getup';
              this.sf = 0;
              break;
            }
          }
          break;
        }
        case 'getup':
        case 'tech': {
          this.friction(1.5);
          if (this.sf >= 26) {
            this.state = 'idle';
            this.sf = 0;
          }
          break;
        }
        case 'dizzy': {
          this.friction(1.5);
          // Mash to recover faster.
          if (c.pressed('attack') || c.pressed('special') || c.pressed('jump') || c.xTap === 0) this.stun -= 6;
          if (this.sf % 10 === 0) this.m.fx.spark(this.x, this.y - this.h - 12, '#fff27a', 1);
          if (this.sf >= this.stun) {
            this.state = 'idle';
            this.sf = 0;
          }
          break;
        }
        case 'shieldbreak': {
          this.vx *= 0.97;
          break;
        }
        case 'ledge':
          this.updateLedge(c);
          break;
        case 'climb': {
          if (this.sf >= this.climbLen) {
            this.state = 'idle';
            this.sf = 0;
          }
          break;
        }
        case 'grabhold': {
          this.friction();
          const v = this.grabbing;
          if (!v || v.grabbedBy !== this) {
            this.grabbing = null;
            this.state = 'idle';
            break;
          }
          this.grabTimer--;
          if (this.grabTimer <= 0) {
            this.releaseGrab(true);
            break;
          }
          if (this.sf > 6) {
            const rx = c.x * this.facing;
            if (c.y < -0.6 && Math.abs(c.y) > Math.abs(c.x)) this.startMove('uthrow');
            else if (c.y > 0.6 && Math.abs(c.y) > Math.abs(c.x)) this.startMove('dthrow');
            else if (rx > 0.6) this.startMove('fthrow');
            else if (rx < -0.6) this.startMove('bthrow');
            else if (this.use('attack')) this.startMove('pummel');
          }
          break;
        }
        case 'grabbed': {
          const g = this.grabbedBy;
          if (!g || g.grabbing !== this) {
            this.grabbedBy = null;
            this.state = 'air';
            break;
          }
          if (c.pressed('attack') || c.pressed('special') || c.pressed('jump') || c.pressed('shield') || c.xTap === 0 || c.yTap === 0) {
            g.grabTimer -= 5;
            this.hitShake = 4;
          }
          break;
        }
        case 'thrown':
          break;
        case 'respawn': {
          this.vx = 0;
          this.vy = 0;
          const act = Math.abs(c.x) > 0.3 || Math.abs(c.y) > 0.3 || c.cur.attack || c.cur.special || c.cur.jump || c.cur.shield;
          if ((act && this.sf > 30) || this.sf > 300) {
            this.state = 'air';
            this.sf = 0;
            this.inv = 120;
            this.jumps = this.st.jumps - 1;
          }
          break;
        }
        case 'final':
          this.vx = 0;
          this.vy = 0;
          this.gmul = 0;
          break;
      }
    }

    tryWallCling() {
      const w = this.wallTouch;
      if (!w || this.wallCD > 0 || this.grounded) return false;
      if (this.ctl.x * w.dir < 0.5 || this.vy < -7) return false;
      this.state = 'wall';
      this.sf = 0;
      this.wallDir = w.dir;
      this.fastFall = false;
      this.airUsed.dodge = false;
      this.vy = Math.min(this.vy, 1);
      SB.audio.play('ledge');
      return true;
    }

    // Weapons (Brawlhalla-style pickups): R picks up, R again throws.
    tryPickupWeapon() {
      const it = this.m.items.find((i) => i.type === 'weapon' && !i.dead && !i.holder && Math.abs(i.x - this.x) < this.w * 0.5 + 34 && i.y > this.y - this.h - 20 && i.y < this.y + 40);
      if (!it) return false;
      this.equipWeapon(it.wtype);
      it.dead = true;
      this.m.fx.ring(this.x, this.y - this.h / 2, SB.WEAPONS[it.wtype].color, 50);
      this.m.fx.spark(it.x, it.y - 10, '#ffffff', 8);
      SB.audio.play('power');
      return true;
    }

    equipWeapon(type) {
      const w = SB.WEAPONS[type];
      this.weapon = Object.assign({ type }, w);
      this.prop = Object.assign({}, this.def.prop, { weapon: w.len });
    }

    unequipWeapon() {
      this.weapon = null;
      this.prop = this.def.prop;
    }

    throwWeapon() {
      const w = this.weapon;
      const c = this.ctl;
      let vx = this.facing * 15;
      let vy = -2;
      if (c.y < -0.5) (vx = this.facing * 4), (vy = -15);
      else if (c.y > 0.5) (vx = this.facing * 6), (vy = 12);
      else if (Math.abs(c.x) > 0.35) this.facing = SB.sign(c.x);
      const h = this.jointWorld('haA');
      this.m.spawnProjectile(this, 'weapon', { x: h.x, y: h.y, vx: vx * (vx === this.facing * 15 ? 1 : 1), vy, r: 16, life: 50, grav: 0.18, dmg: 10, ang: 40, bkb: 45, kbg: 60, kind: 'slash', wtype: w.type, color: w.color });
      this.unequipWeapon();
      this.startMove('itemThrow', true);
      SB.audio.play('throw');
      return true;
    }

    startRoll(dir) {
      this.state = 'roll';
      this.sf = 0;
      this.rollDir = dir;
      SB.audio.play('dodge');
    }

    tryDrop() {
      const c = this.ctl;
      if (this.grounded && this.ground && this.ground.plat && c.yTap < 4 && c.y > 0.7) {
        this.grounded = false;
        this.ground = null;
        this.dropThrough = 12;
        this.state = 'air';
        this.sf = 0;
        this.jumps = this.st.jumps - 1;
        this.vy = 2;
        return true;
      }
      return false;
    }

    breakShield() {
      this.shieldHP = 0;
      this.state = 'shieldbreak';
      this.sf = 0;
      this.leaveGround(-15);
      this.stun = 220;
      this.m.fx.shieldBreak(this.x, this.y - this.h / 2, this.color);
      this.m.shake(10);
      SB.audio.play('shieldBreak');
    }

    runMove(c) {
      const m = this.move;
      // Air drift during aerials and specials.
      if (!this.grounded) {
        if (m.air) this.airDrift();
        else if (m.special) this.airDrift(0.35);
        else this.vx = SB.approach(this.vx, 0, 0.05);
      } else if (!m.keepMomentum) this.friction(m.smash ? 1.2 : 1);
      else this.friction(m.friction || 0.3);

      // Charging (smash attacks / chargeable specials).
      if (m.charge && !this.chargeDone && this.mf >= m.charge.f) {
        const btn = m.charge.btn;
        const held = btn === 'attack' ? c.cur.attack || c.cur.smash || Math.abs(c.cur.cx) > 0.5 || Math.abs(c.cur.cy) > 0.5 : c.cur[btn];
        if (held && this.charge < m.charge.max) {
          this.charge++;
          this.charging = true;
          if (this.charge % 8 === 0) {
            this.fxCharge();
            SB.audio.play('charge');
          }
          if (m.tick) m.tick(this, Math.floor(this.mf), this.m);
          this.prevMf = this.mf;
          return;
        }
        this.chargeDone = true;
        this.charging = false;
      }

      this.prevMf = this.mf;
      this.mf += this.moveRate;
      const fr = Math.floor(this.mf);

      if (m.motion) {
        for (const [s, e, vx, vy, mode] of m.motion) {
          if (this.mf >= s && this.mf < e && (mode !== 'ground' || this.grounded)) {
            if (vx !== null) this.vx = this.facing * vx;
            if (vy !== null && vy !== undefined) this.vy = vy;
          }
        }
      }
      if (m.tick) m.tick(this, fr, this.m);
      if (this.move !== m) return;
      this.fireEvents(this.prevMf, this.mf);
      if (this.move !== m) return;

      // Combo chains: a move that connected can be cancelled into the next one.
      // Presses made slightly before the hit lands are remembered for a while.
      if (this.pendingChain) {
        for (const p of this.pendingChain) p.t--;
        this.pendingChain = this.pendingChain.filter((p) => p.t > 0);
        if (!this.pendingChain.length) this.pendingChain = null;
      }
      if (this.moveHit && this.tryChain(m)) return;

      // Jab combos.
      if (m.next) {
        if (this.mf >= m.next.from && this.mf <= m.next.to && this.buf.attack > 0 && Math.abs(c.x) < 0.5 && Math.abs(c.y) < 0.5) {
          this.buf.attack = 0;
          this.queued = true;
        }
        if (this.queued && this.mf >= m.next.start) {
          this.chaining = true;
          this.nextLetter = 'Q';
          this.startMove(m.next.id);
          return;
        }
      }
      // Throws release the victim at the right frame.
      if (m.throw && this.grabbing && this.prevMf < m.throw.release && this.mf >= m.throw.release) this.releaseThrow(m.throw);
      if (m.id === 'pummel' && this.grabbing && this.prevMf < 5 && this.mf >= 5) {
        const v = this.grabbing;
        const d = 1.6 * this.st.power;
        v.damage = Math.min(999, v.damage + d);
        v.flash = 6;
        v.hitShake = 8;
        this.stats.dealt += d;
        v.stats.taken += d;
        this.m.fx.hitSpark(v.x, v.y - v.h * 0.6, 0.4, this.pal.glow, 'punch');
        SB.audio.play('hit', 0.3, 'punch');
      }

      // Trail points for swooshes.
      if (m.trail && m.hit.length) {
        const first = m.hit[0].f[0] - 2;
        const last = Math.max(...m.hit.map((h) => h.f[1])) + 3;
        if (this.mf >= first && this.mf <= last) {
          this.trail.push(this.jointWorld(m.trail));
          if (this.trail.length > 9) this.trail.shift();
        } else if (this.trail.length) this.trail.shift();
      }

      if (this.mf >= m.frames) this.endMove();
    }

    // ------------------------------------------------------------- ledges
    tryLedgeGrab() {
      if (this.ledgeCD > 0 || this.ctl.y > 0.6) return;
      const okState =
        this.state === 'air' || this.state === 'helpless' || this.state === 'airdodge' ||
        (this.state === 'tumble' && this.hitstun <= 0) ||
        (this.state === 'move' && this.move && (this.move.special || this.move.air) && (this.move.ledgeFrom ? this.mf >= this.move.ledgeFrom : this.vy > 0));
      if (!okState) return;
      if (this.vy < -3 && !(this.move && this.move.ledgeFrom)) return;
      for (const L of this.m.stage.ledges) {
        if (L.owner && L.owner !== this) continue;
        const s = L.side; // -1 left edge, +1 right edge
        const handY = this.y - this.h * 0.9;
        if (Math.abs(handY - L.y) > 30) continue;
        const dx = (this.x - L.x) * s; // distance outward from the ledge
        if (dx < -8 || dx > this.w * 0.5 + 34) continue;
        this.grabLedge(L);
        return;
      }
    }

    grabLedge(L) {
      if (this.move) this.move = null;
      this.state = 'ledge';
      this.sf = 0;
      this.ledge = L;
      L.owner = this;
      this.facing = -L.side;
      this.vx = this.vy = this.kbx = this.kby = 0;
      this.grounded = false;
      this.ground = null;
      this.fastFall = false;
      this.jumps = this.st.jumps - 1;
      this.airUsed = {};
      const tx = L.x - this.facing * this.hangHand.x;
      const ty = L.y - this.hangHand.y;
      this.visOff.x += this.x - tx;
      this.visOff.y += this.y - ty;
      this.x = tx;
      this.y = ty;
      this.ledgeInv = this.ledgeInvReady ? 45 : 0;
      this.ledgeInvReady = false;
      SB.audio.play('ledge');
    }

    releaseLedge() {
      if (this.ledge && this.ledge.owner === this) this.ledge.owner = null;
      this.ledge = null;
      this.ledgeCD = 30;
    }

    updateLedge(c) {
      const L = this.ledge;
      if (!L) {
        this.state = 'air';
        return;
      }
      if (this.ledgeInv > 0) this.ledgeInv--;
      this.x = L.x - this.facing * this.hangHand.x;
      this.y = L.y - this.hangHand.y;
      if (this.sf < 8) return;
      const toward = c.x * this.facing;
      const onStage = () => {
        this.releaseLedge();
        this.visOff.x += this.x - (L.x - L.side * (this.w / 2 + 4));
        this.visOff.y += this.y - L.y;
        this.x = L.x - L.side * (this.w / 2 + 4);
        this.y = L.y;
        this.grounded = true;
        this.ground = L.surface;
        this.jumps = this.st.jumps;
      };
      if (this.use('jump')) {
        this.releaseLedge();
        this.leaveGround(-this.st.jump * 1.02);
        this.vx = this.facing * 1.5;
        this.inv = 6;
        this.state = 'air';
        this.sf = 0;
        this.jumps = this.st.jumps - 1;
        SB.audio.play('jump');
      } else if (this.use('attack')) {
        onStage();
        this.startMove('ledgeAtk');
      } else if (this.use('shield')) {
        onStage();
        this.startRoll(this.facing);
        this.visOff.x *= 0.6;
      } else if (toward > 0.5 || c.y < -0.6) {
        onStage();
        this.state = 'climb';
        this.climbLen = 24;
        this.sf = 0;
      } else if (toward < -0.5 || c.y > 0.6 || this.sf > LEDGE_TIME) {
        this.releaseLedge();
        this.state = 'air';
        this.sf = 0;
        this.vy = 1;
        this.x += L.side * 6;
      }
    }

    // --------------------------------------------------------------- grabs
    grabVictim(v) {
      if (v.grabbing) v.releaseGrab(false);
      if (v.ledge) v.releaseLedge();
      if (v.item) v.dropItem();
      v.move = null;
      this.grabbing = v;
      v.grabbedBy = this;
      v.state = 'grabbed';
      v.sf = 0;
      v.vx = v.vy = v.kbx = v.kby = 0;
      this.state = 'grabhold';
      this.move = null;
      this.sf = 0;
      this.grabTimer = 70 + v.damage * 0.9;
      SB.audio.play('grab');
    }

    holdVictim() {
      const v = this.grabbing;
      if (!v || v.grabbedBy !== this) {
        this.grabbing = null;
        return;
      }
      if (v.state === 'grabbed') {
        v.x = this.x + this.facing * (this.w / 2 + v.w / 2 - 6);
        v.y = this.y;
        v.facing = -this.facing;
        v.grounded = this.grounded;
      } else if (v.state === 'thrown') {
        const h = this.jointWorld('haA');
        v.x = h.x + this.facing * v.w * 0.25;
        v.y = h.y + v.h * 0.55;
      }
      if (this.state === 'move' && this.move && this.move.throw && v.state === 'grabbed') {
        v.state = 'thrown';
        v.sf = 0;
      }
      if (this.state !== 'grabhold' && !(this.state === 'move' && this.move && (this.move.throw || this.move.id === 'pummel'))) this.releaseGrab(false);
    }

    releaseGrab(pushApart) {
      const v = this.grabbing;
      this.grabbing = null;
      if (!v) return;
      v.grabbedBy = null;
      if (v.state === 'grabbed' || v.state === 'thrown') {
        v.state = v.grounded ? 'idle' : 'air';
        v.sf = 0;
        if (pushApart) {
          v.vx = this.facing * 5;
          v.lag = 14;
        }
      }
      if (pushApart) {
        this.vx = -this.facing * 4;
        this.state = 'idle';
        this.lag = 14;
      }
    }

    releaseThrow(t) {
      const v = this.grabbing;
      this.grabbing = null;
      if (!v) return;
      v.grabbedBy = null;
      const dir = this.facing * t.dir;
      if (t.dir < 0) v.x = this.x - this.facing * (this.w / 2 + v.w / 2);
      v.y = Math.min(v.y, this.y);
      v.state = 'air';
      v.grounded = false;
      v.ground = null;
      const dmg = t.dmg * this.st.power;
      v.applyDamage(dmg, this);
      v.launch(this.m.calcKB(v, dmg, t.bkb, t.kbg, 0), t.ang, dir, this, 3);
      this.m.fx.hitSpark(v.x, v.y - v.h / 2, 0.6, this.pal.glow, 'punch');
      this.m.shake(4);
      SB.audio.play('throw');
      SB.audio.play('hit', 0.6, 'punch');
    }

    dropItem() {
      if (this.item) {
        this.item.drop(this);
        this.item = null;
      }
    }

    // ------------------------------------------------------------- damage
    applyDamage(d, from) {
      this.damage = Math.min(999, this.damage + d);
      this.stats.taken += d;
      if (from && from !== this) {
        from.stats.dealt += d;
        this.lastHitBy = from;
        this.lastHitTimer = 600;
        if (this.comboBy === from && (this.hitstun > 0 || this.state === 'grabbed' || this.state === 'thrown')) {
          this.combo++;
          this.comboDmg += d;
        } else {
          this.combo = 1;
          this.comboDmg = d;
        }
        if (this.combo >= 2) from.comboShow = { hits: this.combo, dmg: this.comboDmg, t: 110, name: from.comboShow && from.comboShow.t > 0 ? from.comboShow.name : null };
        this.comboBy = from;
        from.stats.maxCombo = Math.max(from.stats.maxCombo, this.combo);
      }
    }

    // Queue a launch; it's applied when hitlag ends (so DI can be read).
    launch(kb, ang, dirX, from, hitlag) {
      if (this.grabbing) this.releaseGrab(false);
      if (this.ledge) this.releaseLedge();
      this.move = null;
      this.charging = false;
      this.hitlag = hitlag;
      this.pendingKB = { kb, ang, dirX };
      this.hitstun = Math.floor(kb * 0.4);
      this.vx = 0;
      this.vy = 0;
      this.kbx = 0;
      this.kby = 0;
      this.state = kb >= TUMBLE_KB ? 'tumble' : 'hitstun';
      this.sf = 0;
      this.fastFall = false;
      this.spinT = 0;
      if (kb > 45) this.airUsed = {};
      if (hitlag <= 0) this.applyPendingKB();
    }

    applyPendingKB() {
      const p = this.pendingKB;
      this.pendingKB = null;
      if (p.drag) {
        // Multi-hit moves carry the victim along with the attacker.
        const a = p.drag;
        this.kbx = a.vx + a.kbx;
        this.kby = a.vy + (a.grounded ? -2 : 0);
        this.state = 'hitstun';
        this.hitstun = Math.max(this.hitstun, 16);
        if (this.kby < 0 && this.grounded) {
          this.grounded = false;
          this.ground = null;
        }
        return;
      }
      let { kb, ang, dirX } = p;
      if (ang === 361) ang = this.grounded ? (kb < 60 ? 0 : SB.clamp((kb - 60) / 30, 0, 1) * 40) : 44;
      let rad = SB.deg(ang);
      // Downward knockback on a grounded target bounces them up instead.
      if (this.grounded && Math.sin(rad) < -0.1) {
        rad = SB.deg(80);
        kb *= 0.8;
      }
      // Directional influence: rotate up to ~12 degrees toward the held direction.
      const sx = this.ctl.x;
      const sy = -this.ctl.y;
      if (Math.hypot(sx, sy) > 0.3) {
        const lx = Math.cos(rad) * dirX;
        const ly = Math.sin(rad);
        const cross = lx * sy - ly * sx; // + => stick is counter-clockwise from launch
        rad += SB.deg(12) * SB.clamp(cross, -1, 1) * (dirX > 0 ? 1 : -1);
      }
      const speed = Math.min(kb * KB_SPEED, 48);
      this.kbx = Math.cos(rad) * speed * dirX;
      this.kby = -Math.sin(rad) * speed;
      if (this.kby < -0.5 || kb >= TUMBLE_KB) {
        if (this.grounded && this.kby < 0) {
          this.grounded = false;
          this.ground = null;
        }
      } else if (this.grounded) this.kby = 0;
      if (kb > 120) this.launchTrail = Math.floor(kb * 0.3);
      if (kb >= TUMBLE_KB && !this.grounded) this.state = 'tumble';
    }

    // ------------------------------------------------------------- physics
    physics() {
      const S = this.state;
      if (S === 'ledge' || S === 'grabbed' || S === 'thrown' || S === 'dead' || S === 'respawn') return;
      const st = this.st;
      if (S === 'final') {
        this.kbx = this.kby = 0;
      }
      if (!this.grounded) {
        if (this.gmul > 0) {
          this.vy += st.grav * this.gmul;
          const maxFall = this.fastFall ? st.ffall : st.fall;
          if (this.vy > maxFall) this.vy = Math.max(maxFall, this.vy - 1.5);
        }
      } else if (this.vy > 0) this.vy = 0;
      // Knockback decays linearly along its direction.
      const km = Math.hypot(this.kbx, this.kby);
      if (km > 0) {
        const nm = Math.max(0, km - KB_DECAY);
        this.kbx *= nm / km;
        this.kby *= nm / km;
      }
      if (this.launchTrail > 0 && km > 6 && this.sf % 2 === 0) this.m.fx.launchSmoke(this.x, this.y - this.h / 2, km);
      this.moveAndCollide(this.vx + this.kbx, this.vy + this.kby);
      if (!this.grounded && this.state !== 'ledge') this.tryLedgeGrab();
    }

    moveAndCollide(dx, dy) {
      const stage = this.m.stage;
      this.wallTouch = null;
      const hw = this.w / 2;
      const h = this.h;
      const px = this.x;
      const py = this.y;
      // Horizontal
      let nx = px + dx;
      for (const s of stage.solids) {
        if (py > s.y + 0.5 && py - h * 0.8 < s.y + s.h) {
          if (nx + hw > s.x && nx - hw < s.x + s.w) {
            const left = px <= s.x + s.w / 2;
            nx = left ? s.x - hw - 0.01 : s.x + s.w + hw + 0.01;
            this.vx = 0;
            if (!this.grounded && s.wall !== false) this.wallTouch = { dir: left ? 1 : -1, s };
            if (Math.abs(this.kbx) > 3 && this.state === 'tumble') {
              this.kbx = -this.kbx * 0.6;
              this.m.fx.dust(nx + (left ? hw : -hw), py - h / 2, left ? -1 : 1, 6);
              SB.audio.play('land');
            } else this.kbx = 0;
          }
        }
      }
      this.x = nx;
      // Vertical
      let ny = py + dy;
      if (dy >= 0 && this.grounded && this.ground) {
        // Standing: stay on the surface, stop at its edge or walk off it.
        const g = this.ground;
        if (this.x < g.x1 || this.x > g.x2) {
          const stop = EDGE_STOP.has(this.state) || (this.state === 'move' && this.move && !this.move.keepMomentum && !this.move.special && Math.abs(this.kbx) < 1);
          if (stop) {
            this.x = SB.clamp(this.x, g.x1, g.x2);
            this.vx = 0;
          } else {
            this.grounded = false;
            this.ground = null;
            this.onLeaveGround();
          }
        }
        if (this.grounded) {
          ny = g.y;
          this.vy = 0;
          this.teeter = this.state === 'idle' && ((this.x - g.x1 < 6 && this.facing < 0) || (g.x2 - this.x < 6 && this.facing > 0)) && !g.plat;
          this.y = ny;
          return;
        }
      }
      this.teeter = false;
      if (dy >= 0) {
        let best = null;
        for (const s of stage.solids) {
          if (this.x >= s.x - 1 && this.x <= s.x + s.w + 1 && py <= s.y + 0.5 && ny >= s.y) {
            if (!best || s.y < best.y) best = { y: s.y, surf: s.surface };
          }
        }
        if (this.dropThrough <= 0 && !(this.state === 'grabbed' || this.state === 'thrown')) {
          for (const p of stage.plats) {
            const top = Math.min(p.y, p.prevY === undefined ? p.y : p.prevY);
            if (this.x >= p.x1 && this.x <= p.x2 && py <= top + 1 + Math.abs(p.dy || 0) && ny >= p.y) {
              if (!best || p.y < best.y) best = { y: p.y, surf: p };
            }
          }
        }
        if (best) {
          ny = best.y;
          this.ground = best.surf;
          this.grounded = true;
          this.y = ny;
          this.onLand(dy);
          ny = this.y;
          if (this.grounded) this.vy = 0;
          else this.ground = null;
        }
      } else {
        if (this.grounded) {
          this.grounded = false;
          this.ground = null;
        }
        for (const s of stage.solids) {
          if (this.x + hw * 0.6 > s.x && this.x - hw * 0.6 < s.x + s.w && py - h >= s.y + s.h - 1 && ny - h < s.y + s.h) {
            ny = s.y + s.h + h;
            this.vy = 0;
            if (this.kby < -3) this.kby = -this.kby * 0.5;
            else this.kby = 0;
          }
        }
      }
      this.y = ny;
    }

    onLeaveGround() {
      if (['idle', 'walk', 'dash', 'run', 'skid', 'crouch', 'land', 'shield', 'unshield'].includes(this.state)) {
        this.state = 'air';
        this.sf = 0;
      }
      this.jumps = Math.min(this.jumps, this.st.jumps - 1);
    }

    onLand(dy) {
      const was = this.state;
      this.jumps = this.st.jumps;
      this.airUsed = {};
      this.fastFall = false;
      this.ledgeInvReady = true;
      this.djumpT = 0;
      const land = (lag) => {
        this.state = 'land';
        this.landLag = lag;
        this.sf = 0;
        this.move = null;
        this.charging = false;
        this.m.fx.dust(this.x, this.y, 0, lag > 8 ? 6 : 3);
        SB.audio.play('land');
      };
      switch (was) {
        case 'move': {
          const m = this.move;
          if (m.landInto) {
            this.startMove(m.landInto);
            return;
          }
          if (m.air) {
            const ac = m.ac && (this.mf < m.ac[0] || this.mf > m.ac[1]);
            land(ac ? 4 : m.land);
            this.vx *= 0.7;
          } else if (m.helpless) land(20);
          else if (m.special && m.landLag) land(m.landLag);
          // Other moves just keep going on the ground.
          break;
        }
        case 'air':
          land(4);
          break;
        case 'helpless':
          land(20);
          break;
        case 'airdodge':
          land(this.sf < 26 ? 10 : 4);
          break;
        case 'wall':
          land(3);
          break;
        case 'tumble': {
          const speed = dy;
          if (this.wasShieldPress < 20) {
            // Tech!
            this.kbx = this.kby = 0;
            this.vx = 0;
            if (Math.abs(this.ctl.x) > 0.5) this.startRoll(SB.sign(this.ctl.x));
            else {
              this.state = 'tech';
              this.sf = 0;
            }
            this.m.fx.ring(this.x, this.y - 10, '#ffffff', 30);
            SB.audio.play('dodge');
          } else if (speed > 9 && this.hitstun > 0) {
            // Bounce off the floor.
            this.grounded = false;
            this.ground = null;
            this.y -= 1;
            this.kby = -Math.abs(this.kby) * 0.55;
            this.vy = -Math.min(Math.abs(this.vy), 8) * 0.6;
            this.m.fx.dust(this.x, this.y, 0, 8);
            this.m.shake(3);
            SB.audio.play('land');
          } else {
            this.state = 'down';
            this.sf = 0;
            this.kbx *= 0.4;
            this.kby = 0;
            this.m.fx.dust(this.x, this.y, 0, 6);
            SB.audio.play('land');
          }
          break;
        }
        case 'hitstun':
          this.kby = 0;
          break;
        case 'shieldbreak':
          this.state = 'dizzy';
          this.sf = 0;
          this.stun = 200 + this.damage * 0.5;
          break;
        default:
          break;
      }
      if (this.state === 'tech' || this.state === 'down' || this.state === 'land' || this.state === 'dizzy') this.kby = 0;
    }

    // -------------------------------------------------------------- death
    die() {
      if (this.grabbing) this.releaseGrab(false);
      if (this.grabbedBy) {
        this.grabbedBy.grabbing = null;
        this.grabbedBy = null;
      }
      if (this.ledge) this.releaseLedge();
      if (this.item) {
        this.item.dead = true;
        this.item = null;
      }
      this.unequipWeapon();
      this.state = 'dead';
      this.deadT = 0;
      this.move = null;
      this.vx = this.vy = this.kbx = this.kby = 0;
      this.pendingKB = null;
      this.hitlag = 0;
      this.hitstun = 0;
      this.finalReady = false;
      this.combo = 0;
    }

    updateDead() {
      this.deadT++;
      if (this.deadT >= 80 && !this.out) this.respawn();
    }

    respawn() {
      const p = this.m.stage.respawnPoint(this.slot);
      this.x = p.x;
      this.y = p.y;
      this.damage = 0;
      this.state = 'respawn';
      this.sf = 0;
      this.facing = this.x > 0 ? -1 : 1;
      this.grounded = false;
      this.ground = null;
      this.jumps = this.st.jumps;
      this.airUsed = {};
      this.shieldHP = SHIELD_MAX;
      this.lastHitBy = null;
      this.fastFall = false;
      this.visOff.x = 0;
      this.visOff.y = -120;
    }

    // -------------------------------------------------------------- posing
    updatePose() {
      const c = this.def;
      const P = c.poses;
      const out = this.pose;
      const S = this.state;
      const t = this.m.frame;
      let src = null;
      const ground = (mods) => SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, c.base, mods), c.prop, out);
      switch (S) {
        case 'move': {
          const m = this.move;
          SB.Skel.sample(m.compiled, this.mf, out);
          if (!this.grounded && !m.air && SB.Skel.keyIk(m.compiled, this.mf)) {
            const a = P.AIR;
            out.aH = a.aH;
            out.aK = a.aK;
            out.bH = a.bH;
            out.bK = a.bK;
          }
          if (this.charging) {
            const sh = Math.sin(t * 1.3) * 1.2;
            out.bx += sh;
          }
          break;
        }
        case 'idle':
        case 'unshield':
          if (this.teeter) {
            ground(Object.assign({}, SB.Moves.POSES.teeter, { aS: 2.2 + Math.sin(t * 0.3) * 0.6, bS: 1.6 - Math.sin(t * 0.3) * 0.6 }));
          } else {
            const b = Math.sin(t * 0.07 + this.slot);
            ground({ by: (c.base.by || 0) + b * 1.3 + 1, aS: 0.25 + b * 0.05, bS: -0.2 - b * 0.05, head: b * 0.03 });
          }
          break;
        case 'walk': {
          const ph = this.x * 0.09 * this.facing;
          const sn = Math.sin(ph);
          src = ground({ by: 2 - Math.abs(Math.cos(ph)) * 2.5, lean: 0.1 + (c.base.lean || 0) * 0.5, aS: -sn * 0.6 + 0.1, aE: 0.5, bS: sn * 0.6 - 0.1, bE: 0.5 });
          out.aH = sn * 0.55 + 0.05;
          out.aK = Math.max(0, Math.cos(ph)) * 0.9 + 0.1;
          out.bH = -sn * 0.55 + 0.05;
          out.bK = Math.max(0, -Math.cos(ph)) * 0.9 + 0.1;
          break;
        }
        case 'run': {
          const ph = this.sf * 0.36 * (this.st.run / 8);
          const sn = Math.sin(ph);
          const cs = Math.cos(ph);
          ground({ by: 4 - Math.abs(cs) * 5, lean: 0.38, aS: -sn * 1.0, aE: 1.5, bS: sn * 1.0, bE: 1.5, head: -0.15 });
          out.aH = sn * 1.0 + 0.35;
          out.aK = Math.max(0, -cs) * 1.4 + 0.25;
          out.bH = -sn * 1.0 + 0.35;
          out.bK = Math.max(0, cs) * 1.4 + 0.25;
          if (c.id === 'aria') {
            out.aS = -0.7;
            out.aE = 0.5;
            out.wpn = 1.9;
          }
          if (c.id === 'volt') {
            out.aS = -1.3;
            out.bS = -1.2;
            out.aE = out.bE = 0.2;
            out.lean = 0.6;
          }
          break;
        }
        case 'dash':
          ground(SB.Moves.POSES.dashStart);
          break;
        case 'skid':
          ground(SB.Moves.POSES.skid);
          break;
        case 'crouch':
          ground(SB.Moves.POSES.CROUCH);
          break;
        case 'jumpsquat':
          ground(SB.Moves.POSES.jumpsquat);
          break;
        case 'land':
          ground(Object.assign({}, SB.Moves.POSES.land, { by: 18 * (1 - this.sf / Math.max(1, this.landLag)) }));
          break;
        case 'air': {
          const k = SB.clamp((this.vy + 6) / 12, 0, 1);
          for (const ch of SB.Skel.CH) out[ch] = P.rise[ch] + (P.fall[ch] - P.rise[ch]) * k;
          if (this.djumpT > 0) {
            const u = 1 - this.djumpT / 22;
            const tk = Math.sin(u * Math.PI);
            for (const ch of SB.Skel.CH) out[ch] = out[ch] + (P.tuck[ch] - out[ch]) * tk * 0.8;
            out.spin = SB.easeOut(u) * TAU;
          } else out.spin = 0;
          break;
        }
        case 'helpless':
          Object.assign(out, P.helpless);
          out.aS += Math.sin(t * 0.2) * 0.2;
          break;
        case 'shield':
        case 'shieldstun':
          ground(SB.Moves.POSES.shield);
          break;
        case 'roll':
        case 'tech': {
          const u = SB.clamp(this.sf / (S === 'tech' ? 16 : 26), 0, 1);
          Object.assign(out, P.tuck);
          out.spin = u * TAU * (S === 'roll' ? this.rollDir * this.facing : 1);
          out.by = 22 + Math.sin(u * Math.PI) * 4;
          if (u >= 1) ground({});
          break;
        }
        case 'spotdodge':
          ground(Object.assign({}, SB.Moves.POSES.shield, { by: 20, lean: 0.4 }));
          break;
        case 'airdodge': {
          const u = SB.clamp(this.sf / 26, 0, 1);
          for (const ch of SB.Skel.CH) out[ch] = P.fall[ch] + (P.tuck[ch] - P.fall[ch]) * Math.sin(u * Math.PI) * 0.8;
          out.spin = u < 1 ? SB.easeOut(u) * TAU * (this.dodgeDir && this.dodgeDir.x * this.facing < 0 ? -1 : 1) : 0;
          break;
        }
        case 'hitstun':
          Object.assign(out, this.grounded ? P.hurt : P.hurtAir);
          break;
        case 'tumble':
          Object.assign(out, this.hitstun > 0 ? P.tumble : P.fall);
          out.spin = this.hitstun > 0 ? -this.spinT : 0;
          break;
        case 'down':
          Object.assign(out, P.lying);
          break;
        case 'getup': {
          const u = SB.smooth(SB.clamp(this.sf / 22, 0, 1));
          const tgt = SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, c.base, SB.Moves.POSES.CROUCH), c.prop);
          for (const ch of SB.Skel.CH) out[ch] = P.lying[ch] + (tgt[ch] - P.lying[ch]) * u;
          break;
        }
        case 'dizzy':
          ground(Object.assign({}, SB.Moves.POSES.dizzy, { lean: 0.25 + Math.sin(t * 0.1) * 0.2, head: 0.4 + Math.sin(t * 0.13) * 0.3 }));
          break;
        case 'shieldbreak':
          Object.assign(out, P.tumble);
          out.spin = 0;
          break;
        case 'wall':
          Object.assign(out, P.wall);
          out.aS += Math.sin(t * 0.1) * 0.05;
          break;
        case 'ledge':
          Object.assign(out, P.ledge);
          out.aH += Math.sin(t * 0.08) * 0.08;
          break;
        case 'climb': {
          const u = SB.clamp(this.sf / this.climbLen, 0, 1);
          ground(Object.assign({}, SB.Moves.POSES.land, { by: 26 * (1 - u), lean: 0.5 * (1 - u) + 0.06 }));
          break;
        }
        case 'grabhold':
          ground(SB.Moves.POSES.HOLD);
          break;
        case 'grabbed':
          Object.assign(out, P.grabbed);
          out.aH += Math.sin(t * 0.5) * 0.15;
          out.bH -= Math.sin(t * 0.5) * 0.15;
          break;
        case 'thrown':
          Object.assign(out, P.tumble);
          out.spin = -this.sf * 0.3;
          break;
        case 'respawn':
          ground({});
          break;
        case 'final':
          ground({ aS: 1.57, aE: 0, bS: 1.4, bE: 0.2, lean: 0.25, fa: 20, fb: -18 });
          break;
        default:
          Object.assign(out, P.fall);
      }
      void src;
      if (S !== 'air' && S !== 'roll' && S !== 'tech' && S !== 'airdodge' && S !== 'tumble' && S !== 'move' && S !== 'thrown' && S !== 'helpless') {
        if (out.spin === undefined) out.spin = 0;
      }
      SB.Skel.solve(out, this.prop, this.J);
    }
  }

  Fighter.SHIELD_MAX = SHIELD_MAX;
  SB.Fighter = Fighter;
})();
