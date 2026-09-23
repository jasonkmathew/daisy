// Character roster: stats, proportions, palettes, special moves and
// per-character overrides of the default moveset.
'use strict';
(function () {
  const PI = Math.PI;
  const { hb, D, AIR, IDLE } = SB.Moves;
  const idle = (extra) => Object.assign({}, IDLE, extra || {});

  // ================================================================= BLAZE
  const blaze = {
    id: 'blaze',
    name: 'KAI',
    fullName: 'KAI HOMURA',
    title: 'The Crimson Fist',
    desc: 'Hot-blooded street fighter. Fireballs, a blazing rush punch and an explosive burst.',
    prop: { thigh: 24, shin: 25, torso: 31, upperArm: 17, foreArm: 16, headR: 16.5, neck: 5, limb: 9.5, weapon: 0 },
    w: 40, h: 106,
    stats: {
      weight: 100, walk: 3.6, run: 7.8, dashInit: 8.4, air: 5.3, airAccel: 0.45, airFric: 0.05,
      grav: 0.75, fall: 11, ffall: 16.5, jump: 16, hop: 10.5, djump: 15.5, jumps: 3, traction: 0.7,
      speed: 1, power: 1, hbs: 1, roll: 7.5,
    },
    kind: 'punch',
    trailColor: '#ffb347',
    palettes: [
      { name: 'Crimson', hair: '#e8352c', main: '#c9242f', sub: '#2b2f45', accent: '#1d1b26', skin: '#f7d3b5', eye: '#d6302c', glow: '#ffb347' },
      { name: 'Azure', hair: '#3aa0ff', main: '#1f5fd6', sub: '#1d2240', accent: '#e9edf5', skin: '#f2cba9', eye: '#1f7ae0', glow: '#9be7ff' },
      { name: 'Jade', hair: '#2bd67b', main: '#1c8a4f', sub: '#1f2a24', accent: '#101512', skin: '#e0ac7e', eye: '#18a860', glow: '#c8ff7a' },
      { name: 'Shadow', hair: '#f2f2f7', main: '#34303f', sub: '#15141c', accent: '#8a2be2', skin: '#f7d9c4', eye: '#b14aff', glow: '#e0a3ff' },
    ],
    final: { type: 'beam', name: 'SOLAR FLARE' },
    base: {},
    moves: {},
  };
  blaze.moves.fsmash = Object.assign({}, D.fsmash, { hit: D.fsmash.hit.map((h) => Object.assign({}, h, { kind: 'fire' })) });
  blaze.moves.fair = Object.assign({}, D.fair, { hit: D.fair.hit.map((h) => Object.assign({}, h, { kind: 'fire' })) });

  blaze.moves.nspec = {
    frames: 38, special: true, trail: 'haA',
    anim: [
      [0, { aS: 0.2, aE: 1.9, bS: 0.9, bE: 1.6, lean: -0.1 }],
      [9, { aS: -0.5, aE: 1.6, lean: -0.22 }],
      [12, { aS: 1.57, aE: 0, lean: 0.35, bS: -0.6, fa: 17 }, 'out'],
      [22, {}],
      [38, idle()],
    ],
    ev: {
      12: (f) => {
        if (f.projCount('fireball') < 2) {
          f.spawnProj('fireball', { bone: 'haA', vx: 8.8, vy: 0.5, r: 12, life: 85, dmg: 6, ang: 40, bkb: 32, kbg: 42, kind: 'fire', grav: 0.22, bounce: 0.72 });
          SB.audio.play('projectile', 'fire');
        }
      },
    },
  };
  blaze.moves.sspec = {
    frames: 44, special: true, oncePerAir: 'side', trail: 'haA', swing: 8,
    anim: [
      [0, { lean: 0.05, aS: -0.7, aE: 1.3, bS: 0.4, bE: 1.6, by: 10 }],
      [8, { lean: 0.75, aS: 1.57, aE: 0, bS: -0.9, bE: 0.5, ikA: 0, ikB: 0, aH: 0.4, aK: 0.9, bH: -0.9, bK: 1.0, by: 0 }, 'out'],
      [26, {}],
      [36, { lean: 0.1, ikA: 1, ikB: 1, aS: 0.4, aE: 0.8 }],
      [44, idle()],
    ],
    tick: (f, fr) => {
      if (fr < 8) {
        f.vx *= 0.8;
        f.vy *= 0.6;
        f.gmul = 0.2;
      } else if (fr < 26) {
        f.vx = f.facing * 12.5;
        f.vy = 0;
        f.gmul = 0;
        f.fxTrail('fire');
      } else f.vx *= 0.86;
    },
    hit: [hb(8, 26, 'haA', 19, 11, 38, 50, 72, { kind: 'fire' }), hb(8, 26, 'body', 20, 9, 38, 45, 70, { kind: 'fire' })],
  };
  blaze.moves.uspec = {
    frames: 46, special: true, helpless: true, ledgeFrom: 14, trail: 'haA', swing: 5,
    anim: [
      [0, { by: 14, lean: 0.2, aS: 0.2, aE: 2.0, bS: 0.5, bE: 1.8 }],
      [5, { by: -2, lean: -0.05, aS: 3.05, aE: 0.05, bS: 2.2, bE: 0.8, ikA: 0, ikB: 0, aH: 0.3, aK: 0.4, bH: -0.2, bK: 0.9, spin: 0 }, 'out'],
      [25, { spin: PI * 4 }, 'linear'],
      [34, { spin: PI * 4, aS: 2.6 }],
      [46, Object.assign({}, SB.Moves.POSES.helpless, { spin: PI * 4 })],
    ],
    tick: (f, fr) => {
      if (fr === 5) {
        f.leaveGround(-17.5);
        f.vx = f.stickX() * 3.5;
      }
      if (fr >= 5 && fr < 25) {
        f.gmul = 0.35;
        f.vx = SB.approach(f.vx, f.stickX() * 3.8, 0.4);
        f.fxTrail('fire');
      }
    },
    hit: [
      hb(5, 9, 'haA', 18, 5, 80, 0, 0, { kind: 'fire', grp: 0, fkb: 60, drag: true }),
      hb(9, 13, 'haA', 18, 2, 85, 0, 0, { kind: 'fire', grp: 1, fkb: 45, drag: true }),
      hb(13, 17, 'haA', 18, 2, 85, 0, 0, { kind: 'fire', grp: 2, fkb: 45, drag: true }),
      hb(17, 21, 'haA', 18, 2, 85, 0, 0, { kind: 'fire', grp: 3, fkb: 45, drag: true }),
      hb(21, 26, 'haA', 20, 6, 78, 55, 100, { kind: 'fire', grp: 4 }),
    ],
  };
  blaze.moves.dspec = {
    frames: 50, special: true,
    anim: [
      [0, { by: 10, aS: 0.8, aE: 1.9, bS: 0.8, bE: 1.9, lean: 0.25 }],
      [17, { by: 14, lean: 0.35 }],
      [19, { by: -4, aS: 2.5, aE: 0.1, bS: 2.6, bE: 0.1, lean: -0.15, sy: 1.08 }, 'out'],
      [30, {}],
      [50, idle()],
    ],
    tick: (f, fr) => {
      if (!f.grounded && fr < 19) f.vy = Math.min(f.vy, 1.5);
      if (fr < 18 && fr % 2 === 0) f.fxCharge();
    },
    ev: {
      19: (f, m) => {
        const J = f.jointWorld('body');
        m.fx.explosion(J.x, J.y, 70, f.pal.glow);
        m.shake(8);
        SB.audio.play('explosion', 0.8);
      },
    },
    hit: [hb(19, 23, { x: 0, y: -50 }, 64, 15, 50, 50, 92, { kind: 'fire', auto: true, hl: 1.2 })],
  };

  // ================================================================== ARIA
  const aria = {
    id: 'aria',
    name: 'AOI',
    fullName: 'AOI TSUKISHIRO',
    title: 'The Moonlit Blade',
    desc: 'Graceful samurai with a long katana, a crescent sword beam and a deadly counter.',
    prop: { thigh: 24, shin: 25, torso: 29, upperArm: 16, foreArm: 15, headR: 15.5, neck: 5, limb: 8, weapon: 66 },
    w: 36, h: 102,
    stats: {
      weight: 86, walk: 4, run: 8.6, dashInit: 9, air: 5.8, airAccel: 0.55, airFric: 0.05,
      grav: 0.72, fall: 10.5, ffall: 15.5, jump: 16.5, hop: 10.5, djump: 15.5, jumps: 3, traction: 0.75,
      speed: 1.08, power: 0.95, hbs: 1, roll: 8,
    },
    kind: 'slash',
    trailColor: '#bfe9ff',
    palettes: [
      { name: 'Moon', hair: '#243372', main: '#f3f5fb', sub: '#2e3f8f', accent: '#5aa9ff', skin: '#fbe0cc', eye: '#3e6bd8', glow: '#8fd3ff' },
      { name: 'Sakura', hair: '#ff8fb8', main: '#fff3f8', sub: '#b3264f', accent: '#ff5f96', skin: '#fbe0cc', eye: '#d6336c', glow: '#ffb0d0' },
      { name: 'Jade', hair: '#1c1c24', main: '#eaf6f0', sub: '#1b6e57', accent: '#3fd9a5', skin: '#e6b894', eye: '#1b8f6e', glow: '#7dffcf' },
      { name: 'Crimson', hair: '#f0f0f5', main: '#2b2530', sub: '#8f1c24', accent: '#ff4848', skin: '#fde6d6', eye: '#d81f2e', glow: '#ff6a6a' },
    ],
    final: { type: 'blades', name: 'THOUSAND BLADES' },
    base: { wpn: 1.4 },
    moves: {},
  };
  const S = (o) => Object.assign({ kind: 'slash' }, o || {});
  const sw = (f0, f1, r, dmg, ang, bkb, kbg, extra) => [
    hb(f0, f1, 'wtip', r, dmg * 1.1, ang, bkb, kbg, S(extra)),
    hb(f0, f1, 'wmid', r * 0.85, dmg, ang, bkb, kbg, S(extra)),
    hb(f0, f1, 'haA', r * 0.75, dmg * 0.85, ang, bkb, kbg, S(extra)),
  ];
  const SI = { wpn: 1.4 };
  aria.moves.jab1 = {
    frames: 18, trail: 'wtip', swing: 2,
    anim: [[0, { aS: 1.9, aE: 0.6, wpn: 0.3, lean: 0.05 }], [3, { aS: 1.2, aE: 0.1, wpn: -0.2, lean: 0.25, fa: 16 }, 'out'], [8, {}], [18, idle(SI)]],
    hit: sw(3, 5, 12, 3, 65, 14, 25),
    next: { id: 'jab2', from: 3, to: 15, start: 8 },
  };
  aria.moves.jab2 = {
    frames: 20, trail: 'wtip', swing: 2,
    anim: [[0, { aS: 0.8, aE: 0.2, wpn: 0, lean: 0.2, fa: 16 }], [3, { aS: 2.1, aE: 0.2, wpn: 0.3, lean: 0.1 }, 'out'], [8, {}], [20, idle(SI)]],
    hit: sw(3, 5, 12, 3, 70, 14, 25),
    next: { id: 'jab3', from: 3, to: 16, start: 8 },
  };
  aria.moves.jab3 = {
    frames: 30, trail: 'wtip', swing: 4,
    anim: [[0, { aS: 0.8, aE: 1.6, wpn: -1.2, lean: -0.1 }], [5, { aS: 1.57, aE: 0, wpn: 0, lean: 0.38, fa: 24, fb: -20 }, 'out'], [13, {}], [30, idle(SI)]],
    hit: sw(5, 9, 13, 5, 40, 50, 88),
  };
  aria.moves.ftilt = {
    frames: 28, trail: 'wtip', swing: 5,
    anim: [[0, { aS: 2.6, aE: 0.4, wpn: 0.2, lean: -0.1 }], [6, { aS: 0.85, aE: 0.1, wpn: 0, lean: 0.32, fa: 19 }, 'out'], [13, {}], [28, idle(SI)]],
    hit: sw(6, 9, 14, 10, 40, 25, 90),
  };
  aria.moves.utilt = {
    frames: 28, trail: 'wtip', swing: 4,
    anim: [[0, { aS: 1.0, aE: 0.2, wpn: 0.2 }], [5, { aS: 2.2, aE: 0, lean: 0 }, 'linear'], [10, { aS: 3.7, aE: 0, wpn: 0.2, lean: -0.2 }, 'out'], [28, idle(SI)]],
    hit: sw(5, 10, 15, 7, 95, 36, 105),
  };
  aria.moves.dtilt = {
    frames: 22, trail: 'wtip', swing: 4, crouch: true,
    anim: [
      [0, Object.assign({}, SB.Moves.CROUCH, { by: 24, fa: 19, fb: -16, aS: 1.0, aE: 0.8, wpn: -0.3 })],
      [5, { aS: 1.45, aE: 0, wpn: 0.1, lean: 0.5 }, 'out'],
      [10, {}],
      [22, Object.assign({}, SB.Moves.CROUCH, { wpn: 1.4 })],
    ],
    hit: sw(5, 8, 12, 7, 25, 40, 50),
  };
  aria.moves.dash = {
    frames: 34, trail: 'wtip', swing: 5, keepMomentum: true, friction: 0.3,
    anim: [[0, { lean: 0.2, aS: 0.6, aE: 1.4, wpn: -1 }], [6, { aS: 1.57, aE: 0, wpn: 0, lean: 0.55, fa: 26, fb: -24 }, 'out'], [16, {}], [34, idle(SI)]],
    hit: sw(6, 12, 14, 11, 40, 55, 72),
  };
  aria.moves.fsmash = {
    frames: 48, trail: 'wtip', swing: 13, smash: true,
    charge: { f: 10, max: 60, btn: 'attack', dmg: 0.4 },
    anim: [
      [0, { aS: 2.2, aE: 0.6, wpn: 0.5, lean: -0.2, fb: -18 }],
      [10, { aS: 3.3, aE: 0.8, wpn: 0.8, lean: -0.35 }],
      [15, { aS: 0.6, aE: 0.1, wpn: -0.1, lean: 0.55, fa: 28, fb: -22 }, 'out'],
      [26, {}],
      [48, idle(SI)],
    ],
    hit: [hb(15, 18, 'wtip', 18, 18, 36, 34, 100, S()), hb(15, 18, 'wmid', 15, 14, 36, 32, 98, S()), hb(15, 18, 'haA', 12, 12, 40, 30, 90, S())],
  };
  aria.moves.usmash = {
    frames: 46, trail: 'wtip', swing: 10, smash: true,
    charge: { f: 7, max: 60, btn: 'attack', dmg: 0.4 },
    anim: [
      [0, { by: 12, aS: 0.5, aE: 1.2, wpn: 0.4 }],
      [7, { by: 16 }],
      [11, { by: -4, aS: 3.05, aE: 0, wpn: 0.05, lean: -0.05 }, 'out'],
      [20, {}],
      [46, idle(SI)],
    ],
    hit: [hb(11, 18, 'wtip', 17, 16, 90, 35, 100, S()), hb(11, 18, 'wmid', 15, 13, 90, 33, 98, S()), hb(11, 18, 'haA', 13, 12, 88, 30, 95, S())],
  };
  aria.moves.dsmash = {
    frames: 46, trail: 'wtip', swing: 9, smash: true,
    charge: { f: 6, max: 60, btn: 'attack', dmg: 0.4 },
    anim: [
      [0, { by: 18, aS: 0.9, wpn: 0 }],
      [6, { by: 20 }],
      [10, { by: 26, lean: 0.2, aS: 1.5, aE: 0, wpn: 0, fa: 22, fb: -18 }, 'out'],
      [13, {}],
      [17, { aS: -1.45, lean: -0.2 }, 'out'],
      [26, {}],
      [46, idle(SI)],
    ],
    hit: [hb(10, 12, 'wtip', 15, 14, 30, 30, 94, S()), hb(10, 12, 'wmid', 13, 12, 30, 30, 92, S()), hb(16, 18, 'wtip', 15, 13, 30, 30, 94, S({ back: true })), hb(16, 18, 'wmid', 13, 11, 30, 30, 92, S({ back: true }))],
  };
  const AIRS = Object.assign({}, AIR, { wpn: 1.4 });
  aria.moves.nair = {
    frames: 30, air: true, land: 7, ac: [3, 22], trail: 'wtip', swing: 3,
    anim: [[0, { aS: 2.2, aE: 0.3, wpn: 0 }], [4, { aS: 1.4, aE: 0, spin: 0 }], [16, { aS: 1.4, aE: 0, spin: PI * 2 }, 'linear'], [30, AIRS]],
    hit: [hb(4, 16, 'wtip', 15, 8, 361, 25, 85, S({ auto: true })), hb(4, 16, 'wmid', 13, 7, 361, 25, 85, S({ auto: true }))],
  };
  aria.moves.fair = {
    frames: 32, air: true, land: 8, ac: [3, 26], trail: 'wtip', swing: 5,
    anim: [[0, { aS: 3.0, aE: 0.4, wpn: 0.5, lean: -0.1 }], [6, { aS: 0.6, aE: 0, wpn: 0, lean: 0.3 }, 'out'], [12, {}], [32, AIRS]],
    hit: sw(6, 10, 16, 10, 40, 30, 88),
  };
  aria.moves.bair = {
    frames: 32, air: true, land: 10, ac: [3, 25], trail: 'wtip', swing: 6,
    anim: [[0, { aS: 1.4, aE: 0.2, wpn: 0 }], [7, { aS: -1.65, aE: 0, wpn: 0, lean: 0.35, head: -0.3 }, 'out'], [13, {}], [32, AIRS]],
    hit: sw(7, 10, 16, 13, 40, 25, 98, { back: true }),
  };
  aria.moves.uair = {
    frames: 30, air: true, land: 7, ac: [3, 22], trail: 'wtip', swing: 4,
    anim: [[0, { aS: 1.5, aE: 0.1, wpn: 0 }], [5, { aS: 2.3 }, 'linear'], [11, { aS: 4.3, lean: -0.2 }, 'out'], [30, AIRS]],
    hit: sw(5, 11, 15, 9, 88, 38, 92),
  };
  aria.moves.dair = {
    frames: 40, air: true, land: 16, ac: [4, 34], trail: 'wtip', swing: 11,
    anim: [[0, { aS: 2.6, aE: 0.3, wpn: 0, aH: 1.2, aK: 2.0, bH: 1.0, bK: 2.0 }], [12, { aS: 0, aE: 0, wpn: 0, lean: 0, aH: 0.4, aK: 0.6 }, 'out'], [22, {}], [40, AIRS]],
    hit: [hb(12, 18, 'wtip', 15, 14, 275, 25, 80, S({ hl: 1.3 })), hb(12, 18, 'wmid', 13, 11, 60, 25, 70, S())],
  };
  aria.moves.cLauncher = {
    frames: 30, trail: 'wtip', swing: 4, comboMove: true,
    anim: [[0, { by: 14, lean: 0.3, aS: 0.4, aE: 1.0, wpn: -0.6 }], [5, { by: -6, lean: -0.12, aS: 2.95, aE: 0.05, wpn: 0.05, sy: 1.06, fa: 16 }, 'out'], [13, {}], [30, idle(SI)]],
    motion: [[0, 7, 5, null, 'ground']],
    hit: sw(3, 10, 18, 7, 88, 72, 30).concat([hb(3, 8, 'body', 22, 6, 88, 72, 30, S())]),
  };
  aria.moves.cFlurry = {
    frames: 44, trail: 'wtip', comboMove: true,
    anim: [
      [0, { aS: 2.4, aE: 0.3, wpn: 0.2, lean: 0.1 }],
      [4, { aS: 0.7, aE: 0.1, wpn: 0, lean: 0.35, fa: 18 }, 'linear'],
      [8, { aS: 2.4, aE: 0.2, wpn: 0.2 }, 'linear'],
      [12, { aS: 0.7, aE: 0.1, wpn: 0 }, 'linear'],
      [16, { aS: 2.4, aE: 0.2, wpn: 0.2 }, 'linear'],
      [20, { aS: 0.9, aE: 1.6, wpn: -1.2, lean: -0.1 }],
      [25, { aS: 1.57, aE: 0, wpn: 0, lean: 0.55, fa: 28, fb: -22 }, 'out'],
      [33, {}],
      [44, idle(SI)],
    ],
    tick: (f, fr) => {
      if (fr % 4 === 0 && fr < 20) SB.audio.play('swing', 0.4);
    },
    hit: [
      hb(3, 5, 'wtip', 15, 1.6, 80, 0, 0, S({ grp: 0, fkb: 22, drag: true })),
      hb(7, 9, 'wtip', 15, 1.6, 80, 0, 0, S({ grp: 1, fkb: 22, drag: true })),
      hb(11, 13, 'wtip', 15, 1.6, 80, 0, 0, S({ grp: 2, fkb: 22, drag: true })),
      hb(15, 17, 'wtip', 15, 1.6, 80, 0, 0, S({ grp: 3, fkb: 22, drag: true })),
      hb(25, 29, 'wtip', 18, 6, 40, 60, 80, S({ grp: 4 })),
      hb(25, 29, 'wmid', 15, 5, 40, 60, 80, S({ grp: 4 })),
    ],
  };
  aria.moves.cFinisher = {
    frames: 52, trail: 'wtip', comboMove: true,
    anim: [
      [0, { aS: 0.9, aE: 1.6, wpn: -1.2, lean: -0.2, by: 10 }],
      [8, { aS: 1.57, aE: 0, wpn: 0, lean: 0.5, fa: 26, fb: -22, by: 4 }, 'out'],
      [12, { aS: 3.2, aE: 0.3, wpn: 0.4, lean: -0.2 }, 'out'],
      [17, { aS: 0.5, aE: 0.05, wpn: -0.1, lean: 0.6, fa: 30, fb: -24 }, 'out'],
      [30, {}],
      [52, idle(SI)],
    ],
    motion: [[6, 18, 8, null]],
    tick: (f, fr) => {
      if (fr === 8 || fr === 12 || fr === 17) SB.audio.play('swing', 0.9);
    },
    ev: {
      17: (f, m) => {
        const t = f.jointWorld('wtip');
        m.fx.add({ type: 'slash', x: t.x, y: t.y, size: 140, life: 14, color: f.pal.glow, rot: 0.6 * f.facing }, true);
        m.shake(6);
      },
    },
    hit: [
      hb(8, 11, 'wtip', 16, 4, 80, 0, 0, S({ grp: 0, fkb: 40, drag: true })),
      hb(12, 15, 'wtip', 16, 4, 80, 0, 0, S({ grp: 1, fkb: 40, drag: true })),
      hb(17, 21, 'wtip', 22, 13, 40, 85, 92, S({ grp: 2, hl: 1.8, finisher: true })),
      hb(17, 21, 'wmid', 19, 11, 40, 85, 92, S({ grp: 2, finisher: true })),
    ],
  };
  aria.moves.nspec = {
    frames: 42, special: true, trail: 'wtip', swing: 10,
    anim: [[0, { aS: 2.5, aE: 0.5, wpn: 0.4, lean: -0.15 }], [12, { aS: 1.0, aE: 0, wpn: 0, lean: 0.35, fa: 18 }, 'out'], [22, {}], [42, idle(SI)]],
    ev: {
      12: (f) => {
        if (f.projCount('wave') < 1) {
          f.spawnProj('wave', { bone: 'wmid', vx: 11, vy: 0, r: 17, life: 42, dmg: 8, ang: 45, bkb: 30, kbg: 55, kind: 'slash' });
          SB.audio.play('projectile', 'slash');
        }
      },
    },
  };
  aria.moves.sspec = {
    frames: 48, special: true, oncePerAir: 'side', trail: 'wtip',
    anim: [
      [0, { aS: 0.5, aE: 1.5, wpn: -0.5, lean: 0.1 }],
      [6, { aS: 1.95, aE: 0.1, wpn: 0.2, lean: 0.4 }, 'out'],
      [10, { aS: 0.6, aE: 0.3, wpn: -0.2 }, 'out'],
      [14, { aS: 2.2, aE: 0.1, wpn: 0.3 }, 'out'],
      [18, { aS: 1.57, aE: 0, wpn: 0, lean: 0.5, fa: 24, fb: -20 }, 'out'],
      [28, {}],
      [48, idle(SI)],
    ],
    tick: (f, fr) => {
      if (fr === 6 || fr === 10 || fr === 14 || fr === 18) SB.audio.play('swing', 0.6);
      if (fr >= 5 && fr < 22) {
        f.vx = f.facing * 9;
        if (!f.grounded) {
          f.vy = Math.min(f.vy, 0.5);
          f.gmul = 0;
        }
      } else f.vx *= 0.85;
    },
    hit: [
      hb(6, 9, 'wtip', 16, 4, 80, 0, 0, S({ grp: 0, fkb: 40, drag: true })),
      hb(10, 13, 'wtip', 16, 4, 80, 0, 0, S({ grp: 1, fkb: 40, drag: true })),
      hb(14, 17, 'wtip', 16, 4, 80, 0, 0, S({ grp: 2, fkb: 40, drag: true })),
      hb(18, 22, 'wtip', 18, 7, 40, 60, 78, S({ grp: 3 })),
      hb(18, 22, 'wmid', 15, 6, 40, 60, 78, S({ grp: 3 })),
    ],
  };
  aria.moves.uspec = {
    frames: 50, special: true, helpless: true, ledgeFrom: 14, trail: 'wtip',
    anim: [
      [0, { by: 12, aS: 1.57, aE: 0, wpn: 0, lean: 0.1 }],
      [6, { by: 0, aS: 1.57, aE: 0, wpn: 0, lean: 0, ikA: 0, ikB: 0, aH: 0.2, aK: 0.3, bH: -0.1, bK: 0.6, spin: 0 }],
      [26, { spin: PI * 6 }, 'linear'],
      [34, { spin: PI * 6, aS: 2.8 }],
      [50, Object.assign({}, SB.Moves.POSES.helpless, { spin: PI * 6, wpn: 1.4 })],
    ],
    tick: (f, fr) => {
      if (fr === 6) {
        f.leaveGround(-15.5);
        f.vx = f.stickX() * 3.2;
      }
      if (fr >= 6 && fr < 26) {
        f.gmul = 0.4;
        f.vx = SB.approach(f.vx, f.stickX() * 3.4, 0.35);
        if (fr % 4 === 0) SB.audio.play('swing', 0.5);
      }
    },
    hit: [
      hb(6, 11, 'wtip', 16, 3, 90, 0, 0, S({ grp: 0, fkb: 55, drag: true })),
      hb(11, 16, 'wtip', 16, 3, 90, 0, 0, S({ grp: 1, fkb: 50, drag: true })),
      hb(16, 21, 'wtip', 16, 3, 90, 0, 0, S({ grp: 2, fkb: 50, drag: true })),
      hb(21, 26, 'wtip', 16, 3, 90, 0, 0, S({ grp: 3, fkb: 50, drag: true })),
      hb(26, 30, 'wtip', 19, 6, 80, 60, 96, S({ grp: 4 })),
      hb(26, 30, 'body', 22, 5, 80, 60, 96, S({ grp: 4 })),
    ],
  };
  aria.moves.dspec = {
    frames: 48, special: true, counter: [5, 28],
    anim: [[0, { aS: 0.9, aE: 1.1, wpn: 0.9, lean: -0.05, by: 6 }], [5, { aS: 0.95, aE: 1.15, wpn: 0.95, by: 8 }], [28, {}], [48, idle(SI)]],
    tick: (f) => {
      if (!f.grounded) f.gmul = 0.4;
    },
  };
  aria.moves.counterHit = {
    frames: 40, special: true, inv: [0, 26], trail: 'wtip', swing: 6,
    anim: [[0, { aS: 2.6, aE: 0.4, wpn: 0.4, lean: -0.2 }], [7, { aS: 0.7, aE: 0, wpn: 0, lean: 0.5, fa: 26, fb: -20 }, 'out'], [16, {}], [40, idle(SI)]],
    hit: [hb(7, 11, 'wtip', 24, 'counter', 40, 60, 88, S({ hl: 1.5 })), hb(7, 11, 'wmid', 22, 'counter', 40, 60, 88, S({ hl: 1.5 }))],
  };

  // ================================================================= TITAN
  const titan = {
    id: 'titan',
    name: 'GORO',
    fullName: 'GORO THE IRON ONI',
    title: 'The Iron Oni',
    desc: 'Towering oni in iron gauntlets. Super-armoured charges and earth-shaking power.',
    prop: { thigh: 29, shin: 28, torso: 44, upperArm: 25, foreArm: 24, headR: 18, neck: 4, limb: 16, weapon: 0 },
    w: 60, h: 136,
    stats: {
      weight: 135, walk: 3, run: 6.8, dashInit: 7.2, air: 4.5, airAccel: 0.35, airFric: 0.04,
      grav: 0.85, fall: 12.5, ffall: 18, jump: 16.5, hop: 11, djump: 14.5, jumps: 3, traction: 0.85,
      speed: 0.84, power: 1.3, hbs: 1.3, roll: 6.5,
    },
    kind: 'punch',
    trailColor: '#e8d9b8',
    palettes: [
      { name: 'Oni', skin: '#cf5a45', hair: '#f2efe6', main: '#2a2a36', sub: '#e0a93a', accent: '#8a8f99', eye: '#ffe14a', glow: '#ff8a3d' },
      { name: 'Frost', skin: '#4a74c2', hair: '#101018', main: '#3a2a1e', sub: '#e0e0e0', accent: '#6f757f', eye: '#7ff4ff', glow: '#7fd4ff' },
      { name: 'Jade', skin: '#4a8f5c', hair: '#f2d64a', main: '#2a2230', sub: '#c93a2a', accent: '#8a8f99', eye: '#ff4a4a', glow: '#b6ff5a' },
      { name: 'Ronin', skin: '#c68a5e', hair: '#1b1b1f', main: '#3b2f4f', sub: '#d9b44a', accent: '#5d626b', eye: '#ffcc33', glow: '#ffd27a' },
    ],
    final: { type: 'quake', name: 'TECTONIC RAGE' },
    base: { lean: 0.14, fa: 14, fb: -14 },
    moves: {},
  };
  titan.moves.nspec = {
    frames: 52, special: true, trail: 'haA', swing: 16,
    charge: { f: 12, max: 90, btn: 'special', dmg: 1.5 },
    anim: [
      [0, { lean: -0.1, aS: -0.4, aE: 1.4, bS: 0.8, bE: 1.6 }],
      [12, { lean: -0.35, aS: -1.3, aE: 1.6, bS: 1.2, bE: 1.2, by: 10, fb: -20, fa: 16 }],
      [17, { lean: 0.6, aS: 1.6, aE: 0, bS: -0.8, bE: 0.5, by: 4, fa: 36, fb: -24 }, 'out'],
      [30, {}],
      [52, idle({ lean: 0.14, fa: 14, fb: -14 })],
    ],
    motion: [[15, 19, 6, null, 'ground']],
    hit: [hb(17, 21, 'haA', 22, 12, 40, 40, 95, { hl: 1.3 }), hb(17, 21, 'elA', 17, 10, 40, 40, 95)],
  };
  titan.moves.sspec = {
    frames: 54, special: true, oncePerAir: 'side', armor: [6, 32, 16],
    anim: [
      [0, { lean: -0.1, by: 8, aS: -0.6, bS: -0.6 }],
      [8, { lean: 0.6, by: 6, aS: 0.9, aE: 1.9, bS: 0.8, bE: 1.9, head: 0.2, fa: 24, fb: -22 }, 'out'],
      [32, {}],
      [54, idle({ lean: 0.14, fa: 14, fb: -14 })],
    ],
    tick: (f, fr) => {
      if (fr >= 8 && fr < 32) {
        f.vx = f.facing * 9.5;
        if (!f.grounded) {
          f.vy = Math.min(f.vy, 1);
          f.gmul = 0.1;
        }
        if (f.grounded && fr % 3 === 0) f.fxDust();
      } else if (fr >= 32) f.vx *= 0.85;
    },
    hit: [hb(8, 32, 'sh', 28, 12, 40, 60, 80), hb(8, 32, 'head', 22, 12, 40, 60, 80)],
  };
  titan.moves.uspec = {
    frames: 56, special: true, helpless: true, ledgeFrom: 16, trail: 'haA', swing: 9,
    anim: [
      [0, { by: 22, lean: 0.35, aS: -0.4, bS: -0.5 }],
      [9, { by: -4, lean: -0.05, aS: 3.0, aE: 0.1, bS: 2.8, bE: 0.2, ikA: 0, ikB: 0, aH: 0.2, aK: 0.4, bH: -0.2, bK: 0.9 }, 'out'],
      [28, {}],
      [56, SB.Moves.POSES.helpless],
    ],
    tick: (f, fr) => {
      if (fr === 9) {
        f.leaveGround(-19);
        f.vx = f.stickX() * 2.8;
      }
      if (fr >= 9 && fr < 28) f.vx = SB.approach(f.vx, f.stickX() * 3, 0.3);
    },
    hit: [hb(9, 20, 'haA', 22, 11, 85, 50, 85), hb(9, 20, 'head', 22, 9, 85, 50, 85)],
  };
  titan.moves.dspec = {
    frames: 56, special: true,
    anim: [
      [0, { by: 4, ikA: 0, aH: 1.8, aK: 1.6, lean: -0.15, aS: 2.2, bS: 2.0 }],
      [18, { ikA: 1, by: 24, lean: 0.35, aS: 0.6, bS: 0.5, fa: 24 }, 'in'],
      [40, {}],
      [56, idle({ lean: 0.14, fa: 14, fb: -14 })],
    ],
    ev: {
      18: (f, m) => f.quakeShock(m),
    },
    hit: [hb(18, 21, { x: 0, y: -10 }, 48, 10, 80, 60, 60, { auto: true })],
  };
  titan.moves.dspecAir = {
    frames: 70, special: true, landInto: 'dspecLand', helpless: true,
    anim: [
      [0, { aH: 1.6, aK: 2.4, bH: 1.5, bK: 2.4, lean: 0.4, aS: 2.6, bS: 2.5 }],
      [10, { aH: 0.05, aK: 0.05, bH: -0.05, bK: 0.1, lean: 0, aS: 2.9, bS: 2.8, aE: 0.2, bE: 0.2 }, 'out'],
      [70, {}],
    ],
    tick: (f, fr) => {
      f.gmul = 0;
      if (fr < 10) f.vy = Math.min(f.vy * 0.8, 0), (f.vx *= 0.85);
      else f.vy = 19;
    },
    hit: [hb(10, 70, 'ftA', 20, 12, 275, 30, 80, { hl: 1.3 })],
  };
  titan.moves.dspecLand = {
    frames: 36, special: true,
    anim: [[0, { by: 26, lean: 0.35, fa: 22, fb: -22, aS: 1.2, bS: 1.1 }], [20, {}], [36, idle({ lean: 0.14, fa: 14, fb: -14 })]],
    ev: { 0: (f, m) => f.quakeShock(m) },
    hit: [hb(0, 4, { x: 0, y: -10 }, 52, 11, 70, 60, 70, { auto: true })],
  };

  // ================================================================== VOLT
  const volt = {
    id: 'volt',
    name: 'HAYATE',
    fullName: 'HAYATE',
    title: 'The Thunder Shinobi',
    desc: 'Lightning-fast ninja. Shurikens, teleports and thunder called from the sky.',
    prop: { thigh: 22, shin: 23, torso: 28, upperArm: 15, foreArm: 15, headR: 14.5, neck: 5, limb: 7.5, weapon: 0 },
    w: 34, h: 96,
    stats: {
      weight: 80, walk: 4.6, run: 9.8, dashInit: 10, air: 6, airAccel: 0.62, airFric: 0.06,
      grav: 0.8, fall: 12, ffall: 18.5, jump: 17, hop: 11, djump: 14.5, jumps: 3, traction: 0.8,
      speed: 1.2, power: 0.82, hbs: 0.92, roll: 9,
    },
    kind: 'elec',
    trailColor: '#fff27a',
    palettes: [
      { name: 'Thunder', hair: '#ffd53d', main: '#262a4f', sub: '#171a33', accent: '#e8352c', skin: '#f5d6bd', eye: '#3fd0ff', glow: '#ffe45c' },
      { name: 'Ghost', hair: '#f0f0f5', main: '#e8ebf5', sub: '#8a91ad', accent: '#5b6cff', skin: '#f5d6bd', eye: '#8b5bff', glow: '#b8a8ff' },
      { name: 'Viper', hair: '#2c2c2c', main: '#1e3d2f', sub: '#0f1f17', accent: '#9dff3d', skin: '#e3b48f', eye: '#9dff3d', glow: '#d4ff8a' },
      { name: 'Ember', hair: '#ff7a1a', main: '#3a1414', sub: '#1f0a0a', accent: '#ffd21f', skin: '#c68642', eye: '#ffb03a', glow: '#ffd29c' },
    ],
    final: { type: 'storm', name: 'STORM SURGE' },
    base: { lean: 0.2, by: 5, fa: 12, fb: -12 },
    moves: {},
  };
  const elec = (m) => Object.assign({}, m, { hit: m.hit.map((h) => Object.assign({}, h, { kind: 'elec' })) });
  volt.moves.fsmash = elec(D.fsmash);
  volt.moves.usmash = elec(D.usmash);
  volt.moves.dsmash = elec(D.dsmash);
  volt.moves.nair = Object.assign({}, D.nair, {
    hit: [
      hb(4, 8, 'ftA', 13, 3, 80, 0, 0, { kind: 'elec', fkb: 30, drag: true, grp: 0 }),
      hb(9, 13, 'ftA', 13, 3, 80, 0, 0, { kind: 'elec', fkb: 30, drag: true, grp: 1 }),
      hb(14, 20, 'ftA', 14, 5, 361, 30, 95, { kind: 'elec', grp: 2, auto: true }),
    ],
  });
  volt.moves.nspec = {
    frames: 28, special: true,
    anim: [[0, { aS: 2.4, aE: 1.2, lean: -0.1 }], [8, { aS: 1.35, aE: 0, lean: 0.3 }, 'out'], [16, {}], [28, idle({ lean: 0.2, by: 5, fa: 12, fb: -12 })]],
    ev: {
      8: (f) => {
        if (f.projCount('shuriken') < 3) {
          f.spawnProj('shuriken', { bone: 'haA', vx: 14, vy: f.grounded ? 0 : 3, r: 10, life: 55, dmg: 4, ang: 50, bkb: 22, kbg: 30, kind: 'elec' });
          SB.audio.play('projectile', 'elec');
        }
      },
    },
  };
  volt.moves.sspec = {
    frames: 36, special: true, oncePerAir: 'side', inv: [7, 14],
    anim: [
      [0, { by: 14, lean: 0.5, aS: -0.8, aE: 1.0 }],
      [8, { by: 10, lean: 0.8, aS: 1.4, aE: 0, bS: -1.2, fa: 30, fb: -30 }, 'out'],
      [18, {}],
      [36, idle({ lean: 0.2, by: 5, fa: 12, fb: -12 })],
    ],
    tick: (f, fr, m) => {
      if (fr === 8) f.flashStart = { x: f.x, y: f.y };
      if (fr >= 8 && fr < 13) {
        f.vx = f.facing * 36;
        f.vy = 0;
        f.gmul = 0;
        f.invisible = true;
        f.fxTrail('elec');
      } else if (fr === 13) {
        f.vx = f.facing * 3;
        if (f.flashStart) {
          m.spawnProjectile(f, 'dashline', {
            x: (f.flashStart.x + f.x) / 2, y: f.y - f.def.h * 0.5,
            w: Math.abs(f.x - f.flashStart.x) + 30, h: f.def.h * 0.8,
            life: 5, dmg: 9, ang: 45, bkb: 55, kbg: 62, kind: 'elec', color: f.pal.glow,
          });
          SB.audio.play('hit', 0.4, 'elec');
        }
      } else if (fr > 13) f.vx *= 0.8;
      if (!f.grounded && fr < 18) f.gmul = 0;
    },
  };
  volt.moves.uspec = {
    frames: 44, special: true, helpless: true, inv: [10, 24], ledgeFrom: 20,
    anim: [
      [0, { by: 10, lean: 0.3, aS: 1.2, aE: 1.8, bS: 1.1, bE: 1.9 }],
      [12, { ikA: 0, ikB: 0, aH: 1.3, aK: 2.2, bH: 1.2, bK: 2.2, by: 10 }],
      [21, { aS: 2.6, aE: 0.1, bS: -2.2, bE: 0.2, aH: 0.3, aK: 0.4, bH: -0.4, bK: 0.6, by: 0, lean: 0 }, 'out'],
      [44, SB.Moves.POSES.helpless],
    ],
    tick: (f, fr) => {
      if (fr < 12) {
        f.gmul = 0;
        f.vx *= 0.8;
        f.vy *= 0.6;
        if (fr % 3 === 0) f.fxCharge();
      } else if (fr === 12) {
        let sx = f.stickX();
        let sy = f.stickY();
        if (Math.hypot(sx, sy) < 0.3) (sx = 0), (sy = -1);
        const l = Math.hypot(sx, sy);
        f.warpDir = { x: sx / l, y: sy / l };
        if (f.warpDir.x) f.facing = SB.sign(f.warpDir.x);
        SB.audio.play('hit', 0.3, 'elec');
      }
      if (fr >= 12 && fr < 21) {
        f.gmul = 0;
        if (f.warpDir.y < 0) f.leaveGround(f.warpDir.y * 27);
        f.vx = f.warpDir.x * 27;
        f.vy = f.warpDir.y * 27;
        f.invisible = true;
        f.fxTrail('elec');
      } else if (fr === 21) {
        f.vx *= 0.15;
        f.vy = Math.min(f.vy * 0.1, 0);
      }
    },
    hit: [hb(21, 25, 'body', 32, 8, 80, 60, 82, { kind: 'elec', auto: true })],
  };
  volt.moves.dspec = {
    frames: 46, special: true,
    anim: [
      [0, { aS: 1.0, aE: 1.8, lean: 0.05 }],
      [12, { aS: 3.1, aE: 0.05, bS: -0.8, lean: -0.1, head: -0.3 }, 'out'],
      [30, {}],
      [46, idle({ lean: 0.2, by: 5, fa: 12, fb: -12 })],
    ],
    tick: (f, fr) => {
      if (!f.grounded) f.gmul = 0.5;
      if (fr < 13 && fr % 2 === 0) f.fxCharge();
    },
    ev: {
      14: (f, m) => {
        const x = f.x + f.facing * 150;
        const gy = m.stage.groundBelow(x, f.y - 200);
        m.spawnProjectile(f, 'bolt', {
          x, y: gy, top: m.stage.blast.top, w: 48, life: 18, dmg: 13, ang: 80, bkb: 45, kbg: 88, kind: 'elec', color: f.pal.glow,
        });
        m.shake(5);
        SB.audio.play('hit', 1, 'elec');
      },
    },
  };

  // ---------------------------------------------------- QWER combos
  // Q = light attack, W = heavy (smash), E = special. A move that lands can
  // be cancelled into the next button; these exact strings are named combos.
  const combos = (a, b, c) => ({
    QQW: { id: 'cLauncher', name: a },
    QWE: { id: 'cFinisher', name: b },
    QQQQ: { id: 'cFlurry', name: c },
  });
  blaze.combos = combos('RISING FLAME', 'INFERNO KNUCKLE', 'FLAME FLURRY');
  aria.combos = combos('SKY CUTTER', 'AZURE TEMPEST', 'BLADE STORM');
  titan.combos = combos('BOULDER UPPER', 'AVALANCHE', 'ROCK BARRAGE');
  volt.combos = combos('STATIC LIFT', 'THUNDER RUSH', 'SPARK FLURRY');

  const withKind = (m, kind, extra) => Object.assign({}, m, extra || {}, { hit: m.hit.map((h) => Object.assign({}, h, { kind })) });
  blaze.moves.cLauncher = withKind(D.cLauncher, 'fire');
  blaze.moves.cFlurry = withKind(D.cFlurry, 'fire');
  blaze.moves.cFinisher = withKind(D.cFinisher, 'fire', {
    tick: (f, fr) => {
      if (fr < 8 && fr % 2 === 0) f.fxCharge();
      if (fr >= 6 && fr < 16) f.fxTrail('fire');
    },
    ev: {
      10: (f, m) => {
        const h = f.jointWorld('haA');
        m.fx.explosion(h.x + f.facing * 20, h.y, 80, '#ff6b1a');
        m.shake(10);
        SB.audio.play('explosion', 1);
      },
    },
  });
  volt.moves.cLauncher = withKind(D.cLauncher, 'elec');
  volt.moves.cFlurry = withKind(D.cFlurry, 'elec');
  volt.moves.cFinisher = withKind(D.cFinisher, 'elec', {
    inv: [4, 9],
    tick: (f, fr, m) => {
      if (fr < 4 && fr % 2 === 0) f.fxCharge();
      if (fr === 4) {
        // Blink right next to the nearest opponent in front.
        let best = null;
        for (const o of m.fighters) {
          if (o === f || !o.isAlive()) continue;
          const d = (o.x - f.x) * f.facing;
          if (d > -20 && d < 320 && Math.abs(o.y - f.y) < 160 && (!best || d < (best.x - f.x) * f.facing)) best = o;
        }
        f.blinkTo = best ? best.x - f.facing * (f.w / 2 + best.w / 2 + 6) : f.x + f.facing * 90;
      }
      if (fr >= 4 && fr < 8) {
        f.vx = (f.blinkTo - f.x) / Math.max(1, 8 - fr);
        f.invisible = true;
        f.fxTrail('elec');
      } else if (fr === 8) f.vx = f.facing * 2;
    },
    motion: null,
    ev: {
      10: (f, m) => {
        const h = f.jointWorld('haA');
        m.spawnProjectile(f, 'bolt', { x: h.x + f.facing * 20, y: m.stage.groundBelow(h.x, f.y - 20), top: m.stage.blast.top, w: 40, life: 12, dmg: 6, ang: 80, bkb: 50, kbg: 60, kind: 'elec', color: f.pal.glow });
        m.shake(8);
        SB.audio.play('hit', 1, 'elec');
      },
    },
  });
  titan.moves.cFlurry = D.cFlurry;
  titan.moves.cFinisher = Object.assign({}, D.cFinisher, {
    // Overhead double-fist slam that sends a shockwave both ways.
    anim: [
      [0, { lean: -0.35, aS: 2.9, aE: 0.5, bS: 2.8, bE: 0.5, by: 6 }],
      [9, { lean: -0.45, aS: 3.3, bS: 3.2, by: 8 }],
      [12, { lean: 0.75, aS: 1.2, aE: 0, bS: 1.1, bE: 0.1, by: 22, fa: 30, fb: -24 }, 'out'],
      [30, {}],
      [50, IDLE],
    ],
    motion: [[6, 12, 7, null]],
    ev: {
      12: (f, m) => {
        f.quakeShock(m);
      },
    },
    hit: [hb(12, 17, 'haA', 28, 16, 70, 85, 88, { hl: 1.9, finisher: true }), hb(12, 17, 'elA', 22, 13, 70, 85, 88, { finisher: true })],
  });

  const ROSTER = [blaze, aria, titan, volt];

  // Final preparation: fill in default moves and compile animations.
  for (const c of ROSTER) {
    const all = Object.assign({}, D, c.moves);
    c.moveset = {};
    for (const id in all) {
      const m = Object.assign({ id }, all[id]);
      if (!m.hit) m.hit = [];
      // Characters' "kind" colours unarmed hits (fire punches, electric kicks...)
      m.hit = m.hit.map((h) => Object.assign({ kind: c.kind === 'slash' ? 'punch' : c.kind }, h));
      const base = m.air ? Object.assign({}, c.base, AIR) : c.base;
      m.compiled = SB.Skel.compile(m.anim, c.prop, base);
      c.moveset[id] = m;
    }
    c.poses = {};
    for (const k in SB.Moves.POSES) {
      c.poses[k] = SB.Skel.resolve(Object.assign({}, SB.Skel.NEUTRAL, c.base, SB.Moves.POSES[k]), c.prop);
    }
  }

  SB.ROSTER = ROSTER;
  SB.charById = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
})();
