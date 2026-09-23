// Renders every character's poses and attack frames (with hitboxes) into
// PNG sheets for visual inspection: node tests/pose-sheet.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(900);
  const sheets = await page.evaluate(() => {
    const out = {};
    const states = ['IDLE', 'CROUCH', 'jumpsquat', 'rise', 'fall', 'wall', 'hurt', 'hurtAir', 'tumble', 'helpless', 'lying', 'grabbed', 'tuck', 'dashStart', 'skid', 'victory', 'HOLD'];
    for (const c of SB.ROSTER) {
      const moves = Object.values(c.moveset);
      const cols = 8;
      const cell = 190;
      const items = states.map((s) => ({ kind: 'state', name: s })).concat(moves.map((m) => ({ kind: 'move', m })));
      const rows = Math.ceil(items.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * cell;
      cv.height = rows * cell;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#2b2f45';
      ctx.fillRect(0, 0, cv.width, cv.height);
      items.forEach((it, i) => {
        const x = (i % cols) * cell;
        const y = Math.floor(i / cols) * cell;
        ctx.strokeStyle = '#444a66';
        ctx.strokeRect(x, y, cell, cell);
        const gx = x + cell / 2 - 10;
        const gy = y + cell - 38;
        ctx.fillStyle = '#556';
        ctx.fillRect(x, gy, cell, 2);
        let pose;
        let label;
        let hbs = [];
        if (it.kind === 'state') {
          pose = c.poses[it.name];
          label = it.name;
        } else {
          const m = it.m;
          let f = m.hit.length ? m.hit[0].f[0] + 1 : Math.floor(m.frames * 0.35);
          pose = SB.Skel.sample(m.compiled, f, {});
          label = m.id + ' f' + f;
          hbs = m.hit.filter((h) => h.f[0] <= f && h.f[1] >= f);
        }
        const J = SB.Skel.solve(pose, c.prop, {});
        const sc = c.id === 'titan' ? 0.95 : 1.1;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(sc, sc);
        SB.FighterRenderer.drawBody(ctx, c, c.palettes[0], J, { t: 0, toLocal: (p) => p });
        for (const h of hbs) {
          const p = typeof h.bone === 'string' ? J[h.bone] : h.bone;
          ctx.fillStyle = h.grab ? 'rgba(170,80,255,0.4)' : 'rgba(255,40,40,0.4)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, h.r * c.stats.hbs, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,0,0.6)';
        ctx.strokeRect(-c.w / 2, -c.h, c.w, c.h);
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.font = '13px sans-serif';
        ctx.fillText(label, x + 6, y + cell - 10);
      });
      out[c.id] = cv.toDataURL('image/png');
    }
    return out;
  });
  const dir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  for (const id in sheets) {
    fs.writeFileSync(path.join(dir, 'poses-' + id + '.png'), Buffer.from(sheets[id].split(',')[1], 'base64'));
    console.log('wrote poses-' + id + '.png');
  }
  await browser.close();
})();
