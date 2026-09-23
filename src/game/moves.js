// Default (unarmed) moveset + helpers for building move data.
//
// Move fields (all frame numbers are in "base frames"; characters with a
// different speed stat play them faster/slower):
//   frames       total length
//   anim         keyframes [[frame, partialPose, ease], ...]
//   air          true for aerials (anim starts from the airborne base pose)
//   hit          hitboxes (see SB.hb)
//   land         landing lag if the move is interrupted by landing
//   ac           [early, late] autocancel window for aerials
//   charge       {f, max, btn, dmg} hold a button to charge at frame f
//   motion       [[start, end, vx, vy | null, mode]] velocity overrides
//   grav         gravity multiplier while the move runs
//   helpless     become helpless afterwards when airborne
//   inv          [start, end] intangible frames
//   armor        [start, end, maxDamage]
//   ev           {frame: (fighter, match) => void} scripted events
//   trail        bone to draw a swoosh trail behind
//   next         {id, from, to} jab-style follow-up window
'use strict';
(function () {
  const PI = Math.PI;

  // Hitbox helper. bone: joint name or {x, y} local offset.
  function hb(f0, f1, bone, r, dmg, ang, bkb, kbg, extra) {
    return Object.assign({ f: [f0, f1], bone, r, dmg, ang, bkb, kbg, grp: 0 }, extra || {});
  }

  const AIR = { ikA: 0, ikB: 0, aH: 0.55, aK: 1.0, bH: 0.1, bK: 0.7, lean: 0.05, aS: 0.6, aE: 1.1, bS: -0.5, bE: 1.0, head: 0, by: 0, bx: 0, sx: 1, sy: 1 };
  const IDLE = { lean: 0.06, aS: 0.25, aE: 0.5, bS: -0.2, bE: 0.55, fa: 9, fb: -9, ikA: 1, ikB: 1, by: 0, bx: 0, head: 0, spin: 0, sx: 1, sy: 1 };
  const CROUCH = { by: 24, lean: 0.35, fa: 16, fb: -14, aS: 0.7, aE: 1.3, bS: 0.5, bE: 1.4, head: -0.15 };
  const HOLD = { lean: 0.15, aS: 1.3, aE: 0.35, bS: 1.2, bE: 0.45 };

  const D = {};

  // ---------------------------------------------------------------- jabs
  D.jab1 = {
    frames: 16, trail: 'haA', swing: 2,
    anim: [
      [0, { aS: 0.7, aE: 1.9, bS: 0.5, bE: 2.0, lean: 0.12 }],
      [3, { aS: 1.6, aE: 0.05, lean: 0.28, fa: 17 }, 'out'],
      [7, {}],
      [16, IDLE],
    ],
    hit: [hb(3, 5, 'haA', 11, 2.5, 70, 14, 25), hb(3, 5, 'elA', 9, 2.5, 70, 14, 25)],
    next: { id: 'jab2', from: 3, to: 14, start: 7 },
  };
  D.jab2 = {
    frames: 17, trail: 'haB', swing: 2,
    anim: [
      [0, { aS: 0.4, aE: 1.0, bS: 0.9, bE: 1.6, lean: 0.15, fa: 17 }],
      [3, { bS: 1.6, bE: 0.05, aS: 0.3, aE: 1.8, lean: 0.3 }, 'out'],
      [8, {}],
      [17, IDLE],
    ],
    hit: [hb(3, 5, 'haB', 11, 2.5, 70, 14, 25), hb(3, 5, 'elB', 9, 2.5, 70, 14, 25)],
    next: { id: 'jab3', from: 3, to: 15, start: 8 },
  };
  D.jab3 = {
    frames: 30, trail: 'ftA', swing: 3,
    anim: [
      [0, { lean: -0.1, ikA: 0, aH: 0.6, aK: 1.5, aS: 0.4, aE: 1.4, bS: 0.8, bE: 1.4 }],
      [4, { lean: -0.3, aH: 1.6, aK: 0.05, aS: -0.4, bS: 0.9, bE: 1.0 }, 'out'],
      [11, {}],
      [20, { aH: 0.7, aK: 1.2, lean: 0 }],
      [30, IDLE],
    ],
    hit: [hb(4, 7, 'ftA', 14, 4, 40, 45, 90, { kind: 'kick' }), hb(4, 7, 'knA', 10, 3, 40, 40, 80, { kind: 'kick' })],
  };

  // --------------------------------------------------------------- tilts
  D.ftilt = {
    frames: 26, trail: 'ftA', swing: 5,
    anim: [
      [0, { lean: -0.05, ikA: 0, aH: 0.9, aK: 1.7, aS: 0.8, aE: 1.5, bS: 0.4, bE: 1.4 }],
      [6, { lean: -0.32, aH: 1.62, aK: 0, aS: -0.2, aE: 0.5, bS: 1.0, bE: 0.8, fb: -12 }, 'out'],
      [12, {}],
      [20, { aH: 0.8, aK: 1.2, lean: 0 }],
      [26, IDLE],
    ],
    hit: [hb(6, 9, 'ftA', 14, 9, 35, 20, 95, { kind: 'kick' }), hb(6, 9, 'knA', 10, 7, 35, 18, 90, { kind: 'kick' })],
  };
  D.utilt = {
    frames: 28, trail: 'haA', swing: 4,
    anim: [
      [0, { aS: 1.2, aE: 0.4, lean: 0.1, bS: -0.5 }],
      [5, { aS: 2.2, aE: 0.2, lean: 0 }, 'linear'],
      [9, { aS: 3.1, aE: 0.1, lean: -0.15 }, 'linear'],
      [13, { aS: 3.9, aE: 0.2, lean: -0.2 }, 'out'],
      [28, IDLE],
    ],
    hit: [hb(5, 13, 'haA', 15, 7, 96, 40, 112), hb(5, 13, 'elA', 11, 6, 96, 38, 108)],
  };
  D.dtilt = {
    frames: 20, trail: 'ftA', swing: 4, crouch: true,
    anim: [
      [0, Object.assign({}, CROUCH, { by: 24, fa: 20, fb: -16 })],
      [5, { ikA: 0, aH: 1.5, aK: 0.05, by: 28, lean: 0.15, aS: -0.2, bS: 0.9 }, 'out'],
      [9, {}],
      [20, Object.assign({ ikA: 1 }, CROUCH)],
    ],
    hit: [hb(5, 8, 'ftA', 13, 6, 80, 42, 48, { kind: 'kick' }), hb(5, 8, 'knA', 10, 5, 80, 40, 45, { kind: 'kick' })],
  };
  D.dash = {
    frames: 36, trail: 'ftA', swing: 5, keepMomentum: true, friction: 0.25,
    anim: [
      [0, { lean: 0.35 }],
      [5, { ikA: 0, ikB: 0, aH: 1.45, aK: 0.1, bH: -0.4, bK: 1.3, lean: -0.15, by: -8, aS: -0.4, bS: 0.9 }, 'out'],
      [17, {}],
      [27, { ikA: 1, ikB: 1, by: 0, lean: 0.2 }],
      [36, IDLE],
    ],
    hit: [
      hb(5, 10, 'ftA', 15, 11, 45, 55, 70, { kind: 'kick' }),
      hb(5, 10, 'knA', 11, 9, 45, 50, 65, { kind: 'kick' }),
      hb(11, 17, 'ftA', 12, 7, 60, 40, 60, { kind: 'kick' }),
    ],
  };

  // -------------------------------------------------------------- smashes
  D.fsmash = {
    frames: 46, trail: 'haA', swing: 13, smash: true,
    charge: { f: 9, max: 60, btn: 'attack', dmg: 0.4 },
    anim: [
      [0, { lean: -0.2, aS: -0.8, aE: 1.2, bS: 0.6, bE: 1.5, fa: 14, fb: -16 }],
      [9, { lean: -0.32, aS: -1.1, aE: 1.5 }],
      [14, { lean: 0.48, aS: 1.62, aE: 0, bS: -0.7, bE: 0.4, fa: 32, fb: -22 }, 'out'],
      [23, {}],
      [46, IDLE],
    ],
    motion: [[12, 16, 3.5, null, 'ground']],
    hit: [hb(14, 17, 'haA', 17, 16, 38, 32, 100), hb(14, 17, 'elA', 13, 14, 38, 30, 98)],
  };
  D.usmash = {
    frames: 46, trail: 'haA', swing: 10, smash: true,
    charge: { f: 7, max: 60, btn: 'attack', dmg: 0.4 },
    anim: [
      [0, { by: 14, lean: 0.25, aS: 0.3, aE: 1.8, bS: 0.3, bE: 1.8 }],
      [7, { by: 18 }],
      [11, { by: -6, lean: -0.1, aS: 2.95, aE: 0.1, bS: 2.75, bE: 0.2, sy: 1.06 }, 'out'],
      [19, {}],
      [46, IDLE],
    ],
    hit: [hb(11, 16, 'haA', 18, 15, 88, 34, 102), hb(11, 14, 'neck', 17, 12, 86, 30, 96)],
  };
  D.dsmash = {
    frames: 46, trail: 'ftA', swing: 9, smash: true,
    charge: { f: 6, max: 60, btn: 'attack', dmg: 0.4 },
    anim: [
      [0, { by: 16, lean: 0.05, aS: 1.0, bS: -1.0 }],
      [6, { by: 18 }],
      [10, { ikA: 0, ikB: 0, aH: 1.55, aK: 0, bH: -1.55, bK: 0, by: 36, lean: 0, aS: 1.1, bS: -1.1, aE: 0.3, bE: 0.3 }, 'out'],
      [22, {}],
      [34, { ikA: 1, ikB: 1, by: 12 }],
      [46, IDLE],
    ],
    hit: [
      hb(10, 13, 'ftA', 15, 14, 28, 30, 96, { kind: 'kick' }),
      hb(12, 15, 'ftB', 15, 13, 28, 30, 96, { kind: 'kick', back: true }),
    ],
  };

  // ------------------------------------------------------------- aerials
  D.nair = {
    frames: 32, air: true, land: 7, ac: [3, 24], trail: 'ftA', swing: 3,
    anim: [
      [0, { aH: 1.1, aK: 1.9, bH: 0.9, bK: 2.0, aS: 1.0, aE: 1.5, bS: 1.0, bE: 1.5 }],
      [4, { aH: 1.45, aK: 0.1, bH: -0.4, bK: 0.5, aS: 0.2, bS: -0.6, spin: 0 }, 'out'],
      [20, { spin: PI * 2 }, 'linear'],
      [32, AIR],
    ],
    hit: [hb(4, 8, 'ftA', 14, 10, 361, 20, 100, { kind: 'kick', auto: true }), hb(9, 20, 'ftA', 12, 6, 361, 12, 90, { kind: 'kick', auto: true })],
  };
  D.fair = {
    frames: 36, air: true, land: 12, ac: [4, 30], trail: 'haA', swing: 9,
    anim: [
      [0, { aS: 2.8, aE: 0.5, bS: 2.7, bE: 0.6, lean: -0.2 }],
      [10, { aS: 3.25, aE: 0.7, bS: 3.15, lean: -0.3 }],
      [14, { aS: 1.0, aE: 0.1, bS: 0.9, bE: 0.15, lean: 0.45 }, 'out'],
      [21, {}],
      [36, AIR],
    ],
    hit: [
      hb(14, 15, 'haA', 17, 13, 45, 30, 96),
      hb(14, 15, 'elA', 12, 11, 45, 28, 94),
      hb(16, 18, 'haA', 16, 14, 285, 20, 88, { hl: 1.3 }),
    ],
  };
  D.bair = {
    frames: 30, air: true, land: 9, ac: [3, 22], trail: 'ftB', swing: 6,
    anim: [
      [0, { aH: -0.2, aK: 1.7, bH: 0.7, bK: 1.5, lean: 0.3 }],
      [7, { bH: -1.75, bK: 0.05, aH: 0.5, aK: 1.3, lean: 0.55, head: -0.35 }, 'out'],
      [14, {}],
      [30, AIR],
    ],
    hit: [hb(7, 10, 'ftB', 15, 13, 38, 22, 100, { kind: 'kick', back: true }), hb(11, 14, 'ftB', 12, 8, 40, 15, 90, { kind: 'kick', back: true })],
  };
  D.uair = {
    frames: 30, air: true, land: 7, ac: [3, 22], trail: 'ftA', swing: 4,
    anim: [
      [0, { aH: 0.6, aK: 1.5, spin: 0 }],
      [5, { aH: 3.0, aK: 0.1, bH: 0.3, bK: 1.0, spin: -0.9, aS: -0.5, bS: -0.7 }, 'out'],
      [12, { aH: 3.6, spin: -1.5 }],
      [30, Object.assign({ spin: 0 }, AIR)],
    ],
    hit: [hb(5, 12, 'ftA', 14, 8, 85, 38, 92, { kind: 'kick' })],
  };
  D.dair = {
    frames: 40, air: true, land: 18, ac: [4, 34], trail: 'ftA', swing: 13,
    anim: [
      [0, { aH: 1.3, aK: 2.3, bH: 1.2, bK: 2.2, lean: 0.25, aS: 1.2, bS: 1.2 }],
      [12, { aH: 1.4, aK: 2.4, lean: 0.3 }],
      [15, { aH: 0, aK: 0, bH: 0.12, bK: 0.2, lean: 0, aS: 1.3, bS: -1.3, aE: 0.3, bE: 0.3 }, 'out'],
      [23, {}],
      [40, AIR],
    ],
    hit: [hb(15, 18, 'ftA', 15, 14, 275, 20, 85, { kind: 'kick', hl: 1.3 }), hb(19, 23, 'ftA', 12, 9, 60, 20, 80, { kind: 'kick' })],
  };

  // ---------------------------------------------------------------- grabs
  D.grab = {
    frames: 32, noEdge: true,
    anim: [
      [0, { lean: 0.1, aS: 0.8, bS: 0.8 }],
      [6, { lean: 0.32, aS: 1.6, aE: 0.1, bS: 1.5, bE: 0.15, fa: 19 }, 'out'],
      [10, {}],
      [32, IDLE],
    ],
    hit: [hb(6, 9, 'haA', 16, 0, 0, 0, 0, { grab: true }), hb(6, 9, 'elA', 13, 0, 0, 0, 0, { grab: true })],
  };
  D.pummel = {
    frames: 18,
    anim: [[0, HOLD], [5, { lean: 0.5, head: 0.35 }, 'out'], [18, HOLD]],
  };
  D.fthrow = {
    frames: 30,
    throw: { release: 10, dmg: 8, ang: 45, bkb: 65, kbg: 55, dir: 1 },
    anim: [[0, HOLD], [6, { lean: -0.1, aS: 1.0, aE: 1.2 }], [10, { lean: 0.55, aS: 1.7, aE: 0, bS: 1.7, bE: 0, fa: 22 }, 'out'], [30, IDLE]],
  };
  D.bthrow = {
    frames: 36,
    throw: { release: 14, dmg: 10, ang: 45, bkb: 60, kbg: 72, dir: -1 },
    anim: [[0, HOLD], [8, { lean: 0.2, aS: 0.3, bS: 0.3 }], [14, { lean: -0.45, aS: -1.3, aE: 0.1, bS: -1.2, bE: 0.1, fb: -22 }, 'out'], [36, IDLE]],
  };
  D.uthrow = {
    frames: 32,
    throw: { release: 12, dmg: 7, ang: 90, bkb: 70, kbg: 62, dir: 1 },
    anim: [[0, HOLD], [7, { by: 14, aS: 0.6 }], [12, { by: -4, lean: -0.1, aS: 3.0, aE: 0.1, bS: 2.9, bE: 0.1 }, 'out'], [32, IDLE]],
  };
  D.dthrow = {
    frames: 34,
    throw: { release: 14, dmg: 6, ang: 72, bkb: 55, kbg: 42, dir: 1 },
    anim: [[0, HOLD], [7, { aS: 2.4, bS: 2.3, lean: -0.1 }], [14, { by: 20, lean: 0.7, aS: 0.4, aE: 0.1, bS: 0.4, bE: 0.1 }, 'out'], [34, IDLE]],
  };

  // ------------------------------------------------ QWER combo moves
  // Q Q W: launcher - pops the opponent up for air follow-ups.
  D.cLauncher = {
    frames: 30, trail: 'haA', swing: 4, comboMove: true,
    anim: [
      [0, { by: 14, lean: 0.3, aS: 0.3, aE: 1.9, bS: 0.4, bE: 1.6 }],
      [5, { by: -6, lean: -0.12, aS: 2.95, aE: 0.1, bS: -0.5, bE: 0.6, sy: 1.06, fa: 16 }, 'out'],
      [13, {}],
      [30, IDLE],
    ],
    motion: [[0, 7, 5, null, 'ground']],
    hit: [hb(5, 10, 'haA', 20, 7, 88, 72, 30, { hl: 1.2 }), hb(5, 10, 'elA', 17, 6, 88, 72, 30), hb(4, 8, 'body', 22, 6, 88, 72, 30)],
  };
  // Q Q Q Q: rapid flurry that ends with a push.
  D.cFlurry = {
    frames: 44, trail: 'haA', comboMove: true,
    anim: [
      [0, { lean: 0.2, aS: 0.8, aE: 1.8, bS: 0.8, bE: 1.8 }],
      [3, { aS: 1.6, aE: 0.05, bS: 0.5, bE: 1.9, lean: 0.3, fa: 17 }, 'linear'],
      [6, { aS: 0.6, aE: 1.8, bS: 1.6, bE: 0.05 }, 'linear'],
      [9, { aS: 1.65, aE: 0.05, bS: 0.5, bE: 1.9 }, 'linear'],
      [12, { aS: 0.6, aE: 1.8, bS: 1.6, bE: 0.05 }, 'linear'],
      [15, { aS: 1.6, aE: 0.05, bS: 0.5, bE: 1.9 }, 'linear'],
      [18, { aS: 0.6, aE: 1.8, bS: 1.6, bE: 0.05 }, 'linear'],
      [21, { aS: -0.6, aE: 1.4, bS: 0.3, lean: -0.1 }],
      [25, { aS: 1.62, aE: 0, bS: -0.6, lean: 0.5, fa: 26, fb: -20 }, 'out'],
      [32, {}],
      [44, IDLE],
    ],
    motion: [[0, 4, 5, null, 'ground']],
    tick: (f, fr) => {
      if (fr % 3 === 0 && fr < 21) SB.audio.play('swing', 0.3);
    },
    hit: [
      hb(3, 5, 'haA', 14, 1.5, 80, 0, 0, { grp: 0, fkb: 22, drag: true }),
      hb(6, 8, 'haB', 14, 1.5, 80, 0, 0, { grp: 1, fkb: 22, drag: true }),
      hb(9, 11, 'haA', 14, 1.5, 80, 0, 0, { grp: 2, fkb: 22, drag: true }),
      hb(12, 14, 'haB', 14, 1.5, 80, 0, 0, { grp: 3, fkb: 22, drag: true }),
      hb(15, 17, 'haA', 14, 1.5, 80, 0, 0, { grp: 4, fkb: 22, drag: true }),
      hb(18, 20, 'haB', 14, 1.5, 80, 0, 0, { grp: 5, fkb: 22, drag: true }),
      hb(25, 29, 'haA', 19, 6, 40, 60, 80, { grp: 6 }),
    ],
  };
  // Q W E: the character's signature finisher.
  D.cFinisher = {
    frames: 50, trail: 'haA', swing: 9, comboMove: true,
    anim: [
      [0, { lean: -0.3, aS: -1.2, aE: 1.5, bS: 0.9, bE: 1.4, by: 10, fb: -20 }],
      [7, { lean: -0.4, aS: -1.5, by: 12 }],
      [10, { lean: 0.65, aS: 1.62, aE: 0, bS: -0.9, bE: 0.4, by: 2, fa: 36, fb: -26 }, 'out'],
      [24, {}],
      [50, IDLE],
    ],
    motion: [[6, 14, 10, null]],
    tick: (f, fr) => {
      if (fr < 8 && fr % 2 === 0) f.fxCharge();
    },
    ev: {
      10: (f, m) => {
        const h = f.jointWorld('haA');
        m.fx.explosion(h.x + f.facing * 10, h.y, 45, f.pal.glow);
        m.shake(6);
      },
    },
    hit: [hb(10, 15, 'haA', 26, 14, 40, 85, 92, { hl: 1.8, finisher: true }), hb(10, 15, 'elA', 20, 12, 40, 85, 92, { finisher: true })],
  };

  // Heavy + down in the air: Brawlhalla-style ground pound.
  D.gpound = {
    frames: 60, air: true, land: 16, landInto: 'gpoundLand', trail: 'ftA', swing: 6,
    anim: [
      [0, { aH: 1.6, aK: 2.4, bH: 1.5, bK: 2.4, lean: 0.4, aS: 2.4, bS: 2.3 }],
      [6, { aH: 0.1, aK: 0.1, bH: -0.1, bK: 0.2, lean: 0.05, aS: 1.3, aE: 0.2, bS: -1.3, bE: 0.2 }, 'out'],
      [60, {}],
    ],
    tick: (f, fr) => {
      f.gmul = 0;
      if (fr < 6) {
        f.vy = Math.min(f.vy * 0.5, 0);
        f.vx *= 0.8;
      } else {
        f.vy = 15;
        if (fr % 2 === 0) f.fxTrail('dust');
      }
    },
    hit: [hb(6, 60, 'ftA', 17, 9, 290, 30, 60, { kind: 'kick' }), hb(6, 60, 'ftB', 14, 8, 290, 30, 60, { kind: 'kick' })],
  };
  D.gpoundLand = {
    frames: 22,
    anim: [[0, Object.assign({}, CROUCH, { by: 28, fa: 22, fb: -22 })], [22, IDLE]],
    ev: {
      0: (f, m) => {
        m.fx.dust(f.x, f.y, -1, 5);
        m.fx.dust(f.x, f.y, 1, 5);
        m.fx.ring(f.x, f.y - 4, '#ffffff', 50);
        m.shake(4);
        SB.audio.play('land');
      },
    },
    hit: [hb(0, 3, { x: 0, y: -14 }, 42, 5, 70, 55, 40, { auto: true, kind: 'kick' })],
  };

  D.itemThrow = {
    frames: 22,
    anim: [[0, { aS: 2.7, aE: 0.8, lean: -0.1 }], [6, { aS: 1.3, aE: 0, lean: 0.3 }, 'out'], [22, IDLE]],
  };

  // ----------------------------------------------- recovery attacks
  D.getupAtk = {
    frames: 32, inv: [0, 12],
    anim: [
      [0, { by: 30, lean: 1.1, aS: 1.5, bS: 1.5 }],
      [8, { by: 18, lean: 0.3, ikA: 0, aH: 1.5, aK: 0.1 }, 'out'],
      [12, { ikA: 0, ikB: 1, aH: -1.4, aK: 0.1, lean: 0.6 }],
      [32, IDLE],
    ],
    hit: [hb(8, 14, { x: 0, y: -22 }, 38, 7, 30, 60, 40, { auto: true, kind: 'kick' })],
  };
  D.ledgeAtk = {
    frames: 36, inv: [0, 14], noEdge: true,
    anim: [
      [0, { by: 26, lean: 0.8, aS: 2.2, bS: 2.0 }],
      [10, { by: 6, lean: -0.1, ikA: 0, aH: 1.5, aK: 0.1 }, 'out'],
      [18, {}],
      [36, IDLE],
    ],
    hit: [hb(10, 15, 'ftA', 17, 9, 45, 60, 45, { kind: 'kick' }), hb(10, 15, 'knA', 13, 8, 45, 60, 45, { kind: 'kick' })],
  };

  // Common state poses used by the fighter when no move is running.
  const POSES = {
    IDLE, AIR, CROUCH, HOLD,
    jumpsquat: { by: 16, lean: 0.25, fa: 12, fb: -12, aS: -0.3, bS: -0.4 },
    land: { by: 18, lean: 0.3, fa: 14, fb: -14, aS: -0.3, aE: 0.9, bS: 0.5, bE: 0.9 },
    rise: { ikA: 0, ikB: 0, aH: 1.0, aK: 1.5, bH: -0.1, bK: 0.6, aS: -0.4, aE: 0.8, bS: 0.7, bE: 0.7, lean: -0.05 },
    fall: { ikA: 0, ikB: 0, aH: 0.35, aK: 0.6, bH: -0.15, bK: 0.35, aS: 2.1, aE: 0.4, bS: 2.3, bE: 0.5, lean: 0.05, head: -0.1 },
    shield: { by: 10, lean: 0.12, aS: 1.0, aE: 1.9, bS: 0.9, bE: 1.95, head: 0.15, fa: 13, fb: -13 },
    hurt: { lean: -0.45, head: -0.5, aS: -0.9, aE: 0.8, bS: 1.4, bE: 0.6, by: 6, fa: 4, fb: -16 },
    hurtAir: { ikA: 0, ikB: 0, lean: -0.5, head: -0.5, aS: 2.4, aE: 0.5, bS: -2.0, bE: 0.4, aH: 0.8, aK: 1.0, bH: -0.4, bK: 0.4 },
    tumble: { ikA: 0, ikB: 0, lean: -0.3, head: -0.4, aS: 2.6, aE: 0.8, bS: -2.4, bE: 0.9, aH: 1.2, aK: 1.4, bH: -0.8, bK: 0.9 },
    helpless: { ikA: 0, ikB: 0, lean: 0.2, head: -0.3, aS: 2.6, aE: 0.3, bS: 2.9, bE: 0.3, aH: 0.25, aK: 0.8, bH: -0.25, bK: 0.9 },
    ledge: { ikA: 0, ikB: 0, lean: 0.12, head: 0.2, aS: 2.95, aE: 0.05, bS: 2.85, bE: 0.1, aH: 0.2, aK: 0.55, bH: -0.05, bK: 0.8 },
    lying: { ikA: 0, ikB: 0, spin: -PI / 2, by: 44, lean: 0, head: 0.25, aS: 0.4, aE: 0.2, bS: -0.3, bE: 0.4, aH: 0.2, aK: 0.2, bH: -0.1, bK: 0.4 },
    grabbed: { ikA: 0, ikB: 0, lean: -0.3, head: -0.4, aS: 1.6, aE: 1.2, bS: 2.2, bE: 0.9, aH: 0.3, aK: 0.9, bH: -0.2, bK: 0.6 },
    tuck: { ikA: 0, ikB: 0, aH: 1.9, aK: 2.6, bH: 1.7, bK: 2.5, aS: 1.3, aE: 2.0, bS: 1.2, bE: 2.1, lean: 0.9, head: 0.4, by: 22 },
    dizzy: { lean: 0.25, head: 0.4, aS: 0.1, aE: 0.2, bS: -0.1, bE: 0.2, by: 10, fa: 14, fb: -14 },
    teeter: { lean: -0.2, aS: 2.2, aE: 0.8, bS: 1.6, bE: 1.2, fa: 3, fb: -14, head: 0.3 },
    skid: { lean: -0.35, by: 10, fa: 22, fb: -6, aS: 1.1, aE: 0.8, bS: -1.0, bE: 0.6 },
    dashStart: { lean: 0.45, by: 6, fa: 20, fb: -20, aS: -0.9, aE: 1.0, bS: 1.1, bE: 1.3 },
    wall: { ikA: 0, ikB: 0, lean: -0.15, head: 0.2, aS: -1.3, aE: 0.4, bS: -0.9, bE: 0.9, aH: 1.0, aK: 1.8, bH: -0.2, bK: 1.1 },
    victory: { lean: -0.05, head: -0.15, aS: 2.65, aE: 0.25, bS: 0.2, bE: 1.9, fa: 12, fb: -14 },
  };

  SB.Moves = { hb, D, POSES, AIR, IDLE, CROUCH, HOLD };
})();
