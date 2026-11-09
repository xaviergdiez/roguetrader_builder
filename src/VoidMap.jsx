import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import TipButton from './TipButton.jsx';
import { makeRng } from './mapgen.js';
import {
  readVoidMap, BODY_KINDS, FIELD_KINDS, SIDES, STATES, newVoidId,
  reach, moveCheck, moveShip, turnShip, snapToSquare, distanceVU, bearing,
  inField, applyDrift, arcWedges, weaponsBearing, ARC_SLOTS, ARC_DEFAULTS, MIN_ARC,
  rotateThing, rotateScene, clearChart, removeThing, togglePins, togglePin, isPinned, overlayWedges,
  VOID_TRIGGER_WHEN, STRIKE_DICE, readStrike
} from './voidmap.js';
import {
  springVoidEnter, springVoidNow, strikesAhead, strikeText, moversOf, motionAhead, courseFrom, headingOf, orbitAll
} from './voidturn.js';
import { readBackdrop, newBackdropId, backdropKindOf } from './backdrop.js';
import { putLocalFile } from './localfiles.js';
import useBackdropMedia from './useBackdropMedia.js';
import useVoidArt, { tintedArt } from './useVoidArt.js';
import GenerateFloor from './GenerateFloor.jsx';
import { placeOver, generateVoidSet } from './genai.js';
import { getLocalFile } from './localfiles.js';
import { voidBodyArt, voidFieldArt, voidShipArt } from './spritesheet.js';
import { runFrames } from './gsapcdn.js';
import { MOTION_FRAME_MS, VIDEO_FRAME_MS } from './motion.js';
import { measureMedia } from './measureMedia.js';

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
  turnRight: <><path d="M21 4v6h-6" /><path d="M18.5 15a8 8 0 11-5-9.5L21 10" /></>,
  trigger: <><circle cx="12" cy="12" r="8" strokeDasharray="3 2.5" /><path d="M12 8v5M12 16v.5" /></>,
  picture: <><rect x="3" y="5" width="18" height="14" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.5" /></>,
  motion: <><path d="M3 12c3-6 6 6 9 0s6 6 9 0" /></>,
  aim: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
  present: <><rect x="3" y="4" width="18" height="12" /><path d="M8 20h8M12 16v4" /></>
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

/* ---- the painted tokens (useVoidArt.js) ----
   A picture is placed by the box its art fills, centred where the thing is and
   `size` across its longer side, so a world of radius r is drawn 2r wide
   whatever margin its cell had. */
function artAt(ctx, sp, src, x, y, size, angle = 0) {
  const k = size / Math.max(sp.bw, sp.bh);
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(src, sp.bx, sp.by, sp.bw, sp.bh, (-sp.bw * k) / 2, (-sp.bh * k) / 2, sp.bw * k, sp.bh * k);
  ctx.restore();
}

/* A body drawn with its picture. A world is painted whole and evenly lit (the
   prompt asks for that, since a night side would be keyed out), so the chart
   lays its own shade over it, away from its star, and draws it over a dark disc
   clipped to its circle: anything the keying nicked from its edge shows shadow,
   not sky. */
function drawBodyArt(ctx, b, sp, look, lightDir, scale) {
  const turn = ((b.rot || 0) * Math.PI) / 180;
  const src = tintedArt(sp, b.tone, look.tint);
  if (b.kind === 'planet' || b.kind === 'gas_giant' || b.kind === 'moon') {
    ctx.save();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(b.tone, '#000000', 0.72); ctx.fill();
    ctx.clip();
    artAt(ctx, sp, src, b.x, b.y, b.r * 2.04, turn);
    const g = ctx.createRadialGradient(
      b.x + lightDir.x * b.r * 0.6, b.y + lightDir.y * b.r * 0.6, b.r * 0.2, b.x, b.y, b.r * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    ctx.restore();
    return;
  }
  if (b.kind === 'torpedoes' || b.kind === 'attack_craft') {
    // Pointed the way they are going, as the drawn ones are.
    const ang = b.course ? Math.atan2(b.course[1], b.course[0]) + Math.PI / 2 : turn;
    artAt(ctx, sp, src, b.x, b.y, Math.max(b.r, 7 / scale) * 2.6, ang);
    return;
  }
  // A hulk's picture runs up the cell; the drawn one lies along its rotation.
  if (b.kind === 'hulk') { artAt(ctx, sp, src, b.x, b.y, b.r * 2.8, turn + Math.PI / 2); return; }
  artAt(ctx, sp, src, b.x, b.y, b.r * (b.kind === 'station' ? 2.3 : 2.2), turn);
}

function drawBody(ctx, b, lightDir, scale, sel, art = null) {
  const lw = 1 / scale;
  const look = art ? voidBodyArt(b) : null;
  const sp = look ? art[look.role] : null;
  if (b.air > 0) {
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.97, b.x, b.y, b.r * (1.06 + 0.07 * b.air));
    g.addColorStop(0, rgba(b.tone, 0.6));
    g.addColorStop(1, rgba(b.tone, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.06 + 0.07 * b.air), 0, Math.PI * 2); ctx.fill();
  }
  if (sp) {
    drawBodyArt(ctx, b, sp, look, lightDir, scale);
  } else if (b.kind === 'planet' || b.kind === 'gas_giant' || b.kind === 'moon') {
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
  } else if (b.kind === 'torpedoes' || b.kind === 'attack_craft') {
    // Pointed the way they are going: their course, or their facing if none.
    const ang = b.course ? Math.atan2(b.course[1], b.course[0]) + Math.PI / 2 : ((b.rot || 0) * Math.PI) / 180;
    const s = Math.max(b.r, 7 / scale);
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(ang);
    if (b.kind === 'torpedoes') {
      for (const off of [-0.45, 0, 0.45]) {
        ctx.fillStyle = 'rgba(255,170,90,0.95)';
        ctx.beginPath();
        ctx.moveTo(off * s, -s * 0.9); ctx.lineTo(off * s + s * 0.13, s * 0.4); ctx.lineTo(off * s - s * 0.13, s * 0.4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,120,60,0.55)'; ctx.lineWidth = lw * 2;
        ctx.beginPath(); ctx.moveTo(off * s, s * 0.45); ctx.lineTo(off * s, s * 1.1); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(160,210,255,0.95)'; ctx.lineWidth = lw * 1.8;
      for (const [ox, oy] of [[0, -0.6], [-0.55, 0.1], [0.55, 0.1], [0, 0.7]]) {
        ctx.beginPath();
        ctx.moveTo(ox * s - s * 0.28, oy * s + s * 0.22); ctx.lineTo(ox * s, oy * s - s * 0.12); ctx.lineTo(ox * s + s * 0.28, oy * s + s * 0.22);
        ctx.stroke();
      }
    }
    ctx.restore();
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

/* `t` is the time in seconds when the chart moves (map.motion), else 0: a
   cloud turns slowly, rocks tumble round a cluster or run along a belt, and a
   riptide's chevrons flow the way it carries a hull. */
function drawField(ctx, f, bits, scale, sel, map, t = 0, art = null) {
  const lw = 1 / scale;
  ctx.save();
  const faint = f.state === 'hidden' ? 0.55 : 1;
  ctx.globalAlpha = faint;
  const role = art ? voidFieldArt(f.kind) : null;
  const sp = role ? art[role] : null;
  if (f.kind === 'dust_cloud' || f.kind === 'nebula') {
    const tint = f.kind === 'nebula' ? '#a58fd6' : '#b09a78';
    const turn = ((f.rot || 0) * Math.PI) / 180 + t * 0.025;
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
  } else if (f.kind === 'warp_rift') {
    // The veil torn: a bruise of colour that turns on itself.
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, 'rgba(220,140,255,0.35)');
    g.addColorStop(0.6, 'rgba(140,60,220,0.18)');
    g.addColorStop(1, 'rgba(90,20,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(210,150,255,0.6)'; ctx.lineWidth = lw * 1.5;
    const spin = t * 0.35 + ((f.rot || 0) * Math.PI) / 180;
    if (sp) {
      // The painted rift, turning: its swirl turns the way the drawn one does.
      ctx.globalAlpha = faint * 0.92;
      artAt(ctx, sp, sp.c, f.x, f.y, f.r * 2.1, -spin);
      ctx.globalAlpha = faint;
    }
    for (let i = 0; i < (sp ? 0 : 3); i++) {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const u = k / 24;
        const a = spin + i * (Math.PI * 2 / 3) + u * 2.6;
        const rr = f.r * (0.15 + 0.8 * u);
        const x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  } else if (f.kind === 'radiation_zone') {
    fieldPath(ctx, f);
    ctx.fillStyle = 'rgba(110,255,130,0.06)'; ctx.fill();
    const beat = t ? (t * 0.5) % 1 : 0.5;
    ctx.strokeStyle = 'rgba(140,255,150,0.5)'; ctx.lineWidth = lw * 1.3;
    for (const k of [0, 0.33, 0.66]) {
      const u = (beat + k) % 1;
      ctx.globalAlpha = faint * (1 - u);
      ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(0.01, f.r * u), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = faint;
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
    // Flowing along the band when the chart moves.
    const flow = t ? ((t * 1.6) % step) * (Math.cos(dir) * dx + Math.sin(dir) * dy >= 0 ? 1 : -1) : 0;
    for (let k = 2; k < len + step; k += step) {
      const along = ((k + flow) % len + len) % len;
      const cx = f.x + (dx / len) * along;
      const cy = f.y + (dy / len) * along;
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
    // Rocks tumbling: round a cluster, along a belt.
    const spin = t * 0.02;
    for (const s0 of bits || []) {
      const s = !t ? s0 : f.shape === 'band' ? { ...s0, u: (s0.u + t * 0.004) % 1 } : { ...s0, a: s0.a + spin * (0.6 + s0.d) };
      const p = fieldPoint(f, s);
      if (p.x < -1 || p.y < -1 || p.x > map.cols + 1 || p.y > map.rows + 1) continue;
      if (sp) {
        // The big ones in a belt are boulders, the rest the belt's rocks.
        const big = role === 'rock' && s.s > 0.36 && art.asteroid;
        ctx.globalAlpha = faint * (0.6 + 0.4 * s.o);
        artAt(ctx, big || sp, (big || sp).c, p.x, p.y, s.s * (role === 'debris' ? 3.2 : 2.8), s.a * 3 + (t ? t * 0.25 * (0.5 + s.d) : 0));
        continue;
      }
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

function drawShip(ctx, s, scale, { sel, target, live, over, minis, art }) {
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

  const sp = art ? art[voidShipArt(s.side)] : null;
  if (sp) {
    // The painted hull, prow up as the drawn one is, on a wash of its side's
    // colour so the table can still tell friend from foe at a glance.
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.7);
    halo.addColorStop(0, rgba(colour, 0.38)); halo.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, len * 0.7, 0, Math.PI * 2); ctx.fill();
    artAt(ctx, sp, sp.c, 0, 0, len * 1.25, 0);
    if (sel || target || s.state !== 'seen') {
      ctx.lineWidth = lw * (sel ? 2.4 : 1.6);
      ctx.strokeStyle = sel ? '#ffffff' : target ? '#ffe28a' : rgba(colour, 0.8);
      if (s.state !== 'seen') ctx.setLineDash([4 * lw, 3 * lw]);
      ctx.beginPath(); ctx.arc(0, 0, len * 0.68, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (over) {
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = lw * 2;
      ctx.beginPath(); ctx.arc(0, 0, len * 0.8, 0, Math.PI * 2); ctx.stroke();
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
  // The time, when the chart moves; the picture under it, decoded; what the
  // table is warned of; and whether the GM's zones show here.
  const t = env.t || 0;
  const media = env.media || null;
  const ahead = env.ahead || [];
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

  // A picture or a looping video under everything, where the GM laid it.
  if (media && map.backdrop) {
    const b = map.backdrop;
    try { ctx.drawImage(media.el, b.x, b.y, b.w, b.h); } catch { /* not decoded yet */ }
  }

  // The star's light first, so everything else sits in it: a corona that falls
  // away with distance, and under it a limb-darkened disc.
  for (const star of map.stars) {
    // The corona breathes when the chart moves.
    const R = star.r * 6 * (t ? 1 + 0.05 * Math.sin(t * 0.7) : 1);
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
    // A flare's light comes and goes when the chart moves.
    const pulse = t ? 0.6 + 0.4 * Math.abs(Math.sin(t * 0.9)) : 1;
    const alpha = Math.min(0.09, 0.025 * weather) * pulse;
    ctx.fillStyle = rad ? `rgba(110,255,130,${alpha})` : `rgba(255,170,90,${alpha})`;
    ctx.fillRect(0, 0, map.cols, map.rows);
  }

  const art = env.art || null;
  for (const f of map.fields) drawField(ctx, f, scenery.fields[f.id], scale, sel && sel.type === 'field' && sel.id === f.id, map, t, art);

  /* WHERE THE MOVERS ARE GOING: each one's next three turns, fainter the
     further off, and a line along its course, so the table can plan around a
     swarm before it arrives. A hidden one shows only on the GM's chart. */
  const ahead3 = env.ghosts || new Map();
  for (const mv of moversOf(map)) {
    const th = mv.thing;
    if (th.state === 'hidden' && readOnly) continue;
    const ghosts = ahead3.get(`${mv.type}:${th.id}`) || [];
    if (!ghosts.length) continue;
    // An orbit, drawn whole and faint: the path the world keeps to.
    if (th.orbit) {
      const parent = th.orbit.parent ? map.bodies.find((b) => b.id === th.orbit.parent) : null;
      const c = parent || { x: th.orbit.cx, y: th.orbit.cy };
      ctx.save();
      ctx.setLineDash([2 * lw, 5 * lw]);
      ctx.strokeStyle = 'rgba(190,210,255,0.28)'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(c.x, c.y, Math.hypot(th.x - c.x, th.y - c.y), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const pulse = t ? 0.75 + 0.25 * Math.sin(t * 2.2) : 1;
    ctx.save();
    ctx.setLineDash([4 * lw, 4 * lw]);
    ghosts.forEach((g, i) => {
      const a = (0.55 - i * 0.14) * pulse;
      ctx.strokeStyle = th.strike ? `rgba(255,120,90,${a})` : `rgba(170,200,255,${a})`;
      ctx.lineWidth = lw * 1.3;
      if (mv.type === 'field') fieldPath(ctx, g);
      else { ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); }
      ctx.stroke();
    });
    ctx.setLineDash([]);
    if (!th.course) { ctx.restore(); continue; }
    const last = ghosts[ghosts.length - 1];
    const from = mv.type === 'field' && th.shape === 'band' ? { x: (th.x + th.x2) / 2, y: (th.y + th.y2) / 2 } : th;
    const to = mv.type === 'field' && last.shape === 'band' ? { x: (last.x + last.x2) / 2, y: (last.y + last.y2) / 2 } : last;
    ctx.strokeStyle = th.strike ? 'rgba(255,140,100,0.8)' : 'rgba(170,200,255,0.75)';
    ctx.lineWidth = lw * 1.6;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const hd = 0.9;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(ang - 0.45) * hd, to.y - Math.sin(ang - 0.45) * hd);
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - Math.cos(ang + 0.45) * hd, to.y - Math.sin(ang + 0.45) * hd);
    ctx.stroke();
    ctx.restore();
  }

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
    drawBody(ctx, b, light, scale, sel && sel.type === 'body' && sel.id === b.id, art);
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

  /* THE AIM: a firing ship's arcs where its model stands, facing the way it
     faces, and the line to the target's model. Drawn for the table too: it is
     the overlay the projector is for, as on the boarding map. */
  if (env.aim && env.aim.from) {
    const a = env.aim;
    if (a.wedges && a.wedges.length) drawWedges(ctx, a.from, a.wedges, scale, 'sel', labels);
    const rr = Math.max(hullLength(a.cls) * 0.55, 10 / scale);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,226,138,0.95)'; ctx.lineWidth = lw * 2;
    ctx.setLineDash([4 * lw, 3 * lw]);
    ctx.beginPath(); ctx.arc(a.from.x, a.from.y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const hdg = (a.heading * Math.PI) / 180;
    ctx.beginPath(); ctx.moveTo(a.from.x, a.from.y);
    ctx.lineTo(a.from.x + Math.sin(hdg) * rr * 1.6, a.from.y - Math.cos(hdg) * rr * 1.6); ctx.stroke();
    if (a.to) {
      const r = a.reach;
      ctx.strokeStyle = !r || r.blocked || r.canFire === false ? '#ff5a4a' : r.parts && r.parts.length ? '#ffbf47' : '#58e08a';
      ctx.lineWidth = lw * 2.2; ctx.setLineDash([8 * lw, 5 * lw]);
      ctx.beginPath(); ctx.moveTo(a.from.x, a.from.y); ctx.lineTo(a.to.x, a.to.y); ctx.stroke();
      ctx.setLineDash([]);
      const tr = Math.max(0.9, 9 / scale);
      ctx.beginPath(); ctx.arc(a.to.x, a.to.y, tr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(a.to.x + dx * tr * 0.6, a.to.y + dy * tr * 0.6); ctx.lineTo(a.to.x + dx * tr * 1.5, a.to.y + dy * tr * 1.5);
      }
      ctx.stroke();
      if (r) labels.push([(a.from.x + a.to.x) / 2, (a.from.y + a.to.y) / 2, `${r.distance} VU${r.band ? ` \u00b7 ${r.band}` : ''}`, 'rgba(255,236,170,0.98)']);
    }
    ctx.restore();
  }

  // A ship in a mover's path, ringed: struck if it holds still.
  for (const a of ahead) {
    const s = map.ships.find((x) => x.id === a.shipId);
    if (!s) continue;
    const r = Math.max(hullLength(s.cls) * 0.75, 14 / scale);
    ctx.save();
    ctx.setLineDash([3 * lw, 3 * lw]);
    ctx.strokeStyle = a.inTurns === 1 ? 'rgba(255,80,60,0.95)' : 'rgba(255,150,90,0.8)';
    ctx.lineWidth = lw * (a.inTurns === 1 ? 2.2 : 1.6);
    ctx.beginPath(); ctx.arc(s.x, s.y, r * (t ? 1 + 0.06 * Math.sin(t * 4) : 1), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // The GM's zones, where they may be seen.
  if (env.zones) {
    for (const z of map.triggers) {
      const on = sel && sel.type === 'trigger' && sel.id === z.id;
      ctx.save();
      ctx.fillStyle = z.armed ? `rgba(168,85,247,${on ? 0.18 : 0.08})` : 'rgba(140,140,150,0.06)';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([5 * lw, 3 * lw]);
      ctx.strokeStyle = z.armed ? 'rgba(200,140,255,0.9)' : 'rgba(170,170,180,0.55)';
      ctx.lineWidth = lw * (on ? 2 : 1.3);
      ctx.stroke();
      ctx.setLineDash([]);
      if (on && !readOnly) {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(z.x + z.r, z.y, 4 / scale, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // The picture being placed: its edge, and the corner that sizes it.
  if (env.placing && map.backdrop) {
    const b = map.backdrop;
    ctx.save();
    ctx.setLineDash([6 * lw, 4 * lw]);
    ctx.strokeStyle = 'rgba(243,201,110,0.95)';
    ctx.lineWidth = lw * 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    const hs = 10 / scale;
    ctx.fillStyle = 'rgba(243,201,110,0.95)';
    ctx.fillRect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs);
    ctx.restore();
  }

  // Ships, over everything.
  for (const s of map.ships) {
    const isSel = selShip && s.id === selShip.id;
    drawShip(ctx, s, scale, {
      minis: map.minis, art,
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
  for (const a of ahead) {
    const s = map.ships.find((x) => x.id === a.shipId);
    if (!s) continue;
    ringLabel(ctx, scale, off, s.x, s.y - Math.max(hullLength(s.cls) * 0.75, 14 / scale) - 10 / scale,
      a.inTurns === 1 ? `${a.by}: struck next turn` : `${a.by}: struck in ${a.inTurns} turns`,
      a.inTurns === 1 ? 'rgba(255,110,90,0.98)' : 'rgba(255,170,120,0.95)');
  }
  if (env.zones) {
    for (const z of map.triggers) {
      ringLabel(ctx, scale, off, z.x, z.y - z.r, `${z.name || 'Trigger'}${z.armed ? '' : ' \u2713'}`,
        z.armed ? 'rgba(220,190,255,0.98)' : 'rgba(190,190,200,0.85)');
    }
  }

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
  gunnery = null, library = null,
  /* A second copy of the TOOLS with no chart of its own, for the dashboard
     while the only chart is in its own window: the GM picks a tool there
     without bringing the chart back in front of the table. */
  controlsOnly = false,
  /* { tool, setTool } when the owner holds the selection, so the panel and
     the chart it drives agree on what is in hand. Two copies with a tool each
     would make the panel a dead thing. */
  shared = null,
  /* The fight on the chart: the phase it is in, moving it on (which ends the
     chart's turn when it wraps: voidturn.js), and what to do when a trap here
     goes off, with the sounds and handouts one may set off. */
  phase = null, onAdvance = null, onTriggers = null, cues = [], handouts = [],
  /* Adding an enemy from here, as the dashboard's Fleet tab does, for when the
     fight has no ships to aim or strike: { id, name, cls } hulls to pick. */
  onAddShip = null, hulls = []
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
  const [toolOwn, setToolOwn] = useState('select');
  const tool = shared ? shared.tool : toolOwn;
  const setTool = shared ? shared.setTool : setToolOwn;
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
  // The picture under the chart (backdrop.js), and placing it by hand.
  const [picOpen, setPicOpen] = useState(false);
  const [picNote, setPicNote] = useState('');
  const picFileRef = useRef(null);
  const relinkRef = useRef(null);
  const reducedMotion = useMemo(
    () => Boolean(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches), [w]);
  const media = useBackdropMedia(map.backdrop, { win, probeOnly: controlsOnly, reducedMotion });
  // The painted worlds, rocks and ships; a copy of the controls draws nothing.
  const voidArt = useVoidArt(controlsOnly ? 'plain' : map.art);
  // What the table is warned of: ships in a mover's path.
  const ahead = useMemo(() => strikesAhead(map, 3), [map]);
  // Where every mover will be over the next three turns, for the chart to draw.
  const ghosts = useMemo(() => motionAhead(map, 3), [map]);
  // The side panel's three tabs: the fight, building the chart, the library.
  const [sideTab, setSideTab] = useState('fight');
  /* THE AIM, for ships that are models on the table and not on the chart:
     which ship fires and at which, where the GM clicked its model, the way it
     faces, and where the target's model stands. */
  const [aim, setAim] = useState({ shipId: '', targetId: '', from: null, heading: 0, to: null });
  const [aimWeaponIx, setAimWeaponIx] = useState(0);
  // The ship picked to take a hazard's strike, per hazard.
  const [strikePick, setStrikePick] = useState({});
  const menuRef = useRef(null);
  const [isFull, setIsFull] = useState(false);

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
    // A ship moved into a zone watching for it sets the zone off, in the same
    // write: one undo takes back the move and the trap together.
    let out = readVoidMap(next);
    const sprung = springVoidEnter(map, out);
    if (sprung.fired.length) out = sprung.map;
    onChange(out);
    if (sprung.fired.length) announce(sprung.fired);
  };
  /* A trap went off: its dice on the hulls it caught, through the gunnery so
     the hull and the log are the fight's own; and the rest (a sound, a
     handout, the GM's note) to the owner. */
  const announce = (fired) => {
    const hits = fired.filter((f) => f.strike).flatMap((f) => f.shipIds.map((id, i) => ({
      shipId: id, name: f.shipNames[i], why: `caught by ${f.name || 'a trap'}`, strike: f.strike })));
    if (hits.length && gunnery && gunnery.strikeShips) gunnery.strikeShips(hits);
    if (onTriggers) onTriggers(fired);
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

  /* ---- the aim: guns pointed at models ----
     The firing ship and its target stand in for a moment as two ships on the
     chart, where the GM clicked, so every number the chart gives a token (the
     reach, what is in the way, the arcs, what bears) it gives the aim too. */
  const AIM_FROM = '__aim_from';
  const AIM_TO = '__aim_to';
  const aimShip = fleetInfo[aim.shipId] || null;
  const aimWeapons = (aimShip && aimShip.weapons) || [];
  const aimWeapon = aimWeapons.length ? aimWeapons[Math.min(aimWeaponIx, aimWeapons.length - 1)] : null;
  const aimTarget = fleetInfo[aim.targetId] || null;
  const aimMap = useMemo(() => {
    if (!aim.from) return null;
    const ships = map.ships.filter((x) => x.id !== AIM_FROM && x.id !== AIM_TO);
    ships.push({ id: AIM_FROM, name: aimShip ? aimShip.name : 'Firer', cls: aimShip ? aimShip.cls : '', side: 'player',
      x: aim.from.x, y: aim.from.y, heading: aim.heading });
    if (aim.to) ships.push({ id: AIM_TO, name: aimTarget ? aimTarget.name : 'Target', cls: aimTarget ? aimTarget.cls : '', side: 'enemy', x: aim.to.x, y: aim.to.y, heading: 0 });
    return readVoidMap({ ...map, ships });
  }, [map, aim, aimShip, aimTarget]);
  const aimReach = aimMap && aim.to
    ? reach(aimMap, AIM_FROM, AIM_TO, { weaponRange: aimWeapon ? aimWeapon.range : null, slot: aimWeapon ? aimWeapon.slot : null }) : null;
  const aimBearing = aimMap && aim.to && aimWeapons.length ? weaponsBearing(aimMap, AIM_FROM, AIM_TO, aimWeapons) : [];
  const aimWedges = aim.from && aimWeapons.length
    ? arcWedges(map, { id: AIM_FROM, x: aim.from.x, y: aim.from.y, heading: aim.heading, cls: aimShip ? aimShip.cls : '' }, aimWeapons) : [];
  const aimShotKey = gunnery && !readOnly && aim.shipId && aim.targetId && aimReach && aimWeapon
    ? [aim.shipId, aim.targetId, aimWeapon.id, aimWeapon.slot, aimReach.distance, aimReach.silhouetted, aimReach.canFire,
      aimReach.parts.map((pt) => `${pt.label}${pt.value}`).join(',')].join('|') : null;
  useEffect(() => {
    if (!aimShotKey) return;
    gunnery.aim({
      attackerId: aim.shipId, targetId: aim.targetId, distance: aimReach.distance, weaponId: aimWeapon.id,
      silhouetted: aimReach.silhouetted, silhouette: aimReach.silhouette, parts: aimReach.parts,
      canFire: aimReach.canFire, blocked: aimReach.blocked, outOfArc: aimReach.outOfArc
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aimShotKey]);
  // Picking a target, the gun that can reach it, if the one in hand cannot.
  useEffect(() => {
    if (!aimBearing.length) return;
    const cur = Math.min(aimWeaponIx, aimWeapons.length - 1);
    if (aimBearing[cur] && aimBearing[cur].bears) return;
    const first = aimBearing.find((x) => x.bears);
    if (first) setAimWeaponIx(first.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim.to && `${aim.to.x},${aim.to.y}`, aim.shipId]);

  // The panel follows what is in hand: a ship or the aim to the fight, a world,
  // a field, a zone or the picture to building the chart.
  useEffect(() => {
    if (!sel) return;
    setSideTab(sel.type === 'ship' ? 'fight' : 'build');
  }, [sel && sel.type, sel && sel.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tool === 'aim') setSideTab('fight');
    if (tool === 'trigger') setSideTab('build');
  }, [tool]);
  useEffect(() => { if (picOpen) setSideTab('build'); }, [picOpen]);

  /* ---- full screen, in the chart's own window ---- */
  useEffect(() => {
    const d = w.document;
    const on = () => setIsFull(Boolean(d.fullscreenElement));
    d.addEventListener('fullscreenchange', on);
    return () => d.removeEventListener('fullscreenchange', on);
  }, [w]);
  const toggleFullscreen = () => {
    const d = w.document;
    if (d.fullscreenElement) d.exitFullscreen().catch(() => {});
    else d.documentElement.requestFullscreen().catch(() => {});
  };
  // Full screen and the controls away, for the projector. H brings them back.
  const present = () => {
    setClean(true);
    if (!w.document.fullscreenElement) w.document.documentElement.requestFullscreen().catch(() => {});
  };

  // The menu kept inside the chart: lifted when it would run off the bottom.
  useLayoutEffect(() => {
    const el = menuRef.current;
    const st = stageRef.current;
    if (!el || !st || !menu) return;
    const h = el.offsetHeight;
    const room = st.clientHeight;
    if (menu.top + h > room - 4) el.style.top = `${Math.max(4, room - h - 4)}px`;
  }, [menu]);

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

  /* ---- drawing ----
     After every render, and on a frame loop while anything moves: the chart's
     own motion (map.motion), or a video under it. The loop calls the drawing
     straight, not through React. */
  const videoUp = media.state === 'ready' && Boolean(map.backdrop) && map.backdrop.kind === 'video';
  const moves = map.motion && !reducedMotion;
  const animating = !controlsOnly && !reducedMotion && (videoUp
    || (map.motion && (map.fields.length > 0 || map.stars.length > 0 || map.hazards.length > 0 || ahead.length > 0)));
  // The GM's zones: always on the GM's own chart, and on the table's screen
  // only while the GM is working with them.
  const showZones = !readOnly && (!win || tool === 'trigger' || (sel && sel.type === 'trigger'));
  const redrawRef = useRef(() => {});
  redrawRef.current = () => {
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
      target: targeted ? { id: targeted.ship.id, reach: targeted.reach } : null,
      t: moves ? performance.now() / 1000 : 0,
      media: media.state === 'ready' ? media.mediaRef.current : null,
      art: voidArt.artRef.current,
      ahead, zones: showZones, placing: picOpen && !readOnly, ghosts,
      aim: aim.from ? { from: aim.from, to: aim.to, heading: aim.heading, wedges: aimWedges, reach: aimReach, cls: aimShip ? aimShip.cls : '' } : null
    });
  };
  useLayoutEffect(() => { redrawRef.current(); });
  useEffect(() => {
    if (!animating) return undefined;
    return runFrames(w, videoUp ? VIDEO_FRAME_MS : MOTION_FRAME_MS, () => redrawRef.current());
  }, [animating, videoUp, w]);

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
    // A zone's size handle, and with the trigger tool in hand the zones
    // themselves, before anything under them.
    if (!readOnly && sel && sel.type === 'trigger') {
      const z = map.triggers.find((x) => x.id === sel.id);
      if (z && Math.hypot(p.x - (z.x + z.r), p.y - z.y) < 9 / scale) return { type: 'resize', of: 'trigger', id: z.id };
    }
    if (!readOnly && tool === 'trigger') {
      for (let i = map.triggers.length - 1; i >= 0; i--) {
        const z = map.triggers[i];
        if (Math.hypot(p.x - z.x, p.y - z.y) <= z.r) return { type: 'trigger', id: z.id };
      }
      return null;
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
    // Placing the picture, while its card is open: a press on its corner sizes
    // it, a press on it anywhere nothing else is moves it.
    if (!readOnly && picOpen && map.backdrop) {
      const b = map.backdrop;
      const hs = 10 / view.scale;
      if (Math.abs(p.x - (b.x + b.w)) <= hs && Math.abs(p.y - (b.y + b.h)) <= hs) {
        drag.current = { kind: 'picsize', from: p, start: { ...b } };
        return;
      }
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h && !pick(p)) {
        drag.current = { kind: 'picmove', from: p, start: { ...b } };
        return;
      }
    }
    /* THE AIM TOOL. A click with no firer marks where the firing ship's model
       stands, and a drag from it faces it; a click elsewhere is the target's
       model; Shift-click moves the firer; a click on the firer clears it. */
    if (!readOnly && tool === 'aim') {
      const pt = snapPoint(map, p, e.altKey);
      if (!aim.from || e.shiftKey) {
        setAim((a) => ({ ...a, from: pt, to: e.shiftKey ? a.to : null }));
        drag.current = { kind: 'aimturn', from: pt, moved: false };
        return;
      }
      if (Math.hypot(p.x - aim.from.x, p.y - aim.from.y) < 1.2) {
        drag.current = { kind: 'aimturn', from: aim.from, moved: false, clear: true };
        return;
      }
      setAim((a) => ({ ...a, to: pt }));
      return;
    }
    // The trigger tool: a zone picked and moved, or a new one laid down.
    if (!readOnly && tool === 'trigger') {
      const zh = pick(p);
      if (zh && zh.type === 'resize') { drag.current = { kind: 'resize', of: 'trigger', id: zh.id }; return; }
      if (zh && zh.type === 'trigger') {
        setSel(zh); setTarget(null);
        const z = map.triggers.find((x) => x.id === zh.id);
        drag.current = { kind: 'trigger', id: zh.id, from: p, moved: false, start: { ...z } };
        return;
      }
      const c = snapPoint(map, p, e.altKey);
      const id = newVoidId();
      commit({ ...map, triggers: [...map.triggers, { id, name: `Trigger ${map.triggers.length + 1}`, x: c.x, y: c.y, r: 4 }] });
      setSel({ type: 'trigger', id }); setTarget(null);
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
    if (d.kind === 'aimturn') {
      if (Math.hypot(p.x - d.from.x, p.y - d.from.y) > 0.8) {
        d.moved = true;
        const b = bearing(d.from, p);
        setAim((a) => ({ ...a, heading: e.altKey ? Math.round(b) : Math.round(b / 5) * 5 }));
      }
      return;
    }
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
      const key = d.of === 'body' ? 'bodies' : d.of === 'trigger' ? 'triggers' : 'fields';
      const list = map[key];
      const t = list.find((x) => x.id === d.id);
      if (!t) return;
      const r = Math.max(0.5, Math.round(Math.hypot(p.x - t.x, p.y - t.y) * 4) / 4);
      commit({ ...map, [key]: list.map((x) => (x.id === d.id ? { ...x, r } : x)) }, `size-${d.id}`);
      return;
    }
    if (d.kind === 'picmove' || d.kind === 'picsize') {
      const dx = p.x - d.from.x, dy = p.y - d.from.y;
      const r2 = (v) => Math.round(v * 100) / 100;
      if (d.kind === 'picmove') {
        commit({ ...map, backdrop: readBackdrop({ ...map.backdrop, x: r2(d.start.x + dx), y: r2(d.start.y + dy) }) }, 'pic-move');
      } else {
        const ratio = d.start.h / d.start.w;
        const wide = Math.max(1, Math.abs(dx) >= Math.abs(dy / ratio) ? d.start.w + dx : d.start.w + dy / ratio);
        commit({ ...map, backdrop: readBackdrop({ ...map.backdrop, w: r2(wide), h: r2(wide * ratio) }) }, 'pic-size');
      }
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
      } else if (d.kind === 'trigger') {
        commit({ ...map, triggers: map.triggers.map((z) => (z.id === d.id ? { ...z, x: d.start.x + dx, y: d.start.y + dy } : z)) }, `drag-${d.id}`);
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
    if (d.kind === 'aimturn') {
      if (d.clear && !d.moved) setAim((a) => ({ ...a, from: null, to: null }));
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
    if ((k === 'p' || k === 'P') && win) { present(); return; }
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
    if (k === 't' || k === 'T') { setTool((t) => (t === 'trigger' ? 'select' : 'trigger')); return; }
    if (k === 'a' || k === 'A') { setTool((t) => (t === 'aim' ? 'select' : 'aim')); return; }
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
    if (sel.type === 'trigger') {
      commit({ ...map, triggers: map.triggers.filter((z) => z.id !== sel.id) });
      setSel(null);
      return;
    }
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
      hulk: { kind: 'hulk', name: 'Hulk', r: 1.3, tone: '#7b7f86' },
      // HOUSE: a salvo's speed and blow, for the GM to change on the chart.
      torpedoes: { kind: 'torpedoes', name: 'Torpedo salvo', r: 0.7, tone: '#d98a4a', course: courseFrom(0, 10), strike: { n: 2, d: 10, bonus: 4, armour: true } },
      attack_craft: { kind: 'attack_craft', name: 'Attack craft', r: 0.8, tone: '#9ac6e8', course: courseFrom(0, 8), strike: { n: 1, d: 10, bonus: 4, armour: true } }
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
      shotMod: spec.shotMod, moveMod: spec.moveMod, note: spec.note, state: 'seen', drift: null,
      strike: spec.strike || null
    };
    if (spec.shape === 'band') {
      Object.assign(base, { x: 0, y: c.y, x2: map.cols, y2: c.y, w: 10 });
      if (what === 'gravity_riptide') base.drift = [spec.drift, 0];
    } else {
      base.r = what === 'warp_rift' ? 5 : 8;
    }
    commit({ ...map, fields: [...map.fields, base] });
    setSel({ type: 'field', id });
  };

  const ADD_ITEMS = [
    ['planet', 'Planet'], ['gas_giant', 'Gas giant'], ['moon', 'Moon'], ['asteroid', 'Rock'],
    ['station', 'Station'], ['hulk', 'Hulk'], ['dust_cloud', 'Dust'], ['asteroid_cluster', 'Cluster'],
    ['asteroid_belt', 'Belt'], ['gravity_riptide', 'Riptide'], ['nebula', 'Gas cloud'],
    ['warp_rift', 'Warp rift'], ['radiation_zone', 'Radiation'], ['torpedoes', 'Torpedoes'], ['attack_craft', 'Attack craft']
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
  // Clicked into, the number is selected, so what is typed replaces it; a 0
  // left in front of a digit is dropped as it is typed.
  const numInput = (value, on, props = {}) => (
    <input className="rt-field rt-vm-num" type="number" value={value}
      onFocus={(e) => { const el = e.currentTarget; setTimeout(() => { try { el.select(); } catch { /* gone */ } }, 0); }}
      onChange={(e) => {
        const raw = String(e.target.value);
        if (/^-?0\d/.test(raw)) e.target.value = raw.replace(/^(-?)0+(?=\d)/, '$1');
        const v = Number(e.target.value);
        if (Number.isFinite(v)) on(v);
      }} {...props} />
  );

  /* ---- the picture under the chart ----
     Laid to cover the chart, keeping its shape, then moved and sized by hand
     while its card is open. The file stays in this browser (localfiles.js). */
  const choosePicture = async (file) => {
    if (!file) return;
    const kind = backdropKindOf(file.type);
    if (!kind) { setPicNote('That is not a picture or a video the chart can show: PNG, JPEG, WebP or GIF, MP4 or WebM.'); return; }
    const size = await measureMedia(file, kind, win);
    if (!size) { setPicNote(`${file.name} would not open.`); return; }
    const id = newBackdropId();
    try { await putLocalFile(id, file, { name: file.name }); } catch {
      setPicNote('This browser would not keep the file. A private window keeps nothing; try an ordinary one.');
      return;
    }
    const k = Math.max(map.cols / size.width, map.rows / size.height);
    const bw = size.width * k, bh = size.height * k;
    commit({ ...map, backdrop: readBackdrop({ id, kind, name: file.name, x: (map.cols - bw) / 2, y: (map.rows - bh) / 2, w: bw, h: bh }) });
    setPicNote(`${file.name} covers the chart. Drag it to move it and its corner to size it.`);
  };
  /* A generated picture or clip lands a while after it was asked for, so it
     is laid with the map and the writer as they are THEN (GenerateFloor.jsx). */
  const latestRef = useRef(null);
  latestRef.current = { map, commit, choosePicture };
  const layGeneratedPicture = (file) => latestRef.current.choosePicture(file);
  const layGeneratedVideo = async (file, crop, from) => {
    const id = newBackdropId();
    try { await putLocalFile(id, file, { name: file.name }); } catch { setPicNote('This browser would not keep the clip.'); return; }
    const { map: cur, commit: write } = latestRef.current;
    const b = cur.backdrop && from && cur.backdrop.id === from.id ? cur.backdrop : from;
    write({ ...cur, backdrop: readBackdrop({ id, kind: 'video', name: file.name, ...placeOver(b, crop) }) });
    setPicNote('The picture is moving: a looping clip in its place, over the part of it the clip was made from. Undo puts the still back.');
  };

  /* THE TOKENS the chart draws its worlds, rocks and ships with: the painted
     set that ships, the chart's own drawing, or a set generated here and kept
     in this browser (useVoidArt.js). */
  const [artBusy, setArtBusy] = useState(false);
  const [artErr, setArtErr] = useState('');
  const [artDescribe, setArtDescribe] = useState('');
  const generateArt = async () => {
    setArtErr(''); setArtBusy(true);
    try {
      const blob = await generateVoidSet(artDescribe);
      const id = newBackdropId().replace(/^pic-/, 'art-');
      await putLocalFile(id, blob, { name: 'Void tokens' + (artDescribe ? `: ${artDescribe.slice(0, 40)}` : '') });
      const { map: cur, commit: write } = latestRef.current;
      write({ ...cur, art: id });
    } catch (e) {
      setArtErr(e.message || 'Generation failed');
    } finally { setArtBusy(false); }
  };
  const [ownArtName, setOwnArtName] = useState('');
  useEffect(() => {
    let gone = false;
    if (map.art === 'stock' || map.art === 'plain') { setOwnArtName(''); return undefined; }
    getLocalFile(map.art).then((rec) => { if (!gone) setOwnArtName(rec && rec.name ? rec.name : ''); }).catch(() => {});
    return () => { gone = true; };
  }, [map.art]);

  const relinkPicture = async (file) => {
    if (!file || !map.backdrop) return;
    const kind = backdropKindOf(file.type);
    if (!kind) { setPicNote('That is not a picture or a video the chart can show.'); return; }
    try { await putLocalFile(map.backdrop.id, file, { name: file.name }); } catch { setPicNote('This browser would not keep the file.'); return; }
    if (kind !== map.backdrop.kind || file.name !== map.backdrop.name) commit({ ...map, backdrop: { ...map.backdrop, kind, name: file.name } });
    media.reload();
    setPicNote(`${file.name} is on this computer now.`);
  };
  const movePic = (patch) => commit({ ...map, backdrop: readBackdrop({ ...map.backdrop, ...patch }) }, 'pic-field');
  const sizePic = (across) => {
    const b = map.backdrop;
    const m0 = media.mediaRef.current;
    const ratio = m0 && m0.width ? m0.height / m0.width : b.h / b.w;
    movePic({ w: across, h: across * ratio });
  };
  const PIC_TYPES = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';

  /* ---- what moves by itself, and what it does (voidturn.js) ---- */
  const strikeInputs = (strike, set) => (
    <div className="rt-vm-gunrow">
      <label>Dice {numInput(strike.n, (v) => set({ ...strike, n: Math.max(1, Math.min(6, Math.round(v))) }), { min: 1, max: 6 })}</label>
      <label>d
        <select className="rt-sel" value={strike.d} aria-label="Sides" onChange={(e) => set({ ...strike, d: Number(e.target.value) })}>
          {STRIKE_DICE.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <label>+ {numInput(strike.bonus, (v) => set({ ...strike, bonus: Math.max(0, Math.min(30, Math.round(v))) }), { min: 0, max: 30 })}</label>
      <label><input type="checkbox" checked={strike.armour} onChange={(e) => set({ ...strike, armour: e.target.checked })} /> armour applies</label>
    </div>
  );
  /* How something moves by itself: in a line, at a heading and a speed (a
     salvo, a drifting hulk), or round an orbit (a world round its star, a
     moon round its world). One or the other; choosing one stops the other. */
  const orbitChoices = (thing) => map.bodies.filter((b) => b.id !== thing.id
    && ['planet', 'gas_giant', 'moon', 'station'].includes(b.kind));
  const setOrbit = (thing, value, patchFn) => {
    if (!value) { patchFn({ orbit: null }); return; }
    const star = map.stars[0] || { x: map.cols / 2, y: map.rows / 2 };
    if (value === 'star') {
      const big = thing.kind === 'planet' || thing.kind === 'gas_giant';
      patchFn({ orbit: { rate: big ? 2 : 6, parent: '', cx: star.x, cy: star.y }, course: null });
      return;
    }
    const host = map.bodies.find((b) => `body:${b.id}` === value);
    if (host) patchFn({ orbit: { rate: 12, parent: host.id, cx: host.x, cy: host.y }, course: null });
  };
  const moverControls = (thing, patchFn, type = 'field') => {
    const hs = headingOf(thing.course);
    const canOrbit = type === 'body' || thing.shape === 'circle';
    const orbitValue = thing.orbit ? (thing.orbit.parent ? `body:${thing.orbit.parent}` : 'star') : '';
    return (
      <div className="rt-vm-wide rt-vm-mover">
        <label><input type="checkbox" checked={Boolean(thing.course)}
          onChange={(e) => patchFn(e.target.checked ? { course: courseFrom(90, 2), orbit: null } : { course: null })} /> Moves in a line each turn</label>
        {thing.course && (
          <div className="rt-vm-gunrow">
            <label>Heading{'\u00b0'} {numInput(hs.heading, (v) => patchFn({ course: courseFrom(((Math.round(v) % 360) + 360) % 360, hs.speed) }), { step: 15, min: 0, max: 359 })}</label>
            <label>VU a turn {numInput(hs.speed, (v) => patchFn({ course: courseFrom(hs.heading, Math.max(0.5, v)) }), { step: 1, min: 0.5 })}</label>
          </div>
        )}
        {canOrbit && (
          <label>Orbits
            <select className="rt-sel" value={orbitValue} aria-label="What it orbits" onChange={(e) => setOrbit(thing, e.target.value, patchFn)}>
              <option value="">nothing</option>
              <option value="star">{map.stars.length ? 'the star' : 'the middle of the chart'}</option>
              {orbitChoices(thing).map((b) => <option key={b.id} value={`body:${b.id}`}>{b.name}</option>)}
            </select>
          </label>
        )}
        {thing.orbit && (
          <label>Degrees a turn {numInput(thing.orbit.rate, (v) => patchFn({ orbit: { ...thing.orbit, rate: Math.max(-90, Math.min(90, v)) } }), { step: 1, min: -90, max: 90 })}
            <span className="rt-vm-sub">clockwise; below 0 the other way</span></label>
        )}
        <label><input type="checkbox" checked={Boolean(thing.strike)}
          onChange={(e) => patchFn({ strike: e.target.checked ? { n: 3, d: 10, bonus: 0, armour: true } : null })} /> Strikes ships it passes over</label>
        {thing.strike && strikeInputs(thing.strike, (v) => patchFn({ strike: readStrike(v) }))}
        {(thing.course || thing.orbit) && (
          <div className="rt-vm-sub">
            {thing.strike ? `${strikeText(thing.strike)} to a ship it passes over. ` : ''}
            Its next three turns are drawn ahead of it, for the table to plan round.
          </div>
        )}
      </div>
    );
  };

  /* WHAT CAN HIT A SHIP, and the ship it hit. The ships are models on the
     table, so the chart cannot see who sat in a swarm's way or a rift: the GM
     picks the ship and the dice are rolled into its hull, through the gunnery
     so the hull and the log are the fight's own. */
  const strikers = [
    ...map.fields.filter((f) => f.strike).map((f) => ({ key: `field:${f.id}`, name: f.name, strike: f.strike })),
    ...map.bodies.filter((b) => b.strike).map((b) => ({ key: `body:${b.id}`, name: b.name, strike: b.strike })),
    ...map.triggers.filter((z) => z.strike).map((z) => ({ key: `zone:${z.id}`, name: z.name || 'Trigger', strike: z.strike }))
  ];
  const strikeAShip = (st) => {
    const id = strikePick[st.key];
    if (!id || !gunnery || !gunnery.strikeShips) return;
    const who = fleetInfo[id];
    gunnery.strikeShips([{ shipId: id, name: who ? who.name : id, why: `struck by ${st.name}`, strike: st.strike }]);
  };
  /* NO SHIPS TO PICK. The pickers list the fight's ships: the crew's, once it
     has a hull on the Ship tab, and the GM's NPCs. With neither, every picker
     here is empty, so say why, and offer an enemy from a hull. */
  const crewIn = fleet.some((f) => f.side === 'player');
  const shipsHint = fleet.length === 0
    ? 'No ships in this fight yet. The crew\u2019s ship joins once it has a hull on the Ship tab; add the enemy below or on the dashboard\u2019s Fleet tab.'
    : !crewIn ? 'The crew\u2019s ship is not in the fight: it joins once it has a hull on the Ship tab.' : '';
  const addShipPicker = onAddShip && hulls.length > 0 ? (
    <label className="rt-vm-wide">Add an enemy ship
      <select className="rt-sel" value="" aria-label="Add an enemy ship" onChange={(e) => { if (e.target.value) onAddShip(e.target.value); }}>
        <option value="">{'\u2014'} pick a hull {'\u2014'}</option>
        {hulls.map((h) => <option key={h.id} value={h.id}>{h.name}{h.cls ? ` (${h.cls})` : ''}</option>)}
      </select>
    </label>
  ) : null;

  const strikeRow = (st) => (
    <div key={st.key} className="rt-vm-strike">
      <span><b>{st.name}</b> {'\u00b7'} {strikeText(st.strike)}</span>
      <span className="rt-vm-strikeact">
        <select className="rt-sel" value={strikePick[st.key] || ''} aria-label={`Ship struck by ${st.name}`}
          onChange={(e) => setStrikePick((x) => ({ ...x, [st.key]: e.target.value }))}>
          <option value="">which ship{'\u2026'}</option>
          {fleet.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="button" className="rt-btn" disabled={!strikePick[st.key] || !gunnery} onClick={() => strikeAShip(st)}>Roll it</button>
      </span>
    </div>
  );
  const selZone = sel && sel.type === 'trigger' ? map.triggers.find((z) => z.id === sel.id) || null : null;
  const patchZone = (id, patch, key) => commit({ ...map, triggers: map.triggers.map((z) => (z.id === id ? { ...z, ...patch } : z)) }, key);
  const springZone = (z) => {
    const r = springVoidNow(map, z);
    commit(r.map);
    announce(r.fired);
  };

  // The chart and its side panel share one height, set by the chart's own shape.
  // The panel scrolls inside it: if its height followed what is selected, the
  // whole dialog would grow and shrink under the pointer with every click.
  const stageStyle = full || win || !size.w ? undefined
    : { height: Math.min(Math.max(360, size.w * map.rows / map.cols + 64), 700) };

  return (
    <div className={'rt-vm' + (full ? ' full' : '') + (win ? ' win' : '') + (clean ? ' clean' : '')}>
      <div className="rt-vm-bar">
        <IconButton icon="select" label="Select and move (drag a ship to move it, drag the dot to turn it)" on={tool === 'select'} onClick={() => setTool('select')} />
        <IconButton icon="pan" label="Pan (or drag empty space, or hold Space)" on={tool === 'pan'} onClick={() => setTool('pan')} />
        <IconButton icon="measure" label="Measure (M): drag between two points" on={tool === 'measure'} onClick={() => setTool(tool === 'measure' ? 'select' : 'measure')} />
        {!readOnly && <IconButton icon="aim" label="Aim (A): click where the firing ship's model stands, drag to face it, click the target's model. Its arcs and the shot go on the chart." on={tool === 'aim'} onClick={() => setTool(tool === 'aim' ? 'select' : 'aim')} />}
        {!readOnly && <IconButton icon="erase" label="Erase (E): click a ship, body or field to take it off the chart" on={tool === 'erase'} onClick={() => setTool(tool === 'erase' ? 'select' : 'erase')} />}
        {!readOnly && <IconButton icon="pin" label="Pin ranges (O): click a ship to pin its weapon ranges to the chart, or take them down" on={tool === 'overlay'} onClick={() => setTool(tool === 'overlay' ? 'select' : 'overlay')} />}
        {!readOnly && <IconButton icon="trigger" label="Trigger zones (T): click empty space to lay one, drag one to move it. Only you see them." on={tool === 'trigger'} onClick={() => setTool(tool === 'trigger' ? 'select' : 'trigger')} />}
        <span className="rt-vm-sep" />
        {!readOnly && <IconButton icon="undo" label="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={!hist.current.past.length} />}
        {!readOnly && <IconButton icon="redo" label="Redo (Shift+Ctrl/Cmd+Z)" onClick={redo} disabled={!hist.current.future.length} />}
        {!readOnly && <IconButton icon="spinLeft" label={map.backdrop ? 'A chart laid over a picture lies the way the picture does' : 'Turn the whole chart a quarter anticlockwise'} disabled={Boolean(map.backdrop)} onClick={() => turnChart(-1)} />}
        {!readOnly && <IconButton icon="spinRight" label={map.backdrop ? 'A chart laid over a picture lies the way the picture does' : 'Turn the whole chart a quarter clockwise'} disabled={Boolean(map.backdrop)} onClick={() => turnChart(1)} />}
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
        {!readOnly && <IconButton icon="picture" label="A picture or looping video under the chart" on={picOpen} onClick={() => setPicOpen((v) => !v)} />}
        {!readOnly && (
          <IconButton icon="motion" label={map.motion ? 'Moving: rocks tumble, clouds turn, riptides run. Click to still the chart' : 'Still. Click to set the chart moving'}
            on={map.motion} onClick={() => commit({ ...map, motion: !map.motion })} />
        )}
        <IconButton icon="clean" label="Hide the toolbar and panel, for a projector (H)" on={clean} onClick={() => setClean(true)} />
        {onToggleFull && <IconButton icon="full" label="Full window" on={full} onClick={onToggleFull} />}
        {win && <IconButton icon="full" label={isFull ? 'Leave full screen' : 'Full screen'} on={isFull} onClick={toggleFullscreen} />}
        {win && <IconButton icon="present" label="Full screen with the controls away, for the projector (P). H brings them back." onClick={present} />}
        {!readOnly && map.fields.some((f) => f.drift) && (
          <button type="button" className="rt-btn" title="Carry every ship in a riptide one turn along it"
            onClick={() => { const r = applyDrift(map); commit(r.map); }}>
            <Ico name="drift" size={14} /> Apply drift
          </button>
        )}
        <span className="rt-vm-fightbar">
          <span className="rt-vm-turn">Turn {map.turn}{phase ? ` \u00b7 ${phase}` : ''}</span>
          {onAdvance && !readOnly && (
            <button type="button" className="rt-btn" onClick={onAdvance}
              title="Move the fight on a phase. When the turn ends, the worlds go round their orbits, riptides carry ships, whatever has a course moves along it and strikes what it passes over, and turn triggers go off.">
              Next phase
            </button>
          )}
          <span className="rt-vm-scale">{map.cols}{'\u00d7'}{map.rows} VU</span>
        </span>
      </div>

      {!controlsOnly && (
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
            <div className="rt-vm-menu" ref={menuRef} style={{ left: menu.left, top: menu.top }}
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
          {!readOnly && (
            <div className="rt-vm-tabs" role="tablist" aria-label="Chart panel">
              {[['fight', 'Fight'], ['build', 'Build'], ['charts', 'Charts']].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={sideTab === id}
                  className={'rt-vm-tab' + (sideTab === id ? ' on' : '')} onClick={() => setSideTab(id)}>{label}</button>
              ))}
            </div>
          )}
          {(readOnly || sideTab === 'fight') && (<>
          {!readOnly && (<>
            <div className="rt-vm-card">
              <div className="rt-vm-h">Turn {map.turn}{phase ? ` \u00b7 ${phase}` : ''}</div>
              {onAdvance && (
                <div className="rt-vm-add">
                  <button type="button" className="rt-btn" onClick={onAdvance}>Next phase</button>
                </div>
              )}
              <p className="rt-vm-sub">
                When a turn ends the worlds go round, riptides carry ships, what has a course moves along it, and turn
                triggers go off. What moves is drawn three turns ahead.
              </p>
              {ahead.length > 0 && (
                <ul className="rt-vm-warns">
                  {ahead.map((a) => (
                    <li key={a.shipId}>{a.name}: {a.by} strikes it {a.inTurns === 1 ? 'next turn' : `in ${a.inTurns} turns`} if it holds still.</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rt-vm-card rt-vm-aimcard">
              <div className="rt-vm-h">Aim</div>
              <p className="rt-vm-sub">
                The ships are models on the table. With the Aim tool (A) click where the firing ship stands and drag to face
                it the way it faces, then click the target. Shift-click moves the firer; a click on it clears the aim.
              </p>
              {shipsHint && <p className="rt-vm-sub rt-vm-noships" role="status">{shipsHint}</p>}
              <div className="rt-vm-grid">
                {addShipPicker}
                <label className="rt-vm-wide">Firing ship
                  <select className="rt-sel" value={aim.shipId} aria-label="Firing ship"
                    onChange={(e) => { setAim((a) => ({ ...a, shipId: e.target.value })); setAimWeaponIx(0); }}>
                    <option value="">{'\u2014'} pick the ship that fires {'\u2014'}</option>
                    {fleet.filter((f) => f.weapons && f.weapons.length).map((f) => <option key={f.id} value={f.id}>{f.name}{f.cls ? ` (${f.cls})` : ''}</option>)}
                  </select>
                </label>
                <label className="rt-vm-wide">Target
                  <select className="rt-sel" value={aim.targetId} aria-label="Target ship"
                    onChange={(e) => setAim((a) => ({ ...a, targetId: e.target.value }))}>
                    <option value="">{'\u2014'} the ship it fires at {'\u2014'}</option>
                    {fleet.filter((f) => f.id !== aim.shipId).map((f) => <option key={f.id} value={f.id}>{f.name}{f.cls ? ` (${f.cls})` : ''}</option>)}
                  </select>
                </label>
                <label>Facing{'\u00b0'} {numInput(aim.heading, (v) => setAim((a) => ({ ...a, heading: ((Math.round(v) % 360) + 360) % 360 })), { step: 15, min: 0, max: 359 })}</label>
                <div className="rt-vm-row">
                  <button type="button" className="rt-ico-btn" title="Turn 15\u00b0 left" aria-label="Turn the firer left"
                    onClick={() => setAim((a) => ({ ...a, heading: ((a.heading - 15) % 360 + 360) % 360 }))}><Ico name="turnLeft" /></button>
                  <button type="button" className="rt-ico-btn" title="Turn 15\u00b0 right" aria-label="Turn the firer right"
                    onClick={() => setAim((a) => ({ ...a, heading: (a.heading + 15) % 360 }))}><Ico name="turnRight" /></button>
                  <button type="button" className={'rt-btn' + (tool === 'aim' ? '' : ' ghost')} onClick={() => setTool(tool === 'aim' ? 'select' : 'aim')}>
                    {tool === 'aim' ? 'Aiming' : 'Aim on the chart'}
                  </button>
                  {aim.from && <button type="button" className="rt-btn ghost" onClick={() => setAim((a) => ({ ...a, from: null, to: null }))}>Clear</button>}
                </div>
              </div>
              {!aim.shipId ? <p className="rt-vm-sub">Pick the firing ship: its guns and their arcs come from the fleet.</p>
                : !aim.from ? <p className="rt-vm-sub">Click where {aimShip ? aimShip.name : 'it'} stands on the chart.</p>
                  : !aim.to ? <p className="rt-vm-sub">Now click the target{'\u2019'}s model.</p> : null}
              {aimReach && (
                <div className="rt-vm-shotcard">
                  <b>{aimShip ? aimShip.name : 'The firer'} {'\u2192'} {aimTarget ? aimTarget.name : 'the target'}</b>
                  <div>{aimReach.distance} VU{aimWeapon ? `, ${aimWeapon.name} reaches ${aimWeapon.range}` : ''}</div>
                  {aimReach.blocked && <div className="bad">{aimReach.blocked} is between them. No shot.</div>}
                  {aimReach.outOfArc && aimWeapon && (
                    <div className="bad">{slotName(aimReach.arc.slot)} arc does not cover it: it lies {Math.round(aimReach.arc.relative)}{'\u00b0'} round from the bow.</div>
                  )}
                  {aimBearing.length > 0 && (
                    <ul className="rt-vm-bears">
                      {aimBearing.map(({ index, weapon: wp, reach: r, bears }) => (
                        <li key={index}>
                          <button type="button"
                            className={(bears ? 'ok' : 'no') + (index === Math.min(aimWeaponIx, aimWeapons.length - 1) ? ' on' : '')}
                            title="Use this weapon" onClick={() => setAimWeaponIx(index)}>
                            <span>{wp.name}{wp.slot ? ` \u00b7 ${wp.slot}` : ''}</span>
                            <span>{bears
                              ? `bears \u00b7 ${r.band}${gunnery && aim.targetId && gunnery.targetNumber && gunnery.targetNumber(wp.id) != null ? ` \u00b7 ${gunnery.targetNumber(wp.id)}` : ''}`
                              : r.blocked ? 'blocked' : r.outOfArc ? 'outside arc' : 'out of range'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {aimReach.parts.map((pt) => <div key={pt.label}>{pt.label}: {pt.value}</div>)}
                  {aimReach.silhouetted && <div>Silhouetted against {aimReach.silhouette}: +10</div>}
                  {gunnery && aim.targetId ? (
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
                          title="Roll this weapon's Ballistic Skill test, and its hits and damage on the target">Roll attack</button>
                        <button type="button" className="rt-btn" disabled={!aimBearing.some((x) => x.bears)}
                          onClick={() => gunnery.volley(aimBearing.filter((x) => x.bears).map((x) => x.weapon.id))}
                          title="Roll every weapon that bears on the target, one after another">
                          Fire all that bear ({aimBearing.filter((x) => x.bears).length})
                        </button>
                        <button type="button" className="rt-btn ghost" onClick={gunnery.rollCritical}
                          title="Roll on the critical table for the target">Roll critical</button>
                      </div>
                    </div>
                  ) : gunnery ? <p className="rt-vm-sub">Pick the target ship above to roll against it.</p> : null}
                </div>
              )}
            </div>
            {strikers.length > 0 && (
              <div className="rt-vm-card">
                <div className="rt-vm-h">What can hit a ship</div>
                <p className="rt-vm-sub">
                  The models are not on the chart, so it cannot tell who sat in the way. When one of these catches a ship,
                  pick the ship and roll: the damage goes on its hull and in the log.
                </p>
                {fleet.length === 0 && <p className="rt-vm-sub rt-vm-noships">{shipsHint}</p>}
                {strikers.map(strikeRow)}
              </div>
            )}
          </>)}
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
          ) : readOnly ? (
            <div className="rt-vm-card">
              <div className="rt-vm-h">{map.name}</div>
              <div className="rt-vm-sub">Turn {map.turn}{phase ? ` \u00b7 ${phase}` : ''}</div>
              {ahead.length > 0 && (
                <ul className="rt-vm-warns">
                  {ahead.map((a) => (
                    <li key={a.shipId}>{a.name}: {a.by} strikes it {a.inTurns === 1 ? 'next turn' : `in ${a.inTurns} turns`} if it holds still.</li>
                  ))}
                </ul>
              )}
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
          ) : null}
          {!readOnly && (<>
            {gunnery && gunnery.log && gunnery.log.length > 0 && (
              <div className="rt-vm-card">
                <div className="rt-vm-h">Log</div>
                <ul className="rt-vm-gunlog">
                  {gunnery.log.map((en, i) => <li key={en.key || i} className={en.kind}>{en.text}</li>)}
                </ul>
              </div>
            )}
          </>)}
          </>)}
          {!readOnly && sideTab === 'build' && (<>
          <div className="rt-vm-card">
            <div className="rt-vm-h">Tokens</div>
            <label className="rt-vm-sub">What the worlds, rocks and ships are drawn with
              <select className="rt-sel" value={map.art === 'stock' || map.art === 'plain' ? map.art : 'own'} aria-label="Tokens"
                onChange={(e) => { if (e.target.value !== 'own') commit({ ...map, art: e.target.value }); }}>
                <option value="stock">The painted set</option>
                {map.art !== 'stock' && map.art !== 'plain' && <option value="own">{ownArtName || 'A generated set'}</option>}
                <option value="plain">The chart{'’'}s own drawing</option>
              </select>
            </label>
            {voidArt.state === 'none' && map.art === 'stock' && (
              <p className="rt-vm-sub">No painted set on this deployment: the chart draws its own. Generate one below.</p>
            )}
            {voidArt.state === 'missing' && (
              <p className="rt-vm-sub">That set was generated on another computer, so this one shows the painted set.</p>
            )}
            <input className="rt-field" value={artDescribe} maxLength={200} aria-label="What kind of system"
              placeholder="A set of your own (blank for any frontier system): a dying red giant, xenos ruins on the moons…"
              onChange={(e) => setArtDescribe(e.target.value)} />
            <div className="rt-vm-add">
              <button type="button" className="rt-btn" disabled={artBusy} onClick={generateArt}>
                {artBusy ? 'Generating… about twenty seconds' : 'Generate a set'}
              </button>
            </div>
            <p className="rt-vm-sub">Sixteen pictures in one go, so they match: four kinds of world, a gas giant, a moon, rocks, wreckage, a station, a hulk, two ships, torpedoes, attack craft and a warp rift. One of the day{'’'}s images; kept in this browser.</p>
            {artErr && <p className="rt-warn" role="alert">{artErr}</p>}
          </div>
          {picOpen && !readOnly && (
            <div className="rt-vm-card">
              <div className="rt-vm-h">Picture under the chart</div>
              {!map.backdrop ? (<>
                <p className="rt-vm-sub">
                  One picture or looping video laid under the chart: a nebula, a world{'\u2019'}s limb, a moving
                  starfield. It is laid to cover the chart; while this card is open, drag it to move it and its
                  corner to size it. The file stays in this browser, on this computer.
                </p>
                <button type="button" className="rt-btn" onClick={() => picFileRef.current && picFileRef.current.click()}>
                  Choose a picture or video{'\u2026'}
                </button>
              </>) : (<>
                <div className="rt-vm-sub">
                  {map.backdrop.name || 'Picture'} {'\u00b7'} {map.backdrop.kind === 'video' ? 'looping video' : 'picture'} {'\u00b7'}{' '}
                  {media.state === 'missing' ? 'not on this computer' : media.state === 'loading' ? 'opening\u2026' : `${map.backdrop.w} \u00d7 ${map.backdrop.h} VU`}
                </div>
                {media.state === 'missing' && (
                  <button type="button" className="rt-btn" onClick={() => relinkRef.current && relinkRef.current.click()}>
                    Find the file on this computer{'\u2026'}
                  </button>
                )}
                <div className="rt-vm-grid">
                  <label>VU across {numInput(map.backdrop.w, (v) => sizePic(Math.max(1, v)), { step: 1, min: 1 })}</label>
                  <label>From the left {numInput(map.backdrop.x, (v) => movePic({ x: v }), { step: 0.5 })}</label>
                  <label>From the top {numInput(map.backdrop.y, (v) => movePic({ y: v }), { step: 0.5 })}</label>
                </div>
                <div className="rt-vm-add">
                  <button type="button" className="rt-btn ghost" onClick={() => {
                    const m0 = media.mediaRef.current;
                    const ratio = m0 && m0.width ? m0.height / m0.width : map.backdrop.h / map.backdrop.w;
                    const k = Math.max(map.cols, map.rows / ratio);
                    commit({ ...map, backdrop: readBackdrop({ ...map.backdrop, w: k, h: k * ratio, x: (map.cols - k) / 2, y: (map.rows - k * ratio) / 2 }) });
                  }}>Cover the chart</button>
                  <button type="button" className="rt-btn ghost" onClick={() => commit({ ...map, backdrop: null })}>Take it off</button>
                </div>
                <p className="rt-vm-sub">Drag it to move it and its corner to size it while this card is open.</p>
              </>)}
              <GenerateFloor target="void" cols={map.cols} rows={map.rows} backdrop={map.backdrop}
                mediaReady={media.state === 'ready'} onPicture={layGeneratedPicture} onVideo={layGeneratedVideo} />
              <input ref={picFileRef} type="file" hidden accept={PIC_TYPES} aria-label="Picture or video under the chart"
                onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; choosePicture(f); }} />
              <input ref={relinkRef} type="file" hidden accept={PIC_TYPES} aria-label="The same picture again"
                onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; relinkPicture(f); }} />
              {picNote ? <p className="rt-vm-sub" role="status">{picNote}</p> : null}
            </div>
          )}
          {selBody ? (
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
                  {moverControls(selBody, (patch) => patchBody(selBody.id, patch, `mv-${selBody.id}`), 'body')}
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
                  {moverControls(selField, (patch) => patchField(selField.id, patch, `mv-${selField.id}`))}
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
          ) : selZone ? (
            <div className="rt-vm-card">
              <div className="rt-vm-h">{selZone.name || 'Trigger'}</div>
              <div className="rt-vm-sub">{selZone.armed ? 'Armed' : 'Spent'} {'\u00b7'} {selZone.r} VU across its middle to its edge {'\u00b7'} only you see it</div>
              <div className="rt-vm-grid">
                <label className="rt-vm-wide">Name <input className="rt-field" value={selZone.name} maxLength={40} onChange={(e) => patchZone(selZone.id, { name: e.target.value }, `zn-${selZone.id}`)} /></label>
                <label className="rt-vm-wide">Goes off
                  <select className="rt-sel" value={selZone.when} aria-label="When it goes off" onChange={(e) => patchZone(selZone.id, { when: e.target.value })}>
                    {VOID_TRIGGER_WHEN.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
                {selZone.when === 'turn' ? (
                  <label className="rt-vm-wide">At the end of turn {numInput(selZone.turn, (v) => patchZone(selZone.id, { turn: Math.max(0, Math.round(v)) }, `zt-${selZone.id}`), { min: 0 })}
                    <span className="rt-vm-sub">0 is every turn</span></label>
                ) : (
                  <div className="rt-vm-wide rt-vm-sides">Watches for
                    {SIDES.map((sd) => (
                      <label key={sd}><input type="checkbox" checked={selZone.sides.includes(sd)}
                        onChange={(e) => patchZone(selZone.id, { sides: e.target.checked ? [...selZone.sides, sd] : selZone.sides.filter((x) => x !== sd) })} /> {SIDE_NAME[sd]}</label>
                    ))}
                  </div>
                )}
                <label><input type="checkbox" checked={!selZone.once} onChange={(e) => patchZone(selZone.id, { once: !e.target.checked })} /> Every time</label>
                <label><input type="checkbox" checked={selZone.reveal} onChange={(e) => patchZone(selZone.id, { reveal: e.target.checked })} /> Reveals what is hidden in it</label>
                <div className="rt-vm-wide">
                  <label><input type="checkbox" checked={Boolean(selZone.strike)}
                    onChange={(e) => patchZone(selZone.id, { strike: e.target.checked ? { n: 2, d: 10, bonus: 5, armour: true } : null })} /> Damages the ships in it</label>
                  {selZone.strike && strikeInputs(selZone.strike, (v) => patchZone(selZone.id, { strike: readStrike(v) }, `zs-${selZone.id}`))}
                </div>
                <label className="rt-vm-wide">Sound
                  <select className="rt-sel" value={selZone.cue} aria-label="A sound from the ambience board" onChange={(e) => patchZone(selZone.id, { cue: e.target.value })}>
                    <option value="">No sound</option>
                    {cues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="rt-vm-wide">Handout
                  <select className="rt-sel" value={selZone.handout} aria-label="A handout on the table's screen" onChange={(e) => patchZone(selZone.id, { handout: e.target.value })}>
                    <option value="">No handout</option>
                    {handouts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </label>
                <label className="rt-vm-wide">For you alone
                  <textarea className="rt-field" rows={2} value={selZone.note} maxLength={600} aria-label="Note for the GM"
                    placeholder="What happened, and what they roll."
                    onChange={(e) => patchZone(selZone.id, { note: e.target.value }, `zno-${selZone.id}`)} />
                </label>
              </div>
              <div className="rt-vm-add">
                <button type="button" className="rt-btn" onClick={() => springZone(selZone)}>Spring it now</button>
                <button type="button" className="rt-btn ghost" onClick={() => patchZone(selZone.id, { armed: !selZone.armed })}>{selZone.armed ? 'Disarm it' : 'Arm it'}</button>
                <button type="button" className="rt-btn ghost" onClick={removeSel}>Take it off</button>
              </div>
            </div>
          ) : (
            <div className="rt-vm-card">
              <div className="rt-vm-h">{map.name}</div>
              <div className="rt-vm-sub">Turn {map.turn}{phase ? ` \u00b7 ${phase}` : ''}</div>
              {ahead.length > 0 && (
                <ul className="rt-vm-warns">
                  {ahead.map((a) => (
                    <li key={a.shipId}>{a.name}: {a.by} strikes it {a.inTurns === 1 ? 'next turn' : `in ${a.inTurns} turns`} if it holds still.</li>
                  ))}
                </ul>
              )}
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
                {ADD_ITEMS.map(([k, label]) => (
                  <button key={k} type="button" className="rt-btn ghost" onClick={() => addThing(k)}>{label}</button>
                ))}
              </div>
              <div className="rt-vm-add">
                <button type="button" className="rt-btn ghost" disabled={!map.bodies.some((b) => (b.kind === 'planet' || b.kind === 'gas_giant' || b.kind === 'moon') && !b.orbit)}
                  title="Planets and gas giants round the star, nearer ones faster; moons round the nearest world. Each then goes round when a turn ends."
                  onClick={() => commit(orbitAll(map))}>Set the worlds orbiting</button>
                <button type="button" className="rt-btn ghost" onClick={() => setPicOpen(true)}>A picture under the chart{'\u2026'}</button>
              </div>
              {unplaced.length > 0 && (
                <div className="rt-vm-add">
                  <div className="rt-vm-sub" style={{ width: '100%' }}>
                    Ship tokens, if you want the chart to track a model (the Aim tool needs none):
                  </div>
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

          </>)}
          {!readOnly && sideTab === 'charts' && (<>
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
          </>)}
        </div>
      </div>
      )}
    </div>
  );
}

// A point on the chart, snapped to a square centre unless Alt is held.
function snapPoint(map, p, free) {
  if (free) return { x: Math.min(map.cols, Math.max(0, p.x)), y: Math.min(map.rows, Math.max(0, p.y)) };
  return snapToSquare(map, p);
}

