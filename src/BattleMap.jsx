import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MAP_THEMES, themeById, readMap, cellKey, parseKey,
  TILE_CATALOG, TILE_CATEGORIES, stampCells, paintCells,
  wallMask, cornerPillar, WALL_N, WALL_E, WALL_S, WALL_W,
  DOOR_STATES, nextDoorState, MARKER_TYPES, markerTypeById,
  reachBetween, rangeRings, areaCells, coneCells, visibleCells, unobstructed,
  overlayKindFor, onDeck, revealArea, concealArea, visibleExplored, fitGrid,
  DOOR_KINDS, doorKindById, COVER_TYPES, coverById, HAZARD_TYPES, hazardById,
  nextContactState, auspexSweep, AUSPEX_RANGE_M,
  weaponOverlay, calibrationBar, deploymentRows
} from './battlemap.js';
import { GEAR } from './gear.js';

/* The boarding map, projected under physical miniatures.

   Nothing here draws a combatant: the models on the table are the
   combatants, and a painted circle would sit under one and fight it for the
   square. What the projector adds instead is the things a model cannot show
   — range bands, blast radii, flame cones, shield auras and what can
   actually be seen from a square.

   Everything numeric lives in battlemap.js and is checked there. This file
   is the canvas and the controls. */

const MODES = [
  { id: 'stamp', label: 'Stamp tile' },
  { id: 'paint', label: 'Paint deck' },
  { id: 'erase', label: 'Erase' },
  { id: 'door', label: 'Door' },
  { id: 'cover', label: 'Cover' },
  { id: 'hazard', label: 'Hazard' },
  { id: 'contact', label: 'Contacts' },
  { id: 'fog', label: 'Fog' },
  { id: 'marker', label: 'Marker' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'measure', label: 'Measure' }
];

// A canvas larger than this eats hundreds of megabytes and stalls the tab.
const MAX_CANVAS_PX = 4000;

// Only things with a combat line are worth drawing an overlay for.
const ARMED = Object.entries(GEAR)
  .filter(([, v]) => v.stats && ['Pistol', 'Basic', 'Heavy', 'Thrown', 'Melee', 'Field'].includes(v.kind))
  .map(([k, v]) => ({ key: k, label: k.replace(/\b\w/g, (c) => c.toUpperCase()), kind: v.kind, stats: v.stats }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));

/* ---- overlay art ----
   Drawn rather than blitted. A template has to be whatever radius or length
   the weapon says, and a bitmap stretched from 3 metres to 60 goes soft at
   the edges and lies about where it stops; a gradient is sharp at any size,
   recolours per theme and costs nothing to load. */

// A soft glowing annulus. Canvas cannot blur a stroke, so the glow is a
// radial gradient whose stops crowd around the radius — the ring IS the
// gradient rather than a line with an effect on it.
function glowRing(ctx, cx, cy, radiusPx, rgb, width = 0.14) {
  const inner = Math.max(0, radiusPx * (1 - width));
  const outer = radiusPx * (1 + width);
  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.5, `rgba(${rgb},0.7)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();
}

// Cardinal ticks across a ring, so it can be read from any side of the
// table rather than only where its label happens to sit.
function ringTicks(ctx, cx, cy, radiusPx, len, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (radiusPx - len), cy + Math.sin(a) * (radiusPx - len));
    ctx.lineTo(cx + Math.cos(a) * (radiusPx + len), cy + Math.sin(a) * (radiusPx + len));
    ctx.stroke();
  }
}

// A grenade blast: a lethal core at the point of impact and a glowing
// boundary ring at the edge of the radius, with clear air between them. The
// two circles carry different information — where it lands and how far it
// reaches — and one gradient blurring from the middle to the edge says
// neither clearly.
function drawBlast(ctx, cx, cy, radiusPx) {
  if (radiusPx <= 0) return;
  glowRing(ctx, cx, cy, radiusPx, '255,165,45', 0.13);
  ctx.strokeStyle = 'rgba(225,95,25,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ringTicks(ctx, cx, cy, radiusPx, radiusPx * 0.09, 'rgba(255,215,120,0.95)');

  const core = radiusPx * 0.34;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
  g.addColorStop(0, 'rgba(255,236,190,0.85)');
  g.addColorStop(0.45, 'rgba(255,186,70,0.7)');
  g.addColorStop(0.85, 'rgba(240,120,40,0.35)');
  g.addColorStop(1, 'rgba(240,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, core, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,110,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// A shield aura: a bright rim with a hex lattice inside it. The lattice is
// what makes it read as a field rather than a puddle, and it stays faint
// enough to see the models standing in it.
function drawShield(ctx, cx, cy, radiusPx) {
  if (radiusPx <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.clip();

  const s = Math.max(5, radiusPx / 5);          // hex circumradius
  const stepX = s * 1.5;
  const stepY = s * Math.sqrt(3);
  const cols = Math.ceil(radiusPx / stepX) + 1;
  const rows = Math.ceil(radiusPx / stepY) + 1;
  ctx.lineWidth = 1;
  for (let i = -cols; i <= cols; i++) {
    for (let j = -rows; j <= rows; j++) {
      const hx = cx + i * stepX;
      const hy = cy + j * stepY + (i % 2 ? stepY / 2 : 0);
      // Banded like the reference: brightest across the middle, fading top
      // and bottom, so the field has depth instead of reading as wallpaper.
      const fade = 1 - Math.min(1, Math.abs(hy - cy) / radiusPx);
      if (fade <= 0.02) continue;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const px2 = hx + s * 0.92 * Math.cos(a);
        const py2 = hy + s * 0.92 * Math.sin(a);
        if (k === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(120,215,255,${0.1 * fade})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(0,229,255,${0.3 * fade})`;
      ctx.stroke();
    }
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,242,254,0.95)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
}

// A flame cone: hottest at the nozzle, fading to the limit of its reach,
// with the edges and the end arc drawn so the template has a readable
// boundary rather than dissolving into haze.
function drawCone(ctx, ox, oy, aimRad, reachPx, halfRad) {
  if (reachPx <= 0) return;
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, reachPx);
  g.addColorStop(0, 'rgba(255,241,180,0.75)');
  g.addColorStop(0.35, 'rgba(255,170,40,0.55)');
  g.addColorStop(0.8, 'rgba(231,76,60,0.25)');
  g.addColorStop(1, 'rgba(231,76,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.arc(ox, oy, reachPx, aimRad - halfRad, aimRad + halfRad);
  ctx.closePath();
  ctx.fill();

  // Thin edges down both sides and an arc across the mouth: the gradient
  // fades out before the weapon's range does, so without these the template
  // appears to stop short of where it actually reaches.
  ctx.strokeStyle = 'rgba(255,170,60,0.75)';
  ctx.lineWidth = 1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(aimRad + s * halfRad) * reachPx,
      oy + Math.sin(aimRad + s * halfRad) * reachPx);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,220,130,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ox, oy, reachPx, aimRad - halfRad, aimRad + halfRad);
  ctx.stroke();
}

// The shot itself: a glowing beam with a head, so a measured line reads as a
// line of fire and not as a stray guide.
function drawBeam(ctx, x1, y1, x2, y2, rgb) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${rgb},0.22)`;
  ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},0.5)`;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  // Arrowhead at the target end, in a contrasting colour so the direction
  // of the shot is readable at a glance across a lit table.
  const head = 11;
  ctx.fillStyle = 'rgba(0,229,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(ang - 0.42), y2 - head * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - head * Math.cos(ang + 0.42), y2 - head * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* Confines a template's artwork to the squares it actually reaches. Without
   this the smooth shape is drawn over walls and sealed bulkheads while the
   trimmed cell list says otherwise — and the artwork is what the table
   reads, so the projection would show fire crossing a shut hatch. */
function clipToCells(ctx, cells, px, draw) {
  if (!cells.length) return;
  ctx.save();
  ctx.beginPath();
  for (const c of cells) ctx.rect(c.x * px, c.y * px, px, px);
  ctx.clip();
  draw();
  ctx.restore();
}

/* A shot: a beam from the firer to what they are shooting at. A clear lane
   is one beam end to end; a blocked one stops dead at whatever stopped it
   and continues as a thin dashed line, so the picture agrees with the label
   instead of drawing confidently through a sealed bulkhead. */
function drawShot(ctx, px, from, to, blocked) {
  const x1 = from.x * px + px / 2, y1 = from.y * px + px / 2;
  const x2 = to.x * px + px / 2, y2 = to.y * px + px / 2;
  if (!blocked) {
    drawBeam(ctx, x1, y1, x2, y2, '168,130,255');
    return;
  }
  const bx = blocked.x * px + px / 2, by = blocked.y * px + px / 2;
  drawBeam(ctx, x1, y1, bx, by, '231,76,60');
  ctx.strokeStyle = 'rgba(231,76,60,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 3;
  ctx.strokeRect(blocked.x * px + 2, blocked.y * px + 2, px - 4, px - 4);
}

const BAND_COLOUR = {
  point_blank: 'rgba(46,204,113,0.85)',
  short: 'rgba(241,196,15,0.8)',
  standard: 'rgba(255,255,255,0.65)',
  long: 'rgba(230,126,34,0.7)',
  extreme: 'rgba(231,76,60,0.7)'
};

export default function BattleMap({ map, onChange, win = null, encounters = [] }) {
  const m = useMemo(() => readMap(map), [map]);
  const theme = themeById(m.theme);

  const [mode, setMode] = useState('stamp');
  const [tileId, setTileId] = useState('corridor_1x5');
  const [rotation, setRotation] = useState(0);
  const [markerType, setMarkerType] = useState('objective');
  const [doorKind, setDoorKind] = useState('bulkhead');
  const [coverType, setCoverType] = useState('crates');
  const [hazardType, setHazardType] = useState('fire');
  const [contactEnc, setContactEnc] = useState('');
  const [contactHostile, setContactHostile] = useState('');
  const [auspexM, setAuspexM] = useState(AUSPEX_RANGE_M);
  const [hover, setHover] = useState(null);

  const [weaponKey, setWeaponKey] = useState('lasgun');
  const [origin, setOrigin] = useState(null);
  const [aim, setAim] = useState(null);
  const [showLos, setShowLos] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [coneAngle, setConeAngle] = useState(15);

  const [showZones, setShowZones] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);

  const [measureFrom, setMeasureFrom] = useState(null);
  const [measureTo, setMeasureTo] = useState(null);

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  // Resize fires long after the render that bound it; fitting from the
  // captured map would write back a deck that is several edits old.
  const mapRef = useRef(m);
  mapRef.current = m;
  const textureRef = useRef(null);
  const [textureTick, setTextureTick] = useState(0);

  // The two-click tools read their first click back on the second one. State
  // is not readable that soon — two clicks inside one React batch both see
  // the old value, and the second click overwrites the origin it was meant
  // to aim from — so the first click is kept in a ref and the state exists
  // only to drive the redraw.
  const originRef = useRef(null);
  const measureRef = useRef(null);

  const patch = (next) => onChange && onChange({ ...m, ...next });

  // Which window this is. The projector's copy hides what the table must
  // not see; the GM's own tab shows it.
  const projecting = Boolean(win);

  const px = Math.min(
    m.pxPerSquare,
    Math.floor(MAX_CANVAS_PX / Math.max(m.cols, m.rows))
  );

  const weapon = useMemo(() => {
    const entry = GEAR[weaponKey];
    return entry ? weaponOverlay(entry.stats) : null;
  }, [weaponKey]);

  /* ---- the floor texture, loaded once per theme ---- */
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) { textureRef.current = img; setTextureTick((t) => t + 1); } };
    // A missing texture is not an error: the deck is painted in the theme's
    // flat fallback colour instead, which still reads on a projector. It
    // just loses the grain.
    img.onerror = () => { if (!cancelled) { textureRef.current = null; setTextureTick((t) => t + 1); } };
    img.src = theme.texture;
    return () => { cancelled = true; textureRef.current = null; };
  }, [theme]);

  const measurement = useMemo(() => {
    if (!measureFrom || !measureTo) return null;
    return reachBetween({
      from: measureFrom, to: measureTo, map: m,
      weaponRangeM: weapon ? weapon.range : null
    });
  }, [measureFrom, measureTo, m, weapon]);

  /* ---- input ---- */

  const posFromEvent = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // The canvas is displayed at CSS size, which may differ from its pixel
    // size; scale the click back or every placement drifts right and down.
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = Math.floor(((e.clientX - rect.left) * sx) / px);
    const y = Math.floor(((e.clientY - rect.top) * sy) / px);
    if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) return null;
    return { x, y };
  };

  const applyAt = (pos, dragging = false, sweep = false, lineOfSight = false, conceal = false) => {
    if (!pos) return;
    const k = cellKey(pos.x, pos.y);

    if (mode === 'paint') { patch({ floor: paintCells(m.floor, [pos], true) }); return; }
    if (mode === 'erase') {
      const doors = { ...m.doors }; delete doors[k];
      const markers = { ...m.markers }; delete markers[k];
      const cover = { ...m.cover }; delete cover[k];
      const hazards = { ...m.hazards }; delete hazards[k];
      patch({ floor: paintCells(m.floor, [pos], false), doors, markers, cover, hazards });
      return;
    }
    // Revealing is a drag as well as a click: a corridor is swept, not
    // clicked square by square.
    if (mode === 'fog' && dragging) {
      patch({ explored: { ...m.explored, [k]: true } });
      return;
    }
    if (dragging) return;   // the rest place one thing per click

    if (mode === 'stamp') {
      patch({ floor: paintCells(m.floor, stampCells(tileId, pos, rotation, m), true) });
      return;
    }
    if (mode === 'door') {
      const doors = { ...m.doors };
      const here = doors[k];
      // Clicking a door of the same kind cycles its state; clicking with a
      // different kind selected swaps it, which is how a bulkhead becomes a
      // hatch without erasing it first.
      doors[k] = (here && here.kind === doorKind)
        ? { kind: here.kind, state: nextDoorState(here.state) }
        : { kind: doorKind, state: 'closed' };
      patch({ doors });
      return;
    }
    if (mode === 'cover') {
      const cover = { ...m.cover };
      if (cover[k] === coverType) delete cover[k]; else cover[k] = coverType;
      patch({ cover });
      return;
    }
    if (mode === 'hazard') {
      const hazards = { ...m.hazards };
      if (hazards[k] === hazardType) delete hazards[k]; else hazards[k] = hazardType;
      patch({ hazards });
      return;
    }
    if (mode === 'contact') {
      const contacts = { ...m.contacts };
      const here = contacts[k];
      if (here) {
        // Cycle what the party knows: unknown -> on the scope -> seen.
        contacts[k] = { ...here, state: nextContactState(here.state) };
      } else {
        const enc = encounters.find((e) => e.id === contactEnc);
        const h = enc && enc.hostiles[Number(contactHostile)];
        if (!h) return;          // nothing picked: a blank contact helps nobody
        contacts[k] = {
          name: h.name, encounterId: enc.id, hostileId: String(contactHostile), state: 'hidden'
        };
      }
      patch({ contacts });
      return;
    }
    if (mode === 'fog') {
      if (sweep) {
        // An auspex does not light the deck: it finds what is out there.
        patch({ contacts: auspexSweep(m, pos, auspexM) });
        return;
      }
      if (lineOfSight) {
        // What can be seen from a square, for a doorway or a long gallery
        // where the room is not the unit the GM wants.
        const seen = onDeck(m, visibleCells(m, pos, null));
        const explored = { ...m.explored, [k]: true };
        for (const c of seen) explored[cellKey(c.x, c.y)] = true;
        patch({ explored });
        return;
      }
      if (conceal) {
        patch({ explored: concealArea(m, pos) });
        return;
      }
      // A PLACE at a time, which is the reveal the table expects: click
      // inside a room and the room is there; click a door or a hatch and
      // what it joins comes in with it.
      //
      // The clicked square also becomes the viewpoint — where the party is
      // standing — because that is what it means in practice: the GM
      // reveals where they have got to. From then on, shutting a door takes
      // what is beyond it off the board.
      patch({ explored: revealArea(m, pos), viewpoint: pos });
      return;
    }
    if (mode === 'marker') {
      const markers = { ...m.markers };
      // Clicking a marker of the same type again lifts it, so one tool both
      // places and removes.
      if (markers[k] && markers[k].type === markerType) delete markers[k];
      else markers[k] = { type: markerType, label: markerTypeById(markerType).name };
      patch({ markers });
      return;
    }
    if (mode === 'overlay') {
      // First click is where the firer stands, second is what they are
      // pointing at. Clicking the origin again clears it.
      const cur = originRef.current;
      if (!cur) { originRef.current = pos; setOrigin(pos); setAim(null); }
      else if (cur.x === pos.x && cur.y === pos.y) {
        originRef.current = null; setOrigin(null); setAim(null);
      } else setAim(pos);
      return;
    }
    if (mode === 'measure') {
      if (!measureRef.current) {
        measureRef.current = pos; setMeasureFrom(pos); setMeasureTo(null);
      } else {
        setMeasureTo(pos); measureRef.current = null;
      }
    }
  };

  // Bound to the window this is actually rendered in. When the map is
  // portalled into its own window, a listener on the opener's window never
  // sees the GM's keystrokes at all.
  useEffect(() => {
    const target = win || window;
    const onKey = (e) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      setRotation((r) => (r + 90) % 360);
    };
    target.addEventListener('keydown', onKey);
    return () => target.removeEventListener('keydown', onKey);
  }, [win]);

  /* ---- overlay geometry ---- */

  const overlay = useMemo(() => {
    if (mode !== 'overlay' || !origin) return null;
    const target = aim || hover;
    // A flame weapon throws a cone and everything else throws a line. A
    // lasgun shot is one lane between two squares, not an area, so a ranged
    // weapon gets the beam and the band it lands in; only the flamer draws a
    // wedge. A grenade keeps the beam too — it is still thrown at a point,
    // and the line is what shows whether the throw lane is clear.
    const kind = overlayKindFor(weapon);
    const shot = target && kind === 'beam'
      ? reachBetween({ from: origin, to: target, map: m, weaponRangeM: weapon.range })
      : null;
    // Templates are trimmed to what they can actually reach: fire does not
    // cross a sealed bulkhead and a grenade does not blast through a wall.
    // The blast is trimmed from its own point of impact, not from the firer.
    return {
      kind,
      shot,
      target,
      rings: showRings && weapon && !weapon.isField ? rangeRings(weapon.range, m) : [],
      los: showLos ? visibleCells(m, origin, weapon && weapon.range ? weapon.range * 3 : null) : [],
      blast: weapon && weapon.blastM && target
        ? onDeck(m, unobstructed(m, target, areaCells(m, target, weapon.blastM))) : [],
      cone: weapon && weapon.isFlame && target
        ? onDeck(m, unobstructed(m, origin, coneCells(m, origin, target, weapon.range, coneAngle))) : [],
      aura: kind === 'field'
        ? onDeck(m, unobstructed(m, origin, areaCells(m, origin, weapon.auraM))) : []
    };
  }, [mode, origin, aim, hover, weapon, showRings, showLos, coneAngle, m]);

  /* ---- rendering ---- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = m.cols * px;
    const h = m.rows * px;
    canvas.width = w;
    canvas.height = h;

    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    const floorKeys = Object.keys(m.floor);
    const fill = (cells, colour) => {
      ctx.fillStyle = colour;
      for (const c of cells) ctx.fillRect(c.x * px, c.y * px, px, px);
    };

    // 1. The deck, textured, clipped to the painted cells so unbuilt grid
    //    stays void rather than becoming a rectangle of corridor.
    if (floorKeys.length) {
      ctx.save();
      ctx.beginPath();
      for (const k of floorKeys) {
        const p = parseKey(k);
        if (p) ctx.rect(p.x * px, p.y * px, px, px);
      }
      ctx.clip();
      const img = textureRef.current;
      ctx.fillStyle = img ? (ctx.createPattern(img, 'repeat') || theme.fallback) : theme.fallback;
      ctx.fillRect(0, 0, w, h);
      // The wash knocks a busy photographic deck back so tokens, the grid
      // and the templates read over it. A pale drawn deck has none of that
      // noise and a dark grid of its own, so washing it would only turn a
      // deliberately clean floor grey.
      ctx.fillStyle = `rgba(0,0,0,${theme.wash})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 2. Deployment zones, under everything else.
    if (showZones) {
      const z = deploymentRows(m, 1);
      ctx.fillStyle = 'rgba(192,57,43,0.18)';
      ctx.fillRect(0, z.hostile.y0 * px, w, (z.hostile.y1 - z.hostile.y0 + 1) * px);
      ctx.fillStyle = 'rgba(52,152,219,0.18)';
      ctx.fillRect(0, z.crew.y0 * px, w, (z.crew.y1 - z.crew.y0 + 1) * px);
    }

    // 3. Walls, derived from the floor every frame — never stored, so they
    //    cannot disagree with the deck they edge.
    const thick = Math.max(3, Math.floor(px * 0.16));
    for (const k of floorKeys) {
      const p = parseKey(k);
      if (!p) continue;
      const x0 = p.x * px, y0 = p.y * px;
      const mask = wallMask(m.floor, p.x, p.y);
      ctx.fillStyle = 'rgba(8,10,14,0.92)';
      if (mask & WALL_N) ctx.fillRect(x0, y0, px, thick);
      if (mask & WALL_S) ctx.fillRect(x0, y0 + px - thick, px, thick);
      if (mask & WALL_W) ctx.fillRect(x0, y0, thick, px);
      if (mask & WALL_E) ctx.fillRect(x0 + px - thick, y0, thick, px);

      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      const line = (ax, ay, bx, by) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); };
      if (mask & WALL_N) line(x0, y0 + thick, x0 + px, y0 + thick);
      if (mask & WALL_S) line(x0, y0 + px - thick, x0 + px, y0 + px - thick);
      if (mask & WALL_W) line(x0 + thick, y0, x0 + thick, y0 + px);
      if (mask & WALL_E) line(x0 + px - thick, y0, x0 + px - thick, y0 + px);

      // Corner pillars, including the inner corner a four-sided mask misses.
      // Drawn as structure, not highlight: in the grid colour they lit every
      // corner and buried the deck under confetti.
      ctx.fillStyle = 'rgba(4,6,9,0.95)';
      const c = thick + 1;
      if (cornerPillar(m.floor, p.x, p.y, -1, -1)) ctx.fillRect(x0, y0, c, c);
      if (cornerPillar(m.floor, p.x, p.y, 1, -1)) ctx.fillRect(x0 + px - c, y0, c, c);
      if (cornerPillar(m.floor, p.x, p.y, -1, 1)) ctx.fillRect(x0, y0 + px - c, c, c);
      if (cornerPillar(m.floor, p.x, p.y, 1, 1)) ctx.fillRect(x0 + px - c, y0 + px - c, c, c);
    }

    // 3b. Hazards, as a tinted square with a warning stripe. Under the
    //     cover and the markers, because something can stand in a fire.
    for (const [k, id] of Object.entries(m.hazards)) {
      const p = parseKey(k);
      const hz = hazardById(id);
      if (!p || !hz) continue;
      const x0 = p.x * px, y0 = p.y * px;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, px, px); ctx.clip();
      ctx.fillStyle = hz.colour;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(x0, y0, px, px);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = hz.colour;
      ctx.lineWidth = Math.max(2, px * 0.09);
      for (let o = -px; o < px * 2; o += px * 0.34) {
        ctx.beginPath();
        ctx.moveTo(x0 + o, y0 + px);
        ctx.lineTo(x0 + o + px, y0);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = hz.colour;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 1, y0 + 1, px - 2, px - 2);
    }

    // 3c. Cover. Sight-blocking cover fills its square; cover you can shoot
    //     over is drawn as a low bar, so the two are told apart at a glance
    //     from across the table rather than by remembering which is which.
    for (const [k, id] of Object.entries(m.cover)) {
      const p = parseKey(k);
      const cv = coverById(id);
      if (!p || !cv) continue;
      const x0 = p.x * px, y0 = p.y * px;
      if (cv.blocksSight) {
        ctx.fillStyle = 'rgba(78,88,96,0.92)';
        ctx.fillRect(x0 + px * 0.1, y0 + px * 0.1, px * 0.8, px * 0.8);
        ctx.strokeStyle = 'rgba(190,205,215,0.85)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 + px * 0.1, y0 + px * 0.1, px * 0.8, px * 0.8);
        ctx.beginPath();
        ctx.moveTo(x0 + px * 0.1, y0 + px * 0.9);
        ctx.lineTo(x0 + px * 0.9, y0 + px * 0.1);
        ctx.stroke();
      } else {
        const h = Math.max(3, px * 0.2);
        ctx.fillStyle = 'rgba(120,135,145,0.9)';
        ctx.fillRect(x0 + px * 0.08, y0 + px - h - px * 0.12, px * 0.84, h);
        ctx.strokeStyle = 'rgba(200,215,225,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + px * 0.08, y0 + px - h - px * 0.12, px * 0.84, h);
      }
    }

    // 4. The grid, for the table to count squares off.
    ctx.save();
    ctx.globalAlpha = theme.gridAlpha;
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let c = 0; c <= m.cols; c++) { ctx.beginPath(); ctx.moveTo(c * px, 0); ctx.lineTo(c * px, h); ctx.stroke(); }
    for (let r = 0; r <= m.rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * px); ctx.lineTo(w, r * px); ctx.stroke(); }
    ctx.restore();

    // 5. Bulkheads.
    for (const [k, door] of Object.entries(m.doors)) {
      const p = parseKey(k);
      if (!p) continue;
      const { kind, state } = door;
      const x0 = p.x * px, y0 = p.y * px;
      ctx.fillStyle = state === 'open' ? '#2ecc71' : state === 'jammed' ? '#f39c12' : '#e74c3c';
      const leaf = Math.max(3, px * 0.16);
      // A hatch is drawn narrow and short of the walls, a bulkhead spans the
      // opening: the one you can crawl through should not look like the one
      // you need a melta for.
      const hatch = kind === 'hatch';
      const inset = hatch ? px * 0.26 : 2;
      const bh = hatch ? Math.max(4, px * 0.17) : Math.max(6, px * 0.3);
      if (state === 'open') {
        ctx.fillRect(x0 + inset, y0 + inset, leaf, px - inset * 2);
        ctx.fillRect(x0 + px - inset - leaf, y0 + inset, leaf, px - inset * 2);
      } else {
        ctx.fillRect(x0 + inset, y0 + px / 2 - bh / 2, px - inset * 2, bh);
        ctx.strokeStyle = '#0b0e14';
        ctx.lineWidth = hatch ? 1 : 2;
        ctx.strokeRect(x0 + inset, y0 + px / 2 - bh / 2, px - inset * 2, bh);
      }
    }

    // 6. Markers.
    for (const [k, mk] of Object.entries(m.markers)) {
      const p = parseKey(k);
      if (!p) continue;
      const cx = p.x * px + px / 2, cy = p.y * px + px / 2;
      ctx.fillStyle = markerTypeById(mk.type).colour;
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.arc(cx, cy, px * 0.36, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // 6b. Fog of war, over the deck and the grid both: an unexplored square
    //     must not even show how big it is.
    //
    //     IT IS DRAWN DIFFERENTLY IN THE TWO WINDOWS. The projector's copy is
    //     solid, because the table must not read through it. The GM's own tab
    //     is dimmed rather than blacked, because the GM is the one building
    //     the deck and reaching for the next square to reveal, and a tool you
    //     cannot see to aim is no tool.
    if (m.fog) {
      // What is DRAWN is what they have seen and can still reach through
      // open doors, so shutting a bulkhead takes the room beyond it off the
      // board without forgetting it was ever found.
      const shown = visibleExplored(m);
      ctx.fillStyle = projecting ? 'rgb(3,4,6)' : 'rgba(3,4,6,0.82)';
      for (let x = 0; x < m.cols; x++) {
        for (let y = 0; y < m.rows; y++) {
          if (!shown[cellKey(x, y)]) ctx.fillRect(x * px, y * px, px, px);
        }
      }
    }

    // 6c. Contacts. The fight is played with miniatures, so these are not
    //     models on a board — they are what the GM knows and the auspex
    //     leaks. A ping is drawn OVER the fog on purpose: that is the whole
    //     mechanic, something on the scope with the deck still dark.
    for (const [k, c] of Object.entries(m.contacts)) {
      const p = parseKey(k);
      if (!p) continue;
      const cx = p.x * px + px / 2, cy = p.y * px + px / 2;
      if (c.state === 'hidden') {
        // Never on the projector: the GM's note to themselves.
        if (projecting) continue;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(220,120,120,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, px * 0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        continue;
      }
      if (c.state === 'ping') {
        // A contact, not a creature: concentric rings, no name, no shape.
        // The party learns that something is out there and nothing else.
        for (const r of [0.44, 0.3, 0.16]) {
          ctx.beginPath();
          ctx.arc(cx, cy, px * r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,70,70,${0.35 + (0.5 - r)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,70,70,0.9)';
        ctx.beginPath(); ctx.arc(cx, cy, px * 0.07, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      // seen
      ctx.beginPath();
      ctx.arc(cx, cy, px * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(192,57,43,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#0b0e14';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, Math.floor(px * 0.26))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(c.name.slice(0, 2).toUpperCase(), cx, cy + px * 0.09);
    }

    // 7. THE OVERLAYS — the reason this is worth projecting at all.
    if (overlay) {
      const ox = origin.x * px + px / 2, oy = origin.y * px + px / 2;

      // Dead ground first, so everything else paints over it: what cannot be
      // seen from the firing square is dimmed rather than hidden, because
      // the GM still needs to see the deck they are ruling on.
      if (showLos && overlay.los.length) {
        const lit = new Set(overlay.los.map((c) => cellKey(c.x, c.y)));
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let x = 0; x < m.cols; x++) {
          for (let y = 0; y < m.rows; y++) {
            if (!lit.has(cellKey(x, y))) ctx.fillRect(x * px, y * px, px, px);
          }
        }
      }

      // The caught squares are tinted faintly UNDER the template art: the
      // smooth shape is what the table reads, but the GM still needs to see
      // exactly which squares are in it, and a gradient edge alone is a
      // thing to argue over.
      fill(overlay.aura, 'rgba(0,229,255,0.10)');
      fill(overlay.cone, 'rgba(255,170,40,0.12)');
      fill(overlay.blast, 'rgba(231,76,60,0.12)');

      const target = aim || hover;
      const inSquares = (metres) => (metres / (m.metresPerSquare || 1)) * px;

      if (overlay.aura.length) {
        clipToCells(ctx, overlay.aura, px,
          () => drawShield(ctx, ox, oy, inSquares(weapon.auraM)));
      }
      if (overlay.cone.length && target) {
        clipToCells(ctx, overlay.cone, px, () => drawCone(
          ctx, ox, oy,
          Math.atan2(target.y - origin.y, target.x - origin.x),
          inSquares(weapon.range),
          coneAngle * Math.PI / 180
        ));
      }
      if (overlay.blast.length && target) {
        clipToCells(ctx, overlay.blast, px, () => drawBlast(
          ctx, target.x * px + px / 2, target.y * px + px / 2,
          inSquares(weapon.blastM)
        ));
      }

      // Range bands as rings, outermost first so the near ones sit on top.
      for (const ring of overlay.rings) {
        const rp = ring.radius * px;
        ctx.beginPath();
        ctx.arc(ox, oy, rp, 0, Math.PI * 2);
        ctx.strokeStyle = BAND_COLOUR[ring.band] || '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash(ring.band === 'point_blank' ? [] : [7, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ringTicks(ctx, ox, oy, rp, px * 0.28, BAND_COLOUR[ring.band] || '#fff');
        // Label where the ring crosses due east, clipped to the canvas.
        const lx = ox + ring.radius * px;
        if (lx < w - 4 && ring.mod !== null) {
          ctx.fillStyle = BAND_COLOUR[ring.band] || '#fff';
          ctx.font = `${Math.max(9, Math.floor(px * 0.3))}px system-ui, sans-serif`;
          ctx.textAlign = 'right';
          ctx.fillText(`${ring.mod >= 0 ? '+' : ''}${ring.mod}`, lx - 3, oy - 4);
        }
      }

      // The shot itself, over the rings so the lane is not lost under them.
      if (overlay.shot && overlay.target) {
        drawShot(ctx, px, origin, overlay.target, overlay.shot.blocked);
      }

      // The firing square itself.
      ctx.beginPath();
      ctx.arc(ox, oy, px * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.strokeStyle = '#0b0e14'; ctx.lineWidth = 2; ctx.stroke();
    }

    // 8. The stamp preview, so a 1x5 corridor shows where it will land.
    if (hover && mode === 'stamp') {
      ctx.fillStyle = 'rgba(0,229,255,0.3)';
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      for (const c of stampCells(tileId, hover, rotation, m)) {
        ctx.fillRect(c.x * px, c.y * px, px, px);
        ctx.strokeRect(c.x * px, c.y * px, px, px);
      }
    } else if (hover && (mode === 'paint' || mode === 'erase')) {
      fill([hover], mode === 'erase' ? 'rgba(231,76,60,0.4)' : 'rgba(46,204,113,0.4)');
    }

    // 9. The measuring tape.
    if (measureFrom && measureTo && measurement) {
      drawShot(ctx, px, measureFrom, measureTo, measurement.blocked);
    }

    // 10. The calibration bar. Drawn last and over everything, because its
    //     whole job is to be measured against a ruler on the table.
    if (showCalibration) {
      const bar = calibrationBar(m, { targetMm: 100 });
      const bx = px, by = h - px * 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(bx - 6, by - px * 0.55, bar.px + 12, px * 0.8);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bar.px, by); ctx.stroke();
      // End caps, so there is something unambiguous to line a ruler up with.
      ctx.beginPath(); ctx.moveTo(bx, by - px * 0.25); ctx.lineTo(bx, by + px * 0.25); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + bar.px, by - px * 0.25); ctx.lineTo(bx + bar.px, by + px * 0.25);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(10, Math.floor(px * 0.32))}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(bar.label, bx + 4, by - px * 0.3);
    }
  }, [m, px, theme, hover, mode, tileId, rotation, overlay, origin, aim, weapon, coneAngle, projecting,
      measureFrom, measureTo, measurement, showZones, showCalibration, showLos, textureTick]);

  /* ---- controls ---- */

  const num = (label, value, onSet, min, max, step = 1) => (
    <label className="rt-bm-num">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
        /* A focused number input takes the mouse wheel, and these sit a
           centimetre above a map the GM scrolls. Spinning px/square by
           accident would decalibrate the projector mid-session without
           anyone seeing it happen, so the wheel drops focus instead. */
        onWheel={(e) => e.currentTarget.blur()}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onSet(Math.min(max, Math.max(min, n)));
        }} />
    </label>
  );

  /* Grow the grid to whatever the window gives us, at the px/square already
     calibrated. A projector or a second screen is the whole point of this
     thing, so the deck should use the glass rather than sit in the corner of
     it. The squares keep their size; there are simply more of them. */
  const fitToStage = () => {
    const el = stageRef.current;
    if (!el) return;
    const pad = 10;   // the stage's own padding and border
    const cur = mapRef.current;
    const cols = fitGrid(el.clientWidth - pad, cur.pxPerSquare);
    const rows = fitGrid(el.clientHeight - pad, cur.pxPerSquare);
    if (cols === cur.cols && rows === cur.rows) return;
    if (onChange) onChange({ ...cur, cols, rows });
  };

  // In a window of its own there is no reason not to fill it, so it fits
  // itself on open and whenever the window is resized. In the dashboard tab
  // the deck's size is the GM's to set, and resizing a panel should not
  // quietly redraw the deck they are building.
  useEffect(() => {
    if (!win) return undefined;
    fitToStage();
    const onResize = () => fitToStage();
    win.addEventListener('resize', onResize);
    return () => win.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, m.pxPerSquare]);

  const allExplored = () => {
    const out = {};
    for (let x = 0; x < m.cols; x++) for (let y = 0; y < m.rows; y++) out[cellKey(x, y)] = true;
    return out;
  };

  const clearAll = () => {
    if (!window.confirm('Clear the deck, bulkheads and markers?')) return;
    patch({ floor: {}, doors: {}, markers: {} });
    originRef.current = null; measureRef.current = null;
    setMeasureFrom(null); setMeasureTo(null); setOrigin(null); setAim(null);
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `boarding-map-${m.theme}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const bar = calibrationBar(m, { targetMm: 100 });

  return (
    <div className={'rt-bm' + (win ? ' rt-bm-win' : '')}>
      <div className="rt-bm-bar">
        <select value={m.theme} onChange={(e) => patch({ theme: e.target.value })}>
          {MAP_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {MODES.map((x) => (
          <button key={x.id} type="button"
            className={'rt-btn rt-bm-mode' + (mode === x.id ? ' on' : '')}
            onClick={() => setMode(x.id)}>{x.label}</button>
        ))}
        <button type="button" className="rt-btn" onClick={exportPng}>Export PNG</button>
        <button type="button" className="rt-btn" onClick={clearAll}>Clear deck</button>
      </div>

      <div className="rt-bm-bar">
        {mode === 'stamp' && (<>
          <select value={tileId} onChange={(e) => setTileId(e.target.value)}>
            {TILE_CATEGORIES.map((cat) => (
              <optgroup key={cat} label={cat}>
                {TILE_CATALOG.filter((t) => t.category === cat).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.w}×{t.h})</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" className="rt-btn"
            onClick={() => setRotation((r) => (r + 90) % 360)}>Rotate {rotation}° (R)</button>
        </>)}

        {mode === 'marker' && (
          <select value={markerType} onChange={(e) => setMarkerType(e.target.value)}>
            {MARKER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {mode === 'door' && (<>
          <select value={doorKind} onChange={(e) => setDoorKind(e.target.value)}>
            {DOOR_KINDS.map((d) => (
              <option key={d.id} value={d.id}>{d.name} · AP {d.ap}</option>
            ))}
          </select>
          <span className="rt-bm-hint">
            Click to fit one, again to cycle {DOOR_STATES.join(' → ')}. A jammed door still blocks.
          </span>
        </>)}

        {mode === 'cover' && (<>
          <select value={coverType} onChange={(e) => setCoverType(e.target.value)}>
            {COVER_TYPES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · AP {c.ap} · {c.blocksSight ? 'blocks sight' : 'see over'}
              </option>
            ))}
          </select>
          <span className="rt-bm-hint">{(coverById(coverType) || {}).note}</span>
        </>)}

        {mode === 'hazard' && (<>
          <select value={hazardType} onChange={(e) => setHazardType(e.target.value)}>
            {HAZARD_TYPES.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <span className="rt-bm-hint">{(hazardById(hazardType) || {}).note}</span>
        </>)}

        {mode === 'contact' && (<>
          <select value={contactEnc} onChange={(e) => { setContactEnc(e.target.value); setContactHostile(''); }}>
            <option value="">— from which encounter —</option>
            {encounters.map((e) => <option key={e.id} value={e.id}>{e.name || 'Untitled'}</option>)}
          </select>
          {contactEnc && (
            <select value={contactHostile} onChange={(e) => setContactHostile(e.target.value)}>
              <option value="">— which hostile —</option>
              {((encounters.find((e) => e.id === contactEnc) || {}).hostiles || []).map((h, i) => (
                <option key={i} value={String(i)}>{h.name}</option>
              ))}
            </select>
          )}
          <span className="rt-bm-hint">
            Click to place; click a contact again to cycle unknown → on the scope → seen.
            The models still do the fighting.
          </span>
        </>)}

        {mode === 'fog' && (<>
          <label className="rt-bm-num">
            <input type="checkbox" checked={m.fog}
              onChange={(e) => patch({ fog: e.target.checked })} /><span>Fog of war</span>
          </label>
          <button type="button" className="rt-btn"
            onClick={() => patch({ explored: allExplored() })}>Reveal all</button>
          <button type="button" className="rt-btn"
            onClick={() => patch({ explored: {} })}>Hide all</button>
          {num('Auspex m', auspexM, setAuspexM, 1, 500, 5)}
          <span className="rt-bm-hint">
            Click a room to reveal it, or a door to bring in what it joins — a door
            bounds a place whether it is open or shut. The square you click is where
            the party is standing, so shutting a door afterwards takes what is beyond
            it off the board, and opening it again brings it straight back.
            Ctrl-click takes a place back by hand, drag reveals square by square,
            alt-click reveals line of sight from a square, and shift-click is an
            auspex sweep — it reads through bulkheads and pings contacts without
            opening the deck.
          </span>
        </>)}

        {(mode === 'overlay' || mode === 'measure') && (
          <select value={weaponKey} onChange={(e) => setWeaponKey(e.target.value)}>
            <option value="">No weapon</option>
            {['Pistol', 'Basic', 'Heavy', 'Thrown', 'Melee', 'Field'].map((kind) => (
              <optgroup key={kind} label={kind}>
                {ARMED.filter((a) => a.kind === kind).map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {mode === 'overlay' && (<>
          {/* A force field has no range bands, so the toggle for them is not
              offered rather than sitting there doing nothing. */}
          {!(weapon && weapon.isField) && (
            <label className="rt-bm-num"><input type="checkbox" checked={showRings}
              onChange={(e) => setShowRings(e.target.checked)} /><span>Range bands</span></label>
          )}
          <label className="rt-bm-num"><input type="checkbox" checked={showLos}
            onChange={(e) => setShowLos(e.target.checked)} /><span>Line of sight</span></label>
          {weapon && weapon.isFlame && num('Cone °', coneAngle, setConeAngle, 5, 90, 5)}
          <button type="button" className="rt-btn"
            onClick={() => { originRef.current = null; setOrigin(null); setAim(null); }}>Clear overlay</button>
        </>)}
      </div>

      {mode === 'overlay' && (
        <div className="rt-bm-measure">
          {!origin
            ? 'Click the square the firer is standing in. Click it again to clear.'
            : <>
                <strong>Firing from {origin.x},{origin.y}</strong>
                {weapon && weapon.range ? <span> · range {weapon.range} m</span> : null}
                {weapon && !weapon.range && !weapon.isField
                  ? <span> · no ranged profile</span> : null}
                {weapon && weapon.blastM ? <span> · Blast {weapon.blastM} m</span> : null}
                {weapon && weapon.isFlame ? <span> · flame cone — click to aim</span> : null}
                {/* The shot the GM is actually about to roll, so the band and
                    its modifier are on screen without switching to Measure. */}
                {overlay && overlay.shot ? (
                  <span>
                    {' · '}{overlay.shot.metres} m — {overlay.shot.band.replace('_', ' ')}
                    {' ('}{overlay.shot.mod === null
                      ? 'out of range'
                      : `${overlay.shot.mod >= 0 ? '+' : ''}${overlay.shot.mod} to hit`}{')'}
                    {overlay.shot.blocked ? (
                      <strong> · blocked by {overlay.shot.blocked.reason === 'door'
                        ? `a ${overlay.shot.blocked.state} bulkhead` : 'a wall'}</strong>
                    ) : null}
                  </span>
                ) : null}
                {weapon && weapon.isField ? (
                  <span> · field, Protection Rating {weapon.protectionRating}
                    {weapon.auraM > 1 ? ` — covers ${weapon.auraM} m` : ' — covers the bearer only'}</span>
                ) : null}
              </>}
        </div>
      )}

      <div className="rt-bm-bar">
        {num('Cols', m.cols, (v) => patch({ cols: v }), 5, 100)}
        {num('Rows', m.rows, (v) => patch({ rows: v }), 5, 100)}
        {num('Px / square', m.pxPerSquare, (v) => patch({ pxPerSquare: v }), 10, 200, 2)}
        {num('mm / square', m.mmPerSquare, (v) => patch({ mmPerSquare: v }), 5, 100)}
        {num('Metres / square', m.metresPerSquare, (v) => patch({ metresPerSquare: v }), 0.5, 10, 0.5)}
        <button type="button" className="rt-btn" onClick={fitToStage}>Fit to screen</button>
        <label className="rt-bm-num"><input type="checkbox" checked={showZones}
          onChange={(e) => setShowZones(e.target.checked)} /><span>Deployment</span></label>
        <label className="rt-bm-num"><input type="checkbox" checked={showCalibration}
          onChange={(e) => setShowCalibration(e.target.checked)} /><span>Calibrate</span></label>
      </div>

      {showCalibration && (
        <div className="rt-bm-measure">
          Lay a ruler on the table across the white bar and adjust <strong>px / square</strong> until
          it reads <strong>{bar.mm} mm</strong>. A square is then {m.mmPerSquare} mm on the table
          and {m.metresPerSquare} m in the fiction.
        </div>
      )}

      {measurement && (
        <div className={'rt-bm-measure' + (measurement.blocked ? ' blocked' : '')}>
          <strong>{measurement.squares} squares · {measurement.metres} m</strong>
          <span> — {measurement.band.replace('_', ' ')}</span>
          <span> ({measurement.mod === null ? 'out of range' : `${measurement.mod >= 0 ? '+' : ''}${measurement.mod} to hit`})</span>
          {measurement.blocked && (
            <span> · blocked by {measurement.blocked.reason === 'door'
              ? `a ${measurement.blocked.state} bulkhead` : 'a wall'} at {measurement.blocked.x},{measurement.blocked.y}</span>
          )}
        </div>
      )}

      <div className="rt-bm-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => {
            const pos = posFromEvent(e);
            setHover(pos);
            if (e.buttons === 1 && (mode === 'paint' || mode === 'erase')) applyAt(pos, true);
          }}
          onMouseLeave={() => setHover(null)}
          onMouseDown={(e) => {
            if (e.button === 0) applyAt(posFromEvent(e), false, e.shiftKey, e.altKey, e.ctrlKey || e.metaKey);
          }}
          style={{ cursor: mode === 'measure' || mode === 'overlay' ? 'crosshair' : 'pointer' }}
        />
      </div>

    </div>
  );
}
