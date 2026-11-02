import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import TipButton from './TipButton.jsx';
import { makeRng } from './mapgen.js';
import {
  readVoidMap, BODY_KINDS, FIELD_KINDS, SIDES, STATES, newVoidId,
  reach, moveCheck, moveShip, turnShip, snapToSquare, distanceVU, bearing,
  inField, applyDrift, arcWedges, weaponsBearing, ARC_SLOTS, ARC_DEFAULTS, MIN_ARC,
  rotateThing, rotateScene, clearChart, removeThing, togglePins, togglePin, isPinned, overlayWedges
} from './voidmap.js';

/* The void chart: a star system's fight laid out in Void Units.

   Everything numeric (distance, what is in the way, what a move would cost)
   lives in voidmap.js and is checked there. This file is the canvas and the
   controls. The chart is drawn in world coordinates, 1 VU to a unit, under
   one transform; labels are drawn after it in screen space so they stay a
   readable size at any zoom. */

/* ---- icons: the same drawn-here, 24-grid set the boarding map uses ---- */
const ICONS = {
  select: <><path d="M5 3l14 8-6 2-2 6z" /></>,
  pan: <><path d="M12 2v20M2 12h20" /><path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" /></>,
  measure: <><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5M8 11h6" /></>,
  fit: <><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></>,
  grid: <><path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" /></>,
  wells: <><circle cx="12" cy="12" r="3" fill="currentColor" /><circle cx="12" cy="12" r="8" strokeDasharray="3 3" /></>,
  drift: <><path d="M3 8h13M12 4l4 4-4 4M3 16h13M12 12l4 4-4 4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></>,
  hide: <><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4 10 6-.7 1-1.8 2.3-3.2 3.4M6.5 7.3C4.2 8.8 2.6 10.9 2 12c1.5 2 5 6 10 6 1.5 0 2.8-.3 4-.9" /></>,
  show: <><path d="M2 12c1.5-2 5-6 10-6s8.5 4 10 6c-1.5 2-5 6-10 6S3.5 14 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  full: <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>,
  erase: <><path d="M4 15l9-9 6 6-7 7H8z" /><path d="M9 10l6 6M13 20h7" /></>,
  pin: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="8" strokeDasharray="2 3" /></>,
  spinLeft: <><path d="M3 4v6h6" /><path d="M5.5 15a8 8 0 105-9.5L3 10" /><path d="M12 9v4l2 2" /></>,
  spinRight: <><path d="M21 4v6h-6" /><path d="M18.5 15a8 8 0 11-5-9.5L21 10" /><path d="M12 9v4l-2 2" /></>,
  clean: <><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4 10 6-.7 1-1.8 2.3-3.2 3.4M6.5 7.3C4.2 8.8 2.6 10.9 2 12c1.5 2 5 6 10 6 1.5 0 2.8-.3 4-.9" /></>,
  charts: <><path d="M4 5h16v4H4zM4 11h16v4H4zM4 17h16v3H4z" /></>,
  exportPng: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
  arcs: <><path d="M12 20L4.5 8.5a14 14 0 0115 0z" /><path d="M12 20V10" strokeDasharray="2 2" /></>,
  allArcs: <><path d="M12 14L7 6a9 9 0 0110 0z" /><path d="M12 14l-7 4M12 14l7 4" /><circle cx="12" cy="14" r="1.5" fill="currentColor" /></>,
  base: <><circle cx="12" cy="14" r="6" /><path d="M12 14V3M9 6l3-3 3 3" /></>,
  turnLeft: <><path d="M3 4v6h6" /><path d="M5.5 15a8 8 0 105-9.5L3 10" /></>,
  turnRight: <><path d="M21 4v6h-6" /><path d="M18.5 15a8 8 0 11-5-9.5L21 10" /></>
};

function Ico({ name, size = 18 }) {
  return (
    <svg className="rt-ico" viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// The chart's own glyphs in the shared button, so its toolbar names itself
// under the pointer the way the battle map's does.
function IconButton({ icon, label, onClick, on = false, disabled = false }) {
  return (
    <TipButton label={label} onClick={onClick} on={on} disabled={disabled}>
      <Ico name={icon} />
    </TipButton>
  );
}

/* ---- colours ---- */

// Port and starboard take the colours of a ship's running lights.
const SLOT_COLOUR = { prow: '#ffd24a', port: '#ff6b6b', starboard: '#6bff95', dorsal: '#b48cff', '': '#4fd6c8' };
const slotName = (slot) => (slot ? slot[0].toUpperCase() + slot.slice(1) : 'All-round');

const SIDE_COLOUR = { player: '#e0b34a', ally: '#6bd08f', enemy: '#e5574f', neutral: '#9aa7b4' };
const SIDE_NAME = { player: 'Crew', ally: 'Ally', enemy: 'Hostile', neutral: 'Neutral' };
const STATE_NAME = { seen: 'Seen', ping: 'Contact only', hidden: 'Hidden from the table' };

const toRgb = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (h, a) => { const [r, g, b] = toRgb(h); return `rgba(${r},${g},${b},${a})`; };
const mixHex = (h, to, t) => {
  const a = toRgb(h);
  const b = toRgb(to);
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`;
};

// A hull's length on the chart, in VU, by class. A drawn size, not a rule.
const hullLength = (cls) => {
  const c = String(cls || '');
  if (/battle|grand/i.test(c)) return 2.8;
  if (/light cruiser/i.test(c)) return 1.7;
  if (/cruiser|monitor/i.test(c)) return 2.2;
  if (/escort|frigate|raider|transport/i.test(c)) return 1.3;
  return 1.6;
};

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/* ---- scenery that is drawn, not stored ----
   Stars in the sky, rocks in a belt, wisps in a cloud. All of it comes from the
   map's seed and each thing's id, in the thing's own local frame, so dragging a
   field carries its rocks with it and the same scene always looks the same. */
function sceneryFor(map) {
  const rng = makeRng(`specks|${map.seed}|${map.cols}|${map.rows}`);
  const n = Math.round(map.cols * map.rows * 0.18);
  const specks = Array.from({ length: n }, () => ({
    x: rng() * map.cols, y: rng() * map.rows, a: 0.25 + rng() * 0.6, s: rng() < 0.08 ? 2 : 1
  }));
  const fields = {};
  for (const f of map.fields) {
    const fr = makeRng(`field|${f.id}`);
    if (f.kind === 'dust_cloud' || f.kind === 'nebula') {
      fields[f.id] = Array.from({ length: 11 }, () => ({
        a: fr() * Math.PI * 2, d: Math.sqrt(fr()), k: 0.45 + fr() * 0.4, o: 0.6 + fr() * 0.4
      }));
    } else if (f.kind === 'gravity_riptide') {
      fields[f.id] = [];
    } else {
      const area = f.shape === 'band'
        ? f.w * Math.min(Math.hypot(f.x2 - f.x, f.y2 - f.y), Math.hypot(map.cols, map.rows))
        : Math.PI * f.r * f.r;
      const count = Math.min(420, Math.round(area * 0.32));
      fields[f.id] = Array.from({ length: count }, () => ({
        u: fr(), v: fr() * 2 - 1, a: fr() * Math.PI * 2, d: Math.sqrt(fr()),
        s: 0.1 + fr() * fr() * 0.42, sides: 5 + Math.floor(fr() * 3), o: 0.4 + fr() * 0.5
      }));
    }
  }
  return { specks, fields };
}

/* ---- drawing ---- */

function polygon(ctx, x, y, r, sides, seed, rough = 0.28, turn = 0) {
  const rng = makeRng(`poly|${seed}`);
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + turn;
    const rr = r * (1 - rough + rng() * rough * 1.6);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawBody(ctx, b, lightDir, scale, sel) {
  const lw = 1 / scale;
  if (b.air > 0) {
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.97, b.x, b.y, b.r * (1.06 + 0.07 * b.air));
    g.addColorStop(0, rgba(b.tone, 0.6));
    g.addColorStop(1, rgba(b.tone, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.06 + 0.07 * b.air), 0, Math.PI * 2); ctx.fill();
  }
  if (b.kind === 'planet' || b.kind === 'gas_giant' || b.kind === 'moon') {
    const g = ctx.createRadialGradient(
      b.x + lightDir.x * b.r * 0.5, b.y + lightDir.y * b.r * 0.5, b.r * 0.08,
      b.x, b.y, b.r * 1.08
    );
    g.addColorStop(0, mixHex(b.tone, '#ffffff', 0.38));
    g.addColorStop(0.55, b.tone);
    g.addColorStop(1, mixHex(b.tone, '#000000', 0.82));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    if (b.kind !== 'gas_giant') {
      // Darker patches of land and crater, turned with the body: a planet is
      // otherwise a circle, and a circle cannot be seen to have been rotated.
      ctx.save();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.clip();
      ctx.translate(b.x, b.y); ctx.rotate(((b.rot || 0) * Math.PI) / 180);
      const rr = makeRng(`surf|${b.id}`);
      const n = b.kind === 'moon' ? 4 : 6;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let i = 0; i < n; i++) {
        const a = rr() * Math.PI * 2;
        const dd = Math.sqrt(rr()) * b.r * 0.75;
        const wd = b.r * (0.14 + rr() * 0.22);
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * dd, Math.sin(a) * dd, wd * 1.5, wd, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (b.kind === 'gas_giant') {
      ctx.save();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.clip();
      ctx.translate(b.x, b.y);
      ctx.rotate(((b.rot || 0) * Math.PI) / 180);
      for (let i = 0; i < 9; i++) {
        const y = -b.r + (i + 0.5) * (2 * b.r / 9);
        ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.1)';
        ctx.fillRect(-b.r, y - b.r / 20, 2 * b.r, b.r / 10);
      }
      ctx.restore();
    }
  } else if (b.kind === 'asteroid') {
    polygon(ctx, b.x, b.y, b.r, 8, b.id, 0.28, ((b.rot || 0) * Math.PI) / 180);
    const g = ctx.createRadialGradient(b.x + lightDir.x * b.r * 0.4, b.y + lightDir.y * b.r * 0.4, 0, b.x, b.y, b.r * 1.2);
    g.addColorStop(0, mixHex(b.tone, '#ffffff', 0.3));
    g.addColorStop(1, mixHex(b.tone, '#000000', 0.7));
    ctx.fillStyle = g; ctx.fill();
  } else if (b.kind === 'station') {
    ctx.strokeStyle = b.tone; ctx.lineWidth = Math.max(lw * 1.5, b.r * 0.12);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    const sa = ((b.rot || 0) * Math.PI) / 180;
    const sx = Math.cos(sa) * b.r;
    const sy = Math.sin(sa) * b.r;
    ctx.moveTo(b.x - sx, b.y - sy); ctx.lineTo(b.x + sx, b.y + sy);
    ctx.moveTo(b.x + sy, b.y - sx); ctx.lineTo(b.x - sy, b.y + sx);
    ctx.stroke();
    ctx.fillStyle = mixHex(b.tone, '#000000', 0.45);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = b.tone; ctx.lineWidth = lw * 1.2; ctx.stroke();
  } else if (b.kind === 'contact') {
    // A ping: the table knows something is there, and roughly how large.
    ctx.setLineDash([4 * lw, 3 * lw]);
    ctx.strokeStyle = 'rgba(150,200,255,0.7)'; ctx.lineWidth = lw * 1.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(b.r, 6 / scale), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(150,200,255,0.12)';
    ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(b.r, 6 / scale), 0, Math.PI * 2); ctx.fill();
  } else if (b.kind === 'hulk') {
    const ang = ((b.rot || 0) * Math.PI) / 180;
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(ang);
    ctx.fillStyle = mixHex(b.tone, '#000000', 0.35);
    ctx.beginPath();
    ctx.moveTo(-b.r * 1.3, 0); ctx.lineTo(-b.r * 0.4, -b.r * 0.55); ctx.lineTo(b.r * 0.9, -b.r * 0.4);
    ctx.lineTo(b.r * 1.3, 0); ctx.lineTo(b.r * 0.7, b.r * 0.5); ctx.lineTo(-b.r * 0.5, b.r * 0.45);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = b.tone; ctx.lineWidth = lw * 1.3; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.moveTo(b.r * 0.1, -b.r * 0.5); ctx.lineTo(-b.r * 0.1, b.r * 0.5); ctx.stroke();
    ctx.restore();
  }
  if (b.state === 'hidden' || b.state === 'ping') {
    ctx.setLineDash([4 * lw, 3 * lw]);
    ctx.strokeStyle = b.state === 'hidden' ? 'rgba(255,120,120,0.6)' : 'rgba(150,200,255,0.55)';
    ctx.lineWidth = lw * 1.4;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.25 + 3 * lw, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (sel) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 1.6; ctx.setLineDash([5 * lw, 3 * lw]);
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4 * lw, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function fieldPath(ctx, f) {
  if (f.shape === 'band') {
    const dx = f.x2 - f.x;
    const dy = f.y2 - f.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (f.w / 2);
    const ny = (dx / len) * (f.w / 2);
    ctx.beginPath();
    ctx.moveTo(f.x + nx, f.y + ny); ctx.lineTo(f.x2 + nx, f.y2 + ny);
    ctx.lineTo(f.x2 - nx, f.y2 - ny); ctx.lineTo(f.x - nx, f.y - ny);
    ctx.closePath();
  } else {
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
  }
}

// A point in a field's own frame: circle (angle, radius fraction) or band (along, across).
function fieldPoint(f, s) {
  if (f.shape === 'band') {
    const dx = f.x2 - f.x;
    const dy = f.y2 - f.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: f.x + dx * s.u + (-dy / len) * (f.w / 2) * s.v,
      y: f.y + dy * s.u + (dx / len) * (f.w / 2) * s.v
    };
  }
  const t = s.a + ((f.rot || 0) * Math.PI) / 180;
  return { x: f.x + Math.cos(t) * f.r * s.d, y: f.y + Math.sin(t) * f.r * s.d };
}

function drawField(ctx, f, bits, scale, sel, map) {
  const lw = 1 / scale;
  ctx.save();
  const faint = f.state === 'hidden' ? 0.55 : 1;
  ctx.globalAlpha = faint;
  if (f.kind === 'dust_cloud' || f.kind === 'nebula') {
    const tint = f.kind === 'nebula' ? '#a58fd6' : '#b09a78';
    const turn = ((f.rot || 0) * Math.PI) / 180;
    for (const s of bits || []) {
      const cx = f.x + Math.cos(s.a + turn) * f.r * s.d * 0.7;
      const cy = f.y + Math.sin(s.a + turn) * f.r * s.d * 0.7;
      const rr = f.r * s.k;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, rgba(tint, 0.2 * s.o));
      g.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    }
  } else if (f.kind === 'gravity_riptide') {
    fieldPath(ctx, f);
    ctx.fillStyle = 'rgba(96,160,255,0.09)'; ctx.fill();
    // Chevrons along the centreline, pointing the way it carries a hull.
    const dx = f.x2 - f.x;
    const dy = f.y2 - f.y;
    const len = Math.hypot(dx, dy) || 1;
    const dir = f.drift ? Math.atan2(f.drift[1], f.drift[0]) : Math.atan2(dy, dx);
    ctx.strokeStyle = 'rgba(140,190,255,0.5)'; ctx.lineWidth = lw * 1.5;
    const step = 5;
    for (let t = 2; t < len; t += step) {
      const cx = f.x + (dx / len) * t;
      const cy = f.y + (dy / len) * t;
      if (cx < -2 || cy < -2 || cx > map.cols + 2 || cy > map.rows + 2) continue;
      const s = Math.min(1.1, f.w * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(dir + 2.5) * s, cy + Math.sin(dir + 2.5) * s);
      ctx.lineTo(cx + Math.cos(dir) * s * 0.4, cy + Math.sin(dir) * s * 0.4);
      ctx.lineTo(cx + Math.cos(dir - 2.5) * s, cy + Math.sin(dir - 2.5) * s);
      ctx.stroke();
    }
  } else {
    fieldPath(ctx, f);
    ctx.fillStyle = 'rgba(130,118,100,0.07)'; ctx.fill();
    for (const s of bits || []) {
      const p = fieldPoint(f, s);
      if (p.x < -1 || p.y < -1 || p.x > map.cols + 1 || p.y > map.rows + 1) continue;
      polygon(ctx, p.x, p.y, s.s, s.sides, `${f.id}|${s.a}`, 0.35);
      ctx.fillStyle = `rgba(150,140,124,${s.o})`; ctx.fill();
    }
  }
  if (f.state !== 'seen' || sel) {
    fieldPath(ctx, f);
    ctx.setLineDash([6 * lw, 4 * lw]);
    ctx.strokeStyle = sel ? '#fff' : f.state === 'hidden' ? 'rgba(255,120,120,0.55)' : 'rgba(150,200,255,0.5)';
    ctx.lineWidth = lw * (sel ? 1.6 : 1.2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawShip(ctx, s, scale, { sel, target, live, over, minis }) {
  const len = Math.max(hullLength(s.cls), 16 / scale);
  const wid = len * 0.55;
  const lw = 1 / scale;
  const x = live ? live.x : s.x;
  const y = live ? live.y : s.y;
  const colour = SIDE_COLOUR[s.side] || SIDE_COLOUR.neutral;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((s.heading * Math.PI) / 180);
  ctx.globalAlpha = s.state === 'hidden' ? 0.5 : 1;

  if (minis) {
    /* The model is on the table. Drawing a hull under it would fight it for the
       square, so the token is the ring the model's base stands in and a tick for
       the way it points: enough to read where it is and what it faces, and
       nothing a physical hull has to compete with. */
    const rr = Math.max(len * 0.55, 10 / scale);
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fillStyle = rgba(colour, 0.14); ctx.fill();
    ctx.lineWidth = lw * (sel ? 2.6 : 2);
    ctx.strokeStyle = sel ? '#ffffff' : target ? '#ffe28a' : rgba(colour, 0.95);
    if (s.state !== 'seen') ctx.setLineDash([4 * lw, 3 * lw]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = sel ? '#ffffff' : rgba(colour, 0.95); ctx.lineWidth = lw * 2;
    ctx.beginPath(); ctx.moveTo(0, -rr * 0.15); ctx.lineTo(0, -rr * 1.2); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(0, -rr * 1.45); ctx.lineTo(rr * 0.28, -rr * 1.05); ctx.lineTo(-rr * 0.28, -rr * 1.05);
    ctx.closePath(); ctx.fill();
    if (over) {
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = lw * 2;
      ctx.beginPath(); ctx.arc(0, 0, rr * 1.35, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(0, -len / 2);
  ctx.lineTo(wid / 2, len / 2);
  ctx.lineTo(0, len / 2 - len * 0.22);
  ctx.lineTo(-wid / 2, len / 2);
  ctx.closePath();
  ctx.fillStyle = rgba(colour, 0.9); ctx.fill();
  ctx.lineWidth = lw * (sel ? 2.4 : 1.2);
  ctx.strokeStyle = sel ? '#ffffff' : target ? '#ffe28a' : 'rgba(0,0,0,0.75)';
  if (s.state !== 'seen') ctx.setLineDash([4 * lw, 3 * lw]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (over) {
    ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = lw * 2;
    ctx.beginPath(); ctx.arc(0, 0, len * 0.8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// Drawn in screen space (the caller has already left the world transform), so
// a ring's name stays a readable size however far in the chart is zoomed.
function ringLabel(ctx, scale, off, x, y, text, colour) {
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  const px = x * scale + off.x;
  const py = y * scale + off.y;
  // On a dark plate: two arcs often name themselves in the same corner, and a
  // label has to stay readable over the other's colour.
  const half = ctx.measureText(text).width / 2 + 4;
  ctx.fillStyle = 'rgba(4,7,13,0.78)';
  ctx.fillRect(px - half, py - 8, half * 2, 14);
  ctx.fillStyle = colour;
  ctx.fillText(text, px, py + 3);
}

/* The arcs a ship's weapons cover, as wedges out to the longest gun in each
   mount, with the short-range half marked inside. `strong` is the selected
   ship; the rest, when shown, are faint. */
function drawWedges(ctx, pos, wedges, scale, mode, labels) {
  // 'sel' is the selected ship, 'pin' a range pinned to the chart, 'faint' the
  // rest when every ship's arcs are shown.
  const strong = mode === 'sel';
  const pinned = mode === 'pin';
  const lw = 1 / scale;
  // The dorsal covers what the other three do, so it goes down first and
  // lightest: the mounts that matter for a given target read over it.
  const ordered = [...wedges].sort((a, b) => (b.slot === 'dorsal') - (a.slot === 'dorsal'));
  for (const w of ordered) {
    const colour = SLOT_COLOUR[w.slot || ''] || SLOT_COLOUR[''];
    const wide = w.slot === 'dorsal' && !w.full;
    const a0 = ((w.from - 90) * Math.PI) / 180;
    let a1 = ((w.to - 90) * Math.PI) / 180;
    if (a1 <= a0) a1 += Math.PI * 2;
    const path = (r) => {
      ctx.beginPath();
      if (w.full) { ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2); return; }
      ctx.moveTo(pos.x, pos.y); ctx.arc(pos.x, pos.y, r, a0, a1); ctx.closePath();
    };
    path(w.range);
    ctx.fillStyle = rgba(colour, strong ? (wide ? 0.07 : 0.15) : pinned ? (wide ? 0.05 : 0.11) : (wide ? 0.03 : 0.06)); ctx.fill();
    ctx.strokeStyle = rgba(colour, strong ? 0.8 : pinned ? 0.65 : 0.32); ctx.lineWidth = lw * (strong ? 1.5 : pinned ? 1.3 : 1);
    ctx.stroke();
    ctx.setLineDash([2 * lw, 4 * lw]);
    ctx.strokeStyle = rgba(colour, strong ? 0.5 : pinned ? 0.4 : 0.2);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, w.range / 2, w.full ? 0 : a0, w.full ? Math.PI * 2 : a1);
    ctx.stroke();
    ctx.setLineDash([]);
    if ((strong || pinned) && labels) {
      // A dorsal shares its centre with the prow, so its name sits at the edge.
      const c = (((wide ? w.from + 14 : w.centre)) * Math.PI) / 180;
      labels.push([pos.x + Math.sin(c) * w.range, pos.y - Math.cos(c) * w.range,
        `${slotName(w.slot)} ${w.range}`, rgba(colour, 0.98)]);
    }
  }
}

function draw(ctx, env) {
  const { map, scale, off, w, h, sel, scenery, target, live, measure, fleetInfo, grid, wells, readOnly, dpr } = env;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#03050a';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(off.x, off.y);
  ctx.scale(scale, scale);
  const lw = 1 / scale;

  // The chart itself.
  ctx.beginPath(); ctx.rect(0, 0, map.cols, map.rows); ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, map.cols, map.rows);
  bg.addColorStop(0, '#050811'); bg.addColorStop(1, '#070b16');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, map.cols, map.rows);

  // The star's light first, so everything else sits in it: a corona that falls
  // away with distance, and under it a limb-darkened disc.
  for (const star of map.stars) {
    const R = star.r * 6;
    const a = Math.max(0.15, map.glow);
    const g = ctx.createRadialGradient(star.x, star.y, star.r * 0.9, star.x, star.y, R);
    g.addColorStop(0, rgba(star.colour, 0.55 * a));
    g.addColorStop(0.18, rgba(star.colour, 0.22 * a));
    g.addColorStop(0.5, rgba(star.colour, 0.06 * a));
    g.addColorStop(1, rgba(star.colour, 0));
    ctx.fillStyle = g;
    ctx.fillRect(star.x - R, star.y - R, 2 * R, 2 * R);
    const d = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.r);
    d.addColorStop(0, '#ffffff');
    d.addColorStop(0.7, mixHex(star.colour, '#ffffff', 0.5));
    d.addColorStop(1, star.colour);
    ctx.fillStyle = d;
    ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = '#cfd8ea';
  for (const s of scenery.specks) {
    ctx.globalAlpha = s.a;
    ctx.fillRect(s.x, s.y, s.s * lw, s.s * lw);
  }
  ctx.globalAlpha = 1;

  // Weather over the whole zone.
  const weather = map.hazards.reduce((n, hz) => n + hz.intensity, 0);
  if (weather) {
    const rad = map.hazards.some((x) => x.id === 'radiation_bursts');
    ctx.fillStyle = rad ? `rgba(110,255,130,${Math.min(0.09, 0.025 * weather)})` : `rgba(255,170,90,${Math.min(0.09, 0.025 * weather)})`;
    ctx.fillRect(0, 0, map.cols, map.rows);
  }

  for (const f of map.fields) drawField(ctx, f, scenery.fields[f.id], scale, sel && sel.type === 'field' && sel.id === f.id, map);

  // Gravity wells, dashed, under the bodies.
  if (wells) {
    ctx.setLineDash([5 * lw, 5 * lw]);
    ctx.strokeStyle = 'rgba(180,200,255,0.28)'; ctx.lineWidth = lw;
    for (const b of map.bodies) {
      if (b.well > b.r) { ctx.beginPath(); ctx.arc(b.x, b.y, b.well, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.setLineDash([]);
  }

  for (const b of map.bodies) {
    let nearest = null;
    for (const s of map.stars) {
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      if (!nearest || d < nearest.d) nearest = { d, x: s.x - b.x, y: s.y - b.y };
    }
    const light = nearest ? { x: nearest.x / nearest.d, y: nearest.y / nearest.d } : { x: -0.7, y: -0.7 };
    drawBody(ctx, b, light, scale, sel && sel.type === 'body' && sel.id === b.id);
  }

  // Grid over the scenery, under the ships.
  if (grid) {
    const fine = scale >= 11;
    const step = fine ? 1 : scale >= 5 ? 5 : 10;
    ctx.strokeStyle = 'rgba(120,170,220,0.10)'; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let x = 0; x <= map.cols; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, map.rows); }
    for (let y = 0; y <= map.rows; y += step) { ctx.moveTo(0, y); ctx.lineTo(map.cols, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,170,220,0.22)';
    ctx.beginPath();
    for (let x = 0; x <= map.cols; x += 10) { ctx.moveTo(x, 0); ctx.lineTo(x, map.rows); }
    for (let y = 0; y <= map.rows; y += 10) { ctx.moveTo(0, y); ctx.lineTo(map.cols, y); }
    ctx.stroke();
  }

  // The selected ship's reach: how far it can move, how far it can shoot.
  const selShip = sel && sel.type === 'ship' ? map.ships.find((s) => s.id === sel.id) : null;
  const info = selShip ? fleetInfo[selShip.id] : null;
  const at = selShip ? (live || selShip) : null;
  const labels = [];
  if (selShip && info) {
    if (info.speed) {
      ctx.setLineDash([6 * lw, 4 * lw]); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); ctx.arc(at.x, at.y, info.speed, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // Off the lower right, where an arc's name is least likely to be.
      labels.push([at.x + info.speed * 0.707, at.y + info.speed * 0.707, `Speed ${info.speed}`, 'rgba(255,255,255,0.85)']);
    }
    if (env.arcs) {
      // Under the ship, so the token reads over its own arcs.
      drawWedges(ctx, at, arcWedges(map, { ...selShip, x: at.x, y: at.y }, info.weapons), scale, 'sel', labels);
    } else {
      const seen = new Set();
      for (const wp of info.weapons || []) {
        if (!wp.range || seen.has(wp.range)) continue;
        seen.add(wp.range);
        ctx.strokeStyle = 'rgba(70,214,200,0.7)'; ctx.lineWidth = lw * 1.4;
        ctx.beginPath(); ctx.arc(at.x, at.y, wp.range, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([2 * lw, 4 * lw]); ctx.strokeStyle = 'rgba(70,214,200,0.4)';
        ctx.beginPath(); ctx.arc(at.x, at.y, wp.range / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        labels.push([at.x, at.y + wp.range, `${wp.name || 'Weapon'} ${wp.range}`, 'rgba(100,230,215,0.9)']);
      }
    }
  }
  // Every other ship's arcs, faintly, when the GM wants the whole board.
  if (env.allArcs) {
    for (const s of map.ships) {
      if (selShip && s.id === selShip.id) continue;
      const inf = fleetInfo[s.id];
      if (inf && inf.weapons && inf.weapons.length) drawWedges(ctx, s, arcWedges(map, s, inf.weapons), scale, 'faint', null);
    }
  }

  // Ranges pinned to the chart: they belong to a ship and follow it. The
  // selected ship's own arcs are already drawn above when those are on.
  for (const o of overlayWedges(map)) {
    if (env.arcs && selShip && o.ship.id === selShip.id) continue;
    const pos = selShip && o.ship.id === selShip.id && live ? live : o.ship;
    drawWedges(ctx, pos, arcWedges(map, { ...o.ship, x: pos.x, y: pos.y },
      [{ name: o.overlay.name, range: o.overlay.range, slot: o.overlay.slot }]), scale, 'pin', labels);
  }

  // The shot, if one is picked.
  if (selShip && target) {
    const to = map.ships.find((s) => s.id === target.id);
    if (to) {
      const r = target.reach;
      ctx.strokeStyle = !r || r.blocked || r.canFire === false ? '#ff5a4a' : r.parts && r.parts.length ? '#ffbf47' : '#58e08a';
      ctx.lineWidth = lw * 2; ctx.setLineDash([8 * lw, 5 * lw]);
      ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Ships, over everything.
  for (const s of map.ships) {
    const isSel = selShip && s.id === selShip.id;
    drawShip(ctx, s, scale, {
      minis: map.minis,
      sel: isSel, target: target && target.id === s.id,
      live: isSel ? live : null, over: isSel && env.liveCheck && env.liveCheck.over
    });
  }

  // Heading handle on the selected ship.
  if (selShip && !readOnly) {
    const a = (selShip.heading * Math.PI) / 180;
    const reachH = Math.max(hullLength(selShip.cls), 13 / scale) / 2 + 14 / scale;
    const hx = at.x + Math.sin(a) * reachH;
    const hy = at.y - Math.cos(a) * reachH;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx, hy, 4 / scale, 0, Math.PI * 2); ctx.fill();
  }

  // Resize handle on a selected thing.
  if (sel && !readOnly && (sel.type === 'body' || sel.type === 'field')) {
    const t = sel.type === 'body' ? map.bodies.find((b) => b.id === sel.id) : map.fields.find((f) => f.id === sel.id);
    if (t && (sel.type === 'body' || t.shape === 'circle')) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(t.x + t.r, t.y, 4 / scale, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Measuring.
  if (measure) {
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = lw * 1.8;
    ctx.beginPath(); ctx.moveTo(measure.a.x, measure.a.y); ctx.lineTo(measure.b.x, measure.b.y); ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    for (const p of [measure.a, measure.b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 3 / scale, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();

  // Frame and labels, in screen space.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = 'rgba(160,190,230,0.45)'; ctx.lineWidth = 1;
  ctx.strokeRect(off.x, off.y, map.cols * scale, map.rows * scale);

  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(160,190,230,0.65)';
  const tick = scale >= 11 ? 5 : scale >= 5 ? 10 : 20;
  for (let x = 0; x <= map.cols; x += tick) ctx.fillText(String(x), off.x + x * scale + 2, off.y - 4);
  ctx.textAlign = 'right';
  for (let y = tick; y <= map.rows; y += tick) ctx.fillText(String(y), off.x - 5, off.y + y * scale + 3);
  ctx.textAlign = 'left';

  const show = scale >= 7;
  ctx.textAlign = 'center';
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  const clipTo = (x, y) => x > off.x - 40 && x < off.x + map.cols * scale + 40 && y > off.y - 10 && y < off.y + map.rows * scale + 30;
  for (const b of map.bodies) {
    const selected = sel && sel.type === 'body' && sel.id === b.id;
    if (!(show || selected || b.kind === 'planet' || b.kind === 'gas_giant')) continue;
    if (b.kind === 'moon' && scale < 18 && !selected) continue;
    if (b.kind === 'asteroid' && !selected) continue;
    const px = off.x + b.x * scale;
    const py = off.y + (b.y + b.r) * scale + 13;
    if (!clipTo(px, py)) continue;
    ctx.fillStyle = b.state === 'seen' ? 'rgba(220,230,245,0.85)' : 'rgba(150,200,255,0.8)';
    ctx.fillText(b.name, px, py);
  }
  for (const f of map.fields) {
    const selected = sel && sel.type === 'field' && sel.id === f.id;
    if (!(show || selected)) continue;
    const mid = f.shape === 'band' ? { x: (f.x + f.x2) / 2, y: (f.y + f.y2) / 2 } : f;
    const px = off.x + Math.min(Math.max(mid.x, 6), map.cols - 6) * scale;
    const py = off.y + Math.min(Math.max(mid.y, 3), map.rows - 3) * scale;
    ctx.fillStyle = 'rgba(205,190,160,0.7)';
    ctx.fillText(f.name, px, py);
  }
  for (const s of map.ships) {
    const p = selShip && s.id === selShip.id && live ? live : s;
    const px = off.x + p.x * scale;
    const py = off.y + (p.y + Math.max(hullLength(s.cls) / 2, 7 / scale)) * scale + 13;
    ctx.fillStyle = SIDE_COLOUR[s.side] || '#ccc';
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(s.state === 'ping' ? '?' : s.name, px, py);
  }
  for (const [x, y, text, colour] of labels) ringLabel(ctx, scale, off, x, y, text, colour);

  if (measure) {
    const d = distanceVU(measure.a, measure.b);
    const mx = off.x + ((measure.a.x + measure.b.x) / 2) * scale;
    const my = off.y + ((measure.a.y + measure.b.y) / 2) * scale - 8;
    ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(`${d} VU`, mx, my);
  }
}

/* ---- the component ---- */

const MIN_SCALE = 2;
const MAX_SCALE = 120;
const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export default function VoidMap({
  map: rawMap, onChange, fleet = [], readOnly = false, win = null,
  historyKey = 'void', onUseShot = null, full = false, onToggleFull = null,
  gunnery = null, library = null
}) {
  const map = useMemo(() => readVoidMap(rawMap), [rawMap]);
  const w = win || window;
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 12, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const touched = useRef(false);
  const [tool, setTool] = useState('select');
  const [sel, setSel] = useState(null);
  const [target, setTarget] = useState(null);
  const [weaponIx, setWeaponIx] = useState(0);
  const [measure, setMeasure] = useState(null);
  const [live, setLive] = useState(null);
  const [liveCheck, setLiveCheck] = useState(null);
  const [grid, setGrid] = useState(true);
  const [arcs, setArcs] = useState(true);
  const [allArcs, setAllArcs] = useState(false);
  const [wells, setWells] = useState(true);
  // Hides the toolbar and side panel, for a projector. H brings them back.
  const [clean, setClean] = useState(false);
  const [menu, setMenu] = useState(null);
  const [ask, setAsk] = useState(null);
  const askRef = useRef(null);
  const [libName, setLibName] = useState('');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const drag = useRef(null);
  const hist = useRef({ past: [], future: [], key: null, at: 0, owner: historyKey });
  const [, bump] = useState(0);

  const fleetInfo = useMemo(() => {
    const out = {};
    for (const f of fleet) out[f.id] = f;
    return out;
  }, [fleet]);

  const scenery = useMemo(
    () => sceneryFor(map),
    // Rocks depend on each field's id, kind and size bracket, never its place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map.seed, map.cols, map.rows, map.fields.map((f) => `${f.id}${f.kind}${f.shape}${Math.round((f.r || f.w || 0) / 2)}`).join('|')]
  );

  /* ---- history ---- */
  if (hist.current.owner !== historyKey) hist.current = { past: [], future: [], key: null, at: 0, owner: historyKey };
  const commit = (next, key = null) => {
    if (readOnly) return;
    const h = hist.current;
    const now = Date.now();
    if (!(key && key === h.key && now - h.at < 1200)) {
      h.past.push(map);
      if (h.past.length > 80) h.past.shift();
      h.future = [];
    }
    h.key = key; h.at = now;
    onChange(readVoidMap(next));
  };
  const undo = () => {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(map);
    onChange(h.past.pop());
    h.key = null;
    bump((n) => n + 1);
  };
  const redo = () => {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(map);
    onChange(h.future.pop());
    h.key = null;
    bump((n) => n + 1);
  };

  /* ---- the stage's size, and fitting the chart to it ---- */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const RO = (w.ResizeObserver || window.ResizeObserver);
    const ro = RO ? new RO(read) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [w]);

  const fit = () => {
    if (!size.w || !size.h) return;
    const pad = 30;
    const scale = clampScale(Math.min((size.w - pad * 1.4) / map.cols, (size.h - pad * 1.4) / map.rows));
    setView({ scale, x: (size.w - map.cols * scale) / 2, y: (size.h - map.rows * scale) / 2 + 6 });
  };
  const fitKey = `${map.cols}x${map.rows}|${map.seed}|${historyKey}`;
  useLayoutEffect(() => { touched.current = false; }, [fitKey]);
  useLayoutEffect(() => {
    if (!touched.current) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.w, size.h]);

  /* ---- the picked shot ---- */
  const selShip = sel && sel.type === 'ship' ? map.ships.find((s) => s.id === sel.id) || null : null;
  const info = selShip ? fleetInfo[selShip.id] || null : null;
  const weapon = info && info.weapons && info.weapons.length ? info.weapons[Math.min(weaponIx, info.weapons.length - 1)] : null;
  const shots = useMemo(() => {
    if (!selShip) return [];
    return map.ships.filter((s) => s.id !== selShip.id)
      .map((s) => ({ ship: s, reach: reach(map, selShip.id, s.id, { weaponRange: weapon ? weapon.range : null, slot: weapon ? weapon.slot : null }) }))
      .filter((x) => x.reach)
      .sort((a, b) => a.reach.distance - b.reach.distance);
  }, [map, selShip, weapon]);
  const targeted = target && selShip ? shots.find((x) => x.ship.id === target.id) || null : null;
  // Every weapon, and whether it can fire on the target: the question a GM asks
  // with a model in each hand.
  const bearing_ = useMemo(
    () => (targeted && info && info.weapons ? weaponsBearing(map, selShip.id, targeted.ship.id, info.weapons) : []),
    [map, selShip, targeted, info]
  );
  // The gunnery follows the chart: whatever shot is lined up here is the shot
  // the Void combat tab and the roll buttons act on, so there is one aim and no
  // button to carry it across.
  const aimKey = gunnery && !readOnly && selShip && targeted && weapon
    ? [selShip.id, targeted.ship.id, weapon.id, weapon.slot, targeted.reach.distance,
      targeted.reach.silhouetted, targeted.reach.canFire,
      targeted.reach.parts.map((p) => `${p.label}${p.value}`).join(',')].join('|')
    : null;
  useEffect(() => {
    if (!aimKey) return;
    const r = targeted.reach;
    gunnery.aim({
      attackerId: selShip.id, targetId: targeted.ship.id, distance: r.distance, weaponId: weapon.id,
      silhouetted: r.silhouetted, silhouette: r.silhouette, parts: r.parts,
      canFire: r.canFire, blocked: r.blocked, outOfArc: r.outOfArc
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aimKey]);

  const chartKey = library ? `${library.currentId || ''}|${library.currentName || ''}|${map.seed}` : '';
  useEffect(() => {
    setLibName((library && library.currentName) || map.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartKey]);
  useEffect(() => { if (ask && askRef.current) askRef.current.focus(); }, [ask]);

  // Picking a target also picks a gun that can reach it, if the current one cannot.
  const aimAt = (id) => {
    setTarget({ id });
    if (!selShip || !info || !info.weapons || !info.weapons.length) return;
    const list = weaponsBearing(map, selShip.id, id, info.weapons);
    const cur = Math.min(weaponIx, info.weapons.length - 1);
    if (list[cur] && list[cur].bears) return;
    const first = list.find((x) => x.bears);
    if (first) setWeaponIx(first.index);
  };

  /* ---- drawing ---- */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = w.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
    }
    const ctx = canvas.getContext('2d');
    draw(ctx, {
      map, scale: view.scale, off: { x: view.x, y: view.y }, w: size.w, h: size.h, dpr,
      sel, scenery, fleetInfo, grid, wells, readOnly, live, liveCheck, measure, arcs, allArcs,
      target: targeted ? { id: targeted.ship.id, reach: targeted.reach } : null
    });
  });

  /* ---- coordinates ---- */
  const toWorld = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.scale, y: (clientY - rect.top - v.y) / v.scale };
  };

  const zoomAt = (clientX, clientY, factor) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const v = viewRef.current;
    const scale = clampScale(v.scale * factor);
    const wx = (px - v.x) / v.scale;
    const wy = (py - v.y) / v.scale;
    touched.current = true;
    setView({ scale, x: px - wx * scale, y: py - wy * scale });
  };
  const zoomCentre = (factor) => {
    const rect = canvasRef.current.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  // The wheel zooms the chart, so it must not scroll the page. React attaches
  // wheel listeners passive, which cannot prevent that.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  /* ---- what is under the pointer ---- */
  const pick = (p) => {
    const scale = viewRef.current.scale;
    // The selected thing's handles come first.
    if (!readOnly && selShip) {
      const a = (selShip.heading * Math.PI) / 180;
      const reachH = Math.max(hullLength(selShip.cls), 13 / scale) / 2 + 14 / scale;
      const hx = selShip.x + Math.sin(a) * reachH;
      const hy = selShip.y - Math.cos(a) * reachH;
      if (Math.hypot(p.x - hx, p.y - hy) < 9 / scale) return { type: 'heading', id: selShip.id };
    }
    if (!readOnly && sel && (sel.type === 'body' || sel.type === 'field')) {
      const t = sel.type === 'body' ? map.bodies.find((b) => b.id === sel.id) : map.fields.find((f) => f.id === sel.id);
      if (t && t.r && (sel.type === 'body' || t.shape === 'circle') && Math.hypot(p.x - (t.x + t.r), p.y - t.y) < 9 / scale) {
        return { type: 'resize', of: sel.type, id: sel.id };
      }
    }
    for (let i = map.ships.length - 1; i >= 0; i--) {
      const s = map.ships[i];
      if (Math.hypot(p.x - s.x, p.y - s.y) < Math.max(hullLength(s.cls) * 0.7, 12 / scale)) return { type: 'ship', id: s.id };
    }
    const bodies = [...map.bodies].sort((a, b) => a.r - b.r);
    for (const b of bodies) {
      if (Math.hypot(p.x - b.x, p.y - b.y) <= Math.max(b.r, 8 / scale)) return { type: 'body', id: b.id };
    }
    for (let i = map.fields.length - 1; i >= 0; i--) {
      if (inField(map.fields[i], p)) return { type: 'field', id: map.fields[i].id };
    }
    return null;
  };

  /* ---- pointer ---- */
  const onPointerDown = (e) => {
    // Focus for the keys, but never scroll the dialog to do it: that moves the
    // chart out from under the pointer in the middle of a click.
    canvasRef.current.focus({ preventScroll: true });
    const p = toWorld(e.clientX, e.clientY);
    canvasRef.current.setPointerCapture(e.pointerId);
    setMenu(null);
    // A right-click is a menu; a right-drag is a pan. Which one it was is only
    // known when the button comes up.
    if (e.button === 2 && !readOnly) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y,
        menu: { cx: e.clientX, cy: e.clientY, p, moved: false } };
      return;
    }
    const panning = e.button === 1 || e.button === 2 || tool === 'pan' || spaceHeld;
    if (panning) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
      return;
    }
    if (tool === 'measure') {
      const a = snapPoint(map, p, e.altKey);
      setMeasure({ a, b: a });
      drag.current = { kind: 'measure' };
      return;
    }
    const hit = pick(p);
    if (!readOnly && (tool === 'erase' || tool === 'overlay')) {
      if (!hit || !['ship', 'body', 'field'].includes(hit.type)) return;
      if (tool === 'erase') {
        commit(removeThing(map, hit.type, hit.id));
        if (sel && sel.id === hit.id) { setSel(null); setTarget(null); }
      } else if (hit.type === 'ship') {
        const inf = fleetInfo[hit.id];
        if (inf && inf.weapons && inf.weapons.length) commit(togglePins(map, hit.id, inf.weapons));
      }
      return;
    }
    if (!hit) {
      setSel(null); setTarget(null);
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
      return;
    }
    if (hit.type === 'heading') { drag.current = { kind: 'heading', id: hit.id }; return; }
    if (hit.type === 'resize') { drag.current = { kind: 'resize', of: hit.of, id: hit.id }; return; }
    // A second click on another ship while one is selected picks it as the target.
    if (hit.type === 'ship' && selShip && hit.id !== selShip.id && e.shiftKey) {
      aimAt(hit.id);
      return;
    }
    setSel(hit);
    if (hit.type !== 'ship') setTarget(null);
    if (!readOnly) {
      const thing = hit.type === 'ship' ? map.ships.find((s) => s.id === hit.id)
        : hit.type === 'body' ? map.bodies.find((b) => b.id === hit.id)
          : map.fields.find((f) => f.id === hit.id);
      drag.current = { kind: hit.type, id: hit.id, from: p, moved: false, start: { ...thing } };
    }
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      if (d.menu && Math.hypot(e.clientX - d.menu.cx, e.clientY - d.menu.cy) > 4) d.menu.moved = true;
      // A right-click that has not yet moved is still a click: do not pan.
      if (d.menu && !d.menu.moved) return;
      touched.current = true;
      setView({ ...viewRef.current, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) });
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    if (d.kind === 'measure') {
      setMeasure((m) => (m ? { a: m.a, b: e.shiftKey ? m.b : snapPoint(map, p, e.altKey) } : m));
      return;
    }
    if (d.kind === 'heading') {
      const s = map.ships.find((x) => x.id === d.id);
      // Snapped to 5 degrees, the way a model is turned on its stand; Alt turns freely.
      if (s) commit(turnShip(map, d.id, e.altKey ? bearing(s, p) : Math.round(bearing(s, p) / 5) * 5), `turn-${d.id}`);
      return;
    }
    if (d.kind === 'resize') {
      const list = d.of === 'body' ? map.bodies : map.fields;
      const t = list.find((x) => x.id === d.id);
      if (!t) return;
      const r = Math.max(0.3, Math.round(Math.hypot(p.x - t.x, p.y - t.y) * 4) / 4);
      commit({ ...map, [d.of === 'body' ? 'bodies' : 'fields']: list.map((x) => (x.id === d.id ? { ...x, r } : x)) }, `size-${d.id}`);
      return;
    }
    if (Math.hypot(p.x - d.from.x, p.y - d.from.y) * viewRef.current.scale > 4) d.moved = true;
    if (!d.moved) return;
    if (d.kind === 'ship') {
      const s = map.ships.find((x) => x.id === d.id);
      const to = e.altKey ? { x: p.x, y: p.y } : snapToSquare(map, p);
      setLive(to);
      const chk = s ? moveCheck(map, d.id, to, (fleetInfo[d.id] || {}).speed) : null;
      setLiveCheck(chk);
    } else {
      const dx = p.x - d.from.x;
      const dy = p.y - d.from.y;
      if (d.kind === 'body') {
        commit({ ...map, bodies: map.bodies.map((b) => (b.id === d.id ? { ...b, x: d.start.x + dx, y: d.start.y + dy } : b)) }, `drag-${d.id}`);
      } else if (d.kind === 'field') {
        commit({
          ...map,
          fields: map.fields.map((f) => {
            if (f.id !== d.id) return f;
            return f.shape === 'band'
              ? { ...f, x: d.start.x + dx, y: d.start.y + dy, x2: d.start.x2 + dx, y2: d.start.y2 + dy }
              : { ...f, x: d.start.x + dx, y: d.start.y + dy };
          })
        }, `drag-${d.id}`);
      }
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (canvasRef.current.hasPointerCapture && canvasRef.current.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    if (!d) return;
    if (d.kind === 'pan' && d.menu && !d.menu.moved) {
      openMenu(d.menu.cx, d.menu.cy, pick(d.menu.p), d.menu.p);
      return;
    }
    if (d.kind === 'ship' && d.moved && live) {
      commit(moveShip(map, d.id, live, { snap: false }));
    }
    setLive(null); setLiveCheck(null);
    if (d.kind === 'measure') {
      // Left on the chart until the next click, so it can be read at leisure.
      return;
    }
  };

  const onKeyDown = (e) => {
    const k = e.key;
    if (k === ' ') { e.preventDefault(); setSpaceHeld(true); return; }
    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (k === 'f' || k === 'F') { touched.current = false; fit(); return; }
    if (k === 'g' || k === 'G') { setGrid((g) => !g); return; }
    if (k === 'm' || k === 'M') { setTool((t) => (t === 'measure' ? 'select' : 'measure')); return; }
    if (k === 'h' || k === 'H') { setClean((c) => !c); return; }
    if (k === 'Escape' && menu) { e.preventDefault(); e.stopPropagation(); setMenu(null); return; }
    if (k === 'Escape') {
      // Clears what is picked. Held back from the dialog this lives in, which
      // would otherwise close the whole dashboard on the same keypress; with
      // nothing to clear, Escape goes through and closes it as usual.
      if (sel || target || measure || tool !== 'select') {
        e.preventDefault(); e.stopPropagation();
        setSel(null); setTarget(null); setMeasure(null); setTool('select');
      }
      return;
    }
    if (k === '+' || k === '=') { zoomCentre(1.25); return; }
    if (k === '-') { zoomCentre(0.8); return; }
    if (readOnly) return;
    if (k === 'e' || k === 'E') { setTool((t) => (t === 'erase' ? 'select' : 'erase')); return; }
    if (k === 'o' || k === 'O') { setTool((t) => (t === 'overlay' ? 'select' : 'overlay')); return; }
    if (!sel) return;
    if ((k === 'r' || k === 'R')) { rotateSel(e.shiftKey ? -15 : 15); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeSel(); return; }
    if (sel.type === 'ship') {
      const s = map.ships.find((x) => x.id === sel.id);
      if (!s) return;
      const step = e.shiftKey ? 5 : 1;
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (dir) { e.preventDefault(); commit(moveShip(map, s.id, { x: s.x + dir[0] * step, y: s.y + dir[1] * step }, { snap: false })); return; }
      if (k === '[') commit(turnShip(map, s.id, s.heading - 15), `turn-${s.id}`);
      if (k === ']') commit(turnShip(map, s.id, s.heading + 15), `turn-${s.id}`);
    }
  };
  const onKeyUp = (e) => { if (e.key === ' ') setSpaceHeld(false); };

  /* ---- edits ---- */
  const patchShip = (id, patch, key) => commit({ ...map, ships: map.ships.map((s) => (s.id === id ? { ...s, ...patch } : s)) }, key);
  const patchBody = (id, patch, key) => commit({ ...map, bodies: map.bodies.map((b) => (b.id === id ? { ...b, ...patch } : b)) }, key);
  const patchField = (id, patch, key) => commit({ ...map, fields: map.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }, key);
  // Off the chart, and any range pinned to it.
  const removeSel = () => {
    if (!sel) return;
    commit(removeThing(map, sel.type, sel.id));
    setSel(null); setTarget(null);
  };

  // Turn what is picked: a ship's heading, a body's facing, a belt about its
  // middle. Pressed repeatedly it is one step of undo, not one per press.
  const rotateSel = (deg) => {
    if (!sel) return;
    commit(rotateThing(map, sel.type, sel.id, deg), `rot-${sel.id}`);
  };
  // The whole chart a quarter turn, with everything on it.
  const turnChart = (turns) => {
    touched.current = false;
    setSel(null); setTarget(null); setMeasure(null);
    commit(rotateScene(map, turns));
  };

  /* ---- asking, inside the chart ----
     A browser dialog opens on the window behind this one when the chart is
     running in its own, where it cannot be seen or answered. */
  const confirmIn = (title, body, yes, run) => setAsk({
    title, body, buttons: [{ label: yes, primary: true, run }, { label: 'Cancel', run: () => {} }]
  });
  // Anything that would replace the chart on screen asks first if it has
  // changes that were never saved.
  const guard = (action) => {
    if (!library || !library.dirty) { action(); return; }
    setAsk({
      title: 'Keep the changes to this chart?',
      body: `\u201c${library.currentName || map.name}\u201d has changes that are not saved.`,
      buttons: [
        { label: 'Save, then go on', primary: true, run: () => { if (library.onSave(libName || map.name) !== false) action(); } },
        { label: 'Go on without saving', run: action },
        { label: 'Stay here', run: () => {} }
      ]
    });
  };
  const clearWhat = (what, label) => confirmIn(
    `Clear ${label}?`,
    'They come off the chart. Undo (Cmd/Ctrl+Z) brings them back.',
    'Clear',
    () => { commit(clearChart(map, what)); setSel(null); setTarget(null); }
  );

  // The chart as a picture, drawn the way it is on screen but whole.
  const exportPng = () => {
    const px = Math.max(8, Math.min(40, 3200 / Math.max(map.cols, map.rows)));
    const pad = 24;
    const doc = w.document;
    const c = doc.createElement('canvas');
    c.width = Math.round(map.cols * px + pad * 2);
    c.height = Math.round(map.rows * px + pad * 2);
    draw(c.getContext('2d'), {
      map, scale: px, off: { x: pad, y: pad }, w: c.width, h: c.height, dpr: 1,
      sel: null, scenery, fleetInfo, grid, wells, readOnly: true, live: null, liveCheck: null,
      measure: null, arcs: false, allArcs: false, target: null
    });
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = `${(map.name || 'void chart').replace(/[^\w\- ]+/g, '').trim() || 'void chart'}.png`;
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  };

  const centre = () => {
    const v = viewRef.current;
    return snapPoint(map, { x: (size.w / 2 - v.x) / v.scale, y: (size.h / 2 - v.y) / v.scale }, false);
  };

  const addThing = (what, at = null) => {
    const c = at ? snapPoint(map, at, false) : centre();
    const id = newVoidId();
    if (what === 'ship') return;
    const bodyDefs = {
      planet: { kind: 'planet', name: 'Planet', r: 3, tone: '#4e8f78', air: 2, well: 8 },
      gas_giant: { kind: 'gas_giant', name: 'Gas Giant', r: 9, tone: '#c9a36b', air: 3, well: 20 },
      moon: { kind: 'moon', name: 'Moon', r: 1, tone: '#a7a9ad' },
      asteroid: { kind: 'asteroid', name: 'Asteroid', r: 1.2, tone: '#7d776e' },
      station: { kind: 'station', name: 'Station', r: 2.2, tone: '#b59a62' },
      hulk: { kind: 'hulk', name: 'Hulk', r: 1.3, tone: '#7b7f86' }
    };
    if (bodyDefs[what]) {
      commit({ ...map, bodies: [...map.bodies, { ...bodyDefs[what], id, x: c.x, y: c.y, state: 'seen', note: '' }] });
      setSel({ type: 'body', id });
      return;
    }
    const spec = FIELD_KINDS[what];
    if (!spec) return;
    const base = {
      id, kind: what, name: spec.name, shape: spec.shape, x: c.x, y: c.y,
      shotMod: spec.shotMod, moveMod: spec.moveMod, note: spec.note, state: 'seen', drift: null
    };
    if (spec.shape === 'band') {
      Object.assign(base, { x: 0, y: c.y, x2: map.cols, y2: c.y, w: 10 });
      if (what === 'gravity_riptide') base.drift = [spec.drift, 0];
    } else {
      base.r = 8;
    }
    commit({ ...map, fields: [...map.fields, base] });
    setSel({ type: 'field', id });
  };

  const ADD_ITEMS = [
    ['planet', 'Planet'], ['gas_giant', 'Gas giant'], ['moon', 'Moon'], ['asteroid', 'Rock'],
    ['station', 'Station'], ['hulk', 'Hulk'], ['dust_cloud', 'Dust'], ['asteroid_cluster', 'Cluster'],
    ['asteroid_belt', 'Belt'], ['gravity_riptide', 'Riptide'], ['nebula', 'Gas cloud']
  ];

  /* The right-click menu, so the chart can be worked with the toolbar hidden:
     on a thing, what can be done to it; on empty space, what can be put there
     and what can be done to the whole chart. */
  const openMenu = (cx, cy, hit, p) => {
    const rect = stageRef.current.getBoundingClientRect();
    const thing = hit && ['ship', 'body', 'field'].includes(hit.type) ? hit : null;
    const items = [];
    let title = 'This spot';
    if (thing) {
      const list = thing.type === 'ship' ? map.ships : thing.type === 'body' ? map.bodies : map.fields;
      const t = list.find((x) => x.id === thing.id);
      if (!t) return;
      setSel(thing); setTarget(null);
      title = t.name;
      items.push({ label: 'Turn 15\u00b0 left', hint: 'Shift+R', run: () => commit(rotateThing(map, thing.type, thing.id, -15), `rot-${thing.id}`) });
      items.push({ label: 'Turn 15\u00b0 right', hint: 'R', run: () => commit(rotateThing(map, thing.type, thing.id, 15), `rot-${thing.id}`) });
      const inf = thing.type === 'ship' ? fleetInfo[thing.id] : null;
      if (inf && inf.weapons && inf.weapons.length) {
        items.push({
          label: map.overlays.some((o) => o.shipId === thing.id) ? 'Unpin its ranges' : 'Pin its ranges to the chart',
          hint: 'O', run: () => commit(togglePins(map, thing.id, inf.weapons))
        });
      }
      items.push({ sep: true });
      for (const st of STATES) {
        items.push({
          label: STATE_NAME[st], tick: t.state === st,
          run: () => commit({ ...map, [thing.type === 'ship' ? 'ships' : thing.type === 'body' ? 'bodies' : 'fields']:
            list.map((x) => (x.id === thing.id ? { ...x, state: st } : x)) })
        });
      }
      items.push({ sep: true });
      items.push({
        label: thing.type === 'ship' ? 'Take off the chart' : 'Delete', hint: 'Del',
        run: () => { commit(removeThing(map, thing.type, thing.id)); setSel(null); setTarget(null); }
      });
    } else {
      setSel(null); setTarget(null);
      items.push({ group: 'Add here', buttons: ADD_ITEMS.map(([k, label]) => ({ label, run: () => addThing(k, p) })) });
      items.push({ sep: true });
      items.push({ label: 'Turn the chart a quarter left', run: () => turnChart(-1) });
      items.push({ label: 'Turn the chart a quarter right', run: () => turnChart(1) });
      items.push({ label: 'Fit the chart', hint: 'F', run: () => { touched.current = false; fit(); } });
      items.push({ label: 'Hide the controls', hint: 'H', run: () => setClean(true) });
      items.push({ sep: true });
      items.push({ group: 'Clear', buttons: [
        { label: 'Ships', run: () => clearWhat('ships', 'every ship') },
        { label: 'Fields', run: () => clearWhat('fields', 'every field') },
        { label: 'Bodies', run: () => clearWhat('bodies', 'every world and body') },
        { label: 'Pinned ranges', run: () => clearWhat('overlays', 'every pinned range') },
        { label: 'Everything', run: () => clearWhat('everything', 'the whole chart') }
      ] });
    }
    setMenu({ left: Math.max(4, Math.min(cx - rect.left, rect.width - 252)), top: Math.max(4, Math.min(cy - rect.top, rect.height - 80)), title, items });
  };

  const selBody = sel && sel.type === 'body' ? map.bodies.find((b) => b.id === sel.id) : null;
  const selField = sel && sel.type === 'field' ? map.fields.find((f) => f.id === sel.id) : null;
  const onChart = new Set(map.ships.map((s) => s.id));
  const unplaced = fleet.filter((f) => !onChart.has(f.id));
  const numInput = (value, on, props = {}) => (
    <input className="rt-field rt-vm-num" type="number" value={value}
      onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) on(v); }} {...props} />
  );

  // The chart and its side panel share one height, set by the chart's own shape.
  // The panel scrolls inside it: if its height followed what is selected, the
  // whole dialog would grow and shrink under the pointer with every click.
  const stageStyle = full || !size.w ? undefined
    : { height: Math.min(Math.max(360, size.w * map.rows / map.cols + 64), 700) };

  return (
    <div className={'rt-vm' + (full ? ' full' : '') + (clean ? ' clean' : '')}>
      <div className="rt-vm-bar">
        <IconButton icon="select" label="Select and move (drag a ship to move it, drag the dot to turn it)" on={tool === 'select'} onClick={() => setTool('select')} />
        <IconButton icon="pan" label="Pan (or drag empty space, or hold Space)" on={tool === 'pan'} onClick={() => setTool('pan')} />
        <IconButton icon="measure" label="Measure (M): drag between two points" on={tool === 'measure'} onClick={() => setTool(tool === 'measure' ? 'select' : 'measure')} />
        {!readOnly && <IconButton icon="erase" label="Erase (E): click a ship, body or field to take it off the chart" on={tool === 'erase'} onClick={() => setTool(tool === 'erase' ? 'select' : 'erase')} />}
        {!readOnly && <IconButton icon="pin" label="Pin ranges (O): click a ship to pin its weapon ranges to the chart, or take them down" on={tool === 'overlay'} onClick={() => setTool(tool === 'overlay' ? 'select' : 'overlay')} />}
        <span className="rt-vm-sep" />
        {!readOnly && <IconButton icon="undo" label="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={!hist.current.past.length} />}
        {!readOnly && <IconButton icon="redo" label="Redo (Shift+Ctrl/Cmd+Z)" onClick={redo} disabled={!hist.current.future.length} />}
        {!readOnly && <IconButton icon="spinLeft" label="Turn the whole chart a quarter anticlockwise" onClick={() => turnChart(-1)} />}
        {!readOnly && <IconButton icon="spinRight" label="Turn the whole chart a quarter clockwise" onClick={() => turnChart(1)} />}
        <span className="rt-vm-sep" />
        <IconButton icon="zoomIn" label="Zoom in (+)" onClick={() => zoomCentre(1.25)} />
        <IconButton icon="zoomOut" label="Zoom out (-)" onClick={() => zoomCentre(0.8)} />
        <IconButton icon="fit" label="Fit the chart (F)" onClick={() => { touched.current = false; fit(); }} />
        <IconButton icon="grid" label="Grid (G)" on={grid} onClick={() => setGrid((g) => !g)} />
        <IconButton icon="wells" label="Gravity wells" on={wells} onClick={() => setWells((x) => !x)} />
        <span className="rt-vm-sep" />
        <IconButton icon="arcs" label="Firing arcs of the selected ship (instead of plain range rings)" on={arcs} onClick={() => setArcs((x) => !x)} />
        <IconButton icon="allArcs" label="Show every ship's arcs" on={allArcs} onClick={() => setAllArcs((x) => !x)} />
        {!readOnly && (
          <IconButton icon="base" label={map.minis ? 'Ships drawn as bases, for models on the table. Click to draw hulls' : 'Ships drawn as hulls. Click to draw bases for models on the table'}
            on={map.minis} onClick={() => commit({ ...map, minis: !map.minis })} />
        )}
        <IconButton icon="exportPng" label="Save the chart as a picture" onClick={exportPng} />
        <IconButton icon="clean" label="Hide the toolbar and panel, for a projector (H)" on={clean} onClick={() => setClean(true)} />
        {onToggleFull && <IconButton icon="full" label="Full window" on={full} onClick={onToggleFull} />}
        {!readOnly && map.fields.some((f) => f.drift) && (
          <button type="button" className="rt-btn" title="Carry every ship in a riptide one turn along it"
            onClick={() => { const r = applyDrift(map); commit(r.map); }}>
            <Ico name="drift" size={14} /> Apply drift
          </button>
        )}
        <span className="rt-vm-scale">{map.cols}{'×'}{map.rows} VU</span>
      </div>

      <div className="rt-vm-body">
        <div className="rt-vm-stage" ref={stageRef} style={stageStyle}>
          <canvas ref={canvasRef} tabIndex={0} className="rt-vm-canvas"
            style={{ width: size.w, height: size.h, cursor: tool === 'pan' || spaceHeld ? 'grab' : tool === 'measure' || tool === 'erase' || tool === 'overlay' ? 'crosshair' : 'default' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={onKeyDown} onKeyUp={onKeyUp} />
          {(map.hazards.length > 0 || (map.source && map.source.star)) && (
            <div className="rt-vm-badges">
              {map.source && map.source.star && <span className="rt-vm-badge">{map.source.star}</span>}
              {map.hazards.map((h) => (
                <span key={h.id} className="rt-vm-badge warn" title={h.note}>
                  {h.name}{h.intensity > 1 ? ` ×${h.intensity}` : ''}
                </span>
              ))}
            </div>
          )}
          {clean && (
            <button type="button" className="rt-vm-peek" title="Show the controls (H)" aria-label="Show the controls"
              onClick={() => setClean(false)}><Ico name="show" /></button>
          )}
          {menu && !readOnly && (
            <div className="rt-vm-menu" style={{ left: menu.left, top: menu.top }}
              onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
              <div className="rt-vm-menu-h">{menu.title}</div>
              {menu.items.map((it, i) => {
                if (it.sep) return <div key={i} className="rt-vm-menu-sep" />;
                if (it.group) {
                  return (
                    <div key={i} className="rt-vm-menu-group">
                      <div className="rt-vm-menu-gh">{it.group}</div>
                      <div className="rt-vm-menu-chips">
                        {it.buttons.map((b) => (
                          <button key={b.label} type="button" onClick={() => { setMenu(null); b.run(); }}>{b.label}</button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <button key={i} type="button" className="rt-vm-menu-item" onClick={() => { setMenu(null); it.run(); }}>
                    <span className="rt-vm-menu-tick">{it.tick ? '\u2713' : ''}</span>
                    <span>{it.label}</span>
                    {it.hint && <kbd>{it.hint}</kbd>}
                  </button>
                );
              })}
            </div>
          )}
          {ask && (
            <div className="rt-vm-askwrap" role="presentation">
              <div className="rt-vm-ask" role="alertdialog" aria-label={ask.title} tabIndex={-1} ref={askRef}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAsk(null); } }}>
                <h4>{ask.title}</h4>
                <p>{ask.body}</p>
                <div className="rt-vm-askrow">
                  {ask.buttons.map((b) => (
                    <button key={b.label} type="button" className={'rt-btn' + (b.primary ? '' : ' ghost')}
                      onClick={() => { setAsk(null); b.run(); }}>{b.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {liveCheck && (
            <div className="rt-vm-live">
              <b>{liveCheck.distance} VU</b>
              {info && info.speed ? ` of Speed ${info.speed}` : ''}
              {liveCheck.over ? ' — too far' : ''}
              {liveCheck.solid ? ` — ${liveCheck.solid} is in the way` : ''}
              {liveCheck.tests.map((t) => <div key={t.id}>{t.text}</div>)}
            </div>
          )}
        </div>

        <div className="rt-vm-side" style={stageStyle}>
          {selShip ? (
            <div className="rt-vm-card">
              <div className="rt-vm-h" style={{ color: SIDE_COLOUR[selShip.side] }}>{selShip.name}</div>
              {selShip.cls && <div className="rt-vm-sub">{selShip.cls}</div>}
              {info && (
                <div className="rt-vm-sub">
                  {info.speed ? `Speed ${info.speed} VU` : ''}
                  {info.detection ? ` · Detection ${info.detection}` : ''}
                </div>
              )}
              {!readOnly && (
                <div className="rt-vm-grid">
                  <label>Heading {numInput(selShip.heading, (v) => patchShip(selShip.id, { heading: ((v % 360) + 360) % 360 }, `h-${selShip.id}`), { min: 0, max: 359, step: 15 })}</label>
                  <label>Side
                    <select className="rt-sel" value={selShip.side} onChange={(e) => patchShip(selShip.id, { side: e.target.value })}>
                      {SIDES.map((s) => <option key={s} value={s}>{SIDE_NAME[s]}</option>)}
                    </select>
                  </label>
                  <label>Table sees
                    <select className="rt-sel" value={selShip.state} onChange={(e) => patchShip(selShip.id, { state: e.target.value })}>
                      {STATES.map((s) => <option key={s} value={s}>{STATE_NAME[s]}</option>)}
                    </select>
                  </label>
                  <div className="rt-vm-row">
                    <button type="button" className="rt-ico-btn" title="Turn 15° left ([)" aria-label="Turn left" onClick={() => patchShip(selShip.id, { heading: ((selShip.heading - 15) % 360 + 360) % 360 }, `h-${selShip.id}`)}><Ico name="turnLeft" /></button>
                    <button type="button" className="rt-ico-btn" title="Turn 15° right (])" aria-label="Turn right" onClick={() => patchShip(selShip.id, { heading: (selShip.heading + 15) % 360 }, `h-${selShip.id}`)}><Ico name="turnRight" /></button>
                    <button type="button" className="rt-ico-btn" title="Take off the chart" aria-label="Remove ship" onClick={removeSel}><Ico name="trash" /></button>
                  </div>
                </div>
              )}
              {info && info.weapons && info.weapons.length > 0 && (
                <label className="rt-vm-wide">Weapon
                  <select className="rt-sel" value={Math.min(weaponIx, info.weapons.length - 1)} onChange={(e) => setWeaponIx(Number(e.target.value))}>
                    {info.weapons.map((wp, i) => <option key={i} value={i}>{wp.name}{wp.slot ? ` \u00b7 ${wp.slot}` : ''} (range {wp.range} VU)</option>)}
                  </select>
                </label>
              )}
              {!readOnly && info && info.weapons && info.weapons.length > 0 && (
                <div className="rt-vm-pins">
                  <div className="rt-vm-sub">Pin a range to the chart, so it stays when this ship is not picked</div>
                  <div className="rt-vm-add">
                    {arcWedges(map, selShip, info.weapons).map((wd) => (
                      <button key={wd.slot || 'all'} type="button"
                        className={'rt-vm-chipbtn' + (isPinned(map, selShip.id, wd.slot) ? ' on' : '')}
                        style={{ borderColor: SLOT_COLOUR[wd.slot || ''] }}
                        title={wd.weapons.join(', ')}
                        onClick={() => commit(togglePin(map, selShip.id, wd.slot, wd.range, wd.weapons.join(', ')))}>
                        {slotName(wd.slot)} {wd.range}
                      </button>
                    ))}
                    <button type="button" className="rt-btn ghost" onClick={() => commit(togglePins(map, selShip.id, info.weapons))}>
                      {map.overlays.some((o) => o.shipId === selShip.id) ? 'Unpin all' : 'Pin all'}
                    </button>
                  </div>
                </div>
              )}
              <div className="rt-vm-sub">Other ships, nearest first. Click one to line up a shot.</div>
              <ul className="rt-vm-shots">
                {shots.map(({ ship, reach: r }) => {
                  const bad = r.blocked || r.canFire === false;
                  return (
                    <li key={ship.id}>
                      <button type="button"
                        className={'rt-vm-shot' + (target && target.id === ship.id ? ' on' : '') + (bad ? ' bad' : '')}
                        onClick={() => aimAt(ship.id)}>
                        <span style={{ color: SIDE_COLOUR[ship.side] }}>{ship.state === 'ping' ? 'Unknown contact' : ship.name}</span>
                        <span className="rt-vm-dist">{r.distance} VU</span>
                        <span className="rt-vm-note">
                          {r.blocked ? `blocked by ${r.blocked}`
                            : r.outOfArc ? `outside the ${r.arc.slot} arc (${Math.round(r.arc.relative)}\u00b0 from the bow)`
                              : r.band === 'out' ? 'out of range'
                              : [r.band, r.terrainMod ? `${r.terrainMod}` : '', r.silhouetted ? 'silhouetted +10' : ''].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {shots.length === 0 && <li className="rt-vm-sub">No other ship on the chart.</li>}
              </ul>
              {targeted && (
                <div className="rt-vm-shotcard">
                  <b>{selShip.name} {'→'} {targeted.ship.name}</b>
                  <div>{targeted.reach.distance} VU{weapon ? `, ${weapon.name} reaches ${weapon.range}` : ''}</div>
                  {targeted.reach.blocked && <div className="bad">{targeted.reach.blocked} is between them. No shot.</div>}
                  {targeted.reach.outOfArc && (
                    <div className="bad">
                      {slotName(targeted.reach.arc.slot)} arc does not cover it: it lies {Math.round(targeted.reach.arc.relative)}{'\u00b0'} round from the bow.
                    </div>
                  )}
                  {bearing_.length > 0 && (
                    <ul className="rt-vm-bears">
                      {bearing_.map(({ index, weapon: wp, reach: r, bears }) => (
                        <li key={index}>
                          <button type="button"
                            className={(bears ? 'ok' : 'no') + (index === Math.min(weaponIx, info.weapons.length - 1) ? ' on' : '')}
                            title="Use this weapon" onClick={() => setWeaponIx(index)}>
                            <span>{wp.name}{wp.slot ? ` \u00b7 ${wp.slot}` : ''}</span>
                            <span>{bears
                              ? `bears \u00b7 ${r.band}${gunnery && gunnery.targetNumber && gunnery.targetNumber(wp.id) != null ? ` \u00b7 ${gunnery.targetNumber(wp.id)}` : ''}`
                              : r.blocked ? 'blocked' : r.outOfArc ? 'outside arc' : 'out of range'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {targeted.reach.parts.map((p) => <div key={p.label}>{p.label}: {p.value}</div>)}
                  {targeted.reach.silhouetted && <div>Silhouetted against {targeted.reach.silhouette}: +10</div>}
                  {gunnery && !readOnly && (
                    <div className="rt-vm-gun">
                      <div className="rt-vm-gunrow">
                        <label>BS / crew{numInput(gunnery.bs, gunnery.setBs, { min: 0, max: 100 })}</label>
                        <label>Lock DoS{numInput(gunnery.lockDoS, gunnery.setLockDoS, { min: 0, max: 9 })}</label>
                        <label>Spirit DoS{numInput(gunnery.spiritDoS, gunnery.setSpiritDoS, { min: 0, max: 9 })}</label>
                      </div>
                      {gunnery.hit && gunnery.hit.canFire && (
                        <div className="rt-vm-tn">
                          <b>Target {gunnery.hit.target}</b>
                          <span>
                            {gunnery.hit.base} base
                            {gunnery.hit.parts.filter((pt) => pt.value).map((pt) => ` ${pt.value > 0 ? '+' : '\u2212'}${Math.abs(pt.value)} ${pt.label.toLowerCase()}`).join('')}
                            {gunnery.hit.band ? ` \u00b7 ${gunnery.hit.band} range` : ''}
                          </span>
                        </div>
                      )}
                      <div className="rt-vm-btns">
                        <button type="button" className="rt-btn" disabled={!gunnery.canShoot} onClick={gunnery.fire}
                          title="Roll this weapon's Ballistic Skill test and apply what it does to the target">Roll attack</button>
                        <button type="button" className="rt-btn" disabled={!bearing_.some((b) => b.bears)}
                          onClick={() => gunnery.volley(bearing_.filter((b) => b.bears).map((b) => b.weapon.id))}
                          title="Roll every weapon that bears on the target, one after another">
                          Fire all that bear ({bearing_.filter((b) => b.bears).length})
                        </button>
                        <button type="button" className="rt-btn ghost" onClick={gunnery.rollCritical}
                          title="Roll on the critical table for the target">Roll critical</button>
                      </div>
                      {gunnery.log && gunnery.log.length > 0 && (
                        <ul className="rt-vm-gunlog">
                          {gunnery.log.map((en, i) => <li key={en.key || i} className={en.kind}>{en.text}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                  {onUseShot && !readOnly && (
                    <button type="button" className="rt-btn ghost" disabled={Boolean(targeted.reach.blocked) || targeted.reach.canFire === false}
                      title={targeted.reach.outOfArc ? 'This weapon cannot fire that way. Pick one that bears.' : undefined}
                      onClick={() => onUseShot({
                        attackerId: selShip.id, targetId: targeted.ship.id, distance: targeted.reach.distance,
                        silhouetted: targeted.reach.silhouetted, silhouette: targeted.reach.silhouette,
                        parts: targeted.reach.parts, weaponId: weapon ? weapon.id : null
                      })}>
                      Open in Void combat
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : selBody ? (
            <div className="rt-vm-card">
              <div className="rt-vm-h">{selBody.name}</div>
              <div className="rt-vm-sub">{BODY_KINDS[selBody.kind].name} {'·'} radius {selBody.r} VU</div>
              {selBody.note && <p className="rt-vm-p">{selBody.note}</p>}
              {!readOnly && (
                <div className="rt-vm-grid">
                  <label className="rt-vm-wide">Name <input className="rt-field" value={selBody.name} onChange={(e) => patchBody(selBody.id, { name: e.target.value }, `n-${selBody.id}`)} /></label>
                  <label>Radius {numInput(selBody.r, (v) => patchBody(selBody.id, { r: Math.max(0.2, v) }, `r-${selBody.id}`), { step: 0.25, min: 0.2 })}</label>
                  <label>Facing {numInput(selBody.rot, (v) => patchBody(selBody.id, { rot: ((Math.round(v) % 360) + 360) % 360 }, `rot-${selBody.id}`), { min: 0, max: 359, step: 15 })}</label>
                  <label>Table sees
                    <select className="rt-sel" value={selBody.state} onChange={(e) => patchBody(selBody.id, { state: e.target.value })}>
                      {STATES.map((s) => <option key={s} value={s}>{STATE_NAME[s]}</option>)}
                    </select>
                  </label>
                  <label className="rt-vm-wide">Note <textarea className="rt-field" rows={2} value={selBody.note} onChange={(e) => patchBody(selBody.id, { note: e.target.value }, `note-${selBody.id}`)} /></label>
                  <div className="rt-vm-row">
                    <button type="button" className="rt-ico-btn" title="Turn 15° left (Shift+R)" aria-label="Turn left" onClick={() => rotateSel(-15)}><Ico name="turnLeft" /></button>
                    <button type="button" className="rt-ico-btn" title="Turn 15° right (R)" aria-label="Turn right" onClick={() => rotateSel(15)}><Ico name="turnRight" /></button>
                    <button type="button" className="rt-ico-btn" title="Delete (Del)" aria-label="Delete" onClick={removeSel}><Ico name="trash" /></button>
                  </div>
                </div>
              )}
            </div>
          ) : selField ? (
            <div className="rt-vm-card">
              <div className="rt-vm-h">{selField.name}</div>
              <div className="rt-vm-sub">
                {selField.shotMod ? `Shots through: ${selField.shotMod}` : 'No effect on shots'}
                {selField.moveMod != null ? ` · Pilot test ${selField.moveMod}` : ''}
              </div>
              {selField.note && <p className="rt-vm-p">{selField.note}</p>}
              {!readOnly && (
                <div className="rt-vm-grid">
                  <label className="rt-vm-wide">Name <input className="rt-field" value={selField.name} onChange={(e) => patchField(selField.id, { name: e.target.value }, `n-${selField.id}`)} /></label>
                  <label>Shot modifier {numInput(selField.shotMod, (v) => patchField(selField.id, { shotMod: Math.round(v) }, `s-${selField.id}`), { step: 5, min: -50, max: 50 })}</label>
                  <label>Pilot test {numInput(selField.moveMod == null ? '' : selField.moveMod, (v) => patchField(selField.id, { moveMod: Math.round(v) }, `m-${selField.id}`), { step: 5, min: -50, max: 50, placeholder: 'none' })}</label>
                  {selField.shape === 'circle'
                    ? <label>Radius {numInput(selField.r, (v) => patchField(selField.id, { r: Math.max(0.5, v) }, `r-${selField.id}`), { step: 0.5, min: 0.5 })}</label>
                    : <label>Width {numInput(selField.w, (v) => patchField(selField.id, { w: Math.max(1, v) }, `w-${selField.id}`), { step: 1, min: 1 })}</label>}
                  {selField.drift && (
                    <label>Drift (VU/turn) {numInput(selField.drift[0], (v) => patchField(selField.id, { drift: [v, selField.drift[1]] }, `d-${selField.id}`), { step: 1 })}
                      {numInput(selField.drift[1], (v) => patchField(selField.id, { drift: [selField.drift[0], v] }, `d-${selField.id}`), { step: 1 })}</label>
                  )}
                  <label>Table sees
                    <select className="rt-sel" value={selField.state} onChange={(e) => patchField(selField.id, { state: e.target.value })}>
                      {STATES.map((s) => <option key={s} value={s}>{STATE_NAME[s]}</option>)}
                    </select>
                  </label>
                  <label className="rt-vm-wide">Note <textarea className="rt-field" rows={2} value={selField.note} onChange={(e) => patchField(selField.id, { note: e.target.value }, `note-${selField.id}`)} /></label>
                  <div className="rt-vm-row">
                    <button type="button" className="rt-ico-btn" aria-label="Turn left"
                      title={selField.shape === 'band' ? 'Turn 15° left about its middle (Shift+R)' : 'Turn what is inside it 15° left (Shift+R)'}
                      onClick={() => rotateSel(-15)}><Ico name="turnLeft" /></button>
                    <button type="button" className="rt-ico-btn" aria-label="Turn right"
                      title={selField.shape === 'band' ? 'Turn 15° right about its middle (R)' : 'Turn what is inside it 15° right (R)'}
                      onClick={() => rotateSel(15)}><Ico name="turnRight" /></button>
                    <button type="button" className="rt-ico-btn" title="Delete (Del)" aria-label="Delete" onClick={removeSel}><Ico name="trash" /></button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rt-vm-card">
              <div className="rt-vm-h">{map.name}</div>
              {map.source && <div className="rt-vm-sub">{map.source.zoneName}{map.source.star ? ` · ${map.source.star}` : ''}</div>}
              {map.source && map.source.features.length > 0 && <div className="rt-vm-sub">System: {map.source.features.join(', ')}</div>}
              {map.hazards.map((h) => <p key={h.id} className="rt-vm-p"><b>{h.name}{h.intensity > 1 ? ` ×${h.intensity}` : ''}.</b> {h.note}</p>)}
              <p className="rt-vm-sub">
                {map.minis
                  ? 'Ships are drawn as bases, for the models on the table. Move a token to match its model; the dot on its nose turns it.'
                  : 'Click a ship to see its Speed and weapon reach and to line up shots. Drag it to move it; the dot on its nose turns it.'}
                {' '}Click a ship to see its arcs and reach, and Shift-click another to pick it as the target.
              </p>
              {!readOnly && (
                <div className="rt-vm-arcs">
                  <div className="rt-vm-sub">
                    Firing arcs: where each mount covers, in degrees clockwise from the bow. A
                    weapon cannot fire outside its mount{'\u2019'}s arc.
                  </div>
                  {ARC_SLOTS.map((slot) => (
                    <div key={slot} className="rt-vm-arcrow">
                      <span style={{ color: SLOT_COLOUR[slot] }}>{slotName(slot)}</span>
                      <label>centre
                        {numInput(map.arcs[slot].c, (v) => commit({ ...map, arcs: { ...map.arcs, [slot]: { ...map.arcs[slot], c: ((Math.round(v) % 360) + 360) % 360 } } }, `arc-${slot}`), { min: 0, max: 359, step: 5 })}
                      </label>
                      <label>width
                        {numInput(map.arcs[slot].w, (v) => commit({ ...map, arcs: { ...map.arcs, [slot]: { ...map.arcs[slot], w: Math.min(360, Math.max(MIN_ARC, Math.round(v))) } } }, `arc-${slot}`), { min: MIN_ARC, max: 360, step: 5 })}
                      </label>
                    </div>
                  ))}
                  <button type="button" className="rt-btn ghost"
                    disabled={ARC_SLOTS.every((k) => map.arcs[k].c === ARC_DEFAULTS[k].c && map.arcs[k].w === ARC_DEFAULTS[k].w)}
                    onClick={() => commit({ ...map, arcs: { ...ARC_DEFAULTS } })}>Reset to the defaults</button>
                </div>
              )}
              {map.ships.length > 0 && (
                <ul className="rt-vm-shots">
                  {map.ships.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="rt-vm-shot" onClick={() => setSel({ type: 'ship', id: s.id })}>
                        <span style={{ color: SIDE_COLOUR[s.side] }}>{s.state === 'ping' ? 'Unknown contact' : s.name}</span>
                        <span className="rt-vm-dist">{Math.floor(s.x)}, {Math.floor(s.y)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!readOnly && (
            <div className="rt-vm-card">
              <div className="rt-vm-sub">Add to the chart</div>
              <div className="rt-vm-add">
                {[['planet', 'Planet'], ['gas_giant', 'Gas giant'], ['moon', 'Moon'], ['asteroid', 'Rock'], ['station', 'Station'], ['hulk', 'Hulk'],
                  ['dust_cloud', 'Dust'], ['asteroid_cluster', 'Cluster'], ['asteroid_belt', 'Belt'], ['gravity_riptide', 'Riptide'], ['nebula', 'Gas cloud']].map(([k, label]) => (
                  <button key={k} type="button" className="rt-btn ghost" onClick={() => addThing(k)}>{label}</button>
                ))}
              </div>
              {unplaced.length > 0 && (
                <div className="rt-vm-add">
                  {unplaced.map((f) => (
                    <button key={f.id} type="button" className="rt-btn" onClick={() => {
                      const c = centre();
                      commit({ ...map, ships: [...map.ships, { id: f.id, name: f.name, cls: f.cls || '', side: f.side || 'neutral', x: c.x, y: c.y, heading: 0, state: 'seen' }] });
                      setSel({ type: 'ship', id: f.id });
                    }}>+ {f.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {library && !readOnly && (
            <div className="rt-vm-card rt-vm-lib">
              <div className="rt-vm-sub">
                Charts
                {library.currentId ? '' : ' \u00b7 this one is not saved yet'}
                {library.dirty && library.currentId ? ' \u00b7 changes not saved' : ''}
              </div>
              <label className="rt-vm-wide">Name
                <input className="rt-field" value={libName} onChange={(e) => setLibName(e.target.value)} />
              </label>
              <div className="rt-vm-add">
                <button type="button" className="rt-btn" onClick={() => library.onSave(libName || map.name)}
                  title={library.currentId ? 'Save over the saved chart of this name' : 'Keep this chart in the library'}>
                  {library.currentId ? 'Save' : 'Save chart'}
                </button>
                {library.currentId && (
                  <button type="button" className="rt-btn ghost" onClick={() => library.onSaveAs(libName || map.name)}
                    title="Keep it as a second chart, and leave the saved one as it was">Save as new</button>
                )}
                <button type="button" className="rt-btn ghost" onClick={() => guard(() => library.onNew())}>New chart</button>
                <button type="button" className="rt-btn ghost" onClick={() => guard(() => library.onClose())}
                  title="Take this chart off the screen (and out of its window)">Close chart</button>
              </div>
              {library.error && <p className="rt-warn">{library.error}</p>}
              {library.note && !library.error && <p className="rt-vm-sub">{library.note}</p>}
              {library.list.length > 0 ? (
                <ul className="rt-vm-saved">
                  {library.list.map((c) => (
                    <li key={c.id} className={c.id === library.currentId ? 'on' : ''}>
                      <button type="button" className="rt-vm-open" title="Open this chart"
                        onClick={() => (c.id === library.currentId ? null : guard(() => library.onOpen(c.id)))}>
                        <span>{c.name}</span>
                        <span className="rt-vm-dist">{c.cols}{'\u00d7'}{c.rows}{c.ships ? ` \u00b7 ${c.ships} ship${c.ships === 1 ? '' : 's'}` : ''}</span>
                      </button>
                      <button type="button" className="rt-ico-btn" title="Delete this saved chart" aria-label={`Delete ${c.name}`}
                        onClick={() => confirmIn(`Delete \u201c${c.name}\u201d?`,
                          'It goes out of the library for good. The chart on screen stays as it is.', 'Delete it', () => library.onDelete(c.id))}>
                        <Ico name="trash" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="rt-vm-sub">Nothing saved yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A point on the chart, snapped to a square centre unless Alt is held.
function snapPoint(map, p, free) {
  if (free) return { x: Math.min(map.cols, Math.max(0, p.x)), y: Math.min(map.rows, Math.max(0, p.y)) };
  return snapToSquare(map, p);
}

