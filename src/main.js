// Boot: canvas sizing, fixed-timestep game loop and screen management.
'use strict';
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  SB.isElectron = /electron/i.test(navigator.userAgent);
  let scale = 1;

  function resize() {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const aspect = SB.W / SB.H;
    let cw = ww;
    let ch = ww / aspect;
    if (ch > wh) {
      ch = wh;
      cw = wh * aspect;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.min(Math.round(cw * dpr), 2560);
    canvas.width = px;
    canvas.height = Math.round(px / aspect);
    canvas.style.width = Math.round(cw) + 'px';
    canvas.style.height = Math.round(ch) + 'px';
    scale = canvas.width / SB.W;
  }
  window.addEventListener('resize', resize);
  resize();
  SB.input.attachMouse(canvas);

  SB.toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) {
      /* not supported */
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F11' && !SB.isElectron) {
      e.preventDefault();
      SB.toggleFullscreen();
    }
  });

  const app = (SB.app = {
    screen: null,
    go(s) {
      if (this.screen && this.screen.exit) this.screen.exit();
      this.screen = s;
      s.enter && s.enter();
    },
  });

  let error = null;
  function showError(e) {
    error = e;
    console.error(e);
  }
  window.addEventListener('error', (e) => showError(e.error || e.message));

  const STEP = 1000 / 60;
  let acc = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // tab was hidden; don't spiral
    acc += dt;
    try {
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        SB.input.beginFrame();
        app.screen.update();
        SB.input.afterFrame();
        acc -= STEP;
        steps++;
      }
      if (steps === 5) acc = 0;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      app.screen.draw(ctx);
    } catch (e) {
      showError(e);
    }
    if (error) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, SB.H - 60, SB.W, 60);
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Error: ' + String((error && error.stack) || error).split('\n').slice(0, 2).join(' | '), 10, SB.H - 30);
    }
  }

  app.go(new SB.Screens.TitleScreen());
  requestAnimationFrame(frame);
})();
