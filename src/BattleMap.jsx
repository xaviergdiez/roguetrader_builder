import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MAP_THEMES, themeById, readMap, cellKey, parseKey,
  TILE_CATALOG, TILE_CATEGORIES, stampCells, paintCells,
  wallMask, cornerPillar, WALL_N, WALL_E, WALL_S, WALL_W,
  DOOR_STATES, nextDoorState, MARKER_TYPES, markerTypeById,
  reachBetween, rangeRings, areaCells, coneCells, visibleCells, unobstructed,
  overlayKindFor, onDeck, revealArea, concealArea, visibleExplored, fitGrid, brushCells,
  clampZoom, MIN_ZOOM, MAX_ZOOM, textureAdvice, rotateMap, rotationFits,
  expandMap, expandPlan, MIN_GRID, MAX_GRID,
  resolveTheme, themeNumbersFor, groundsUsed,
  DOOR_KINDS, doorKindById, COVER_TYPES, coverById, HAZARD_TYPES, hazardById,
  nextContactState, auspexSweep, AUSPEX_RANGE_M,
  OBSCURING, obscuringById, LIGHTING_PRESETS, blockedText,
  weaponOverlay, calibrationBar, deploymentRows
} from './battlemap.js';
import { NOISE, noiseById, noisePing } from './awareness.js';
import { GEAR } from './gear.js';
import { shrinkToDataUrl, prepareTexture } from './imageshrink.js';
import { centreCrop, cropRect, dragBy, zoomTo, scaleBounds } from './texturecrop.js';
import { generateDeck, newSeed, DECK_STYLES, styleById } from './mapgen.js';
import { ENVIRONMENTS, CONDITIONS, MAX_DESCRIBE } from '../lib/mapprompt.js';

/* The boarding map, projected under physical miniatures.

   Nothing here draws a combatant: the models on the table are the
   combatants, and a painted circle would sit under one and fight it for the
   square. What the projector adds instead is the things a model cannot show
   — range bands, blast radii, flame cones, shield auras and what can
   actually be seen from a square.

   Everything numeric lives in battlemap.js and is checked there. This file
   is the canvas and the controls. */

/* The crop window's side, in CSS pixels. A display size, not the stored one:
   the tile is written at 512 whatever this is. Big enough to judge what is
   in the square, small enough to sit in the panel beside its controls. */
const CROP_BOX = 240;

const MODES = [
  { id: 'stamp', label: 'Stamp tile' },
  { id: 'paint', label: 'Paint deck' },
  { id: 'ground', label: 'Paint ground' },
  { id: 'erase', label: 'Erase' },
  { id: 'door', label: 'Door' },
  { id: 'cover', label: 'Cover' },
  { id: 'hazard', label: 'Hazard' },
  { id: 'obscure', label: 'Foliage / smoke' },
  { id: 'contact', label: 'Contacts' },
  { id: 'noise', label: 'Noise' },
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

export default function BattleMap({
  map, onChange, historyKey = null, win = null, encounters = [], customThemes = [], onSaveTheme = null,
  decks = [], onSaveDeck = null, onLoadDeck = null, onNeedTexture = null
}) {
  const m = useMemo(() => readMap(map), [map]);
  const theme = resolveTheme(m.theme, customThemes);

  const [mode, setMode] = useState('stamp');
  const [tileId, setTileId] = useState('corridor_1x5');
  const [rotation, setRotation] = useState(0);
  const [markerType, setMarkerType] = useState('objective');
  const [brush, setBrush] = useState(1);
  /* A VIEW control, deliberately not stored on the map. px/square is the
     projector's calibration and must not move; zoom scales what is already
     drawn so the GM can read a corner or take in the whole deck. On the
     projector it belongs at 100%, which is why it resets rather than
     following the deck around. */
  const [zoom, setZoom] = useState(1);
  // The box holds what is being TYPED, which may be empty or half a number;
  // `zoom` only ever holds a usable one.
  const [zoomPct, setZoomPct] = useState('100');
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  // Saving the deck from here. The target is PICKED, never guessed: writing
  // over the wrong deck and quietly making a duplicate are both losses, and
  // this window is where a GM works without the library in front of them.
  const [deckTarget, setDeckTarget] = useState('');
  const [deckName, setDeckName] = useState('');
  const [deckNote, setDeckNote] = useState('');
  const [doorKind, setDoorKind] = useState('bulkhead');
  const [coverType, setCoverType] = useState('crates');
  const [hazardType, setHazardType] = useState('fire');
  const [obscureType, setObscureType] = useState('medium');
  const [noiseKind, setNoiseKind] = useState('shot');
  const [contactEnc, setContactEnc] = useState('');
  const [contactHostile, setContactHostile] = useState('');
  const [auspexM, setAuspexM] = useState(AUSPEX_RANGE_M);
  const [genOpen, setGenOpen] = useState(false);
  const [genDescribe, setGenDescribe] = useState('');
  const [genCover, setGenCover] = useState('');
  const [genCond, setGenCond] = useState('none');
  const [genName, setGenName] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState('');
  // What came back, held here rather than written to the deck: nothing is
  // kept until the GM says they are happy with it.
  const [preview, setPreview] = useState(null);
  // What was done to an uploaded file, so the GM is told rather than having
  // their image quietly cropped and recompressed.
  const [uploadNote, setUploadNote] = useState('');
  const [cropSquare, setCropSquare] = useState(true);
  const fileRef = useRef(null);
  // The picture being positioned under the crop window, or null when there
  // is none: { file, url, imgW, imgH, box, scale, x, y }.
  const [crop, setCrop] = useState(null);
  const dragRef = useRef(null);
  // Deck generation. The seed is held here rather than on the map because it
  // describes how the floor was made, not what it is — and the floor is the
  // only record of the deck.
  const [deckOpen, setDeckOpen] = useState(false);
  const [genStyle, setGenStyle] = useState(DECK_STYLES[0].id);
  const [genSeed, setGenSeed] = useState('');
  // Held as text, not numbers: a half-typed "1" on the way to "120" must not
  // be read as a grid of one and clamp the box out from under the typing.
  const [growCols, setGrowCols] = useState('');
  const [growRows, setGrowRows] = useState('');
  const [growMirror, setGrowMirror] = useState(true);
  // The terrain the ground brush lays down. Defaults to the deck's own,
  // which is the "lift it off again" option.
  const [paintGround, setPaintGround] = useState(m.theme);

  /* Opening the panel offers double the current deck, which is the thing
     almost everyone wants and saves typing two numbers to get it. */
  useEffect(() => {
    if (!deckOpen) return;
    setGrowCols(String(Math.min(MAX_GRID, m.cols * 2)));
    setGrowRows(String(Math.min(MAX_GRID, m.rows * 2)));
    // Only when the panel opens, not on every change to the deck underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckOpen]);
  const [hover, setHover] = useState(null);

  const [weaponKey, setWeaponKey] = useState('lasgun');
  const [origin, setOrigin] = useState(null);
  const [aim, setAim] = useState(null);
  const [showLos, setShowLos] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [coneAngle, setConeAngle] = useState(15);

  // A clean map: every toolbar and readout hidden, only the deck left. The
  // overlays, templates and fog still draw, because those are the map.
  const [showOptions, setShowOptions] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const presentingRef = useRef(false);
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
  // src -> decoded image, for every ground the deck draws with.
  const texturesRef = useRef(new Map());
  const [textureTick, setTextureTick] = useState(0);

  // The two-click tools read their first click back on the second one. State
  // is not readable that soon — two clicks inside one React batch both see
  // the old value, and the second click overwrites the origin it was meant
  // to aim from — so the first click is kept in a ref and the state exists
  // only to drive the redraw.
  const originRef = useRef(null);
  const measureRef = useRef(null);

  /* ---- undo ----
     One entry per GESTURE, not per square: a drag that paints forty cells is
     one step, so Undo takes the stroke back rather than one square of it.
     A gesture is everything between a mouse-down and the next mouse-up, and
     a toolbar field typed into counts as one until the pointer next lets go.

     The history belongs to whatever deck is open. `historyKey` names it (the
     deck's id, or 'live'), and a change of key empties the stacks — Undo on
     a freshly opened deck must never write the PREVIOUS deck's squares into
     it. */
  const MAX_HISTORY = 100;
  const historyRef = useRef({ past: [], future: [] });
  const gestureRef = useRef(false);
  const [, setHistTick] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const remember = (before) => {
    const h = historyRef.current;
    h.past.push(before);
    if (h.past.length > MAX_HISTORY) h.past.shift();
    h.future = [];
    setHistTick((t) => t + 1);
  };

  const patch = (next) => {
    if (!onChange) return;
    if (!gestureRef.current) { remember(m); gestureRef.current = true; }
    onChange({ ...m, ...next });
  };

  // Refs rather than closures: the key handler is bound once, and the
  // writer it would capture is replaced on every render.
  const undo = () => {
    const h = historyRef.current;
    const prev = h.past.pop();
    const write = onChangeRef.current;
    if (!prev || !write) return;
    h.future.push(mapRef.current);
    gestureRef.current = false;
    write(prev);
    setHistTick((t) => t + 1);
  };
  const redo = () => {
    const h = historyRef.current;
    const next = h.future.pop();
    const write = onChangeRef.current;
    if (!next || !write) return;
    h.past.push(mapRef.current);
    gestureRef.current = false;
    write(next);
    setHistTick((t) => t + 1);
  };

  useEffect(() => {
    historyRef.current = { past: [], future: [] };
    gestureRef.current = false;
    setHistTick((t) => t + 1);
  }, [historyKey]);

  useEffect(() => {
    const w = win || window;
    const end = () => { gestureRef.current = false; };
    w.addEventListener('mouseup', end);
    return () => w.removeEventListener('mouseup', end);
  }, [win]);

  /* ---- turning the map ----
     A quarter turn at a time, as one undoable step. What turns is what has
     been painted; the grid it sits in stays as it is. Overlays, the ruler and
     the firing square are cleared because the squares they pointed at are
     somewhere else now. */
  const [turnNote, setTurnNote] = useState('');
  const rotateMapBy = (turns) => {
    const write = onChangeRef.current;
    if (!write) return;
    if (!rotationFits(mapRef.current, turns)) {
      const msg = 'The painted map is too big to turn inside this grid. Make the grid bigger first.';
      setTurnNote(msg);
      if (!showOptions) (win || window).alert(msg);
      return;
    }
    setTurnNote('');
    remember(mapRef.current);
    gestureRef.current = false;
    write(rotateMap(mapRef.current, turns));
    originRef.current = null; measureRef.current = null;
    setOrigin(null); setAim(null); setMeasureFrom(null); setMeasureTo(null);
  };
  /* ---- loading a saved deck ----
     The window is where a session is run, and until now it could save a deck
     but not bring one back. What "load" means is the parent's call: onto the
     live map for play (as Publish for play does: fog on, contacts hidden),
     or, while a deck is being designed, switching to that deck. */
  const [loadId, setLoadId] = useState('');
  const loadChosenDeck = () => {
    const deck = decks.find((d) => d.id === loadId);
    if (!deck || !onLoadDeck) return;
    const name = deck.name || 'Untitled deck';
    const occupied = Object.keys(mapRef.current.floor || {}).length > 0;
    if (occupied && !(win || window).confirm(
      `Replace the map on screen with \u201c${name}\u201d? Undo (Cmd/Ctrl+Z) brings the current one back.`)) return;
    remember(mapRef.current);
    gestureRef.current = false;
    originRef.current = null; measureRef.current = null;
    setOrigin(null); setAim(null); setMeasureFrom(null); setMeasureTo(null);
    onLoadDeck(deck);
    setLoadId('');
    setDeckNote(`Loaded \u201c${name}\u201d.`);
  };
  const rHeldRef = useRef(false);     // R is down: a click turns the map
  const rUsedRef = useRef(false);     // ...and a tap of R turns the stamp instead
  const spaceRef = useRef(false);     // Space is down: a drag pans

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

  /* Every ground this deck draws with — its own, plus any painted onto
     individual squares. Joined to a string so the effects below re-run when
     the SET changes rather than on every redraw of the same set. */
  const groundIds = useMemo(() => groundsUsed(m), [m]);
  const groundKey = groundIds.join('|');

  /* Where a ground's floor comes from. The deck's generated floor overrides
     its own theme's file; a ground painted onto a square always uses its
     own, or painting ice onto a deck with a generated floor would paint the
     generated floor again. */
  const groundSrc = (id) => {
    if (id === m.theme && m.customTexture) return m.customTexture;
    const t = resolveTheme(id, customThemes);
    return (t && t.texture) || null;
  };

  /* A saved ground is listed without its floor — the index would be
     megabytes otherwise — so the ones actually being drawn are asked for the
     first time a deck lands on them. Every painted ground, not just the
     deck's own: a square of saved fen in the corner needs its floor too. */
  useEffect(() => {
    if (!onNeedTexture) return;
    for (const id of groundIds) {
      const t = resolveTheme(id, customThemes);
      if (t && t.custom && !t.texture) onNeedTexture(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundKey, customThemes, onNeedTexture]);

  /* ---- the floor textures, one per ground in use ----

     Keyed by SOURCE rather than by ground id, so two grounds pointing at the
     same file share one decode, and a ground whose floor arrives later
     replaces nothing it should not. */
  useEffect(() => {
    let cancelled = false;
    const wanted = new Set();
    for (const id of groundIds) {
      const src = groundSrc(id);
      if (src) wanted.add(src);
    }
    // Anything no longer painted anywhere is dropped, or a GM trying grounds
    // keeps every one they rejected decoded in memory.
    for (const key of [...texturesRef.current.keys()]) {
      if (!wanted.has(key)) texturesRef.current.delete(key);
    }
    for (const src of wanted) {
      if (texturesRef.current.has(src)) continue;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        texturesRef.current.set(src, img);
        setTextureTick((t) => t + 1);
      };
      /* A missing texture is not an error: those squares are painted in that
         ground's flat fallback colour instead, which still reads on a
         projector. It just loses the grain. */
      img.onerror = () => { if (!cancelled) setTextureTick((t) => t + 1); };
      img.src = src;
    }
    // Redraw now as well, for the sources already decoded.
    setTextureTick((t) => t + 1);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundKey, customThemes, m.theme, m.customTexture]);

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

    if (mode === 'paint') {
      patch({ floor: paintCells(m.floor, brushCells(pos, brush, m), true) });
      return;
    }
    /* Painting terrain, not deck. Only what a square LOOKS like changes, so
       this writes nothing but `ground` — the floor it paints over is left
       exactly as it is, and with it every wall, region and fog state
       derived from it. */
    if (mode === 'ground') {
      const ground = { ...m.ground };
      const cells = brushCells(pos, brush, m);
      // The deck's own ground is the absence of paint rather than a value,
      // so choosing it is how paint is lifted off again.
      const lifting = paintGround === m.theme;
      for (const c of cells) {
        const ck = cellKey(c.x, c.y);
        if (lifting) delete ground[ck]; else ground[ck] = paintGround;
      }
      // Painting a terrain on a square with no deck lays the deck there too:
      // a ground that is only drawn where there is already floor leaves a
      // marsh, a lake or a field to be built square by square first. Squares
      // that already have floor keep it exactly as it is, so nothing derived
      // from it (walls, doors, fog) moves. Lifting paint never adds deck.
      patch(lifting ? { ground } : { ground, floor: paintCells(m.floor, cells, true) });
      return;
    }
    if (mode === 'erase') {
      // Everything standing on a square goes with the square. Erasing the
      // floor and leaving its bulkhead behind would put a door in the void.
      const cells = brushCells(pos, brush, m);
      const doors = { ...m.doors };
      const markers = { ...m.markers };
      const cover = { ...m.cover };
      const hazards = { ...m.hazards };
      const ground = { ...m.ground };
      const obscuring = { ...m.obscuring };
      for (const c of cells) {
        const ck = cellKey(c.x, c.y);
        delete doors[ck]; delete markers[ck]; delete cover[ck]; delete hazards[ck];
        delete ground[ck]; delete obscuring[ck];
      }
      patch({ floor: paintCells(m.floor, cells, false), doors, markers, cover, hazards, ground, obscuring });
      return;
    }
    // Foliage and smoke are laid down by dragging, like the deck itself, and
    // take the same brush as everything else.
    if (mode === 'obscure') {
      const cells = brushCells(pos, brush, m);
      const obscuring = { ...m.obscuring };
      const lifting = !dragging && obscuring[k] === obscureType;
      for (const c of cells) {
        const ck = cellKey(c.x, c.y);
        if (lifting) delete obscuring[ck]; else obscuring[ck] = obscureType;
      }
      patch({ obscuring });
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
      // Opening a door is a noise: anything hidden within earshot comes up
      // on the scope as a ping, without saying what it is.
      const opened = doors[k].state === 'open' && !(here && here.state === 'open');
      patch(opened ? { doors, contacts: noisePing(m, pos, 'door') } : { doors });
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
    if (mode === 'noise') {
      patch({ contacts: noisePing(m, pos, noiseKind) });
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
    const typing = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target && e.target.tagName) || '');
    const onKey = (e) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      // Undo and redo, the way every editor does them.
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        else if (k === 'y') { e.preventDefault(); redo(); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;    // leave browser shortcuts alone
      // R is two things. Held with a click it turns the painted map; tapped on
      // its own it turns the tile about to be stamped. Which one it was is
      // only known when the key comes up.
      if (k === 'r') { if (!e.repeat) { rHeldRef.current = true; rUsedRef.current = false; } }
      // H hides or brings back the toolbars; F takes the map's window
      // full screen; P does both at once, for the projector.
      else if (k === 'h') setShowOptions((v) => !v);
      else if (k === 'f' && win) toggleFullscreen();
      else if (k === 'p' && win) present();
    };
    const onKeyUp = (e) => {
      if (e.key.toLowerCase() !== 'r') return;
      if (rHeldRef.current && !rUsedRef.current) setRotation((r) => (r + 90) % 360);
      rHeldRef.current = false;
    };
    const onBlur = () => { rHeldRef.current = false; };
    target.addEventListener('keydown', onKey);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onKey);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win]);

  /* ---- panning ----
     Hold Space and drag. The pointer has to be over the map: Space also
     presses whichever toolbar button was clicked last, and swallowing it
     across the whole dashboard would break every other panel. The press is
     caught on the way in, before the tool under the cursor sees it, so a pan
     never paints a square. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const w = win || window;
    const typing = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target && e.target.tagName) || '');
    let over = false;
    let drag = null;
    const cursor = (state) => {
      el.classList.toggle('pan-ready', state === 'ready');
      el.classList.toggle('panning', state === 'panning');
    };
    const onEnter = () => { over = true; };
    const onLeave = () => { over = false; };
    const onKeyDown = (e) => {
      if (e.code !== 'Space' || !over || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) { spaceRef.current = true; if (!drag) cursor('ready'); }
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      if (spaceRef.current) e.preventDefault();    // no click on a focused button
      spaceRef.current = false;
      if (!drag) cursor(null);
    };
    const onDown = (e) => {
      if (!spaceRef.current || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      cursor('panning');
    };
    const onMove = (e) => {
      if (!drag) return;
      el.scrollLeft = drag.left - (e.clientX - drag.x);
      el.scrollTop = drag.top - (e.clientY - drag.y);
    };
    const onUp = () => {
      if (!drag) return;
      drag = null;
      cursor(spaceRef.current ? 'ready' : null);
    };
    const onBlur = () => { spaceRef.current = false; drag = null; cursor(null); };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousedown', onDown, true);
    w.addEventListener('keydown', onKeyDown);
    w.addEventListener('keyup', onKeyUp);
    w.addEventListener('mousemove', onMove);
    w.addEventListener('mouseup', onUp);
    w.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mousedown', onDown, true);
      w.removeEventListener('keydown', onKeyDown);
      w.removeEventListener('keyup', onKeyUp);
      w.removeEventListener('mousemove', onMove);
      w.removeEventListener('mouseup', onUp);
      w.removeEventListener('blur', onBlur);
      cursor(null);
    };
  }, [win]);

  /* ---- full screen ----
     The Fullscreen API has to be asked from a click or keypress inside the
     window that is going full screen, which is why the button and the key
     live here rather than on the dashboard that opened it. The prefixed names
     are Safari's. */
  const fsDoc = () => (win || window).document;
  const fsActive = () => Boolean(fsDoc().fullscreenElement || fsDoc().webkitFullscreenElement);
  function toggleFullscreen() {
    const doc = fsDoc();
    const el = doc.documentElement;
    try {
      const done = fsActive()
        ? (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc)
        : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      if (done && typeof done.catch === 'function') done.catch(() => {});
    } catch { /* the browser refused; the window is still as large as the screen */ }
  }
  // A clean, full-screen map in one step. Leaving full screen (Esc) brings
  // the toolbars back, so the GM is never stranded without them.
  function present() {
    if (!fsActive()) {
      presentingRef.current = true;
      setShowOptions(false);
    }
    toggleFullscreen();
  }
  useEffect(() => {
    if (!win) return undefined;
    const doc = win.document;
    const onChange = () => {
      const on = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFull(on);
      if (!on && presentingRef.current) { presentingRef.current = false; setShowOptions(true); }
    };
    doc.addEventListener('fullscreenchange', onChange);
    doc.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      doc.removeEventListener('fullscreenchange', onChange);
      doc.removeEventListener('webkitfullscreenchange', onChange);
    };
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
      /* Grouped by the ground painted on each square, so a deck that runs
         from ice to deck plate is drawn in one pass per terrain rather than
         one per square. Unpainted squares fall to the deck's own ground. */
      const byGround = new Map();
      for (const k of floorKeys) {
        const id = m.ground[k] || m.theme;
        const list = byGround.get(id);
        if (list) list.push(k); else byGround.set(id, [k]);
      }

      for (const [id, keys] of byGround) {
        // Each ground brings its OWN fallback and wash: the wash is tuned to
        // how bright that particular floor is, so sharing the deck's would
        // wash a pale ice shelf like dark deck plate.
        const t = resolveTheme(id, customThemes) || theme;
        const src = groundSrc(id);
        const img = src ? texturesRef.current.get(src) : null;
        ctx.save();
        ctx.beginPath();
        for (const k of keys) {
          const p = parseKey(k);
          if (p) ctx.rect(p.x * px, p.y * px, px, px);
        }
        ctx.clip();
        ctx.fillStyle = img ? (ctx.createPattern(img, 'repeat') || t.fallback) : t.fallback;
        ctx.fillRect(0, 0, w, h);
        // The wash knocks a busy photographic deck back so tokens, the grid
        // and the templates read over it. A pale drawn deck has none of that
        // noise and a dark grid of its own, so washing it would only turn a
        // deliberately clean floor grey.
        ctx.fillStyle = `rgba(0,0,0,${t.wash})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
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

    // 3d. Foliage and smoke: a green wash, denser where sight stops sooner.
    //     Drawn on the projector too — it is terrain, not a secret.
    for (const [k, id] of Object.entries(m.obscuring)) {
      const p = parseKey(k);
      const ob = obscuringById(id);
      if (!p || !ob) continue;
      ctx.save();
      ctx.globalAlpha = ob.alpha;
      ctx.fillStyle = ob.colour;
      ctx.fillRect(p.x * px, p.y * px, px, px);
      ctx.globalAlpha = Math.min(0.9, ob.alpha + 0.25);
      ctx.fillStyle = ob.colour;
      for (const [fx, fy] of [[0.28, 0.3], [0.7, 0.35], [0.45, 0.7]]) {
        ctx.beginPath();
        ctx.arc(p.x * px + px * fx, p.y * px + px * fy, px * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
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
    } else if (hover && (mode === 'paint' || mode === 'erase' || mode === 'ground')) {
      fill(brushCells(hover, brush, m),
        mode === 'erase' ? 'rgba(231,76,60,0.4)'
          // Terrain lays down rather than builds, so it gets its own colour:
          // a green brush would read as "this adds deck".
          : mode === 'ground' ? 'rgba(0,229,255,0.35)'
            : 'rgba(46,204,113,0.4)');
    } else if (hover && mode === 'obscure') {
      fill(brushCells(hover, brush, m), 'rgba(95,159,85,0.45)');
    } else if (hover && mode === 'noise' && !projecting) {
      // How far this sound carries, as the GM lines it up.
      const n = noiseById(noiseKind);
      if (n) fill(areaCells(m, hover, n.radiusM), 'rgba(255,200,60,0.16)');
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
  }, [m, px, theme, hover, mode, tileId, rotation, brush, overlay, origin, aim, weapon, coneAngle, projecting,
      measureFrom, measureTo, measurement, showZones, showCalibration, showLos, textureTick,
      noiseKind]);

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

  /* The stage takes everything from wherever it has landed down to the
     bottom of the screen.

     A fixed height in vh cannot do this: what sits above the map differs
     between the dashboard tab and its own window, and inside the tab it
     changes as the toolbars reflow — picking a tool with a long hint pushes
     the map down by a line. Measuring the stage's own top is the only thing
     that knows. A ResizeObserver on the component catches the reflow; the
     height it computes does not depend on the stage's own height, so
     setting it cannot feed back into another measurement. */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const w = win || window;
    const sizeStage = () => {
      const top = el.getBoundingClientRect().top;
      const next = Math.max(240, Math.round(w.innerHeight - top - 14));
      if (Math.abs(el.clientHeight - next) > 1) el.style.height = next + 'px';
    };
    sizeStage();
    const ro = typeof w.ResizeObserver === 'function'
      ? new w.ResizeObserver(sizeStage) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    w.addEventListener('resize', sizeStage);
    return () => {
      if (ro) ro.disconnect();
      w.removeEventListener('resize', sizeStage);
    };
  }, [win]);

  // In a window of its own there is no reason not to fill it, so the grid
  // fits itself on open and whenever the window is resized. In the dashboard
  // tab the deck's size is the GM's to set with Fit to screen, because
  // resizing a panel should not quietly redraw the deck being built.
  useEffect(() => {
    if (!win) return undefined;
    // Only a blank deck. Now that the window and the tab share one map,
    // fitting on open would resize a deck the GM had already built — and
    // shrinking hides painted squares, even though the floor keeps them.
    if (!Object.keys(mapRef.current.floor).length) fitToStage();
    const onResize = () => fitToStage();
    win.addEventListener('resize', onResize);
    return () => win.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, m.pxPerSquare]);

  /* Zooming the deck, kept clear of scrolling it.

     The plain wheel scrolls: a deck bigger than the window is read by
     scrolling it, and a wheel that also zoomed meant every scroll changed the
     scale under the cursor. Zoom now needs a deliberate gesture: hold the
     right mouse button and turn the wheel, or hold Z and turn the wheel. A
     trackpad pinch also works, because browsers report it as a wheel event
     with ctrl held.

     A native listener rather than React's onWheel: React registers wheel
     listeners as passive, and a passive listener cannot stop the page
     scrolling, so the deck zoomed and slid at the same time. */
  const zHeldRef = useRef(false);
  const rightZoomedRef = useRef(false);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const w = win || window;
    const typing = (t) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((t && t.tagName) || '');

    const onKeyDown = (e) => {
      if (e.key.toLowerCase() === 'z' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
        zHeldRef.current = true;
      }
    };
    const onKeyUp = (e) => { if (e.key.toLowerCase() === 'z') zHeldRef.current = false; };
    // A key held while the window loses focus never reports its release.
    const onBlur = () => { zHeldRef.current = false; rightZoomedRef.current = false; };

    const onWheel = (e) => {
      const rightHeld = (e.buttons & 2) === 2;
      if (!(rightHeld || zHeldRef.current || e.ctrlKey)) return;   // a plain wheel scrolls
      e.preventDefault();
      if (rightHeld) rightZoomedRef.current = true;
      const box = el.getBoundingClientRect();
      const atX = e.clientX - box.left + el.scrollLeft;
      const atY = e.clientY - box.top + el.scrollTop;
      const cur = zoomRef.current;
      // A pinch arrives as many small deltas; a wheel notch as one large one.
      const step = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.12 : 1 / 1.12);
      const next = clampZoom(cur * step);
      if (next === cur) return;
      const k = next / cur;
      zoomRef.current = next;
      setZoom(next);
      setZoomPct(String(Math.round(next * 100)));
      // About the pointer, after the browser has laid the bigger canvas out.
      // Without the correction the deck slides out from under the cursor.
      w.requestAnimationFrame(() => {
        el.scrollLeft = atX * k - (e.clientX - box.left);
        el.scrollTop = atY * k - (e.clientY - box.top);
      });
    };
    // Releasing the right button after zooming would open the context menu
    // over the map. Swallow it once, and only when a zoom just happened.
    const onContextMenu = (e) => {
      if (rightZoomedRef.current) { e.preventDefault(); rightZoomedRef.current = false; }
    };
    const onMouseDown = (e) => { if (e.button === 2) rightZoomedRef.current = false; };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('mousedown', onMouseDown);
    w.addEventListener('keydown', onKeyDown);
    w.addEventListener('keyup', onKeyUp);
    w.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('mousedown', onMouseDown);
      w.removeEventListener('keydown', onKeyDown);
      w.removeEventListener('keyup', onKeyUp);
      w.removeEventListener('blur', onBlur);
    };
  }, [win]);

  // Hiding the toolbars frees the height they held; in the map's own window
  // the grid grows into it, as it does on a resize. Waits a frame for the
  // layout to settle before measuring.
  useEffect(() => {
    if (!win) return undefined;
    const id = win.requestAnimationFrame(() => fitToStage());
    return () => win.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOptions, isFull]);

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

  /* Grows the deck by repeating what is already built, rather than adding
     bare grid for the GM to paint. Nothing is asked first: it is additive
     where it grows, and `Expand deck` back to the old numbers puts it back —
     except where it SHRINKS, which drops squares, so that is confirmed. */
  const growDeck = () => {
    const plan = expandPlan(m, growCols, growRows);
    if (plan.shrinking
      && !window.confirm(
        `${plan.cols}×${plan.rows} is smaller than this deck. Squares outside it are dropped.`)) {
      return;
    }
    if (onChange) onChange(expandMap(m, growCols, growRows, { mirror: growMirror }));
  };

  /* Lays out a deck: compartments, the runs between them, and a door at
     every junction. The seed is what makes it a deck rather than a roll —
     written down, it comes back, so an edit that goes wrong is recoverable
     and a layout worth keeping can be handed to someone else.

     REPLACES THE FLOOR, so it asks first when there is one. What it does not
     touch is the ground, the calibration or the deck's name: those are the
     GM's, and a generator that reset them would be taking more than it was
     asked for. */
  const rollDeck = () => {
    if (Object.keys(m.floor).length
      && !window.confirm('Replace the deck with a generated one? The ground and calibration are kept.')) {
      return;
    }
    const seed = genSeed.trim() || newSeed();
    const out = generateDeck({ cols: m.cols, rows: m.rows, style: genStyle, seed });
    setGenSeed(out.seed);
    patch({
      floor: out.floor,
      doors: out.doors,
      // Everything that was placed ON the old deck refers to squares that no
      // longer exist. Left behind, a crate sits in the void and a contact
      // pings from inside a wall.
      cover: {}, hazards: {}, markers: {}, contacts: {},
      explored: {}, viewpoint: null
    });
    originRef.current = null; measureRef.current = null;
    setMeasureFrom(null); setMeasureTo(null); setOrigin(null); setAim(null);
  };

  /* Generates a floor with the same Gemini pipeline the portraits use. The
     GM describes the ground; the server wraps that in the clauses that make
     it a floor rather than a picture (top-down, seamless, flat light, no grid
     of its own) — so what is ON the ground is theirs and the shot is ours.

     Nothing is written to the deck here. The result is held as a preview
     until they say they are happy with it, because the first attempt usually
     is not the one you keep. */
  const generateGround = async () => {
    setGenErr(''); setGenBusy(true);
    try {
      const res = await fetch('/api/generate-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          describe: genDescribe, cover: genCover, condition: genCond
        })
      });
      if (!res.ok) {
        let why = `Generation failed (${res.status})`;
        try { why = (await res.json()).error || why; } catch { /* not json */ }
        throw new Error(why);
      }
      /* Shrunk hard, because it is kept in the GM's library as a data URL
         and that library has a real byte ceiling. 512 is plenty for a floor
         that TILES — at a 40px square one copy already spans twelve squares
         — and it is the difference between a handful of saved grounds
         fitting and the first one filling the budget on its own. */
      const texture = await shrinkToDataUrl(await res.blob(), 512, 0.75);
      setPreview({ texture, numbers: await sampleNumbers(texture) });
    } catch (e) {
      setGenErr(e.message || 'Generation failed');
    } finally {
      setGenBusy(false);
    }
  };

  /* A floor of the GM's own. It lands in the same preview a generated one
     does, so it is judged tiled and saved by the same road.

     Cropped and recompressed to match the shipped floors, and SAID so: the
     two files people reach for are a photo and a screenshot, and both are
     the wrong shape for something that tiles. */
  const uploadGround = (file) => {
    if (!file) return;
    setGenErr(''); setUploadNote('');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const advice = textureAdvice({ width: img.naturalWidth, height: img.naturalHeight });
      if (!advice.ok) { URL.revokeObjectURL(url); setGenErr(advice.message); return; }
      setUploadNote(advice.message);
      // Opens on the middle, which is where the old centre-crop took it from.
      // Pressing straight through gives the tile this gave before it could
      // be dragged at all.
      setCrop({ file, url, ...centreCrop(img.naturalWidth, img.naturalHeight, CROP_BOX) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); setGenErr('Could not read that image.'); };
    img.src = url;
  };

  /* The object URL is the browser holding the whole file in memory for us.
     Dropped here rather than on unmount alone, because a GM trying four
     photographs for one floor would otherwise be holding all four. */
  const closeCrop = () => setCrop((c) => {
    if (c) URL.revokeObjectURL(c.url);
    return null;
  });

  const recentre = (c) => ({ ...c, ...centreCrop(c.imgW, c.imgH, c.box) });

  /* Cuts the chosen square and hands it to the same preview a generated
     floor lands in, so both are judged tiled and saved by the same button. */
  const commitCrop = async () => {
    if (!crop) return;
    setGenErr(''); setGenBusy(true);
    try {
      const out = await prepareTexture(crop.file, {
        square: cropSquare,
        // Unticked means take the file as it is, so there is no square to
        // cut and the rect would be meaningless.
        rect: cropSquare ? cropRect(crop) : null
      });
      setPreview({ texture: out.dataUrl, numbers: await sampleNumbers(out.dataUrl) });
      setUploadNote(
        `Stored at ${out.width}\u00d7${out.height}, ${Math.round(out.bytes / 1024)}KB.`
      );
      closeCrop();
    } catch (e) {
      setGenErr(e.message || 'Could not read that image.');
    } finally {
      setGenBusy(false);
    }
  };

  /* Reads the generated floor back to work out its five numbers. Drawn small
     on purpose — this wants the average of the whole floor, not its
     detail, and 64x64 is plenty for that. */
  const sampleNumbers = (dataUrl) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64).data;
      let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      resolve(themeNumbersFor({ r: r / n, g: gg / n, b: b / n }));
    };
    // A floor we cannot read gets the neutral set rather than no theme.
    img.onerror = () => resolve(themeNumbersFor({}));
    img.src = dataUrl;
  });

  /* Keeps it. The preview becomes a named environment in the GM's own
     library, the map switches to it, and it is in the picker from then on
     beside the nine built in. */
  const saveGround = async () => {
    if (!preview) return;
    if (!onSaveTheme) {
      // It used to be a disabled button with nothing to say. A GM pressing
      // it learned only that pressing it did nothing.
      setGenErr('This window cannot save grounds — open the map from the GM dashboard.');
      return;
    }
    setGenBusy(true);
    const saved = await onSaveTheme({
      name: genName.trim() || 'Saved ground',
      texture: preview.texture,
      prompt: [genDescribe, genCover].filter(Boolean).join(' / '),
      subtitle: genCover ? `with ${genCover}` : '',
      ...preview.numbers
    });
    setGenBusy(false);
    if (!saved || !saved.id) {
      // The store said no — out of room, or offline. The message is already
      // on screen; keep the preview so the work is not thrown away with it.
      if (!genErr) setGenErr('Could not save that ground.');
      return;
    }
    patch({ theme: saved.id, customTexture: null });
    setPreview(null);
    setGenName('');
    setGenOpen(false);
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
    <div className={'rt-bm' + (win ? ' rt-bm-win' : '')} style={{ position: 'relative' }}>
      {!showOptions && (
        <button type="button" className="rt-btn rt-bm-peek" onClick={() => setShowOptions(true)}
          title="Show the map options (H)">Options</button>
      )}
      {showOptions && (<>
      <div className="rt-bm-bar">
        <select value={m.theme}
          onChange={(e) => patch({ theme: e.target.value, customTexture: null })}>
          <optgroup label="Built in">
            {MAP_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
          {customThemes.length > 0 && (
            <optgroup label="My grounds">
              {customThemes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          )}
        </select>
        <button type="button"
          className={'rt-btn rt-bm-mode' + (genOpen ? ' on' : '')}
          onClick={() => setGenOpen((v) => !v)}>
          Ground{m.customTexture ? ' \u00b7 generated' : ''}
        </button>
        <button type="button"
          className={'rt-btn rt-bm-mode' + (deckOpen ? ' on' : '')}
          onClick={() => setDeckOpen((v) => !v)}>
          Deck
        </button>
        {MODES.map((x) => (
          <button key={x.id} type="button"
            className={'rt-btn rt-bm-mode' + (mode === x.id ? ' on' : '')}
            onClick={() => setMode(x.id)}>{x.label}</button>
        ))}
        {onSaveDeck && (<>
          <select value={deckTarget} onChange={(e) => { setDeckTarget(e.target.value); setDeckNote(''); }}>
            {/* Written as the character itself: a backslash-u escape in JSX
                TEXT is not an escape, it is the six characters, and the GM
                reads the backslash. */}
            <option value="">Save as a new deck…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>Save over: {d.name || 'Untitled deck'}</option>
            ))}
          </select>
          {!deckTarget && (
            <input className="rt-field" value={deckName} maxLength={80}
              placeholder="Name this deck"
              onChange={(e) => setDeckName(e.target.value)} />
          )}
          <button type="button" className="rt-btn" onClick={() => {
            const saved = onSaveDeck({ id: deckTarget || null, name: deckName, map: m });
            if (saved) {
              setDeckNote(`Saved to \u201c${saved.name}\u201d.`);
              setDeckTarget(saved.id);
              setDeckName('');
            }
          }}>Save deck</button>
          {deckNote ? <span className="rt-bm-hint">{deckNote}</span> : null}
        </>)}
        {onLoadDeck && decks.length > 0 && (<>
          <select value={loadId} onChange={(e) => setLoadId(e.target.value)}>
            <option value="">Load a deck…</option>
            {decks.map((d) => <option key={d.id} value={d.id}>{d.name || 'Untitled deck'}</option>)}
          </select>
          <button type="button" className="rt-btn" disabled={!loadId} onClick={loadChosenDeck}
            title="Bring a saved deck onto the map. Undo takes it back.">Load deck</button>
        </>)}
        <button type="button" className="rt-btn" onClick={exportPng}>Export PNG</button>
        <button type="button" className="rt-btn" onClick={clearAll}>Clear deck</button>
        <button type="button" className="rt-btn" onClick={undo}
          disabled={historyRef.current.past.length === 0}
          title="Undo the last change (Cmd/Ctrl+Z)">Undo</button>
        <button type="button" className="rt-btn" onClick={redo}
          disabled={historyRef.current.future.length === 0}
          title="Redo (Shift+Cmd/Ctrl+Z)">Redo</button>
        <button type="button" className="rt-btn" onClick={() => rotateMapBy(-1)}
          title="Turn what you have painted 90 degrees anticlockwise. The grid stays put. Hold R and Shift and click the map to do the same.">Rotate {'\u21BA'} 90{'\u00B0'}</button>
        <button type="button" className="rt-btn" onClick={() => rotateMapBy(1)}
          title="Turn what you have painted 90 degrees clockwise. The grid stays put. Hold R and click the map to do the same.">Rotate {'\u21BB'} 90{'\u00B0'}</button>
        {turnNote ? <span className="rt-bm-hint">{turnNote}</span> : null}
        <button type="button" className="rt-btn" onClick={() => setShowOptions(false)}
          title="Hide every toolbar for a clean map. H brings them back.">Hide options (H)</button>
        {win && (<>
          <button type="button" className="rt-btn" onClick={toggleFullscreen}
            title="Full screen. Esc leaves it.">{isFull ? 'Exit full screen (F)' : 'Full screen (F)'}</button>
          <button type="button" className="rt-btn" onClick={present}
            title="Full screen with the options hidden, for the projector. Esc leaves it.">Present (P)</button>
        </>)}
      </div>

      {/* Laying out the deck, beside generating its ground: the two halves of
          "make me somewhere to fight", in one place. */}
      {deckOpen && (
        <div className="rt-bm-gen">
          <div className="rt-sechead">
            <h4>Generate a deck</h4>
            <button type="button" className="rt-btn ghost"
              onClick={() => setDeckOpen(false)}>Close</button>
          </div>

          <div className="rt-bm-bar">
            <label className="rt-bm-num">
              <span>Layout</span>
              <select value={genStyle} onChange={(e) => setGenStyle(e.target.value)}>
                {DECK_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="rt-bm-num">
              <span>Seed</span>
              {/* Typed and kept, because this is what makes a generated deck
                  reproducible. Blank rolls a fresh one and shows it. */}
              <input className="rt-field" value={genSeed} maxLength={24}
                placeholder="blank to roll"
                onChange={(e) => setGenSeed(e.target.value)} />
            </label>
            <button type="button" className="rt-btn ghost"
              onClick={() => setGenSeed(newSeed())}>New seed</button>
            <button type="button" className="rt-btn" onClick={rollDeck}>
              Generate deck
            </button>
          </div>

          {/* Growing a built deck, rather than laying out a new one. Here
              because "make it bigger" and "make me one" are the same
              question asked at different points. */}
          <div className="rt-bm-bar">
            <label className="rt-bm-num">
              <span>Expand to cols</span>
              <input type="number" min={MIN_GRID} max={MAX_GRID} value={growCols}
                onChange={(e) => setGrowCols(e.target.value)} />
            </label>
            <label className="rt-bm-num">
              <span>rows</span>
              <input type="number" min={MIN_GRID} max={MAX_GRID} value={growRows}
                onChange={(e) => setGrowRows(e.target.value)} />
            </label>
            <label className="rt-bm-num">
              <input type="checkbox" checked={growMirror}
                onChange={(e) => setGrowMirror(e.target.checked)} />
              <span>Mirror at the seams</span>
            </label>
            <button type="button" className="rt-btn" onClick={growDeck}>
              Expand deck
            </button>
          </div>

          <p className="rt-bm-hint">
            {(() => {
              // Said before the button is pressed, because turning one deck
              // into nine is worth being told about first.
              const p = expandPlan(m, growCols, growRows);
              if (p.shrinking) {
                return `${p.cols}×${p.rows} is smaller than this deck. `
                  + 'Anything outside the new grid is dropped.';
              }
              if (p.copies <= 1) return `${p.cols}×${p.rows} holds one copy of this deck.`;
              return `${p.across}×${p.down} copies of the current ${m.cols}×${m.rows} deck`
                + `${p.partial ? ', the last one cut short' : ''}`
                + `${growMirror ? ', flipped at each seam so the runs meet' : ', repeated as-is'}.`
                + ' Hostiles and fog are not copied.';
            })()}
          </p>

          <p className="rt-bm-hint">
            {styleById(genStyle).note} Laid out across the current
            {' '}{m.cols}×{m.rows} grid, with a door wherever a run meets a
            compartment — so one fog click reveals one room, not the deck.
            Replaces the floor and the bulkheads; the ground, the calibration
            and the deck's name are kept.
          </p>
        </div>
      )}

      {genOpen && (
        <div className="rt-bm-gen">
          <div className="rt-sechead">
            <h4>Generate a ground</h4>
            <button type="button" className="rt-btn ghost"
              onClick={() => {
                setGenOpen(false); setPreview(null); setGenErr(''); closeCrop();
              }}>Close</button>
          </div>

          <label className="rt-bm-field">
            <span className="rt-der-k">The ground itself</span>
            <textarea rows={3} maxLength={MAX_DESCRIBE} value={genDescribe}
              disabled={genBusy}
              placeholder="A flooded promethium refinery floor, oil slick on standing water, rusted deck plate underneath"
              onChange={(e) => setGenDescribe(e.target.value)} />
          </label>

          <label className="rt-bm-field">
            <span className="rt-der-k">Terrain and cover on it</span>
            <textarea rows={2} maxLength={MAX_DESCRIBE} value={genCover}
              disabled={genBusy}
              placeholder="Burst promethium drums, fallen gantry sections, a toppled cogitator bank"
              onChange={(e) => setGenCover(e.target.value)} />
          </label>

          <div className="rt-bm-bar">
            <select value={genCond} onChange={(e) => setGenCond(e.target.value)} disabled={genBusy}>
              {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {/* The built-in grounds fill the box rather than restricting it:
                a starting point to edit, which beats a blank page. */}
            <select value="" disabled={genBusy}
              onChange={(e) => {
                const env = ENVIRONMENTS.find((x) => x.id === e.target.value);
                if (!env) return;
                setGenDescribe(env.surface);
                setGenCover(env.detail);
              }}>
              <option value="">Start from…</option>
              {ENVIRONMENTS.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button type="button" className="rt-btn" onClick={generateGround} disabled={genBusy}>
              {genBusy ? 'Generating…' : preview ? 'Generate again' : 'Generate'}
            </button>
          </div>

          {/* A floor of the GM's own, down the same road as a generated one:
              it lands in the preview below and is saved by the same button. */}
          <div className="rt-bm-bar">
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => {
                uploadGround(e.target.files && e.target.files[0]);
                // Cleared, or picking the same file twice fires nothing.
                e.target.value = '';
              }} />
            <button type="button" className="rt-btn ghost" disabled={genBusy}
              onClick={() => fileRef.current && fileRef.current.click()}>
              Upload a floor…
            </button>
            <label className="rt-bm-num">
              <input type="checkbox" checked={cropSquare} disabled={genBusy}
                onChange={(e) => setCropSquare(e.target.checked)} />
              <span>Crop to square</span>
            </label>
            <span className="rt-bm-hint">
              A floor tiles, so it wants a square. Pick an image and drag it
              under the window to choose which square. Stored at 512×512 to
              match the shipped grounds.
            </span>
          </div>

          {/* THE CROP WINDOW. The picture moves, the window does not: the
              square on screen is exactly the square that gets cut, so there
              is nothing to read off a number or imagine. */}
          {crop && (
            <div className="rt-bm-bar rt-bm-cropbar">
              <div
                className="rt-bm-crop"
                style={{ width: CROP_BOX, height: CROP_BOX }}
                onPointerDown={(e) => {
                  dragRef.current = { x: e.clientX, y: e.clientY };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current;
                  if (!d) return;
                  const dx = e.clientX - d.x, dy = e.clientY - d.y;
                  dragRef.current = { x: e.clientX, y: e.clientY };
                  setCrop((c) => (c ? { ...c, ...dragBy(c, dx, dy) } : c));
                }}
                onPointerUp={() => { dragRef.current = null; }}
                onPointerCancel={() => { dragRef.current = null; }}
                // The wheel zooms this small crop preview; the deck itself needs Z or the right button.
                onWheel={(e) => {
                  setCrop((c) => (c
                    ? { ...c, ...zoomTo(c, c.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)) }
                    : c));
                }}
              >
                <img src={crop.url} alt="" draggable={false}
                  style={{
                    width: crop.imgW * crop.scale,
                    height: crop.imgH * crop.scale,
                    transform: `translate(${crop.x}px, ${crop.y}px)`
                  }} />
              </div>

              <div className="rt-bm-cropside">
                <label className="rt-bm-num">
                  <span>Zoom</span>
                  <input type="range" step="any"
                    min={scaleBounds(crop.imgW, crop.imgH, crop.box).min}
                    max={scaleBounds(crop.imgW, crop.imgH, crop.box).max}
                    value={crop.scale}
                    onChange={(e) => setCrop((c) => (c
                      ? { ...c, ...zoomTo(c, Number(e.target.value)) } : c))} />
                </label>
                <span className="rt-bm-hint">
                  {crop.imgW}×{crop.imgH}. Taking {cropRect(crop).size}px
                  from ({cropRect(crop).sx}, {cropRect(crop).sy}).
                </span>
                <div className="rt-bm-bar">
                  <button type="button" className="rt-btn" onClick={commitCrop}
                    disabled={genBusy}>
                    {genBusy ? 'Working…' : 'Use this crop'}
                  </button>
                  <button type="button" className="rt-btn ghost"
                    onClick={() => setCrop((c) => (c ? recentre(c) : c))}
                    disabled={genBusy}>
                    Centre
                  </button>
                  <button type="button" className="rt-btn ghost" onClick={closeCrop}
                    disabled={genBusy}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {uploadNote ? <p className="rt-bm-hint">{uploadNote}</p> : null}
          {genErr ? <p className="rt-warn">{genErr}</p> : null}

          {preview && (<>
            {/* Tiled at a fixed square size, because a floor is judged on
                how it repeats and a single copy hides every seam. */}
            <div className="rt-bm-preview"
              style={{ backgroundImage: `url(${preview.texture})` }} />
            <div className="rt-bm-bar">
              <label className="rt-bm-num">
                <span>Name it</span>
                <input value={genName} maxLength={60} placeholder="Refinery floor"
                  onChange={(e) => setGenName(e.target.value)} />
              </label>
              <button type="button" className="rt-btn" onClick={saveGround} disabled={genBusy}>
                Save to my grounds
              </button>
              <button type="button" className="rt-btn ghost"
                onClick={() => patch({ customTexture: preview.texture })}>
                Try it on this deck
              </button>
              <span className="rt-bm-hint">
                Saving adds it to the ground picker and switches this deck to it.
                Its grid and wash are read off the image.
              </span>
            </div>
          </>)}
        </div>
      )}
      {genErr ? <p className="rt-warn">{genErr}</p> : null}

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

        {(mode === 'paint' || mode === 'erase' || mode === 'ground') && (
          <label className="rt-bm-num">
            <span>Brush</span>
            <select value={String(brush)} onChange={(e) => setBrush(Number(e.target.value))}>
              {[1, 2, 3, 5, 7, 10].map((n) => (
                <option key={n} value={String(n)}>{n}×{n}</option>
              ))}
            </select>
          </label>
        )}

        {/* Which terrain the brush lays down. The deck's own ground is first
            and named as such, because picking it is how paint comes off. */}
        {mode === 'ground' && (<>
          <span className="rt-bm-hint">Paints new squares as well as existing ones.</span>
          <label className="rt-bm-num">
            <span>Terrain</span>
            <select value={paintGround} onChange={(e) => setPaintGround(e.target.value)}>
              <option value={m.theme}>
                {`This deck's ground (${theme.name}) \u2014 lifts paint off`}
              </option>
              <optgroup label="Built in">
                {MAP_THEMES.filter((t) => t.id !== m.theme).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
              {customThemes.length > 0 && (
                <optgroup label="Saved grounds">
                  {customThemes.filter((t) => t.id !== m.theme).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <span className="rt-bm-hint">
            {(() => {
              const n = Object.keys(m.ground).filter((k) => m.floor[k]).length;
              return n
                ? `${n} square${n === 1 ? '' : 's'} painted, ${groundIds.length} grounds on this deck.`
                : 'Paint terrain over the deck. Walls, rooms and fog are unaffected \u2014 this is only what a square looks like.';
            })()}
          </span>
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

        {mode === 'obscure' && (<>
          <select value={obscureType} onChange={(e) => setObscureType(e.target.value)}>
            {OBSCURING.map((o) => (
              <option key={o.id} value={o.id}>{o.name} {'\u00b7'} sight stops after {o.blocksAfterM} m</option>
            ))}
          </select>
          <span className="rt-bm-hint">
            Click to lay it, drag to paint a stand of it, click again to lift. Not cover:
            it blocks the line of sight once it is deep enough, so the ruler and the
            sight overlay both stop at it. Blasts and flame cones pass through.
          </span>
        </>)}

        {mode === 'noise' && (<>
          <select value={noiseKind} onChange={(e) => setNoiseKind(e.target.value)}>
            {NOISE.map((n) => <option key={n.id} value={n.id}>{n.name} {'\u00b7'} heard to {n.radiusM} m</option>)}
          </select>
          <span className="rt-bm-hint">
            Click where the sound is made. Anything hidden within earshot comes up as a
            ping. Opening a door does this on its own.
          </span>
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
                      <strong> · blocked by {blockedText(overlay.shot.blocked)}</strong>
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
        <label className="rt-bm-num"><span>Light</span>
          <select value={m.lighting} onChange={(e) => patch({ lighting: e.target.value })}
            title="Shooting in poor light carries a penalty to hit (Rogue Trader pp.248-249)">
            {LIGHTING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button type="button" className="rt-btn" onClick={fitToStage}>Fit to screen</button>
        <label className="rt-bm-num">
          <span>Zoom %</span>
          {/* Typed, not picked: a GM matching the deck to a projector wants
              83%, not the nearest of eight. Holding Z or the right button
              and turning the wheel over the map does the same thing for the
              cases where a number is not what you have in mind. */}
          <input type="number" value={zoomPct}
            min={Math.round(MIN_ZOOM * 100)} max={Math.round(MAX_ZOOM * 100)} step={5}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => {
              setZoomPct(e.target.value);
              if (e.target.value.trim() !== '') setZoom(clampZoom(Number(e.target.value) / 100));
            }}
            onBlur={() => setZoomPct(String(Math.round(zoom * 100)))} />
        </label>
        <button type="button" className="rt-btn"
          onClick={() => { setZoom(1); setZoomPct('100'); }}>100%</button>
        <span className="rt-bm-hint">Zoom: hold Z or the right button and scroll, or pinch.</span>
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
            <span> · blocked by {blockedText(measurement.blocked)} at {measurement.blocked.x},{measurement.blocked.y}</span>
          )}
        </div>
      )}

      </>)}

      <div className="rt-bm-stage" ref={stageRef}>
        {/* The wrapper takes the scaled size because a CSS transform does not
            affect layout — without it the stage would not know there was
            anything to scroll to. */}
        <div style={{ width: m.cols * px * zoom, height: m.rows * px * zoom }}>
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => {
            const pos = posFromEvent(e);
            setHover(pos);
            if (spaceRef.current || rHeldRef.current) return;   // panning, or turning the map
            if (e.buttons === 1 && (mode === 'paint' || mode === 'erase' || mode === 'ground' || mode === 'obscure')) {
              applyAt(pos, true);
            }
          }}
          onMouseLeave={() => setHover(null)}
          onMouseDown={(e) => {
            // R held: this click turns the map, a quarter turn clockwise, or
            // anticlockwise with Shift, and does nothing else.
            if (e.button === 0 && rHeldRef.current) {
              rUsedRef.current = true;
              rotateMapBy(e.shiftKey ? -1 : 1);
              return;
            }
            if (e.button === 0) applyAt(posFromEvent(e), false, e.shiftKey, e.altKey, e.ctrlKey || e.metaKey);
          }}
          style={{
            cursor: mode === 'measure' || mode === 'overlay' ? 'crosshair' : 'pointer',
            transform: zoom === 1 ? undefined : `scale(${zoom})`,
            transformOrigin: 'top left',
            // Nearest-neighbour when magnified: a deck zoomed in should show
            // its squares, not a blurred guess at them.
            imageRendering: zoom > 1 ? 'pixelated' : undefined
          }}
        />
        </div>
      </div>

    </div>
  );
}
