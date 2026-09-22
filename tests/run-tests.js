// Automated checks: loads the game in headless Chromium, drives every menu,
// then simulates many full CPU-vs-CPU matches on every stage with every
// character, asserting no errors, no NaNs, KOs happen and matches finish.
//
// Usage: node tests/run-tests.js [--shots]   (needs the `playwright` package)
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

const SHOTS = process.argv.includes('--shots');
const shotDir = path.join(__dirname, 'screenshots');

(async () => {
  const { chromium } = loadPlaywright();
  const opts = { args: ['--autoplay-policy=no-user-gesture-required'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) {
    // Use the preinstalled browser when available.
  }
  const browser = await chromium.launch(opts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(600);
  if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(shotDir, name + '.png') });

  let failures = 0;
  const check = (cond, msg) => {
    if (!cond) {
      failures++;
      console.log('  FAIL: ' + msg);
    }
  };

  // ------------------------------------------------------------ menus
  console.log('Menus');
  await shot('01-title');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await shot('02-main-menu');
  let name = await page.evaluate(() => SB.app.screen.constructor.name);
  check(name === 'MainMenu', 'Enter on title should open the main menu (got ' + name + ')');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await shot('03-char-select');
  name = await page.evaluate(() => SB.app.screen.constructor.name);
  check(name === 'CharSelect', 'VERSUS should open character select (got ' + name + ')');
  // Navigate to CONTINUE with the mouse
  await page.evaluate(() => SB.app.screen.next());
  await page.waitForTimeout(300);
  await shot('04-stage-select');
  name = await page.evaluate(() => SB.app.screen.constructor.name);
  check(name === 'StageSelect', 'Continue should open stage select (got ' + name + ')');
  await page.evaluate(() => SB.app.screen.start());
  await page.waitForTimeout(3500);
  await shot('05-game-start');
  name = await page.evaluate(() => SB.app.screen.constructor.name);
  check(name === 'GameScreen', 'FIGHT should start a match (got ' + name + ')');
  // Play as P1 for a bit with the keyboard.
  const keys = ['ArrowRight', 'KeyQ', 'ArrowUp', 'KeyE', 'ArrowLeft', 'Space', 'KeyR', 'KeyW', 'ShiftLeft', 'ArrowDown'];
  for (let i = 0; i < 60; i++) {
    const k = keys[i % keys.length];
    await page.keyboard.down(k);
    await page.waitForTimeout(40);
    await page.keyboard.up(k);
  }
  await shot('06-game-play');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const paused = await page.evaluate(() => SB.app.screen.paused);
  check(paused === true, 'Escape should pause');
  await shot('07-paused');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  // Other screens render without errors
  for (const s of ['ControlsScreen', 'SettingsScreen', 'MainMenu', 'TitleScreen']) {
    await page.evaluate((s) => SB.app.go(new SB.Screens[s]()), s);
    await page.waitForTimeout(250);
    await shot('08-' + s);
  }
  await page.evaluate(() => SB.app.go(new SB.Screens.CharSelect(true)));
  await page.waitForTimeout(250);
  await shot('09-training-select');

  // ------------------------------------------------------- simulations
  console.log('Simulations');
  const result = await page.evaluate(() => {
    const out = [];
    const chars = SB.ROSTER.map((c) => c.id);
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    let game = 0;
    for (const st of SB.STAGES) {
      for (let rot = 0; rot < chars.length; rot++) {
        const players = [0, 1, 2, 3].map((i) => ({ slot: i, char: chars[(i + rot) % 4], palette: 0, type: 'cpu', level: [9, 7, 5, 3][i] }));
        const cfg = { players, stage: st.id, mode: 'stock', stocks: 2, time: 3, items: true };
        const m = new SB.Match(cfg);
        let bad = null;
        let frames = 0;
        const statesSeen = new Set();
        const movesSeen = new Set();
        try {
          while (m.phase !== 'done' && frames < 60 * 60 * 6) {
            m.step();
            frames++;
            for (const f of m.fighters) {
              statesSeen.add(f.state);
              if (f.move) movesSeen.add(f.move.id);
              if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.damage) || !Number.isFinite(f.vx) || !Number.isFinite(f.vy)) {
                bad = 'NaN in fighter ' + f.def.id + ' state ' + f.state;
              }
            }
            if (!Number.isFinite(m.cam.x) || !Number.isFinite(m.cam.zoom)) bad = 'NaN camera';
            if (bad) break;
            if (frames % 97 === 0) SB.GameRenderer.render(ctx, m);
          }
        } catch (e) {
          bad = 'exception: ' + e.message + ' ' + e.stack;
        }
        const kos = m.fighters.reduce((a, f) => a + f.stats.kos + f.stats.sds, 0);
        out.push({
          game: game++, stage: st.id, chars: players.map((p) => p.char).join(','), frames, phase: m.phase, bad, kos,
          winner: m.winner ? m.winner.def.id : null, states: [...statesSeen].sort().join(' '), moves: movesSeen.size,
          finals: 0,
        });
      }
    }
    return out;
  });
  let totalFrames = 0;
  const allStates = new Set();
  for (const r of result) {
    totalFrames += r.frames;
    r.states.split(' ').forEach((s) => allStates.add(s));
    console.log(`  ${r.stage.padEnd(8)} ${r.chars.padEnd(24)} ${String(r.frames).padStart(6)}f  ${r.phase.padEnd(6)} KOs:${r.kos}  moves:${r.moves} winner:${r.winner}${r.bad ? '  BAD: ' + r.bad : ''}`);
    check(!r.bad, 'simulation error: ' + r.bad);
    check(r.phase === 'done', `match ${r.game} on ${r.stage} did not finish (${r.frames} frames)`);
    check(r.kos >= 6, `match ${r.game} expected at least 6 KOs (got ${r.kos})`);
  }
  console.log('  states seen: ' + [...allStates].sort().join(', '));
  console.log('  simulated ' + totalFrames + ' frames (' + (totalFrames / 3600).toFixed(1) + ' minutes of gameplay)');

  // -------------------------------------------- targeted mechanic tests
  console.log('Mechanics');
  const mech = await page.evaluate(() => {
    const res = {};
    const mk = (a, b, extra) =>
      new SB.Match(Object.assign({ players: [{ slot: 0, char: a, palette: 0, type: 'cpu', level: 0 }, { slot: 1, char: b, palette: 0, type: 'cpu', level: 0 }], stage: 'space', mode: 'stock', stocks: 3, items: false }, extra || {}));
    const run = (m, n, fn) => {
      for (let i = 0; i < n; i++) {
        if (fn) fn(i);
        m.step();
      }
    };
    // Every move of every character runs to completion from the ground and air.
    res.moves = [];
    for (const c of SB.ROSTER) {
      for (const id of Object.keys(c.moveset)) {
        if (['pummel', 'fthrow', 'bthrow', 'uthrow', 'dthrow', 'counterHit', 'dspecLand'].includes(id)) continue;
        const m = mk(c.id, 'titan');
        m.phase = 'play';
        const f = m.fighters[0];
        const ok = f.startMove(id);
        let frames = 0;
        let err = null;
        try {
          while ((f.state === 'move') && frames < 400) {
            m.step();
            frames++;
          }
        } catch (e) {
          err = e.message;
        }
        res.moves.push({ c: c.id, id, ok, frames, err, finite: Number.isFinite(f.x + f.y) });
      }
    }
    // Knockback scaling: a fully charged fsmash at 120% should KO from centre stage.
    const kbTest = (char, pct) => {
      const m = mk('blaze', char);
      m.phase = 'play';
      const [a, b] = m.fighters;
      a.x = -40;
      b.x = 20;
      a.facing = 1;
      b.damage = pct;
      a.startMove('fsmash');
      a.charge = 60;
      a.chargeDone = true;
      let n = 0;
      while (b.state !== 'dead' && n < 400) {
        m.step();
        n++;
      }
      return b.state === 'dead' || b.stats.falls > 0;
    };
    res.koAt130 = kbTest('blaze', 130);
    res.koAt20 = kbTest('blaze', 20);
    // Shield blocks damage
    {
      const m = mk('blaze', 'aria');
      m.phase = 'play';
      const [a, b] = m.fighters;
      a.x = -30;
      b.x = 25;
      b.state = 'shield';
      b.ctl.feed(Object.assign(SB.input.blankState(), { shield: true }));
      b.ai = null;
      b.ctl.source = 'cpu';
      a.startMove('ftilt');
      let dmg0 = b.damage;
      run(m, 12, () => {
        b.ctl.virtual = Object.assign(SB.input.blankState(), { shield: true });
      });
      res.shieldBlocks = b.damage === dmg0 && b.shieldHP < 50;
    }
    // Grab and throw
    {
      const m = mk('titan', 'volt');
      m.phase = 'play';
      const [a, b] = m.fighters;
      a.x = -30;
      b.x = 20;
      a.facing = 1;
      a.startMove('grab');
      run(m, 10);
      res.grabbed = b.state === 'grabbed' && a.state === 'grabhold';
      a.ai = null;
      a.ctl.source = 'cpu';
      run(m, 60, () => {
        a.ctl.virtual = Object.assign(SB.input.blankState(), { x: 1 });
      });
      res.thrown = b.damage > 0 && b.state !== 'grabbed';
    }
    // Ledge grab & recovery via up special
    res.ledge = {};
    for (const c of SB.ROSTER) {
      const m = mk(c.id, 'titan');
      m.phase = 'play';
      const f = m.fighters[0];
      f.ai = new SB.AI(f, m, 9);
      f.x = -700;
      f.y = 150;
      f.grounded = false;
      f.ground = null;
      f.state = 'air';
      f.vy = 2;
      m.fighters[1].x = 300;
      let grabbed = false;
      let survived = false;
      for (let i = 0; i < 600; i++) {
        m.step();
        if (f.state === 'ledge') grabbed = true;
        if (f.grounded && Math.abs(f.x) < 460) {
          survived = true;
          break;
        }
        if (f.state === 'dead') break;
      }
      res.ledge[c.id] = { grabbed, survived };
    }
    // Final smash of each character hits an opponent
    res.finals = {};
    for (const c of SB.ROSTER) {
      const m = mk(c.id, 'blaze');
      m.phase = 'play';
      const [a, b] = m.fighters;
      a.x = -100;
      b.x = 100;
      a.facing = 1;
      a.finalReady = true;
      a.startFinal();
      run(m, 220);
      res.finals[c.id] = b.damage > 10 || b.stats.falls > 0;
    }
    // Keyboard-style (digital) input mapping produces the intended moves.
    res.inputs = {};
    const B = SB.input.blankState;
    const seq = (name, frames, expect) => {
      const m = mk('blaze', 'titan');
      m.phase = 'play';
      const f = m.fighters[0];
      f.ai = null;
      m.fighters[1].x = 400;
      f.ctl.digital = true;
      let got = null;
      for (let i = 0; i < 40; i++) {
        f.ctl.virtual = Object.assign(B(), frames[i] || {});
        m.step();
        if (!got && f.state === 'move') got = f.move.id;
        if (!got && ['shield', 'roll', 'spotdodge', 'airdodge'].includes(f.state)) got = f.state;
      }
      res.inputs[name] = got === expect ? true : got;
    };
    const hold = (o, n, extra) => Array.from({ length: n }, (_, i) => Object.assign({}, o, i === n - 1 ? extra : {}));
    seq('jab', [{ attack: true }], 'jab1');
    seq('ftilt (Right+Q)', [{ x: 1 }, { x: 1, attack: true }], 'ftilt');
    seq('dash attack', hold({ x: 1 }, 20, { attack: true }), 'dash');
    seq('utilt (Up+Q)', [{ y: -1 }, { y: -1, attack: true }], 'utilt');
    seq('dtilt', hold({ y: 1 }, 4, { attack: true }), 'dtilt');
    seq('fsmash (Right+W)', [{ x: 1, smash: true }], 'fsmash');
    seq('usmash (Up+W)', [{ y: -1 }, { y: -1, smash: true }], 'usmash');
    seq('dsmash (Down+W)', [{ y: 1, smash: true }], 'dsmash');
    seq('nspec', [{ special: true }], 'nspec');
    seq('sspec', [{ x: 1, special: true }], 'sspec');
    seq('uspec', [{ y: -1, special: true }], 'uspec');
    seq('dspec', [{ y: 1, special: true }], 'dspec');
    seq('grab', [{ grab: true }], 'grab');
    seq('shield', hold({ shield: true }, 10), 'shield');
    seq('nair', [{ jump: true }, { jump: true }, {}, {}, {}, {}, {}, {}, { attack: true }], 'nair');
    seq('fair', [{ jump: true }, { jump: true }, {}, {}, {}, {}, {}, { x: 1 }, { x: 1, attack: true }], 'fair');
    seq('bair', [{ jump: true }, { jump: true }, {}, {}, {}, {}, {}, { x: -1 }, { x: -1, attack: true }], 'bair');
    seq('uair', [{ jump: true }, { jump: true }, {}, {}, {}, {}, {}, {}, { y: -1, attack: true }], 'uair');
    seq('dair', [{ jump: true }, { jump: true }, {}, {}, {}, {}, {}, {}, { y: 1, attack: true }], 'dair');
    seq('crouch (Shift)', hold({ crouch: true }, 6), null);
    seq('dtilt (Shift+Q)', hold({ crouch: true }, 4, { attack: true }), 'dtilt');
    {
      const m = mk('blaze', 'titan');
      m.phase = 'play';
      const f = m.fighters[0];
      f.ai = null;
      f.ctl.digital = true;
      for (let i = 0; i < 10; i++) {
        f.ctl.virtual = Object.assign(B(), { crouch: true });
        m.step();
      }
      res.inputs['crouch (Shift)'] = f.state === 'crouch' ? true : f.state;
    }
    seq('airdodge', [{ jump: true }, { jump: true }, {}, {}, {}, {}, {}, {}, { shield: true }], 'airdodge');
    // Items: heart heals, bomb explodes
    {
      const m = mk('blaze', 'aria', { items: true });
      m.phase = 'play';
      const [a] = m.fighters;
      a.damage = 80;
      const h = new SB.Item(m, 'heart', a.x, a.y - 100);
      m.items.push(h);
      run(m, 60);
      res.heart = a.damage < 80;
      const b = m.fighters[1];
      const bomb = new SB.Item(m, 'bomb', b.x, b.y - 40);
      m.items.push(bomb);
      bomb.thrownBy = a;
      bomb.throwT = 5;
      bomb.vy = 6;
      const d0 = b.damage;
      run(m, 30);
      res.bomb = b.damage > d0;
    }
    // QWER combos: land a hit, then press the next key.
    res.combos = {};
    // Presses are made at fixed intervals (fast mashing to slow) like a real player.
    const combo = (char, keys, expectId, gap) => {
      const m = mk(char, 'titan');
      m.phase = 'play';
      const [f, v] = m.fighters;
      f.ai = null;
      f.ctl.digital = true;
      f.x = -30;
      v.x = 22;
      v.damage = 30;
      f.facing = 1;
      const map = { Q: 'attack', W: 'smash', E: 'special' };
      const seen = [];
      let named = null;
      for (let i = 0; i < 200; i++) {
        const inp = B();
        const k = i / gap;
        if (Number.isInteger(k) && k < keys.length) inp[map[keys[k]]] = true;
        f.ctl.virtual = inp;
        m.step();
        if (f.move && seen[seen.length - 1] !== f.move.id) seen.push(f.move.id);
        if (f.comboShow && f.comboShow.name) named = f.comboShow.name;
      }
      const ok = seen.includes(expectId) && f.stats.maxCombo >= keys.length;
      res.combos[char + ' ' + keys + ' gap' + gap] = { ok, seen: seen.join('>'), named, hits: f.stats.maxCombo, dmg: Math.round(v.stats.taken) };
    };
    for (const c of SB.ROSTER) {
      for (const gap of [3, 6, 12]) {
        combo(c.id, 'QQW', 'cLauncher', gap);
        combo(c.id, 'QWE', 'cFinisher', gap);
        combo(c.id, 'QQQQ', 'cFlurry', gap);
      }
    }
    // Generic chain: ftilt (Q) then heavy (W) then special (E)
    // Time mode ends on the clock with a ranking.
    {
      const m = new SB.Match({ players: [0, 1, 2].map((i) => ({ slot: i, char: SB.ROSTER[i].id, palette: 0, type: 'cpu', level: 7 })), stage: 'sky', mode: 'time', time: 1, stocks: 3, items: true });
      let n = 0;
      while (m.phase !== 'done' && n < 60 * 80) {
        m.step();
        n++;
      }
      res.timeMode = { done: m.phase === 'done', frames: n, ranking: m.ranking && m.ranking.map((f) => f.score) };
    }
    // Training mode never ends and never loses stocks.
    {
      const m = new SB.Match({ players: [{ slot: 0, char: 'volt', palette: 0, type: 'cpu', level: 9 }, { slot: 1, char: 'titan', palette: 0, type: 'cpu', level: 3 }], stage: 'city', training: true, items: true });
      for (let i = 0; i < 60 * 90; i++) m.step();
      res.training = { phase: m.phase, stocks: m.fighters.map((f) => f.stocks), falls: m.fighters.map((f) => f.stats.falls) };
    }
    // Two keyboard players can be configured side by side.
    {
      const m = new SB.Match({ players: [{ slot: 0, char: 'blaze', palette: 0, type: 'human', device: 'kb1' }, { slot: 1, char: 'blaze', palette: 1, type: 'human', device: 'kb2' }], stage: 'volcano', mode: 'stock', stocks: 3, items: false });
      for (let i = 0; i < 300; i++) m.step();
      res.humans = m.fighters.every((f) => f.state === 'idle' && Number.isFinite(f.x));
    }
    // Higher CPU levels should beat lower ones.
    {
      let wins = 0;
      const games = 6;
      for (let g = 0; g < games; g++) {
        const ch = SB.ROSTER[g % 4].id;
        const m = new SB.Match({ players: [{ slot: 0, char: ch, palette: 0, type: 'cpu', level: 9 }, { slot: 1, char: ch, palette: 1, type: 'cpu', level: 1 }], stage: 'space', mode: 'stock', stocks: 2, items: false });
        let n = 0;
        while (m.phase !== 'done' && n < 60 * 60 * 5) {
          m.step();
          n++;
        }
        if (m.winner === m.fighters[0]) wins++;
      }
      res.aiScaling = wins + '/' + games;
      res.aiWins = wins;
    }
    return res;
  });
  for (const k in mech.combos) {
    const c = mech.combos[k];
    console.log('  combo ' + k.padEnd(20) + ' ' + (c.ok ? 'OK ' : 'FAIL') + '  ' + c.seen + '  ' + (c.named || '') + '  hits:' + c.hits + ' dmg:' + c.dmg);
    check(c.ok && c.named, 'combo ' + k + ' should trigger its named finisher');
  }
  console.log('  time mode: ' + JSON.stringify(mech.timeMode));
  check(mech.timeMode.done, 'time mode should end');
  console.log('  training: ' + JSON.stringify(mech.training));
  check(mech.training.phase === 'play' && mech.training.stocks.every((s) => s === 99), 'training should never end');
  console.log('  two keyboard players: ' + mech.humans);
  check(mech.humans, 'keyboard players should spawn idle');
  console.log('  level 9 vs level 1 wins: ' + mech.aiScaling);
  check(mech.aiWins >= 5, 'level 9 CPU should beat level 1 almost always');
  console.log('  input mapping: ' + JSON.stringify(mech.inputs));
  for (const k in mech.inputs) check(mech.inputs[k] === true, 'input ' + k + ' produced ' + mech.inputs[k]);
  const badMoves = mech.moves.filter((x) => !x.ok || x.err || !x.finite || x.frames >= 400);
  console.log('  moves executed: ' + mech.moves.length + ', problems: ' + badMoves.length);
  for (const b of badMoves) console.log('    ', JSON.stringify(b));
  check(badMoves.length === 0, 'all moves should run to completion');
  console.log('  KO with charged fsmash at 130%: ' + mech.koAt130 + ', at 20%: ' + mech.koAt20);
  check(mech.koAt130 && !mech.koAt20, 'knockback should scale with damage');
  console.log('  shield blocks: ' + mech.shieldBlocks + ', grab: ' + mech.grabbed + ', throw: ' + mech.thrown);
  check(mech.shieldBlocks, 'shield should block damage');
  check(mech.grabbed && mech.thrown, 'grab & throw should work');
  console.log('  recovery: ' + JSON.stringify(mech.ledge));
  for (const c in mech.ledge) check(mech.ledge[c].survived, c + ' should recover to the stage');
  console.log('  final smashes: ' + JSON.stringify(mech.finals));
  for (const c in mech.finals) check(mech.finals[c], c + ' final smash should hit');
  console.log('  heart heals: ' + mech.heart + ', bomb explodes: ' + mech.bomb);
  check(mech.heart && mech.bomb, 'items should work');

  if (SHOTS) {
    // Gameplay screenshots on each stage
    for (const st of ['sky', 'space', 'volcano', 'city']) {
      await page.evaluate((st) => {
        const cfg = { players: SB.ROSTER.map((c, i) => ({ slot: i, char: c.id, palette: i % 4, type: 'cpu', level: 9 })), stage: st, mode: 'stock', stocks: 3, items: true };
        SB.app.go(new SB.Screens.GameScreen(cfg));
        for (let i = 0; i < 700; i++) SB.app.screen.match.step();
      }, st);
      await page.waitForTimeout(300);
      await shot('10-stage-' + st);
    }
    await page.evaluate(() => {
      const m = SB.app.screen.match;
      while (m.phase !== 'done') m.step();
      SB.app.go(new SB.Screens.ResultsScreen(m, m.cfg));
    });
    await page.waitForTimeout(800);
    await shot('11-results');
  }

  if (errors.length) {
    console.log('Browser errors:');
    for (const e of errors) console.log('  ' + e);
  }
  check(errors.length === 0, 'no browser errors');
  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
