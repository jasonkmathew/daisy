// Keyboard / gamepad / mouse input. Every fighter (human or CPU) is driven
// through the same Controller interface so the game logic never cares where
// the input came from.
'use strict';
(function () {
  const keys = new Set();
  const pressedThisFrame = new Set();

  window.addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) pressedThisFrame.add(e.code);
    keys.add(e.code);
    // Keep arrows / space from scrolling the page and Tab from leaving the canvas.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (SB.audio) SB.audio.unlock();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // Keyboard layouts. Each action can have several keys.
  const LAYOUTS = {
    kb1: {
      name: 'Keyboard A',
      left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
      attack: ['KeyJ'], special: ['KeyK'], shield: ['KeyL'], jump: ['Space'],
      grab: ['KeyU'], smash: ['KeyI'],
    },
    kb2: {
      name: 'Keyboard B',
      left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
      attack: ['Numpad1', 'Period'], special: ['Numpad2', 'Slash'], shield: ['Numpad3', 'ShiftRight'],
      jump: ['Numpad0', 'Quote'], grab: ['Numpad4', 'Semicolon'], smash: ['Numpad5', 'Comma'],
    },
  };

  // A key counts as down if it is held, or was tapped since the last tick
  // (so very quick taps between two frames are never lost).
  const anyDown = (list) => list.some((k) => keys.has(k) || pressedThisFrame.has(k));

  function blankState() {
    return { x: 0, y: 0, cx: 0, cy: 0, attack: false, special: false, jump: false, shield: false, grab: false, smash: false };
  }

  function readKeyboard(layoutId) {
    const L = LAYOUTS[layoutId];
    const s = blankState();
    s.x = (anyDown(L.right) ? 1 : 0) - (anyDown(L.left) ? 1 : 0);
    s.y = (anyDown(L.down) ? 1 : 0) - (anyDown(L.up) ? 1 : 0);
    s.attack = anyDown(L.attack);
    s.special = anyDown(L.special);
    s.shield = anyDown(L.shield);
    s.jump = anyDown(L.jump);
    s.grab = anyDown(L.grab);
    s.smash = anyDown(L.smash);
    return s;
  }

  const DEAD = 0.25;
  const dz = (v) => (Math.abs(v) < DEAD ? 0 : SB.clamp((v - SB.sign(v) * DEAD) / (1 - DEAD), -1, 1));
  const btn = (p, i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));

  function getPads() {
    try {
      return navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    } catch (e) {
      return [];
    }
  }

  function readPad(index) {
    const s = blankState();
    const p = getPads()[index];
    if (!p) return s;
    s.x = dz(p.axes[0] || 0);
    s.y = dz(p.axes[1] || 0);
    if (btn(p, 14)) s.x = -1;
    if (btn(p, 15)) s.x = 1;
    if (btn(p, 12)) s.y = -1;
    if (btn(p, 13)) s.y = 1;
    s.cx = dz(p.axes[2] || 0);
    s.cy = dz(p.axes[3] || 0);
    s.attack = btn(p, 0);
    s.special = btn(p, 1);
    s.jump = btn(p, 2) || btn(p, 3);
    s.grab = btn(p, 5);
    s.shield = btn(p, 4) || btn(p, 6) || btn(p, 7);
    return s;
  }

  // A Controller keeps the current + previous frame so fighters can ask for
  // "pressed this frame" edges and detect quick stick flicks (smash inputs).
  class Controller {
    constructor(source) {
      this.source = source; // 'kb1' | 'kb2' | 'pad0'..'pad3' | 'cpu'
      this.cur = blankState();
      this.prev = blankState();
      this.xTap = 99; // frames since the stick was flicked horizontally
      this.yTap = 99;
      this.virtual = null; // CPU writes here
      // Digital devices (keyboards, CPU) can't "flick" a stick, so smash
      // attacks there come only from the dedicated smash button.
      this.digital = source === 'cpu' || source.startsWith('kb');
    }
    poll() {
      let s;
      if (this.source === 'cpu') s = Object.assign(blankState(), this.virtual || {});
      else if (this.source.startsWith('kb')) s = readKeyboard(this.source);
      else if (this.source.startsWith('pad')) s = readPad(parseInt(this.source.slice(3), 10));
      else s = blankState();
      this.feed(s);
    }
    feed(s) {
      this.prev = this.cur;
      this.cur = s;
      if (Math.abs(s.x) > 0.8 && Math.abs(this.prev.x) < 0.5) this.xTap = 0;
      else this.xTap++;
      if (Math.abs(s.y) > 0.8 && Math.abs(this.prev.y) < 0.5) this.yTap = 0;
      else this.yTap++;
    }
    pressed(b) {
      return this.cur[b] && !this.prev[b];
    }
    released(b) {
      return !this.cur[b] && this.prev[b];
    }
    get x() { return this.cur.x; }
    get y() { return this.cur.y; }
  }

  // ------------------------------------------------------------------ menus
  const menuState = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false };
  let menuPrev = Object.assign({}, menuState);
  const repeat = { up: 0, down: 0, left: 0, right: 0 };
  const menu = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, any: false };

  function pollMenu() {
    const pads = getPads();
    const cur = {
      up: anyDown(['ArrowUp', 'KeyW']),
      down: anyDown(['ArrowDown', 'KeyS']),
      left: anyDown(['ArrowLeft', 'KeyA']),
      right: anyDown(['ArrowRight', 'KeyD']),
      confirm: anyDown(['Enter', 'KeyJ', 'NumpadEnter', 'Numpad1']),
      back: anyDown(['Escape', 'Backspace', 'KeyK', 'Numpad2']),
      start: anyDown(['Escape', 'Enter']),
    };
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      const ay = p.axes[1] || 0;
      cur.up = cur.up || btn(p, 12) || ay < -0.6;
      cur.down = cur.down || btn(p, 13) || ay > 0.6;
      cur.left = cur.left || btn(p, 14) || ax < -0.6;
      cur.right = cur.right || btn(p, 15) || ax > 0.6;
      cur.confirm = cur.confirm || btn(p, 0);
      cur.back = cur.back || btn(p, 1);
      cur.start = cur.start || btn(p, 9);
    }
    menu.any = false;
    for (const k of Object.keys(cur)) {
      const edge = cur[k] && !menuPrev[k];
      menu[k] = edge;
      if (repeat[k] !== undefined) {
        if (cur[k]) {
          repeat[k]++;
          if (repeat[k] > 22 && repeat[k] % 5 === 0) menu[k] = true;
        } else repeat[k] = 0;
      }
      if (edge) menu.any = true;
    }
    if (pressedThisFrame.size > 0) menu.any = true;
    menuPrev = cur;
  }

  // ------------------------------------------------------------------ mouse
  const mouse = { x: -1, y: -1, down: false, clicked: false, moved: false, _click: false };

  function attachMouse(canvas) {
    const toGame = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * SB.W;
      mouse.y = ((e.clientY - r.top) / r.height) * SB.H;
    };
    canvas.addEventListener('mousemove', (e) => {
      toGame(e);
      mouse.moved = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      toGame(e);
      mouse.down = true;
      mouse._click = true;
      if (SB.audio) SB.audio.unlock();
    });
    window.addEventListener('mouseup', () => (mouse.down = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function endFrame() {
    pressedThisFrame.clear();
  }
  function beginFrame() {
    mouse.clicked = mouse._click;
    mouse._click = false;
    pollMenu();
  }
  function afterFrame() {
    mouse.moved = false;
    endFrame();
  }

  function connectedPads() {
    return getPads()
      .map((p, i) => (p ? i : -1))
      .filter((i) => i >= 0);
  }

  SB.input = {
    LAYOUTS, Controller, blankState, menu, mouse, keys,
    attachMouse, beginFrame, afterFrame, connectedPads,
    keyPressed: (code) => pressedThisFrame.has(code),
  };
})();
