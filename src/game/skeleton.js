// 2D skeletal rig shared by gameplay (bone-attached hitboxes) and rendering.
//
// Local space: fighter faces +x, feet at (0,0), y grows downward.
// Angle convention for limbs: 0 = pointing straight down, +PI/2 = pointing
// forward (+x), PI = pointing up. Elbow bends are added (forward/up),
// knee bends are subtracted (knees point forward).
'use strict';
(function () {
  const NEUTRAL = {
    lean: 0.06, head: 0, bx: 0, by: 0,
    aS: 0.25, aE: 0.5, bS: -0.2, bE: 0.55,
    aH: 0.15, aK: 0.2, bH: -0.12, bK: 0.2,
    fa: 9, fb: -9, ikA: 1, ikB: 1,
    spin: 0, sx: 1, sy: 1, wpn: 0,
  };
  // Resolved poses only carry these numeric channels (IK already baked in).
  const CH = ['lean', 'head', 'bx', 'by', 'aS', 'aE', 'bS', 'bE', 'aH', 'aK', 'bH', 'bK', 'spin', 'sx', 'sy', 'wpn'];

  function hipHeight(prop) {
    return (prop.thigh + prop.shin) * 0.94;
  }

  // Two-bone IK: returns [thighAngle, kneeBend] so the foot reaches (fx, fy).
  function legIK(hx, hy, fx, fy, t, s) {
    let dx = fx - hx;
    let dy = fy - hy;
    let d = Math.hypot(dx, dy);
    const max = (t + s) * 0.999;
    if (d > max) {
      dx *= max / d;
      dy *= max / d;
      d = max;
    }
    if (d < 1e-3) return [0, 0];
    const ux = dx / d;
    const uy = dy / d;
    const cosA = SB.clamp((t * t + d * d - s * s) / (2 * t * d), -1, 1);
    const a = Math.acos(cosA);
    // Rotate toward +x (knee forward).
    const kx = hx + t * (ux * Math.cos(-a) - uy * Math.sin(-a));
    const ky = hy + t * (ux * Math.sin(-a) + uy * Math.cos(-a));
    const psi = Math.atan2(kx - hx, ky - hy);
    const sig = Math.atan2(hx + dx - kx, hy + dy - ky);
    return [psi, psi - sig];
  }

  // Convert an authoring pose (may contain IK foot targets) into pure angles.
  function resolve(p, prop, out) {
    out = out || {};
    for (const k of CH) out[k] = p[k] !== undefined ? p[k] : NEUTRAL[k];
    const hx = out.bx;
    const hy = -hipHeight(prop) + out.by;
    if (p.ikA) {
      const r = legIK(hx, hy, p.fa !== undefined ? p.fa : NEUTRAL.fa, 0, prop.thigh, prop.shin);
      out.aH = r[0];
      out.aK = r[1];
    }
    if (p.ikB) {
      const r = legIK(hx, hy, p.fb !== undefined ? p.fb : NEUTRAL.fb, 0, prop.thigh, prop.shin);
      out.bH = r[0];
      out.bK = r[1];
    }
    return out;
  }

  const dirX = (a) => Math.sin(a);
  const dirY = (a) => Math.cos(a);

  // Forward kinematics -> joint positions in local space.
  function solve(r, prop, J) {
    J = J || {};
    const hipY = -hipHeight(prop) + r.by;
    const hip = { x: r.bx, y: hipY };
    const T = prop.torso;
    const neck = { x: hip.x + T * Math.sin(r.lean), y: hip.y - T * Math.cos(r.lean) };
    const sh = { x: hip.x + (neck.x - hip.x) * 0.86, y: hip.y + (neck.y - hip.y) * 0.86 };
    const hd = prop.neck + prop.headR;
    const ha = r.lean + r.head;
    const head = { x: neck.x + hd * Math.sin(ha), y: neck.y - hd * Math.cos(ha) };

    const phiA = r.lean + r.aS;
    const elA = { x: sh.x + prop.upperArm * dirX(phiA), y: sh.y + prop.upperArm * dirY(phiA) };
    const phiA2 = phiA + r.aE;
    const haA = { x: elA.x + prop.foreArm * dirX(phiA2), y: elA.y + prop.foreArm * dirY(phiA2) };

    const shB = { x: sh.x - 3, y: sh.y };
    const phiB = r.lean + r.bS;
    const elB = { x: shB.x + prop.upperArm * dirX(phiB), y: shB.y + prop.upperArm * dirY(phiB) };
    const phiB2 = phiB + r.bE;
    const haB = { x: elB.x + prop.foreArm * dirX(phiB2), y: elB.y + prop.foreArm * dirY(phiB2) };

    const knA = { x: hip.x + prop.thigh * dirX(r.aH), y: hip.y + prop.thigh * dirY(r.aH) };
    const sA = r.aH - r.aK;
    const ftA = { x: knA.x + prop.shin * dirX(sA), y: knA.y + prop.shin * dirY(sA) };
    const hipB = { x: hip.x - 2, y: hip.y };
    const knB = { x: hipB.x + prop.thigh * dirX(r.bH), y: hipB.y + prop.thigh * dirY(r.bH) };
    const sB = r.bH - r.bK;
    const ftB = { x: knB.x + prop.shin * dirX(sB), y: knB.y + prop.shin * dirY(sB) };

    const wl = prop.weapon || 0;
    const wa = phiA2 + r.wpn;
    const wtip = { x: haA.x + wl * dirX(wa), y: haA.y + wl * dirY(wa) };
    const wmid = { x: haA.x + wl * 0.55 * dirX(wa), y: haA.y + wl * 0.55 * dirY(wa) };

    const body = { x: (hip.x + neck.x) / 2, y: (hip.y + neck.y) / 2 };
    const pts = { hip, hipB, neck, sh, shB, head, elA, haA, elB, haB, knA, ftA, knB, ftB, wtip, wmid, body };

    // Whole-body spin around the torso centre, then squash & stretch from the feet.
    const s = r.spin;
    const cs = Math.cos(s);
    const sn = Math.sin(s);
    const px = body.x;
    const py = body.y;
    for (const k in pts) {
      const p = pts[k];
      if (s !== 0) {
        const dx = p.x - px;
        const dy = p.y - py;
        p.x = px + dx * cs - dy * sn;
        p.y = py + dx * sn + dy * cs;
      }
      p.x *= r.sx;
      p.y *= r.sy;
      J[k] = p;
    }
    J.ang = {
      torso: r.lean + s, head: ha + s,
      uA: phiA + s, fA: phiA2 + s, uB: phiB + s, fB: phiB2 + s,
      tA: r.aH + s, sA: sA + s, tB: r.bH + s, sB: sB + s, wpn: wa + s,
    };
    return J;
  }

  // Compile keyframes (each key only lists the channels that change) into
  // resolved angle poses for one character's proportions.
  function compile(keys, prop, base) {
    let acc = Object.assign({}, NEUTRAL, base || {});
    const out = [];
    for (const [f, k, ease] of keys) {
      acc = Object.assign({}, acc, k);
      out.push({ f, pose: resolve(acc, prop), ease: ease || 'smooth', ik: !!(acc.ikA || acc.ikB) });
    }
    return out;
  }

  function sample(compiled, t, out) {
    out = out || {};
    if (!compiled.length) return Object.assign(out, NEUTRAL);
    if (t <= compiled[0].f) return Object.assign(out, compiled[0].pose);
    for (let i = 0; i < compiled.length - 1; i++) {
      const a = compiled[i];
      const b = compiled[i + 1];
      if (t >= a.f && t <= b.f) {
        let u = (t - a.f) / Math.max(1e-6, b.f - a.f);
        if (b.ease === 'smooth') u = SB.smooth(u);
        else if (b.ease === 'out') u = SB.easeOut(u);
        else if (b.ease === 'in') u = SB.easeIn(u);
        else if (b.ease === 'step') u = 0;
        for (const k of CH) out[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * u;
        return out;
      }
    }
    return Object.assign(out, compiled[compiled.length - 1].pose);
  }

  // Whether the keyframe governing time t was authored with grounded (IK) legs.
  function keyIk(compiled, t) {
    let ik = compiled.length ? compiled[0].ik : true;
    for (const k of compiled) {
      if (k.f <= t) ik = k.ik;
      else break;
    }
    return ik;
  }

  function blend(cur, target, t) {
    // Take the short way round for whole-body spins so flips don't rewind.
    const TAU = Math.PI * 2;
    while (target.spin - cur.spin > Math.PI) cur.spin += TAU;
    while (cur.spin - target.spin > Math.PI) cur.spin -= TAU;
    for (const k of CH) cur[k] = cur[k] + (target[k] - cur[k]) * t;
    return cur;
  }

  SB.Skel = { NEUTRAL, CH, resolve, solve, compile, sample, keyIk, blend, hipHeight, legIK };
})();
