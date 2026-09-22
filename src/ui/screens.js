// Menu screens, the in-game screen (with pause) and results.
'use strict';
(function () {
  const W = SB.W;
  const H = SB.H;
  const TAU = Math.PI * 2;
  const { Menu, button, spinner, FONT } = SB.UI;
  const T = (...a) => SB.GameRenderer.text(...a);
  const banner = (...a) => SB.GameRenderer.banner(...a);
  const PCOL = ['#ff4d5e', '#3d8bff', '#ffd23f', '#3ddc84'];

  const DEVICES = ['off', 'kb1', 'kb2', 'pad0', 'pad1', 'pad2', 'pad3', 'cpu'];
  const DEVICE_LABEL = { off: 'OFF', kb1: 'KEYBOARD A', kb2: 'KEYBOARD B', pad0: 'GAMEPAD 1', pad1: 'GAMEPAD 2', pad2: 'GAMEPAD 3', pad3: 'GAMEPAD 4', cpu: 'CPU' };

  // ------------------------------------------------------------- config
  const defaults = () => ({
    slots: [
      { dev: 'kb1', char: 'blaze', palette: 0, level: 5 },
      { dev: 'cpu', char: 'aria', palette: 0, level: 5 },
      { dev: 'off', char: 'titan', palette: 0, level: 5 },
      { dev: 'off', char: 'volt', palette: 0, level: 5 },
    ],
    stage: 'sky', mode: 'stock', stocks: 3, time: 3, items: true,
  });
  const cfg = Object.assign(defaults(), SB.storage.get('config', {}));
  if (!Array.isArray(cfg.slots) || cfg.slots.length !== 4) cfg.slots = defaults().slots;
  const saveCfg = () => SB.storage.set('config', cfg);

  function buildMatchCfg(training) {
    const players = [];
    const used = new Set();
    cfg.slots.forEach((s, i) => {
      if (s.dev === 'off') return;
      const char = SB.charById(s.char);
      let pal = s.palette % char.palettes.length;
      while (used.has(s.char + pal)) pal = (pal + 1) % char.palettes.length;
      used.add(s.char + pal);
      players.push({
        slot: i, char: s.char, palette: pal, type: s.dev === 'cpu' ? 'cpu' : 'human', device: s.dev,
        level: training && s.dev === 'cpu' ? s.trainLevel || 0 : s.level,
      });
    });
    return { players, stage: cfg.stage, mode: cfg.mode, stocks: cfg.stocks, time: cfg.time, items: cfg.items, training };
  }

  // --------------------------------------------------- shared background
  const bgStage = new SB.Stage(SB.stageById('sky'));
  function menuBackground(ctx, t, tint) {
    const cam = { x: Math.sin(t * 0.002) * 300, y: -120 + Math.sin(t * 0.003) * 40, zoom: 0.9 };
    bgStage.t = t;
    bgStage.drawBack(ctx, cam, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, tint || 'rgba(12,6,35,0.72)');
    g.addColorStop(1, 'rgba(5,2,18,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Diagonal speed stripes
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    for (let i = -4; i < 16; i++) {
      const x = ((i * 140 + t * 0.6) % 2240) - 400;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 50, 0);
      ctx.lineTo(x - 250, H);
      ctx.lineTo(x - 300, H);
      ctx.fill();
    }
    ctx.restore();
  }

  function logo(ctx, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // Emblem ring
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.rotate(t * 0.004);
    ctx.strokeStyle = 'rgba(255,200,80,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 170, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([20, 14]);
    ctx.beginPath();
    ctx.arc(0, 0, 190, 0, TAU);
    ctx.stroke();
    ctx.restore();
    banner(ctx, 'BRAWL', -4, -40, 120, '#ffe066', '#ff5a1f', 1, -0.04);
    banner(ctx, 'LEGENDS', 10, 70, 104, '#9be7ff', '#3d5bff', 1, -0.04);
    ctx.restore();
  }

  function title(ctx, str, sub) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 18, W, 58);
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(0, 74, W, 3);
    ctx.restore();
    banner(ctx, str, W / 2, 48, 40, '#ffffff', '#ffcc33');
    if (sub) T(ctx, sub, W / 2, 100, 15, '#cfd6ff', 'center', null, 600);
  }

  // =============================================================== TITLE
  class TitleScreen {
    enter() {
      this.t = 0;
      SB.audio.startMusic('menu');
    }
    update() {
      this.t++;
      const M = SB.input.menu;
      if (this.t > 20 && (M.any || SB.input.mouse.clicked)) {
        SB.audio.unlock();
        SB.audio.play('menuSelect');
        SB.app.go(new MainMenu());
      }
    }
    draw(ctx) {
      const t = this.t;
      menuBackground(ctx, t, 'rgba(10,5,30,0.45)');
      // Fighters line-up
      const R = SB.ROSTER;
      R.forEach((c, i) => {
        const x = W / 2 + (i - 1.5) * 240;
        const y = H - 70;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 60, 10, 0, 0, TAU);
        ctx.fill();
        SB.FighterRenderer.drawPreview(ctx, c, 0, x, y, 1.7, t + i * 30, i % 2 ? 'idle' : 'victory', 'title' + i);
      });
      logo(ctx, W / 2, 210 + Math.sin(t * 0.03) * 6, 1, t);
      if (Math.floor(t / 30) % 2 === 0 || t < 20) T(ctx, 'PRESS ENTER OR CLICK TO START', W / 2, 395, 24, '#ffffff');
      T(ctx, 'A platform fighter  •  4 fighters  •  4 stages  •  up to 4 players', W / 2, 428, 15, '#cfd6ff', 'center', null, 600);
    }
  }

  // =========================================================== MAIN MENU
  class MainMenu {
    enter() {
      this.t = 0;
      SB.audio.startMusic('menu');
      this.menu = new Menu();
      const bx = 90;
      const items = [
        ['VERSUS', 'Up to 4 players or CPUs', () => SB.app.go(new CharSelect(false)), '#ff5a5a'],
        ['TRAINING', 'Practise combos on a dummy', () => SB.app.go(new CharSelect(true)), '#3ddc84'],
        ['CONTROLS', 'Keyboard & gamepad layouts', () => SB.app.go(new ControlsScreen()), '#3d8bff'],
        ['SETTINGS', 'Audio, video & gameplay', () => SB.app.go(new SettingsScreen()), '#ffd23f'],
      ];
      if (SB.isElectron) items.push(['QUIT', 'Close the game', () => window.close(), '#999999']);
      items.forEach(([l, s, fn, c], i) => this.menu.add(button(bx, 190 + i * 88, 360, 72, l, fn, { sub: s, size: 28, color: c })));
    }
    update() {
      this.t++;
      this.menu.update();
      if (SB.input.menu.back) {
        SB.audio.play('menuBack');
        SB.app.go(new TitleScreen());
      }
    }
    draw(ctx) {
      menuBackground(ctx, this.t);
      logo(ctx, 880, 150, 0.62, this.t);
      const f = this.menu.focused();
      const idx = this.menu.items.indexOf(f);
      const c = SB.ROSTER[Math.max(0, idx) % SB.ROSTER.length];
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(880, 640, 110, 16, 0, 0, TAU);
      ctx.fill();
      SB.FighterRenderer.drawPreview(ctx, c, 0, 880, 636, 2.9, this.t, 'idle', 'mm');
      T(ctx, c.name, 880, 690, 30, c.palettes[0].glow);
      this.menu.draw(ctx);
    }
  }

  // ======================================================= CHAR SELECT
  class CharSelect {
    constructor(training) {
      this.training = training;
    }
    enter() {
      this.t = 0;
      this.active = 0;
      SB.audio.startMusic('menu');
      if (this.training) {
        // Training: exactly one human + one CPU dummy.
        if (cfg.slots[0].dev === 'off' || cfg.slots[0].dev === 'cpu') cfg.slots[0].dev = 'kb1';
        cfg.slots[1].dev = 'cpu';
        cfg.slots[2].dev = 'off';
        cfg.slots[3].dev = 'off';
      }
      this.build();
    }
    build() {
      const m = (this.menu = new Menu());
      const R = SB.ROSTER;
      const cw = 230;
      const x0 = (W - (R.length * cw + (R.length - 1) * 18)) / 2;
      R.forEach((c, i) => {
        m.add({
          kind: 'button', x: x0 + i * (cw + 18), y: 112, w: cw, h: 176, label: c.name, char: c,
          onPress: () => {
            const s = cfg.slots[this.active];
            if (s.dev === 'off') s.dev = this.active === 0 ? 'kb1' : 'cpu';
            s.char = c.id;
            saveCfg();
            SB.audio.play('menuSelect');
          },
          draw: (ctx, w, focus, t) => this.drawCard(ctx, w, focus, t),
        });
      });
      const pw = 285;
      const px0 = (W - (4 * pw + 3 * 16)) / 2;
      for (let i = 0; i < 4; i++) {
        const s = cfg.slots[i];
        const x = px0 + i * (pw + 16);
        const y = 300;
        const vis = () => this.training && i > 1;
        const typeW = m.add(spinner(x + 10, y + 188, pw - 20, 34, '', () => DEVICE_LABEL[s.dev], (d) => {
          let k = DEVICES.indexOf(s.dev);
          do {
            k = (k + d + DEVICES.length) % DEVICES.length;
          } while (this.training && ((i === 0 && (DEVICES[k] === 'cpu' || DEVICES[k] === 'off')) || (i === 1 && DEVICES[k] !== 'cpu')));
          s.dev = DEVICES[k];
          this.active = i;
          saveCfg();
        }, { small: true, color: PCOL[i], slot: i }));
        typeW.hidden = vis();
        m.add(spinner(x + 10, y + 226, pw - 20, 34, 'FIGHTER', () => SB.charById(s.char).name, (d) => {
          const k = SB.ROSTER.findIndex((c) => c.id === s.char);
          s.char = SB.ROSTER[(k + d + SB.ROSTER.length) % SB.ROSTER.length].id;
          this.active = i;
          saveCfg();
        }, { small: true, color: PCOL[i], slot: i, hidden: vis() }));
        m.add(spinner(x + 10, y + 264, pw - 20, 34, 'COLOUR', () => SB.charById(s.char).palettes[s.palette % 4].name.toUpperCase(), (d) => {
          s.palette = (s.palette + d + 4) % 4;
          this.active = i;
          saveCfg();
        }, { small: true, color: PCOL[i], slot: i, hidden: vis() }));
        const lv = m.add(spinner(x + 10, y + 302, pw - 20, 34, this.training ? 'DUMMY' : 'CPU LEVEL', () => {
          if (this.training) return ['STAND', 'LV 1', 'LV 3', 'LV 5', 'LV 9'][[0, 1, 3, 5, 9].indexOf(s.trainLevel || 0)] || 'STAND';
          return 'LV ' + s.level;
        }, (d) => {
          if (this.training) {
            const opts = [0, 1, 3, 5, 9];
            const k = Math.max(0, opts.indexOf(s.trainLevel || 0));
            s.trainLevel = opts[(k + d + opts.length) % opts.length];
          } else s.level = SB.clamp(s.level + d, 1, 9);
          this.active = i;
          saveCfg();
        }, { small: true, color: PCOL[i], slot: i }));
        lv.cpuOnly = s;
      }
      this.backBtn = m.add(button(40, 654, 180, 50, 'BACK', () => this.back(), { color: '#999999' }));
      this.nextBtn = m.add(button(W - 260, 654, 220, 50, 'CONTINUE ▶', () => this.next(), { color: '#3ddc84' }));
      m.focus = 0;
    }
    back() {
      SB.audio.play('menuBack');
      SB.app.go(new MainMenu());
    }
    next() {
      const n = cfg.slots.filter((s) => s.dev !== 'off').length;
      if (n < 2) {
        this.warn = 90;
        return;
      }
      SB.app.go(new StageSelect(this.training));
    }
    update() {
      this.t++;
      for (const w of this.menu.items) {
        if (w.cpuOnly) w.hidden = w.cpuOnly.dev !== 'cpu' || (this.training && w.slot > 1);
        if (w.slot !== undefined && this.training && w.slot > 1) w.hidden = true;
      }
      const f = this.menu.focused();
      if (f && f.slot !== undefined) this.active = f.slot;
      this.menu.update();
      if (this.warn) this.warn--;
      if (SB.input.menu.back) this.back();
    }
    drawCard(ctx, w, focus, t) {
      const c = w.char;
      const picked = cfg.slots.map((s, i) => (s.dev !== 'off' && s.char === c.id ? i : -1)).filter((i) => i >= 0);
      ctx.save();
      const s = 1 + w.pulse * 0.04 + (focus ? 0.03 : 0);
      ctx.translate(w.x + w.w / 2, w.y + w.h / 2);
      ctx.scale(s, s);
      const x = -w.w / 2;
      const y = -w.h / 2;
      const pal = c.palettes[0];
      const g = ctx.createLinearGradient(0, y, 0, y + w.h);
      g.addColorStop(0, SB.shade(pal.main, 0.1));
      g.addColorStop(1, SB.shade(pal.main, -0.7));
      if (focus) {
        ctx.shadowColor = pal.glow;
        ctx.shadowBlur = 26;
      }
      SB.roundRect(ctx, x, y, w.w, w.h, 14);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      SB.roundRect(ctx, x, y, w.w, w.h, 14);
      ctx.clip();
      // Rays
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = pal.glow;
      for (let i = 0; i < 8; i++) {
        const a = t * 0.005 + (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(Math.cos(a) * 300, 10 + Math.sin(a) * 300);
        ctx.lineTo(Math.cos(a + 0.2) * 300, 10 + Math.sin(a + 0.2) * 300);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const sc = c.id === 'titan' ? 1.08 : 1.35;
      SB.FighterRenderer.drawPreview(ctx, c, 0, 0, y + w.h - 42, sc, t, focus ? 'victory' : 'idle', 'card' + c.id);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y + w.h - 40, w.w, 40);
      ctx.restore();
      T(ctx, c.name, 0, y + w.h - 16, 22, '#ffffff');
      T(ctx, c.title, 0, y + w.h - 2, 11, pal.glow, 'center', null, 700);
      SB.roundRect(ctx, x, y, w.w, w.h, 14);
      ctx.lineWidth = focus ? 4 : 2;
      ctx.strokeStyle = focus ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.stroke();
      picked.forEach((pi, k) => {
        const bx = x + 10 + k * 40;
        ctx.fillStyle = PCOL[pi];
        SB.roundRect(ctx, bx, y + 8, 36, 22, 6);
        ctx.fill();
        T(ctx, cfg.slots[pi].dev === 'cpu' ? 'CPU' : 'P' + (pi + 1), bx + 18, y + 24, 13, '#fff', 'center', '#111', 900, 3);
      });
      ctx.restore();
    }
    draw(ctx) {
      menuBackground(ctx, this.t);
      title(ctx, this.training ? 'TRAINING — CHOOSE FIGHTERS' : 'CHOOSE YOUR FIGHTER', 'Click a fighter to give it to the highlighted slot • Arrows / mouse to change options');
      const pw = 285;
      const px0 = (W - (4 * pw + 3 * 16)) / 2;
      for (let i = 0; i < 4; i++) {
        const s = cfg.slots[i];
        const x = px0 + i * (pw + 16);
        const y = 300;
        const off = s.dev === 'off' || (this.training && i > 1);
        ctx.save();
        const g = ctx.createLinearGradient(0, y, 0, y + 345);
        g.addColorStop(0, off ? 'rgba(50,50,60,0.75)' : SB.rgba(PCOL[i], 0.55));
        g.addColorStop(1, 'rgba(10,8,25,0.9)');
        SB.roundRect(ctx, x, y, pw, 345, 16);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = this.active === i ? 4 : 2;
        ctx.strokeStyle = this.active === i ? '#ffffff' : SB.rgba(PCOL[i], 0.7);
        ctx.stroke();
        ctx.restore();
        const label = this.training && i > 1 ? '' : s.dev === 'cpu' ? 'CPU' : 'P' + (i + 1);
        T(ctx, label, x + 18, y + 34, 26, PCOL[i], 'left');
        if (!off) {
          const c = SB.charById(s.char);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(x + pw / 2, y + 176, 70, 10, 0, 0, TAU);
          ctx.fill();
          SB.FighterRenderer.drawPreview(ctx, c, s.palette, x + pw / 2, y + 174, c.id === 'titan' ? 1.05 : 1.3, this.t + i * 20, 'idle', 'slot' + i + c.id + s.palette);
          T(ctx, c.name, x + pw - 16, y + 34, 20, c.palettes[s.palette % 4].glow, 'right');
        } else {
          T(ctx, this.training && i > 1 ? '' : 'Press ▶ on the first option to join', x + pw / 2, y + 120, 13, '#c0c0d0', 'center', null, 600);
        }
      }
      if (this.warn) T(ctx, 'At least two fighters are needed!', W / 2, 690, 22, '#ff6b6b');
      this.menu.draw(ctx);
    }
  }

  // ======================================================= STAGE SELECT
  const thumbs = {};
  function stageThumb(def) {
    if (thumbs[def.id]) return thumbs[def.id];
    const c = SB.makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const st = new SB.Stage(def);
    for (let i = 0; i < 30; i++) st.update();
    const cam = { x: 0, y: -110, zoom: 0.62 };
    st.drawBack(ctx, cam, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    st.drawStage(ctx);
    ctx.restore();
    st.drawFront(ctx, cam, W, H);
    const out = SB.makeCanvas(320, 180);
    out.getContext('2d').drawImage(c, 0, 0, 320, 180);
    thumbs[def.id] = out;
    return out;
  }

  class StageSelect {
    constructor(training) {
      this.training = training;
    }
    enter() {
      this.t = 0;
      const m = (this.menu = new Menu());
      const cw = 280;
      const x0 = (W - (4 * cw + 3 * 20)) / 2;
      SB.STAGES.forEach((s, i) => {
        m.add({
          kind: 'button', x: x0 + i * (cw + 20), y: 110, w: cw, h: 190, label: s.name, stage: s,
          onPress: () => {
            cfg.stage = s.id;
            saveCfg();
            this.menu.setFocus(this.fightBtn);
          },
          draw: (ctx, w, focus) => this.drawCard(ctx, w, focus),
        });
      });
      const rx = W / 2 - 330;
      const ry = 420;
      const rules = [
        spinner(rx, ry, 320, 44, 'MODE', () => (cfg.mode === 'stock' ? 'STOCK' : 'TIME'), () => {
          cfg.mode = cfg.mode === 'stock' ? 'time' : 'stock';
          saveCfg();
        }),
        spinner(rx + 340, ry, 320, 44, 'STOCKS', () => String(cfg.stocks), (d) => {
          cfg.stocks = SB.clamp(cfg.stocks + d, 1, 9);
          saveCfg();
        }),
        spinner(rx, ry + 56, 320, 44, 'TIME LIMIT', () => cfg.time + ' MIN', (d) => {
          cfg.time = SB.clamp(cfg.time + d, 1, 9);
          saveCfg();
        }),
        spinner(rx + 340, ry + 56, 320, 44, 'ITEMS', () => (cfg.items ? 'ON' : 'OFF'), () => {
          cfg.items = !cfg.items;
          saveCfg();
        }),
      ];
      for (const r of rules) {
        r.hidden = this.training;
        m.add(r);
      }
      m.add(button(40, 654, 180, 50, 'BACK', () => this.back(), { color: '#999999' }));
      this.fightBtn = m.add(button(W - 300, 640, 260, 64, 'FIGHT!', () => this.start(), { color: '#ff5a5a', size: 32 }));
      m.focus = Math.max(0, SB.STAGES.findIndex((s) => s.id === cfg.stage));
    }
    back() {
      SB.audio.play('menuBack');
      SB.app.go(new CharSelect(this.training));
    }
    start() {
      SB.app.go(new GameScreen(buildMatchCfg(this.training)));
    }
    update() {
      this.t++;
      const f = this.menu.focused();
      if (f && f.stage) cfg.stage = f.stage.id;
      this.menu.update();
      if (SB.input.menu.back) this.back();
    }
    drawCard(ctx, w, focus) {
      const sel = cfg.stage === w.stage.id;
      ctx.save();
      const s = 1 + w.pulse * 0.04 + (sel ? 0.04 : 0);
      ctx.translate(w.x + w.w / 2, w.y + w.h / 2);
      ctx.scale(s, s);
      const x = -w.w / 2;
      const y = -w.h / 2;
      if (sel) {
        ctx.shadowColor = '#ffcc33';
        ctx.shadowBlur = 30;
      }
      SB.roundRect(ctx, x, y, w.w, w.h, 14);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      SB.roundRect(ctx, x, y, w.w, w.h, 14);
      ctx.clip();
      ctx.drawImage(stageThumb(w.stage), x, y, w.w, w.w * (9 / 16));
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x, y + w.h - 34, w.w, 34);
      ctx.restore();
      T(ctx, w.stage.name.toUpperCase(), 0, y + w.h - 11, 19, sel ? '#ffcc33' : '#ffffff');
      SB.roundRect(ctx, x, y, w.w, w.h, 14);
      ctx.lineWidth = sel ? 4 : focus ? 3 : 2;
      ctx.strokeStyle = sel ? '#ffcc33' : focus ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.stroke();
      ctx.restore();
    }
    draw(ctx) {
      menuBackground(ctx, this.t);
      title(ctx, 'SELECT STAGE', 'Enter / click FIGHT! to begin');
      const st = SB.stageById(cfg.stage);
      T(ctx, st.name, W / 2, 340, 30, '#ffcc33');
      T(ctx, st.blurb, W / 2, 368, 16, '#dfe4ff', 'center', null, 600);
      if (!this.training) T(ctx, 'RULES', W / 2, 408, 18, '#ffffff');
      else T(ctx, 'Training: unlimited stocks, combo counter, press R to reset positions.', W / 2, 440, 18, '#8ff8ff');
      this.menu.draw(ctx);
    }
  }

  // ============================================================ CONTROLS
  class ControlsScreen {
    enter() {
      this.t = 0;
      this.menu = new Menu();
      this.menu.add(button(40, 654, 180, 50, 'BACK', () => this.back(), { color: '#999999' }));
    }
    back() {
      SB.audio.play('menuBack');
      SB.app.go(new MainMenu());
    }
    update() {
      this.t++;
      this.menu.update();
      if (SB.input.menu.back) this.back();
    }
    draw(ctx) {
      menuBackground(ctx, this.t);
      title(ctx, 'CONTROLS', 'Tap a direction and attack together for a SMASH attack — hold attack to charge it');
      const cols = [
        ['KEYBOARD A', [['Move', 'W A S D'], ['Jump', 'Space (or W)'], ['Attack', 'J'], ['Special', 'K'], ['Shield / Dodge', 'L'], ['Grab', 'U'], ['Smash attack', 'I + direction']]],
        ['KEYBOARD B', [['Move', 'Arrow keys'], ['Jump', 'Num 0 / \' (or Up)'], ['Attack', 'Num 1 / .'], ['Special', 'Num 2 / /'], ['Shield / Dodge', 'Num 3 / R-Shift'], ['Grab', 'Num 4 / ;'], ['Smash attack', 'Num 5 / ,']]],
        ['GAMEPAD', [['Move', 'Left stick / D-pad'], ['Jump', 'X / Y'], ['Attack', 'A'], ['Special', 'B'], ['Shield / Dodge', 'LB / LT / RT'], ['Grab', 'RB'], ['Smash / aerials', 'Right stick']]],
      ];
      cols.forEach(([name, rows], i) => {
        const x = 70 + i * 390;
        const y = 130;
        ctx.fillStyle = 'rgba(15,10,40,0.8)';
        SB.roundRect(ctx, x, y, 360, 330, 14);
        ctx.fill();
        ctx.strokeStyle = PCOL[i + 1];
        ctx.lineWidth = 2;
        ctx.stroke();
        T(ctx, name, x + 180, y + 36, 24, PCOL[i + 1]);
        rows.forEach(([a, b], k) => {
          T(ctx, a, x + 22, y + 78 + k * 36, 16, '#cfd6ff', 'left', null, 700);
          T(ctx, b, x + 338, y + 78 + k * 36, 16, '#ffffff', 'right', null, 900);
        });
      });
      const tips = [
        'Special + direction = 4 different special moves (up special recovers!).  Shield + direction = roll, shield + down = spot dodge.',
        'Shield in the air = air dodge.  Press shield just before hitting the ground while tumbling to TECH.  Flick down in the air to fast fall.',
        'Grab, then push a direction to throw.  Hang on ledges: toward/up = climb, jump, attack or shield for other get-ups.',
        'Break the rainbow SMASH ORB and press special for your FINAL SMASH!   Esc / Start = pause.',
      ];
      tips.forEach((s, i) => T(ctx, s, W / 2, 500 + i * 30, 15, '#e6e9ff', 'center', null, 600));
      this.menu.draw(ctx);
    }
  }

  // ============================================================ SETTINGS
  class SettingsScreen {
    enter() {
      this.t = 0;
      const m = (this.menu = new Menu());
      const S = SB.settings;
      const x = W / 2 - 220;
      let y = 130;
      const save = () => {
        SB.saveSettings();
        SB.audio.applyVolumes();
      };
      const vol = (label, key) =>
        m.add(spinner(x, (y += 58) - 58, 440, 46, label, () => '▮'.repeat(Math.round(S[key] * 10)).padEnd(10, '▯'), (d) => {
          S[key] = SB.clamp(Math.round((S[key] + d * 0.1) * 10) / 10, 0, 1);
          save();
        }));
      const tog = (label, key, def = false) =>
        m.add(spinner(x, (y += 58) - 58, 440, 46, label, () => ((S[key] === undefined ? def : S[key]) ? 'ON' : 'OFF'), () => {
          S[key] = !(S[key] === undefined ? def : S[key]);
          save();
        }));
      vol('MASTER VOLUME', 'master');
      vol('MUSIC', 'music');
      vol('SOUND EFFECTS', 'sfx');
      tog('SCREEN SHAKE', 'shake', true);
      tog('DAMAGE NUMBERS', 'damageNumbers', true);
      tog('TAP JUMP (UP = JUMP)', 'tapJump', true);
      tog('SHOW HITBOXES', 'hitboxes', false);
      m.add(button(x, y + 6, 440, 50, 'TOGGLE FULLSCREEN', () => SB.toggleFullscreen(), { color: '#3d8bff' }));
      m.add(button(40, 654, 180, 50, 'BACK', () => this.back(), { color: '#999999' }));
    }
    back() {
      SB.audio.play('menuBack');
      SB.app.go(new MainMenu());
    }
    update() {
      this.t++;
      this.menu.update();
      if (SB.input.menu.back) this.back();
    }
    draw(ctx) {
      menuBackground(ctx, this.t);
      title(ctx, 'SETTINGS', 'Left / right to change • settings are saved automatically');
      this.menu.draw(ctx);
    }
  }

  // ================================================================ GAME
  class GameScreen {
    constructor(matchCfg) {
      this.matchCfg = matchCfg;
    }
    enter() {
      this.match = new SB.Match(this.matchCfg);
      SB.match = this.match;
      this.paused = false;
      this.t = 0;
      SB.audio.startMusic(SB.stageById(this.matchCfg.stage).music);
      this.pmenu = new Menu();
      const x = W / 2 - 160;
      this.pmenu.add(button(x, 300, 320, 56, 'RESUME', () => (this.paused = false), { color: '#3ddc84' }));
      this.pmenu.add(button(x, 370, 320, 56, 'RESTART', () => SB.app.go(new GameScreen(this.matchCfg)), { color: '#ffd23f' }));
      this.pmenu.add(button(x, 440, 320, 56, 'QUIT TO MENU', () => SB.app.go(new CharSelect(this.matchCfg.training)), { color: '#ff5a5a' }));
    }
    exit() {
      SB.match = null;
    }
    update() {
      this.t++;
      const M = SB.input.menu;
      const pauseKey = SB.input.keyPressed('Escape') || SB.input.keyPressed('KeyP') || (M.start && !SB.input.keyPressed('Enter'));
      if (this.paused) {
        this.pmenu.update();
        if (pauseKey || M.back) {
          this.paused = false;
          SB.audio.play('menuBack');
        }
        return;
      }
      if (pauseKey && this.match.phase !== 'ending') {
        this.paused = true;
        this.pmenu.focus = 0;
        SB.audio.play('menuSelect');
        return;
      }
      if (this.match.training && SB.input.keyPressed('KeyR')) {
        const cfg2 = this.matchCfg;
        this.match = new SB.Match(cfg2);
        this.match.phase = 'play';
        SB.match = this.match;
      }
      this.match.step();
      if (this.match.phase === 'done') SB.app.go(new ResultsScreen(this.match, this.matchCfg));
    }
    draw(ctx) {
      SB.GameRenderer.render(ctx, this.match);
      if (this.paused) {
        ctx.fillStyle = 'rgba(5,3,15,0.65)';
        ctx.fillRect(0, 0, W, H);
        banner(ctx, 'PAUSED', W / 2, 220, 80, '#ffffff', '#8f7bff');
        this.pmenu.draw(ctx);
      }
    }
  }

  // ============================================================= RESULTS
  class ResultsScreen {
    constructor(match, matchCfg) {
      this.m = match;
      this.matchCfg = matchCfg;
    }
    enter() {
      this.t = 0;
      SB.audio.startMusic('results');
      SB.audio.play('cheer');
      const m = (this.menu = new Menu());
      m.add(button(W - 700, 650, 200, 52, 'REMATCH', () => SB.app.go(new GameScreen(this.matchCfg)), { color: '#3ddc84' }));
      m.add(button(W - 480, 650, 220, 52, 'FIGHTERS', () => SB.app.go(new CharSelect(false)), { color: '#3d8bff' }));
      m.add(button(W - 240, 650, 200, 52, 'MAIN MENU', () => SB.app.go(new MainMenu()), { color: '#999999' }));
      this.confetti = [];
      for (let i = 0; i < 120; i++) this.confetti.push({ x: SB.rand(0, W), y: SB.rand(-H, 0), vy: SB.rand(1, 3), vx: SB.rand(-0.6, 0.6), r: SB.rand(0, 6), c: SB.pick(['#ff4d5e', '#3d8bff', '#ffd23f', '#3ddc84', '#ffffff', '#ff8cf0']) });
    }
    update() {
      this.t++;
      this.menu.update();
      for (const c of this.confetti) {
        c.y += c.vy;
        c.x += c.vx + Math.sin(this.t * 0.03 + c.r) * 0.5;
        c.r += 0.05;
        if (c.y > H + 10) c.y = -10;
      }
    }
    draw(ctx) {
      const win = this.m.winner;
      const t = this.t;
      // Rotating rays in the winner's colour
      ctx.fillStyle = SB.shade(win.color, -0.75);
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(330, 380);
      ctx.rotate(t * 0.003);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? SB.rgba(win.color, 0.25) : SB.rgba(win.pal.glow, 0.12);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 1400, (i / 16) * TAU, ((i + 1) / 16) * TAU);
        ctx.fill();
      }
      ctx.restore();
      const g = ctx.createRadialGradient(330, 400, 50, 330, 400, 500);
      g.addColorStop(0, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(330, 640, 130, 20, 0, 0, TAU);
      ctx.fill();
      SB.FighterRenderer.drawPreview(ctx, win.def, win.palIndex, 330, 636, win.def.id === 'titan' ? 2.3 : 2.6, t, 'victory', 'results');
      banner(ctx, win.def.name, 330, 80, 76, '#ffffff', win.pal.glow);
      T(ctx, (win.tag === 'CPU' ? 'CPU' : win.tag) + ' WINS!', 330, 140, 30, win.color);
      // Stats table
      const x = 640;
      let y = 110;
      ctx.fillStyle = 'rgba(8,5,20,0.8)';
      SB.roundRect(ctx, x - 20, y - 50, 620, 90 + this.m.ranking.length * 104, 16);
      ctx.fill();
      const hdr = ['KOs', 'FALLS', 'SDs', 'DMG', 'COMBO'];
      hdr.forEach((h, i) => T(ctx, h, x + 290 + i * 62, y - 16, 13, '#bfc7ff', 'center', null, 800));
      this.m.ranking.forEach((f, r) => {
        const yy = y + r * 104;
        const slide = Math.max(0, 1 - (t - r * 8) / 25);
        ctx.save();
        ctx.translate(slide * 600, 0);
        ctx.fillStyle = SB.rgba(f.color, 0.3);
        SB.roundRect(ctx, x, yy, 580, 92, 12);
        ctx.fill();
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        T(ctx, String(r + 1), x + 30, yy + 60, 44, r === 0 ? '#ffd23f' : '#ffffff');
        ctx.drawImage(SB.FighterRenderer.portrait(f.def, f.palIndex, 96), x + 58, yy + 6, 80, 80);
        T(ctx, f.def.name, x + 148, yy + 40, 22, '#ffffff', 'left');
        T(ctx, f.tag, x + 148, yy + 66, 16, f.color, 'left');
        const s = f.stats;
        [s.kos, s.falls, s.sds, Math.round(s.dealt), s.maxCombo].forEach((v, i) => T(ctx, String(v), x + 290 + i * 62, yy + 56, 22, '#ffffff'));
        ctx.restore();
      });
      for (const c of this.confetti) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.r);
        ctx.fillStyle = c.c;
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
      this.menu.draw(ctx);
    }
  }

  SB.Screens = { TitleScreen, MainMenu, CharSelect, StageSelect, ControlsScreen, SettingsScreen, GameScreen, ResultsScreen, buildMatchCfg, cfg };
  void FONT;
})();
