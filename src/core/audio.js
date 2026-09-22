// Procedural sound effects + a small step-sequencer for background music.
// Everything is synthesised with WebAudio so the game has no asset files.
'use strict';
(function () {
  let ctx = null;
  let master, musicBus, sfxBus, noiseBuf;

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (e) {
      return false;
    }
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    applyVolumes();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    master.gain.value = SB.settings.master;
    musicBus.gain.value = SB.settings.music * 0.55;
    sfxBus.gain.value = SB.settings.sfx;
  }

  function unlock() {
    if (!init()) return;
    const kick = () => {
      if (pendingTrack && !musicTimer) startMusic(pendingTrack);
    };
    if (ctx.state === 'suspended') ctx.resume().then(kick, () => {});
    else kick();
  }

  const now = () => ctx.currentTime;

  function env(g, t, a, peak, dec, sustain = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + dec);
  }

  function tone(type, f0, f1, dur, vol, bus = sfxBus, t = now(), attack = 0.004) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    env(g, t, attack, vol, dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  function noise(filterType, f0, f1, q, dur, vol, bus = sfxBus, t = now(), attack = 0.003) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain();
    env(g, t, attack, vol, dur);
    s.connect(f);
    f.connect(g);
    g.connect(bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + attack + dur + 0.05);
  }

  const lastPlayed = {};
  // Throttle identical sounds so 4 fighters landing at once don't clip.
  function gate(name, ms) {
    const t = performance.now();
    if (lastPlayed[name] && t - lastPlayed[name] < ms) return false;
    lastPlayed[name] = t;
    return true;
  }

  const SFX = {
    hit(strength = 0.5, kind = 'punch') {
      const s = SB.clamp(strength, 0.1, 1.5);
      tone('sine', 180 + s * 60, 40, 0.12 + s * 0.12, 0.5 + s * 0.4);
      if (kind === 'slash') {
        noise('highpass', 3000, 1200, 1, 0.12 + s * 0.1, 0.35 + s * 0.3);
        tone('sawtooth', 1400, 500, 0.08, 0.08);
      } else if (kind === 'fire') {
        noise('lowpass', 2500, 300, 0.8, 0.25 + s * 0.2, 0.5 + s * 0.3);
      } else if (kind === 'elec') {
        tone('square', 900, 120, 0.15 + s * 0.1, 0.12);
        noise('bandpass', 5000, 1500, 3, 0.15, 0.3);
      } else {
        noise('bandpass', 1800, 500, 1.2, 0.08 + s * 0.12, 0.45 + s * 0.35);
      }
      if (s > 0.9) noise('lowpass', 900, 100, 0.7, 0.45, 0.4);
    },
    swing(size = 0.5) {
      if (!gate('swing', 40)) return;
      noise('bandpass', 600 + size * 300, 2400, 2, 0.12 + size * 0.08, 0.08 + size * 0.07);
    },
    jump() {
      if (!gate('jump', 30)) return;
      tone('sine', 280, 560, 0.1, 0.12);
      noise('highpass', 2000, 4000, 1, 0.05, 0.05);
    },
    djump() {
      tone('triangle', 400, 900, 0.12, 0.12);
    },
    land() {
      if (!gate('land', 50)) return;
      noise('lowpass', 700, 200, 1, 0.09, 0.15);
    },
    shield() {
      tone('triangle', 900, 600, 0.12, 0.15);
      noise('highpass', 5000, 3000, 1, 0.06, 0.12);
    },
    shieldBreak() {
      tone('square', 600, 80, 0.6, 0.2);
      noise('highpass', 6000, 800, 1, 0.5, 0.3);
    },
    grab() {
      noise('bandpass', 1200, 900, 3, 0.06, 0.2);
    },
    throw() {
      noise('bandpass', 500, 2000, 1.5, 0.2, 0.2);
    },
    dodge() {
      noise('highpass', 1500, 6000, 1, 0.15, 0.08);
    },
    ledge() {
      tone('sine', 300, 250, 0.05, 0.15);
    },
    clank() {
      tone('square', 1600, 1500, 0.15, 0.12);
      tone('square', 2130, 2000, 0.15, 0.08);
    },
    projectile(kind) {
      if (kind === 'fire') noise('lowpass', 1800, 400, 1, 0.2, 0.25);
      else if (kind === 'elec') tone('sawtooth', 1200, 400, 0.12, 0.08);
      else noise('bandpass', 2000, 4000, 2, 0.1, 0.15);
    },
    explosion(big = 1) {
      tone('sine', 120, 30, 0.5 * big, 0.7);
      noise('lowpass', 3000, 80, 0.6, 0.7 * big, 0.7);
    },
    ko() {
      tone('sine', 90, 25, 1.2, 0.9);
      noise('lowpass', 5000, 60, 0.5, 1.4, 0.8);
      tone('sawtooth', 800, 60, 0.9, 0.1);
    },
    heal() {
      [0, 0.07, 0.14].forEach((d, i) => tone('triangle', 600 + i * 200, 800 + i * 200, 0.12, 0.12, sfxBus, now() + d));
    },
    power() {
      [0, 0.06, 0.12, 0.18, 0.24].forEach((d, i) => tone('square', 300 * Math.pow(1.26, i), 300 * Math.pow(1.26, i + 1), 0.1, 0.07, sfxBus, now() + d));
    },
    charge() {
      if (!gate('charge', 120)) return;
      tone('sine', 300, 700, 0.12, 0.05);
    },
    menuMove() {
      if (!gate('menuMove', 30)) return;
      tone('square', 880, 880, 0.04, 0.05);
    },
    menuSelect() {
      tone('square', 660, 660, 0.05, 0.07);
      tone('square', 990, 990, 0.08, 0.07, sfxBus, now() + 0.05);
    },
    menuBack() {
      tone('square', 500, 300, 0.1, 0.06);
    },
    countdown(go) {
      if (go) {
        tone('square', 880, 880, 0.5, 0.12);
        tone('square', 1320, 1320, 0.5, 0.08);
      } else tone('square', 440, 440, 0.18, 0.12);
    },
    game() {
      tone('sawtooth', 220, 110, 1.4, 0.2);
      tone('square', 330, 165, 1.4, 0.12);
      noise('lowpass', 2000, 100, 0.5, 1.2, 0.4);
    },
    cheer() {
      noise('bandpass', 1400, 1100, 0.6, 1.8, 0.12, sfxBus, now(), 0.4);
    },
  };

  function play(name, ...args) {
    if (!ctx || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (fn) {
      try {
        fn(...args);
      } catch (e) {
        /* audio should never crash the game */
      }
    }
  }

  // ------------------------------------------------------------------ music
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // Each track: tempo, chord roots (midi), scale for melody, drum style.
  const TRACKS = {
    menu: { bpm: 104, roots: [57, 53, 48, 55], minor: true, drums: 'soft', lead: 'triangle' },
    sky: { bpm: 142, roots: [50, 58, 53, 57], minor: true, drums: 'rock', lead: 'square' },
    space: { bpm: 128, roots: [52, 48, 55, 50], minor: true, drums: 'four', lead: 'sawtooth' },
    volcano: { bpm: 156, roots: [45, 45, 48, 43], minor: true, drums: 'rock', lead: 'sawtooth' },
    city: { bpm: 120, roots: [53, 55, 52, 57], minor: false, drums: 'four', lead: 'square' },
    results: { bpm: 112, roots: [48, 53, 55, 48], minor: false, drums: 'soft', lead: 'triangle' },
  };
  let musicTimer = null;
  let pendingTrack = null;
  let seqStep = 0;
  let nextTime = 0;
  let current = null;
  let melodyRng = SB.seeded(7);
  let melody = [];

  function buildMelody(track) {
    melodyRng = SB.seeded(track.bpm * 13 + track.roots[0]);
    const scale = track.minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12];
    melody = [];
    // Two bars of melody per chord, 16th-note grid, with a repeating motif.
    const motif = [];
    for (let i = 0; i < 16; i++) motif.push(melodyRng() < 0.55 ? scale[Math.floor(melodyRng() * scale.length)] : null);
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < 16; i++) {
        let n = motif[i];
        if (c === 3 && i > 8) n = melodyRng() < 0.5 ? scale[Math.floor(melodyRng() * scale.length)] : null;
        melody.push(n);
      }
    }
  }

  function scheduleStep(step, t) {
    const tr = current;
    const sixteenth = 60 / tr.bpm / 4;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = tr.roots[bar];
    // Bass: driving eighths
    if (s % 2 === 0) {
      const oct = s % 8 === 6 ? 12 : 0;
      bass(NOTE(root - 12 + oct), sixteenth * 1.8, t);
    }
    // Pads: chord on bar start
    if (s === 0) {
      const third = tr.minor ? 3 : 4;
      [0, third, 7].forEach((iv) => pad(NOTE(root + 12 + iv), sixteenth * 15, t));
    }
    // Lead melody (skip first 4 bars of each 8-bar loop for variety)
    const loopBar = Math.floor(step / 16) % 8;
    const m = melody[(bar * 16 + s) % melody.length];
    if (loopBar >= 4 && m !== null && m !== undefined) lead(NOTE(root + 24 + m), sixteenth * 1.6, t, tr.lead);
    // Arpeggio in the first half
    if (loopBar < 4 && s % 2 === 1) {
      const third = tr.minor ? 3 : 4;
      const arp = [0, third, 7, 12][(s >> 1) % 4];
      lead(NOTE(root + 24 + arp), sixteenth * 0.9, t, 'triangle', 0.035);
    }
    // Drums
    if (tr.drums === 'rock') {
      if (s === 0 || s === 8 || s === 10) kick(t);
      if (s === 4 || s === 12) snare(t);
      if (s % 2 === 0) hat(t, 0.03);
    } else if (tr.drums === 'four') {
      if (s % 4 === 0) kick(t);
      if (s === 4 || s === 12) snare(t);
      if (s % 4 === 2) hat(t, 0.05);
      else if (s % 2 === 1) hat(t, 0.015);
    } else {
      if (s === 0 || s === 10) kick(t, 0.5);
      if (s === 8) snare(t, 0.4);
      if (s % 4 === 2) hat(t, 0.02);
    }
  }

  function bass(f, dur, t) {
    const o = ctx.createOscillator();
    const fl = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f;
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(900, t);
    fl.frequency.exponentialRampToValueAtTime(200, t + dur);
    env(g, t, 0.01, 0.16, dur);
    o.connect(fl);
    fl.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function pad(f, dur, t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    o.detune.value = SB.rand(-6, 6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function lead(f, dur, t, type, vol = 0.05) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 3200;
    o.type = type;
    o.frequency.value = f;
    env(g, t, 0.01, vol, dur);
    o.connect(fl);
    fl.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function kick(t, v = 0.8) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    env(g, t, 0.002, v * 0.6, 0.16);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + 0.25);
  }
  function snare(t, v = 0.7) {
    noise('bandpass', 1800, 1500, 0.8, 0.14, v * 0.3, musicBus, t, 0.001);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    env(g, t, 0.001, v * 0.15, 0.08);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + 0.15);
  }
  function hat(t, v) {
    noise('highpass', 8000, 8000, 1, 0.04, v * 2, musicBus, t, 0.001);
  }

  let currentName = null;
  function startMusic(name) {
    pendingTrack = name;
    if (!ctx || ctx.state !== 'running') return;
    if (musicTimer && currentName === name) return;
    stopMusic(true);
    currentName = name;
    current = TRACKS[name] || TRACKS.menu;
    buildMelody(current);
    seqStep = 0;
    nextTime = now() + 0.1;
    musicTimer = setInterval(() => {
      if (!ctx || !current) return;
      const sixteenth = 60 / current.bpm / 4;
      while (nextTime < now() + 0.25) {
        try {
          scheduleStep(seqStep, nextTime);
        } catch (e) {
          /* ignore */
        }
        seqStep++;
        nextTime += sixteenth;
      }
    }, 50);
  }

  function stopMusic(keepPending) {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    current = null;
    currentName = null;
    if (!keepPending) pendingTrack = null;
  }

  SB.audio = { unlock, play, startMusic, stopMusic, applyVolumes, get ready() { return !!ctx && ctx.state === 'running'; } };
})();
