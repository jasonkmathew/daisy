// Minimal immediate-ish UI toolkit: buttons & spinners with keyboard,
// gamepad and mouse navigation.
'use strict';
(function () {
  const TAU = Math.PI * 2;
  const FONT = '"Segoe UI", "Trebuchet MS", Arial, sans-serif';

  class Menu {
    constructor() {
      this.items = [];
      this.focus = 0;
      this.t = 0;
    }
    add(w) {
      w.pulse = 0;
      this.items.push(w);
      return w;
    }
    clear() {
      this.items.length = 0;
      this.focus = 0;
    }
    visible() {
      return this.items.filter((w) => !w.hidden);
    }
    focused() {
      const it = this.items[this.focus];
      return it && !it.hidden ? it : this.visible()[0];
    }
    setFocus(w) {
      const i = this.items.indexOf(w);
      if (i >= 0 && i !== this.focus) {
        this.focus = i;
        SB.audio.play('menuMove');
      }
    }
    move(dx, dy) {
      const cur = this.focused();
      if (!cur) return;
      const cx = cur.x + cur.w / 2;
      const cy = cur.y + cur.h / 2;
      let best = null;
      let bd = Infinity;
      for (const w of this.visible()) {
        if (w === cur || w.disabled) continue;
        const wx = w.x + w.w / 2;
        const wy = w.y + w.h / 2;
        const ddx = wx - cx;
        const ddy = wy - cy;
        if (dx && Math.sign(ddx) !== dx) continue;
        if (dy && Math.sign(ddy) !== dy) continue;
        if (dx && Math.abs(ddx) < 4) continue;
        if (dy && Math.abs(ddy) < 4) continue;
        const d = dx ? Math.abs(ddx) + Math.abs(ddy) * 2.2 : Math.abs(ddy) + Math.abs(ddx) * 2.2;
        if (d < bd) {
          bd = d;
          best = w;
        }
      }
      if (best) this.setFocus(best);
    }
    update() {
      this.t++;
      const M = SB.input.menu;
      const mouse = SB.input.mouse;
      for (const w of this.items) w.pulse *= 0.85;
      if (mouse.moved || mouse.clicked) {
        for (const w of this.visible()) {
          if (!w.disabled && mouse.x >= w.x && mouse.x <= w.x + w.w && mouse.y >= w.y && mouse.y <= w.y + w.h) {
            if (mouse.moved) this.setFocus(w);
            if (mouse.clicked) {
              this.setFocus(w);
              if (w.kind === 'spinner') {
                if (mouse.x < w.x + w.w * 0.3) this.change(w, -1);
                else this.change(w, 1);
              } else this.activate(w);
              mouse.clicked = false;
            }
          }
        }
      }
      const f = this.focused();
      if (M.up) this.move(0, -1);
      if (M.down) this.move(0, 1);
      if (M.left) {
        if (f && f.kind === 'spinner') this.change(f, -1);
        else this.move(-1, 0);
      }
      if (M.right) {
        if (f && f.kind === 'spinner') this.change(f, 1);
        else this.move(1, 0);
      }
      if (M.confirm && f) {
        if (f.kind === 'spinner') this.change(f, 1);
        else this.activate(f);
      }
    }
    change(w, d) {
      if (w.disabled) return;
      w.onChange(d);
      w.pulse = 1;
      SB.audio.play('menuMove');
    }
    activate(w) {
      if (w.disabled) return;
      w.pulse = 1;
      SB.audio.play('menuSelect');
      w.onPress && w.onPress();
    }
    draw(ctx) {
      const f = this.focused();
      for (const w of this.visible()) drawWidget(ctx, w, w === f, this.t);
    }
  }

  function drawWidget(ctx, w, focus, t) {
    if (w.draw) return w.draw(ctx, w, focus, t);
    const s = 1 + w.pulse * 0.05 + (focus ? 0.02 : 0);
    ctx.save();
    ctx.translate(w.x + w.w / 2, w.y + w.h / 2);
    ctx.scale(s, s);
    const x = -w.w / 2;
    const y = -w.h / 2;
    const accent = w.color || '#ffcc33';
    if (focus) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 22;
    }
    const g = ctx.createLinearGradient(0, y, 0, y + w.h);
    if (w.disabled) {
      g.addColorStop(0, 'rgba(60,60,70,0.8)');
      g.addColorStop(1, 'rgba(30,30,40,0.8)');
    } else if (focus) {
      g.addColorStop(0, SB.shade(accent, 0.25));
      g.addColorStop(1, SB.shade(accent, -0.35));
    } else {
      g.addColorStop(0, 'rgba(45,40,80,0.92)');
      g.addColorStop(1, 'rgba(20,16,40,0.92)');
    }
    SB.roundRect(ctx, x, y, w.w, w.h, 12);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = focus ? '#ffffff' : 'rgba(255,255,255,0.25)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    SB.roundRect(ctx, x + 3, y + 3, w.w - 6, w.h * 0.42, 9);
    ctx.fill();
    const tc = focus ? '#1a0f2e' : '#ffffff';
    ctx.textBaseline = 'middle';
    if (w.kind === 'spinner') {
      ctx.font = `700 ${w.small ? 13 : 15}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = focus ? '#2a1a40' : 'rgba(220,220,255,0.75)';
      if (w.label) ctx.fillText(w.label, x + 14, y + w.h / 2);
      ctx.font = `900 ${w.small ? 15 : 18}px ${FONT}`;
      ctx.textAlign = w.label ? 'right' : 'center';
      ctx.fillStyle = tc;
      const val = w.get();
      ctx.fillText(val, w.label ? x + w.w - 34 : 0, y + w.h / 2 + 1);
      // arrows
      ctx.fillStyle = focus ? '#1a0f2e' : accent;
      const ay = y + w.h / 2;
      ctx.beginPath();
      ctx.moveTo(x + w.w - 12, ay);
      ctx.lineTo(x + w.w - 22, ay - 7);
      ctx.lineTo(x + w.w - 22, ay + 7);
      ctx.fill();
      if (!w.label) {
        ctx.beginPath();
        ctx.moveTo(x + 12, ay);
        ctx.lineTo(x + 22, ay - 7);
        ctx.lineTo(x + 22, ay + 7);
        ctx.fill();
      }
    } else {
      ctx.font = `900 ${w.size || 22}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = tc;
      ctx.fillText(w.label, 0, 1);
      if (w.sub) {
        ctx.font = `600 13px ${FONT}`;
        ctx.fillStyle = focus ? '#2a1a40' : 'rgba(220,220,255,0.7)';
        ctx.fillText(w.sub, 0, w.h / 2 - 12);
      }
    }
    ctx.restore();
    void TAU;
  }

  const button = (x, y, w, h, label, onPress, extra) => Object.assign({ kind: 'button', x, y, w, h, label, onPress }, extra || {});
  const spinner = (x, y, w, h, label, get, onChange, extra) => Object.assign({ kind: 'spinner', x, y, w, h, label, get, onChange }, extra || {});

  SB.UI = { Menu, button, spinner, FONT };
})();
