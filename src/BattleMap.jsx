import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import TipButton from './TipButton.jsx';
import {
  MAP_THEMES, themeById, readMap, cellKey, parseKey,
  TILE_CATALOG, TILE_CATEGORIES, stampCells, paintCells,
  wallMask, cornerPillar, WALL_N, WALL_E, WALL_S, WALL_W,
  DOOR_STATES, nextDoorState, MARKER_TYPES, markerTypeById, TARGET_BONUS,
  reachBetween, rangeRings, areaCells, coneCells, visibleCells, unobstructed,
  overlayKindFor, onDeck, revealArea, concealArea, visibleExplored, fitGrid, brushCells,
  clampZoom, MIN_ZOOM, MAX_ZOOM, textureAdvice, rotateMap, rotationFits,
  expandMap, expandPlan, MIN_GRID, MAX_GRID, MAX_CUSTOM_SPRITES,
  resolveTheme, themeNumbersFor, groundsUsed, tokensNeeded, meleeReaches,
  DOOR_KINDS, doorKindById, COVER_TYPES, coverById, readCover, writeCover,
  HAZARD_TYPES, hazardById,
  nextContactState, auspexSweep, AUSPEX_RANGE_M,
  terminalAt, setTerminal, workRoomDoors, downloadSchematics,
  OBSCURING, obscuringById, LIGHTING_PRESETS, blockedText, lineBlocked, LOS_MAX_SQUARES, keepClean,
  weaponOverlay, calibrationBar, deploymentRows,
  setStartRoom, startPlay, playDoor, regionAt, coverAt,
  wearCover, detonateTank, turretAt, turretCells, setTurret, setDeckTurrets,
  spreadWarp, sealWarp, sanctified, placeVent, ventPartner, crawlThrough, ventField, VENT_REACH_SQUARES,
  lightAt, lightingById, caughtBy, caughtText,
  WALL_EAST, WALL_SOUTH, edgeNear, hasWall, setWall, clearWallsAround
} from './battlemap.js';
import {
  readBackdrop, newBackdropId, backdropKindOf, squaresFor, gridFor, squaresUnder, TV_SIZES, tvSquaresAcross
} from './backdrop.js';
import {
  deckMoves, MOTION_FRAME_MS, VIDEO_FRAME_MS, MOTION_MAX_SQUARES, rainStreaks, drift, flicker, sparkArc, rush
} from './motion.js';
import { putLocalFile } from './localfiles.js';
import {
  AREA_COLOURS, areaColour, newArea, areaById, areaAt, paintArea, updateArea, removeArea, labelCell, areasForTable
} from './areas.js';
import { PENS, MARKS, LAYOUTS, PASSAGE_KINDS, readStroke, simplify, distanceToStroke, newStrokeId } from './sketchplan.js';
import { planFromStrokes, describePlan, placePicture, moveStrokes, strokesFromReading } from './sketchread.js';
import { deckFromPlan } from './plandeck.js';
import { STOCK_EXAMPLES, stockExample, readExample, exampleFromMap, deckFromExample } from './wfc.js';
import { SKETCH_SOURCES, MAX_READ_NOTE } from '../lib/sketchprompt.js';
import GenerateFloor from './GenerateFloor.jsx';
import { placeOver, deckPlanMask, pictureForSketch, readSketchPicture } from './genai.js';
import useBackdropMedia from './useBackdropMedia.js';
import { measureMedia } from './measureMedia.js';
import { readUvtt, uvttToMap, UVTT_METRES_PER_SQUARE } from './uvtt.js';
import { runFrames, reveal } from './gsapcdn.js';
import {
  TRIGGER_WHEN, TRIGGER_DOORS, newTrigger, triggerById, triggerAt, paintTrigger, updateTrigger, rearmAll, anyArmed
} from './triggers.js';
import { springTriggers, springNow } from './triggerfire.js';
import { SITUATION_MODIFIERS } from './groundcombat.js';
import { NOISE, noiseById, noisePing } from './awareness.js';
import { GEAR } from './gear.js';
import { shrinkToDataUrl, prepareTexture } from './imageshrink.js';
import { centreCrop, cropRect, dragBy, zoomTo, scaleBounds } from './texturecrop.js';
import { generateDeck, growDeck as buildAroundDeck, newSeed, DECK_STYLES, styleById } from './mapgen.js';
import {
  spriteRole, spriteTurn, SPRITE_SLOTS, cellRect, keyBlack, tokenDirFor
} from './spritesheet.js';
import {
  DISCIPLINES, powerRule, powerShape, effectivePsyRating,
  phenomenaResult, perilsResult, escalatesToPerils
} from './psychic.js';
import { generateTerrain, readTerrainPrompt, TERRAIN_SIZES, TERRAIN_SCOPES } from './terrain.js';
import { ENVIRONMENTS, CONDITIONS, MAX_DESCRIBE } from '../lib/mapprompt.js';
import MapLibrary from './MapLibrary.jsx';

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
  { id: 'stamp', label: 'Stamp tile', icon: 'stamp' },
  { id: 'paint', label: 'Paint deck', icon: 'paint' },
  { id: 'ground', label: 'Paint ground', icon: 'ground' },
  { id: 'erase', label: 'Erase', icon: 'erase' },
  { id: 'door', label: 'Door', icon: 'door' },
  { id: 'wall', label: 'Thin wall', icon: 'wall' },
  { id: 'cover', label: 'Cover', icon: 'cover' },
  { id: 'hazard', label: 'Hazard', icon: 'hazard' },
  { id: 'obscure', label: 'Foliage / smoke', icon: 'foliage' },
  { id: 'light', label: 'Light', icon: 'light' },
  { id: 'contact', label: 'Contacts', icon: 'contact' },
  { id: 'noise', label: 'Noise', icon: 'noise' },
  { id: 'start', label: 'Starting room', icon: 'flag' },
  { id: 'fog', label: 'Fog and doors in play', icon: 'fog' },
  { id: 'marker', label: 'Marker', icon: 'marker' },
  { id: 'trigger', label: 'Trigger zones', icon: 'trigger' },
  { id: 'area', label: 'Named areas', icon: 'area' },
  { id: 'sketch', label: 'Sketch', icon: 'sketch' },
  { id: 'overlay', label: 'Overlay', icon: 'overlay' },
  { id: 'measure', label: 'Measure', icon: 'measure' }
];

/* THE TWO TABS. A map is built and then it is played, and the tools for the two
   have little in common: stamping tiles has no place at a table with the fog on,
   and revealing a room has none while the deck is being drawn. Build holds the
   tools that make the deck; Play holds the ones that run it, with the fog and
   the doors in one place, clickable. Measure is wanted in both. */
/* The starting room is set at the table, not at the drawing board: it is where
   the party ARRIVES, which is a thing about the session rather than about the
   deck. It lives on Play only. */
/* Light is on both: a deck is built with its dark corridors, and the lumens
   go out mid-session. */
const BUILD_TOOLS = ['sketch', 'stamp', 'paint', 'ground', 'erase', 'door', 'wall', 'cover', 'hazard', 'obscure', 'light', 'marker', 'trigger', 'area', 'measure'];
const PLAY_TOOLS = ['fog', 'start', 'contact', 'noise', 'light', 'trigger', 'area', 'overlay', 'measure'];

/* Markers that are part of the deck rather than laid on it mid-session: a
   click in play WORKS them (or leaves them be), it never lifts them. */
const FIXTURES = new Set(['cogitator', 'turret', 'shrine', 'vent']);
const FACINGS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
const toolsOf = (tab) => MODES.filter((x) => (tab === 'play' ? PLAY_TOOLS : BUILD_TOOLS).includes(x.id));

/* WHAT ELSE CAN BE POINTED AT THE DECK, beside the guns.

   Every psychic technique the app knows, by discipline — the map reads each
   one's range line ("5 m × PR cone", "10 m × PR line", "Personal") to know its
   shape (powerShape in psychic.js), so nothing here restates a rule.

   And the Navigator's third eye. Only the gazes that matter in a fight are
   listed: Seek the Path and the rest read the warp, not a boarding deck. The
   app records no range for them, so a gaze is drawn as what it plainly is —
   the Navigator's line of sight — and the GM applies the rest at the table. */
const NAV_GAZES = [
  { id: 'lidless', name: 'Lidless Stare', all: false,
    note: 'Opposed Willpower against one target who meets the gaze.' },
  { id: 'held', name: 'Held in the Gaze', all: false,
    note: 'One target who meets the gaze is pinned in place.' },
  { id: 'unveiled', name: 'Third Eye Unveiled', all: true,
    note: 'Everyone who can see the Navigator is struck by the unveiled eye.' }
];
const POWER_GROUPS = [
  ...DISCIPLINES.map((d) => ({
    group: `Psychic \u2014 ${d.name}`,
    items: [d.basic, ...d.techniques].map((n) => ({ key: 'psy:' + n, label: n }))
  })),
  { group: 'Navigator \u2014 the third eye', items: NAV_GAZES.map((g) => ({ key: 'nav:' + g.id, label: g.name })) }
];
const powerLabel = (key) => {
  for (const g of POWER_GROUPS) for (const i of g.items) if (i.key === key) return i.label;
  return '';
};
// The psychic mode, as one choice: Push carries its own size.
const PSY_MODES = [
  { id: 'fettered', name: 'Fettered' },
  { id: 'unfettered', name: 'Unfettered' },
  { id: 'push1', name: 'Push +1' },
  { id: 'push2', name: 'Push +2' },
  { id: 'push3', name: 'Push +3' }
];
const channelled = (pr, mode) => (String(mode).startsWith('push')
  ? effectivePsyRating(pr, 'push', Number(String(mode).slice(4)) || 1)
  : effectivePsyRating(pr, mode));

/* The overlay's own description of a power, in the same fields a weapon uses
   so the drawing code needs to learn as little as possible. */
function powerOverlay(key, psyRating, psyMode) {
  if (key.startsWith('nav:')) {
    const g = NAV_GAZES.find((x) => 'nav:' + x.id === key);
    if (!g) return null;
    return { power: 'nav', name: g.name, overlayKind: 'gaze', gazeAll: g.all, note: g.note, range: null };
  }
  const name = key.slice(4);
  const rule = powerRule(name);
  // Pyromancy is fire and is drawn as fire; everything else is the warp.
  const fire = DISCIPLINES.some((d) => d.id === 'pyromancy' && [d.basic, ...d.techniques].includes(name));
  const pr = channelled(psyRating, psyMode);
  const sh = powerShape(rule && rule.range, pr);
  const base = { power: 'psy', name, pr, fire, rangeText: rule ? rule.range : '', test: rule ? rule.test : '', range: null };
  if (sh.shape === 'cone') return { ...base, overlayKind: 'cone', range: sh.metres, coneDeg: sh.coneDeg };
  if (sh.shape === 'radius') return { ...base, overlayKind: 'burst', burstM: sh.metres };
  if (sh.shape === 'line') return { ...base, overlayKind: 'line', lineM: sh.metres };
  if (sh.shape === 'personal') return { ...base, overlayKind: 'personal' };
  if (sh.shape === 'sight') return { ...base, overlayKind: 'bolt', reachM: Infinity };
  return { ...base, overlayKind: 'bolt', reachM: sh.metres, touch: sh.shape === 'touch' };
}

// One set of options for both weapon pickers, so they cannot list different
// things. Powers only where they mean something: Measure reads a weapon's
// range bands, and a power has none.
function WeaponOptions({ powers = true }) {
  return (<>
    <option value="">No weapon</option>
    {['Pistol', 'Basic', 'Heavy', 'Thrown', 'Melee', 'Field'].map((kind) => (
      <optgroup key={kind} label={kind}>
        {ARMED.filter((a) => a.kind === kind).map((a) => (
          <option key={a.key} value={a.key}>{a.label}</option>
        ))}
      </optgroup>
    ))}
    {powers && POWER_GROUPS.map((g) => (
      <optgroup key={g.group} label={g.group}>
        {g.items.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
      </optgroup>
    ))}
  </>);
}

// Only things with a combat line are worth drawing an overlay for.
const ARMED = Object.entries(GEAR)
  .filter(([, v]) => v.stats && ['Pistol', 'Basic', 'Heavy', 'Thrown', 'Melee', 'Field'].includes(v.kind))
  .map(([k, v]) => ({ key: k, label: k.replace(/\b\w/g, (c) => c.toUpperCase()), kind: v.kind, stats: v.stats }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));

/* ---- the toolbar's icons ----
   Drawn here rather than imported: a dozen strokes each, no dependency, and
   they take their colour from the button they sit in. Every one is a 24-square
   grid of lines, so they read as one set. A button that is only an icon always
   carries its name as a tooltip and an aria-label. */
const ICONS = {
  stamp: <><path d="M9 3h6v6l3 3v3H6v-3l3-3z" /><path d="M5 20h14" /></>,
  paint: <><rect x="4" y="4" width="16" height="16" /><path d="M12 4v16M4 12h16" /><rect x="4" y="4" width="8" height="8" fill="currentColor" /></>,
  ground: <><path d="M3 18l6-9 4 5 3-4 5 8z" /><path d="M3 21h18" /></>,
  erase: <><path d="M4 15l9-9 6 6-7 7H8z" /><path d="M9 10l6 6M13 20h7" /></>,
  door: <><path d="M6 21V4h12v17M4 21h16" /><circle cx="15" cy="12.5" r="1" fill="currentColor" /></>,
  wall: <><rect x="3" y="6" width="18" height="12" /><path d="M3 12h18M9 6v6M15 12v6" /></>,
  trigger: <><path d="M4 4h16v16H4z" strokeDasharray="3 2.5" /><path d="M12 8v5M12 16v.5" /></>,
  area: <><path d="M3 5h9v6h9v8H3z" /><path d="M7 9h2M7 13h6" /></>,
  sketch: <><path d="M4 20l4-1 11-11-3-3L5 16z" /><path d="M14 6l3 3" /></>,
  picture: <><rect x="3" y="5" width="18" height="14" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.5" /></>,
  cover: <><rect x="4" y="5" width="16" height="14" /><path d="M4 5l16 14M20 5L4 19" /></>,
  hazard: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  foliage: <><path d="M7 18a4 4 0 010-8 5 5 0 019.5-1A4.5 4.5 0 0117 18z" /></>,
  contact: <><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="10" /></>,
  noise: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" /></>,
  fog: <><path d="M3 8h12M6 12h15M3 16h10M9 20h12" /></>,
  marker: <><path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  flag: <><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></>,
  light: <><path d="M9 17h6M10 20.5h4" /><path d="M8.5 14a5.5 5.5 0 117 0c-.8.7-1 1.6-1 3h-5c0-1.4-.2-2.3-1-3z" /></>,
  overlay: <><circle cx="12" cy="12" r="6" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></>,
  measure: <><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></>,
  rotateLeft: <><path d="M3 4v6h6" /><path d="M5.5 15a8 8 0 105-9.5L3 10" /></>,
  rotateRight: <><path d="M21 4v6h-6" /><path d="M18.5 15a8 8 0 11-5-9.5L21 10" /></>,
  pan: <><path d="M12 2v20M2 12h20" /><path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5M8 11h6" /></>,
  fit: <><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></>,
  hide: <><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4 10 6-.7 1-1.8 2.3-3.2 3.4M6.5 7.3C4.2 8.8 2.6 10.9 2 12c1.5 2 5 6 10 6 1.5 0 2.8-.3 4-.9" /></>,
  show: <><path d="M2 12c1.5-2 5-6 10-6s8.5 4 10 6c-1.5 2-5 6-10 6S3.5 14 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  full: <><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>,
  present: <><rect x="3" y="4" width="18" height="12" /><path d="M8 20h8M12 16v4" /></>,
  save: <><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>,
  grid: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>
};

/* A number field the GM types into. Selected whole when clicked, so a 0 is
   replaced rather than typed after; and a 0 left in front of a digit is taken
   off as it is typed, since "03" is 3 but reads as a mistake. A browser
   leaves the field's own text alone when it already equals the number. */
const selectAll = (e) => { const el = e.currentTarget; setTimeout(() => { try { el.select(); } catch { /* gone */ } }, 0); };
function noLeadingZero(el) {
  const v = String(el.value);
  if (/^-?0\d/.test(v)) el.value = v.replace(/^(-?)0+(?=\d)/, '$1');
}

function Icon({ name, size = 18 }) {
  return (
    <svg className="rt-ico" viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// The chart and the deck share one icon button (TipButton), which draws the
// name under the pointer; this passes the deck's own glyphs into it.
function IconButton({ icon, label, onClick, on = false, disabled = false, className = '' }) {
  return (
    <TipButton label={label} onClick={onClick} on={on} disabled={disabled} className={className}>
      <Icon name={icon} />
    </TipButton>
  );
}

/* ---- prop sheets in the browser ----

   The nine sheets that ship are cut up on a desktop by tools/slice-sprites.mjs.
   A sheet the GM generates mid-session has to be cut up here, by the same
   rules out of spritesheet.js, or a generated set would not sit beside a
   shipped one.

   Two steps, and the ORDER is the thing. The black is keyed into alpha at the
   size it arrived, and only then is the sheet shrunk for storage. Shrinking
   first averages each token with a background it has not been separated from
   yet, and bakes in a dark fringe that no later keying can find — the same
   trap the desktop tool documents, and it is easier to fall into here because
   a canvas makes the shrink the convenient thing to do first. */
function imageFrom(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

/* 768 across, so each of the sixteen cells is 192px.

   Measured rather than chosen: the shipped sheets, keyed and re-encoded, come
   to 535-840KB as data URLs at 1024, against a store that refuses anything
   over 900KB. A busy sheet — the jungle one — sits 60KB under the ceiling,
   which means a busier generated one fails to save AFTER the GM has paid for
   the call. At 768 the same three land at 317-485KB, roughly half the budget,
   and 192px a cell is still more than a 40-96px square ever asks for. */
async function keySheet(blob, { store = 768, quality = 0.78 } = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await imageFrom(url);
    // Square, and the smaller side wins: a sheet that came back 1024x1032
    // must still cut into sixteen equal cells.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('That sheet came back empty.');

    const full = document.createElement('canvas');
    full.width = side; full.height = side;
    const fg = full.getContext('2d', { willReadFrequently: true });
    fg.drawImage(img, 0, 0, side, side, 0, 0, side, side);
    const px = fg.getImageData(0, 0, side, side);
    // The dimensions matter: without them the keying cannot tell the art's own
    // dark shadows from background showing through, and two thirds of a dark
    // token comes out see-through.
    keyBlack(px.data, { w: side, h: side });
    fg.putImageData(px, 0, 0);

    // Now it may be shrunk: every pixel carries its own alpha, so the filter
    // mixes art with transparency rather than with black.
    const out = document.createElement('canvas');
    out.width = Math.min(store, side); out.height = out.width;
    const og = out.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(full, 0, 0, out.width, out.height);
    return out.toDataURL('image/webp', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* A stored sheet into sixteen pictures, by role. Canvases rather than Images
   because drawImage takes either and this way nothing is encoded, decoded and
   re-encoded on the way to being drawn. The sheet is already transparent —
   keySheet did that before it was stored — so this is pure cutting. */
function sliceSheet(img) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const out = {};
  for (const s of SPRITE_SLOTS) {
    const r = cellRect(s.slot, side, side);
    const c = document.createElement('canvas');
    c.width = r.w; c.height = r.h;
    c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    out[s.role] = c;
  }
  return out;
}

/* A cogitator terminal: the ground's own machinery token where there is one,
   a plain console where there is not, and its state as a frame and a lit
   screen — red locked, green accessed, a dead grey for burnt out — so the
   table can see at a glance which ones are worth fighting over. */
const TERMINAL_COLOUR = { locked: '231,76,60', open: '46,204,113', dead: '120,120,120' };
function drawTerminal(ctx, x0, y0, px, state, tok) {
  const rgb = TERMINAL_COLOUR[state] || TERMINAL_COLOUR.locked;
  if (tok) drawToken(ctx, tok, x0, y0, px);
  else {
    ctx.fillStyle = 'rgba(30,38,44,0.95)';
    ctx.fillRect(x0 + px * 0.14, y0 + px * 0.2, px * 0.72, px * 0.6);
  }
  // The screen.
  ctx.fillStyle = state === 'dead' ? 'rgba(40,40,40,0.9)' : `rgba(${rgb},0.85)`;
  ctx.fillRect(x0 + px * 0.3, y0 + px * 0.32, px * 0.4, px * 0.22);
  if (state !== 'dead') {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 3; i++) ctx.fillRect(x0 + px * 0.34, y0 + px * (0.36 + i * 0.055), px * (0.32 - i * 0.07), Math.max(1, px * 0.025));
  }
  ctx.strokeStyle = `rgba(${rgb},0.95)`;
  ctx.lineWidth = Math.max(1.5, px * 0.05);
  if (state === 'dead') ctx.setLineDash([3, 3]);
  const o = ctx.lineWidth / 2;
  ctx.strokeRect(x0 + o, y0 + o, px - ctx.lineWidth, px - ctx.lineWidth);
  ctx.setLineDash([]);
}

/* ---- terrain that does things, drawn ----
   None of these has a picture on the sheets, so each is drawn the way the
   terminal is: simple shapes that say what the thing is from across a table. */

/* Promethium tanks, from above: two drums in a hazard-striped cradle. The
   stripes are the point — this is the cover that explodes. */
function drawTank(ctx, x0, y0, px) {
  ctx.save();
  ctx.fillStyle = 'rgba(28,24,18,0.92)';
  ctx.fillRect(x0 + px * 0.08, y0 + px * 0.08, px * 0.84, px * 0.84);
  ctx.beginPath(); ctx.rect(x0 + px * 0.08, y0 + px * 0.08, px * 0.84, px * 0.84); ctx.clip();
  ctx.strokeStyle = 'rgba(241,196,15,0.85)';
  ctx.lineWidth = Math.max(2, px * 0.07);
  for (let o = -px; o < px * 2; o += px * 0.22) {
    ctx.beginPath(); ctx.moveTo(x0 + o, y0 + px); ctx.lineTo(x0 + o + px, y0); ctx.stroke();
  }
  ctx.restore();
  for (const [fx, fy] of [[0.34, 0.36], [0.64, 0.62]]) {
    const cx = x0 + px * fx, cy = y0 + px * fy, r = px * 0.24;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, 'rgb(236,120,60)');
    g.addColorStop(0.7, 'rgb(150,48,22)');
    g.addColorStop(1, 'rgb(70,20,10)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,5,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(40,40,40,0.95)';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.fill();
  }
}

/* Cover with hits in it: cracks across the art, and what it has left in the
   corner, so the next shot is priced off the screen. */
function drawWear(ctx, x0, y0, px, apLeft) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,90,60,0.85)';
  ctx.lineWidth = Math.max(1, px * 0.03);
  ctx.beginPath();
  ctx.moveTo(x0 + px * 0.2, y0 + px * 0.25); ctx.lineTo(x0 + px * 0.42, y0 + px * 0.45);
  ctx.lineTo(x0 + px * 0.36, y0 + px * 0.62); ctx.lineTo(x0 + px * 0.58, y0 + px * 0.8);
  ctx.moveTo(x0 + px * 0.42, y0 + px * 0.45); ctx.lineTo(x0 + px * 0.66, y0 + px * 0.38);
  ctx.stroke();
  const tag = String(apLeft);
  const fs = Math.max(8, Math.round(px * 0.26));
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3; ctx.strokeStyle = '#000';
  ctx.strokeText(tag, x0 + px - 3, y0 + px - 2);
  ctx.fillStyle = '#ffb199';
  ctx.fillText(tag, x0 + px - 3, y0 + px - 2);
  ctx.restore();
}

/* A sentry turret: a mount and a gun on it, pointed where it is facing
   (eighths of a turn, 0 north). Awake, it glows orange with a red eye;
   switched off, it is grey and the barrel droops to nothing. */
function drawTurret(ctx, x0, y0, px, facing, state) {
  const cx = x0 + px / 2, cy = y0 + px / 2;
  const live = state === 'active';
  ctx.save();
  ctx.fillStyle = 'rgba(25,28,32,0.95)';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const r = px * 0.44;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = live ? 'rgba(230,126,34,0.95)' : 'rgba(130,130,130,0.8)';
  ctx.lineWidth = Math.max(1.5, px * 0.05);
  ctx.stroke();
  ctx.translate(cx, cy);
  ctx.rotate((facing * Math.PI) / 4);
  ctx.fillStyle = live ? 'rgb(120,126,132)' : 'rgb(80,82,85)';
  const bw = px * 0.09;
  ctx.fillRect(-bw * 1.4, -px * 0.46, bw, px * (live ? 0.34 : 0.22));
  ctx.fillRect(bw * 0.4, -px * 0.46, bw, px * (live ? 0.34 : 0.22));
  ctx.beginPath(); ctx.arc(0, 0, px * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = live ? 'rgb(96,100,106)' : 'rgb(64,66,68)'; ctx.fill();
  ctx.strokeStyle = 'rgba(10,10,10,0.9)'; ctx.lineWidth = 1; ctx.stroke();
  if (live) {
    ctx.fillStyle = 'rgba(255,59,48,0.95)';
    ctx.beginPath(); ctx.arc(0, -px * 0.08, px * 0.055, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* A shrine: a gold halo and the double-headed eagle reduced to three strokes.
   The holy ground round it is drawn separately, as a faint gold wash. */
function drawShrine(ctx, x0, y0, px) {
  const cx = x0 + px / 2, cy = y0 + px / 2;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, px * 0.48);
  g.addColorStop(0, 'rgba(255,230,140,0.75)');
  g.addColorStop(1, 'rgba(241,196,15,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, px, px);
  ctx.strokeStyle = 'rgba(241,196,15,0.95)';
  ctx.lineWidth = Math.max(1.5, px * 0.06);
  ctx.beginPath(); ctx.arc(cx, cy, px * 0.36, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,190,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - px * 0.22); ctx.lineTo(cx, cy + px * 0.22);
  ctx.moveTo(cx, cy - px * 0.05);
  ctx.quadraticCurveTo(cx - px * 0.18, cy - px * 0.2, cx - px * 0.26, cy - px * 0.02);
  ctx.moveTo(cx, cy - px * 0.05);
  ctx.quadraticCurveTo(cx + px * 0.18, cy - px * 0.2, cx + px * 0.26, cy - px * 0.02);
  ctx.stroke();
  ctx.restore();
}

/* One end of a crawlway: the ground's own grating where it has one, slats in a
   frame where not. */
function drawVent(ctx, x0, y0, px, tok) {
  if (tok) { drawToken(ctx, tok, x0, y0, px); }
  else {
    ctx.fillStyle = 'rgba(20,22,26,0.95)';
    ctx.fillRect(x0 + px * 0.15, y0 + px * 0.15, px * 0.7, px * 0.7);
    ctx.strokeStyle = 'rgba(150,160,165,0.9)';
    ctx.lineWidth = Math.max(1, px * 0.05);
    for (let i = 1; i <= 4; i++) {
      const y = y0 + px * (0.15 + i * 0.14);
      ctx.beginPath(); ctx.moveTo(x0 + px * 0.2, y); ctx.lineTo(x0 + px * 0.8, y); ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(149,165,166,0.95)';
  ctx.lineWidth = Math.max(1.5, px * 0.05);
  ctx.strokeRect(x0 + px * 0.12, y0 + px * 0.12, px * 0.76, px * 0.76);
}

/* The light a square was painted with, over everything standing in it. Only
   painted squares are drawn: the deck's own light is a number for the dice,
   and darkening a whole projected deck would hide the table's own map. */
function drawLight(ctx, x0, y0, px, id) {
  if (id === 'dark') { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0, y0, px, px); return; }
  if (id === 'dim') { ctx.fillStyle = 'rgba(8,12,22,0.38)'; ctx.fillRect(x0, y0, px, px); return; }
  if (id === 'smoke') {
    ctx.fillStyle = 'rgba(110,112,116,0.32)'; ctx.fillRect(x0, y0, px, px);
    return;
  }
  if (id === 'rain') {
    ctx.fillStyle = 'rgba(40,60,90,0.25)'; ctx.fillRect(x0, y0, px, px);
    ctx.strokeStyle = 'rgba(170,200,230,0.35)'; ctx.lineWidth = 1;
    for (const f of [0.2, 0.5, 0.8]) {
      ctx.beginPath(); ctx.moveTo(x0 + px * f, y0 + px * 0.1); ctx.lineTo(x0 + px * (f - 0.12), y0 + px * 0.9); ctx.stroke();
    }
    return;
  }
  // Lit: a square with its lumens working in a darker deck.
  ctx.fillStyle = 'rgba(255,226,150,0.12)'; ctx.fillRect(x0, y0, px, px);
}

/* Air on its way out of the ship: a chevron per square pointing along the
   pull, brighter close to the hole. */
function drawDrag(ctx, x0, y0, px, dx, dy, d, reach) {
  const cx = x0 + px / 2, cy = y0 + px / 2;
  const a = Math.atan2(dy, dx);
  const s = px * 0.22;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.strokeStyle = `rgba(150,200,255,${0.25 + 0.6 * (1 - (d - 1) / reach)})`;
  ctx.lineWidth = Math.max(1.5, px * 0.06);
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, -s); ctx.lineTo(s * 0.5, 0); ctx.lineTo(-s * 0.6, s);
  ctx.stroke();
  ctx.restore();
}

/* Draws one prop picture into its square, turned a quarter at a time where
   that prop has no front (see spriteTurn). The turn is about the square's own
   centre, so a rotated crate stays in its square rather than wandering into
   the next one. */
function drawToken(ctx, tok, x0, y0, px) {
  if (!tok.turn) { ctx.drawImage(tok.img, x0, y0, px, px); return; }
  ctx.save();
  ctx.translate(x0 + px / 2, y0 + px / 2);
  ctx.rotate((tok.turn * Math.PI) / 2);
  ctx.drawImage(tok.img, -px / 2, -px / 2, px, px);
  ctx.restore();
}

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
/* THE WARP'S COLOURS, which do not hold still.

   Warp-work is drawn in colours that shift — purple through magenta to a
   sick green and round the spectrum — so a psychic power or a rift reads at a
   glance as nothing a weapon makes. `t` is the clock in milliseconds and `k`
   offsets one band from the next, so a gradient's stops ripple outward rather
   than changing all at once. A full turn of the wheel takes about three
   seconds. Pyromancy is fire and is drawn as fire. */
function warpRgb(t, k = 0) {
  const h = ((t * 0.12 + k * 55) % 360 + 360) % 360;
  const sat = 0.88, light = 0.62;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = light - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `${Math.round((r + mm) * 255)},${Math.round((g + mm) * 255)},${Math.round((b + mm) * 255)}`;
}

/* A warp rift on one square: a dark wound with the colours turning round it
   and a slow swirl through the middle. */
function drawWarpRift(ctx, x0, y0, px, t) {
  const cx = x0 + px / 2, cy = y0 + px / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, px * 0.62);
  g.addColorStop(0, 'rgba(8,0,18,0.9)');
  g.addColorStop(0.35, `rgba(${warpRgb(t, 0)},0.75)`);
  g.addColorStop(0.7, `rgba(${warpRgb(t, 1)},0.45)`);
  g.addColorStop(1, `rgba(${warpRgb(t, 2)},0)`);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, px, px); ctx.clip();
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, px, px);
  ctx.lineWidth = Math.max(1, px * 0.05);
  for (let i = 0; i < 3; i++) {
    const a = t * 0.002 + i * (Math.PI * 2 / 3);
    ctx.strokeStyle = `rgba(${warpRgb(t, i + 3)},0.85)`;
    ctx.beginPath();
    ctx.arc(cx, cy, px * (0.18 + i * 0.1), a, a + Math.PI * 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

// Flame by default; `warp` for a psychic cone, which is a scream through the
// warp and should not be mistaken across the table for a flamer.
const CONE_FLAME = ['255,241,180', '255,170,40', '231,76,60', '255,170,60', '255,220,130'];
function drawCone(ctx, ox, oy, aimRad, reachPx, halfRad, warp = false) {
  if (reachPx <= 0) return;
  const now = warp ? performance.now() : 0;
  const c = warp ? [0, 1, 2, 3, 4].map((k) => warpRgb(now, k)) : CONE_FLAME;
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, reachPx);
  g.addColorStop(0, `rgba(${c[0]},0.75)`);
  g.addColorStop(0.35, `rgba(${c[1]},0.55)`);
  g.addColorStop(0.8, `rgba(${c[2]},0.25)`);
  g.addColorStop(1, `rgba(${c[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.arc(ox, oy, reachPx, aimRad - halfRad, aimRad + halfRad);
  ctx.closePath();
  ctx.fill();

  // Thin edges down both sides and an arc across the mouth: the gradient
  // fades out before the weapon's range does, so without these the template
  // appears to stop short of where it actually reaches.
  ctx.strokeStyle = `rgba(${c[3]},0.75)`;
  ctx.lineWidth = 1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(aimRad + s * halfRad) * reachPx,
      oy + Math.sin(aimRad + s * halfRad) * reachPx);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${c[4]},0.9)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ox, oy, reachPx, aimRad - halfRad, aimRad + halfRad);
  ctx.stroke();
}

// The shot itself: a glowing beam with a head, so a measured line reads as a
// line of fire and not as a stray guide.
// `weight` scales the beam: a heavy weapon throws a fatter bolt than a
// marksman's rifle, and the two should not look the same across a table.
function drawBeam(ctx, x1, y1, x2, y2, rgb, weight = 1) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${rgb},0.22)`;
  ctx.lineWidth = 11 * weight;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},0.5)`;
  ctx.lineWidth = 5 * weight;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.5 * Math.max(0.6, weight);
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

/* A shotgun does not put a hole in one square: it opens out. A short wedge
   that widens to the target, so the GM can see who else is in the way. */
function drawSpread(ctx, x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const wide = Math.max(6, len * 0.22);
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, 'rgba(255,214,140,0.75)');
  g.addColorStop(1, 'rgba(255,170,60,0.08)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 + Math.cos(a + Math.PI / 2) * wide, y2 + Math.sin(a + Math.PI / 2) * wide);
  ctx.lineTo(x2 + Math.cos(a - Math.PI / 2) * wide, y2 + Math.sin(a - Math.PI / 2) * wide);
  ctx.closePath();
  ctx.fill();
}

/* Automatic fire: a handful of tracers that do not all go to the same place,
   because that is the whole difference between a burst and a shot. */
function drawBurst(ctx, x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const n = ctx.canvas ? 3 : 3;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 4;
    const ex = x2 + Math.cos(a + Math.PI / 2) * off * 1.6;
    const ey = y2 + Math.sin(a + Math.PI / 2) * off * 1.6;
    drawBeam(ctx, x1 + Math.cos(a + Math.PI / 2) * off * 0.25,
      y1 + Math.sin(a + Math.PI / 2) * off * 0.25, ex, ey, '168,130,255', 0.7);
  }
}

/* A thrown weapon arcs. Drawn as a curve rather than a line so nobody reads
   a grenade as something that needs a clear lane at head height. */
function drawLob(ctx, x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const lift = Math.max(8, Math.hypot(x2 - x1, y2 - y1) * 0.22);
  const cx = mx + Math.cos(a - Math.PI / 2) * lift;
  const cy = my + Math.sin(a - Math.PI / 2) * lift;
  ctx.strokeStyle = 'rgba(168,130,255,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* A shot: a beam from the firer to what they are shooting at. A clear lane
   is one beam end to end; a blocked one stops dead at whatever stopped it
   and continues as a thin dashed line, so the picture agrees with the label
   instead of drawing confidently through a sealed bulkhead. */
function drawShot(ctx, px, from, to, blocked, style = {}) {
  const x1 = from.x * px + px / 2, y1 = from.y * px + px / 2;
  const x2 = to.x * px + px / 2, y2 = to.y * px + px / 2;
  if (!blocked) {
    /* EACH WEAPON SHOOTS LIKE ITSELF. One beam for everything said a
       shotgun, an autocannon and a thrown grenade all put the same neat line
       across the deck, which is the one thing none of them does. */
    if (style.scatter) { drawSpread(ctx, x1, y1, x2, y2); return; }
    if (style.burst) { drawBurst(ctx, x1, y1, x2, y2); return; }
    if (style.thrown) { drawLob(ctx, x1, y1, x2, y2); return; }
    drawBeam(ctx, x1, y1, x2, y2, style.rgb || (style.heavy ? '255,170,80' : '168,130,255'),
      style.heavy ? 2 : style.accurate ? 0.6 : 1);
    if (style.accurate) {
      // A marksman's weapon puts a mark on what it is pointed at.
      ctx.strokeStyle = 'rgba(200,180,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x2, y2, px * 0.3, 0, Math.PI * 2); ctx.stroke();
    }
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
  decks = [], onSaveDeck = null, onLoadDeck = null, onDeleteDeck = null, onNeedTexture = null,
  library = null,
  /* A second copy of the TOOLS, with no map of its own. While the only map is
     on the projector the GM has nothing on their own screen to click, and
     bringing the map back to click it would put it in front of the table. So
     the dashboard may show this: the toolbars, the tool's own options and its
     dropdowns, driving the same state the projected map is drawing. */
  controlsOnly = false,
  /* { tab, setTab, mode, setMode } when the owner keeps the selection, so a
     control panel and the map it drives agree on what is in hand. */
  shared = null,
  /* TRIGGER ZONES (triggers.js). The sounds and handouts a trigger may set
     off, as { id, name }, for its pickers; what to do when triggers go off
     (play the sound, put up the handout, tell the GM); and what went off
     last, held by the owner so every copy of the map shows the same note. */
  cues = [], handouts = [], onTriggers = null, sprung = null, onDismissSprung = null
}) {
  const m = useMemo(() => readMap(map), [map]);
  const theme = resolveTheme(m.theme, customThemes);

  // A deck with the fog on is one being played, so it opens on the Play tab with
  // the tool that runs a crawl in hand; a deck being drawn opens on Build.
  /* WHICH TAB AND WHICH TOOL, shared when there are two copies of this.

     The GM may have the map on the projector and its controls on their own
     screen (controlsOnly, below). Those are two mounts of this component, and
     with a tool selection each the control panel would be a dead thing:
     picking Cover there would change nothing the projected map does. So the
     owner may hold the selection and hand it down to both, and both go on
     calling `mode` and `setMode` exactly as they did. */
  const [tabOwn, setTabOwn] = useState(m.fog ? 'play' : 'build');
  const [modeOwn, setModeOwn] = useState(m.fog ? 'fog' : 'stamp');
  const tab = shared ? shared.tab : tabOwn;
  const setTab = shared ? shared.setTab : setTabOwn;
  const mode = shared ? shared.mode : modeOwn;
  const setMode = shared ? shared.setMode : setModeOwn;
  const tabRef = useRef(tab);
  const modeRef = useRef(mode);
  tabRef.current = tab;
  modeRef.current = mode;
  // What the flag interrupted, so one click on a room gives it straight back.
  const beforeStartRef = useRef(null);
  /* Picking a tool. The flag is the one that TOGGLES: pressing it again puts
     back what was in hand rather than leaving the GM holding a tool that eats
     their next click on the map. Every other tool is simply taken up. */
  const pickTool = (id) => {
    if (id !== 'start') { beforeStartRef.current = null; setMode(id); return; }
    if (mode === 'start') {
      setMode(beforeStartRef.current || 'fog');
      beforeStartRef.current = null;
      return;
    }
    beforeStartRef.current = mode;
    setMode('start');
  };
  // The tool last used on each tab, so going back to one finds it as it was.
  const lastToolRef = useRef({ build: 'stamp', play: 'fog' });
  const [tileId, setTileId] = useState('corridor_1x5');
  const [rotation, setRotation] = useState(0);
  const [markerType, setMarkerType] = useState('objective');
  const [brush, setBrush] = useState(1);
  // How big a cloud the right-click menu lays: smoke is an area, and one square
  // of it is no smoke at all. Apart from the brush so changing one is not
  // changing the other.
  const [cloud, setCloud] = useState(3);
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
  const [deckMsg, setDeckMsg] = useState('');
  const [doorKind, setDoorKind] = useState('bulkhead');
  const [coverType, setCoverType] = useState('crates');
  /* Which way the next barrier lies: 0 across the square, 1 standing up it.
     Only a low barrier has a direction worth choosing — crates, machinery and
     a pillar fill their square and are already turned by position so a run of
     them does not look stamped — so the control only appears for that one,
     but the number is stored for any cover, because turning the whole deck
     has to turn whatever is on it. */
  const [coverTurn, setCoverTurn] = useState(0);
  const [hazardType, setHazardType] = useState('fire');
  // The Light tool: which light, and whether a click lights the room or the
  // brush paints squares. A Play tool, so shared with the control panel the
  // way the weapon is: picked there, it is what a click on the map lays.
  const [lightTypeOwn, setLightTypeOwn] = useState('dark');
  const [lightScopeOwn, setLightScopeOwn] = useState('room');
  const lightType = shared && shared.lightType ? shared.lightType : lightTypeOwn;
  const setLightType = shared && shared.setLightType ? shared.setLightType : setLightTypeOwn;
  const lightScope = shared && shared.lightScope ? shared.lightScope : lightScopeOwn;
  const setLightScope = shared && shared.setLightScope ? shared.setLightScope : setLightScopeOwn;
  // Which way the next sentry turret is set facing, in eighths of a turn.
  const [turretFacing, setTurretFacing] = useState(0);
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
  // Its own flag, not genBusy: the props take their own trip to the model and
  // the floor's buttons should not all grey out while they are coming.
  const [propsBusy, setPropsBusy] = useState(false);

  /* ---- asking before something destructive, INSIDE the map ----

     window.confirm looked like the simple answer and was the wrong one, in
     two ways that both end with the GM pressing a button and nothing
     happening:

     1. THIS COMPONENT RUNS IN THE DASHBOARD'S JS CONTEXT even when it is
        painted into the popped-out map window, because it gets there through
        a React portal (see MapWindow.jsx). So bare `window` is the DASHBOARD's
        window, and `window.confirm` opened a dialog on a window sitting
        BEHIND the map — invisible, unclickable, and holding the map's own
        code hostage until something was clicked. "Clear the deck does
        nothing" was this.
     2. Even addressed to the right window it is wrong for the one screen that
        matters most. The map is run full screen on a projector, and a browser
        chrome dialog over a projected deck is either suppressed or is a grey
        system box in front of the table.

     So the map asks in its own panel, rendered inside its own DOM — which is
     whichever window the map is in — and the handlers await the answer. */
  const [ask, setAsk] = useState(null);
  // The resolve lives in a ref rather than in the state: putting it in state
  // means settling it from inside a state updater, and an updater that has a
  // side effect is run twice by StrictMode.
  const askRef = useRef(null);
  const confirmInMap = (opts) => new Promise((resolve) => {
    // A second question while one is up would strand the first handler
    // waiting for an answer that can never come. Decline it instead.
    if (askRef.current) { resolve(false); return; }
    askRef.current = resolve;
    setAsk(opts);
  });
  const closeAsk = (yes) => {
    const settle = askRef.current;
    askRef.current = null;
    setAsk(null);
    if (settle) settle(yes);
  };
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
  // The terrain the ground brush lays down. Defaults to the deck's own,
  // which is the "lift it off again" option.
  const [paintGround, setPaintGround] = useState(m.theme);

  // The Pan tool. While it is on a plain drag moves the view, the way holding
  // Space does for as long as Space is down.
  const [panOn, setPanOn] = useState(false);
  const panOnRef = useRef(false);
  panOnRef.current = panOn;
  // Panels that used to be rows of controls on the bar, folded away until they
  // are wanted: saving and loading decks, and the grid and its scale.
  const [libOpen, setLibOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  // The right-click menu: where it was opened, and which group is unfolded.
  const [menu, setMenu] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const menuRef = useRef(null);
  const [menuAt, setMenuAt] = useState({ x: 0, y: 0 });
  // Procedural terrain, in the Ground panel. `terrainPick` is the grounds the
  // GM has ticked; until they tick any it is the deck's own plus every saved one.
  const [terrainPrompt, setTerrainPrompt] = useState('');
  const [terrainPick, setTerrainPick] = useState(null);
  const [terrainSeed, setTerrainSeed] = useState('');
  const [terrainSize, setTerrainSize] = useState('auto');
  const [terrainScope, setTerrainScope] = useState('deck');
  const [terrainNote, setTerrainNote] = useState('');
  // Which half of the Ground panel is showing: making a ground (generated or
  // uploaded) or laying terrain from the grounds there are.
  const [groundTab, setGroundTab] = useState('make');
  // Every ground there is — built in, generated, uploaded; once saved they are
  // all the same kind of thing — described by the words they answer to.
  const allGrounds = useMemo(() => [...MAP_THEMES, ...customThemes].map((t) => ({
    id: t.id, name: t.name, subtitle: t.subtitle, desc: t.desc, prompt: t.prompt,
    custom: Boolean(t.custom), fallback: t.fallback
  })), [customThemes]);
  const terrainRead = useMemo(() => readTerrainPrompt(terrainPrompt, allGrounds), [terrainPrompt, allGrounds]);
  // How Expand grows a deck: from what is painted (the default), or by
  // repeating the deck, or repeating it flipped at the seams.
  const [growHow, setGrowHow] = useState('grow');
  // Generate a deck builds around what is painted, rather than over it.
  const [buildAround, setBuildAround] = useState(true);

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

  const [weaponKeyOwn, setWeaponKeyOwn] = useState('lasgun');
  const [origin, setOrigin] = useState(null);
  const [aim, setAim] = useState(null);
  const [showLosOwn, setShowLosOwn] = useState(true);
  const [showRingsOwn, setShowRingsOwn] = useState(true);
  /* The whole cone, in degrees, not the half-angle. The control said "Cone °"
     and was handed straight to coneCells as the HALF angle, so a GM asking
     for 30 — a flamer's template in Rogue Trader — got sixty, and the wider
     they set it the further it ran from what the number said. 30 here draws
     exactly what the old default of 15 drew; nothing moves until someone
     types a number, and now the number means what it says. */
  const [coneAngleOwn, setConeAngleOwn] = useState(30);
  /* The overlay is aimed from whichever copy of this the GM is looking at, so
     its settings are shared the way the tool is. Left per-copy, the control
     panel said Heavy Flamer while the map drew a lasgun — two menus for one
     overlay, disagreeing. */
  const weaponKey = shared ? shared.weaponKey : weaponKeyOwn;
  const setWeaponKey = shared ? shared.setWeaponKey : setWeaponKeyOwn;
  const showLos = shared ? shared.showLos : showLosOwn;
  const setShowLos = shared ? shared.setShowLos : setShowLosOwn;
  const showRings = shared ? shared.showRings : showRingsOwn;
  const setShowRings = shared ? shared.setShowRings : setShowRingsOwn;
  const coneAngle = shared ? shared.coneAngle : coneAngleOwn;
  const setConeAngle = shared ? shared.setConeAngle : setConeAngleOwn;
  // The psyker's rating and how they channel it: what "× PR" means for the
  // power in hand. Shared like the weapon, for the same reason.
  const [psyRatingOwn, setPsyRatingOwn] = useState(3);
  const [psyModeOwn, setPsyModeOwn] = useState('unfettered');
  const psyRating = shared && shared.psyRating != null ? shared.psyRating : psyRatingOwn;
  const setPsyRating = shared && shared.setPsyRating ? shared.setPsyRating : setPsyRatingOwn;
  const psyMode = shared && shared.psyMode ? shared.psyMode : psyModeOwn;
  const setPsyMode = shared && shared.setPsyMode ? shared.setPsyMode : setPsyModeOwn;

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

  /* ---- the picture floor ----
     The file is in this browser's own store, not on the deck (see
     localfiles.js), so it is looked up by the id the deck carries and decoded
     here: an image, or a video playing muted on a loop. Each window drawing
     the map decodes its own, which is what lets the projector's copy go on
     playing while the dashboard is behind it. A controls-only copy draws
     nothing and only asks whether the file is here. See useBackdropMedia. */
  const [picOpen, setPicOpen] = useState(false);
  const [picNote, setPicNote] = useState('');
  const [picHow, setPicHow] = useState('grid');
  const [picPps, setPicPps] = useState('100');
  const [picTv, setPicTv] = useState('40');
  const [picAcross, setPicAcross] = useState('30');
  const picFileRef = useRef(null);
  const importFileRef = useRef(null);
  const relinkFileRef = useRef(null);
  // A stroke of the thin-wall tool puts walls up or takes them down for its
  // whole length, decided by the first edge it touched.
  const wallStrokeRef = useRef(null);
  // The trigger zone being painted, and whether this stroke adds or lifts.
  const [trigId, setTrigId] = useState(null);
  const trigStrokeRef = useRef(null);
  // The named area in hand (areas.js), and which way a stroke is painting.
  const [areaId, setAreaId] = useState(null);
  const areaStrokeRef = useRef(null);
  const [areaNote, setAreaNote] = useState('');
  /* THE SKETCH (sketchplan.js): the pen in hand, the stroke being drawn (in
     squares, fractions and all, kept in a ref and redrawn by a tick so a
     stroke does not write the deck at every point), and what was said about
     the last Generate. */
  const [sketchPen, setSketchPen] = useState('room');
  const [sketchMark, setSketchMark] = useState('start');
  const [sketchHazard, setSketchHazard] = useState('fire');
  const [sketchFixture, setSketchFixture] = useState('cogitator');
  const [sketchPassage, setSketchPassage] = useState('door');
  const [sketchMsg, setSketchMsg] = useState('');
  const strokeRef = useRef(null);
  const [strokeTick, setStrokeTick] = useState(0);
  /* A picture under the sketch (genai.js's pictureForSketch): to trace, or to
     have read into strokes. Only while the tool is in hand, and never kept
     with the deck; what is read from it is. `place` is where it lies on the
     grid: its corner in squares, and how many squares across. */
  const [sketchPic, setSketchPic] = useState(null);
  const [sketchPicSource, setSketchPicSource] = useState('sketch');
  const [sketchPicNote, setSketchPicNote] = useState('');
  const [sketchPicBusy, setSketchPicBusy] = useState(false);
  const sketchFileRef = useRef(null);
  const sketch = m.sketch || { strokes: [], plan: null, layout: 'decks', fill: false, seed: '', notes: [], example: null };
  // What the strokes say, read again whenever they change (sketchread.js).
  const sketchPlan = useMemo(() => sketch.plan || planFromStrokes(sketch.strokes, { cols: m.cols, rows: m.rows }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.sketch, m.cols, m.rows]);
  const sprungRef = useRef(null);
  useEffect(() => {
    if (sprung && sprung.length && sprungRef.current) reveal(sprungRef.current, { from: 0.98 });
  }, [sprung, win]);
  const [hoverEdge, setHoverEdge] = useState(null);
  const reducedMotion = useMemo(() => {
    const w = win || window;
    return Boolean(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, [win]);

  const media = useBackdropMedia(m.backdrop, { win, probeOnly: controlsOnly, reducedMotion });
  const mediaRef = media.mediaRef;
  const mediaState = media.state;
  const mediaTick = media.tick;

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

  /* Every change to a deck being PLAYED is asked whether it set a trigger
     off: the party placed in a zone, or a zone come into view. What went off
     is applied in the same write, so one undo takes back the step and the
     trap together. */
  const patch = (next) => {
    if (!onChange) return;
    if (!gestureRef.current) { remember(m); gestureRef.current = true; }
    let merged = { ...m, ...next };
    if (tabRef.current === 'play' && merged.fog && anyArmed(m.triggers)) {
      const s = springTriggers(m, merged);
      if (s.fired.length) {
        merged = s.map;
        if (onTriggers) onTriggers(s.fired);
      }
    }
    onChange(merged);
  };
  // Sprung by the GM's hand, armed or not, as its own undoable step.
  const fireByHand = (t) => {
    if (!onChange || !t) return;
    const s = springNow(m, t);
    remember(m);
    gestureRef.current = false;
    onChange(s.map);
    if (onTriggers) onTriggers(s.fired);
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
    const end = () => { gestureRef.current = false; wallStrokeRef.current = null; trigStrokeRef.current = null; picDragRef.current = null; };
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
      const msg = mapRef.current.backdrop
        ? 'A deck laid over a picture lies the way the picture does, and does not turn.'
        : 'The painted map is too big to turn inside this grid. Make the grid bigger first.';
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
  /* A saved deck's map may still be on its way (a signed-in library holds an
     index, not maps), so onLoadDeck is async and says what it did: 'replaced'
     the live map, 'opened' the deck for designing instead, or false if it
     could not be had. Only a replaced map has an earlier state to undo to —
     and it is remembered AFTER the load, from what was on screen before, so a
     deck that never arrived leaves nothing in the history. */
  const loadChosenDeck = () => loadThisDeck(decks.find((d) => d.id === loadId));
  /* An area's own deck (areas.js): in play, the party goes into it, the deck
     put on the table the way Play from the library does; while building, it
     is opened to draw on. In the map's own window, which has no library, it
     is loaded the way Load deck does. */
  const openAreaDeck = async (a) => {
    const list = decks.length ? decks : (library && library.decks) || [];
    const deck = a && list.find((d) => d.id === a.deck);
    if (!deck) { setAreaNote('That deck is no longer in the library.'); return; }
    const name = deck.name || 'Untitled deck';
    if (library) {
      if (tab === 'play') {
        if (!await confirmInMap({
          title: `Go into \u201c${name}\u201d?`,
          body: 'It takes the place of the map in play, laid out for play as a deck always is: fog on, '
            + 'what lies in wait hidden. Undo (Cmd/Ctrl+Z) brings this map back.',
          yes: 'Go into it'
        })) return;
        const ok = await playFromLibrary(deck.id);
        setAreaNote(ok ? `In play: \u201c${name}\u201d.` : `Could not open \u201c${name}\u201d.`);
      } else {
        const ok = await library.open(deck.id);
        setAreaNote(ok ? `Opened \u201c${name}\u201d to draw on.` : `Could not open \u201c${name}\u201d.`);
      }
      return;
    }
    const ok = await loadThisDeck(deck);
    if (ok) setAreaNote(`Loaded \u201c${name}\u201d.`);
  };
  const loadThisDeck = async (deck) => {
    if (!deck || !onLoadDeck) return false;
    const name = deck.name || 'Untitled deck';
    const occupied = Object.keys(mapRef.current.floor || {}).length > 0;
    if (occupied && !await confirmInMap({
      title: 'Replace what is on screen?',
      body: `\u201c${name}\u201d takes the place of the map on screen. Undo (Cmd/Ctrl+Z)`
        + ' brings the current one back.',
      yes: 'Load it'
    })) return;
    const before = mapRef.current;
    setDeckNote(`Opening \u201c${name}\u201d\u2026`);
    const result = await onLoadDeck(deck);
    if (!result) { setDeckNote(`Could not open \u201c${name}\u201d.`); return false; }
    if (result === 'replaced') remember(before);
    gestureRef.current = false;
    originRef.current = null; measureRef.current = null;
    setOrigin(null); setAim(null); setMeasureFrom(null); setMeasureTo(null);
    setLoadId('');
    setDeckNote(`Loaded \u201c${name}\u201d.`);
    return true;
  };
  /* Playing a deck from the library panel. The panel has already asked whether
     the table's map may be replaced; this is the part that makes it undoable,
     the same as Load deck always was: what was on screen is remembered once the
     new one has arrived, and only if there WAS a live map to go back to. */
  const playFromLibrary = async (id) => {
    const before = mapRef.current;
    const wasLive = library.view === 'live';
    const ok = await library.play(id);
    if (ok && wasLive) remember(before);
    gestureRef.current = false;
    originRef.current = null; measureRef.current = null;
    setOrigin(null); setAim(null); setMeasureFrom(null); setMeasureTo(null);
    return ok;
  };
  /* Throwing a deck out of the library. The map's undo cannot reach this \u2014
     it is the stored library, not the map on screen \u2014 so it asks first, and
     says so. */
  const deleteChosenDeck = async () => {
    const deck = decks.find((d) => d.id === loadId);
    if (!deck || !onDeleteDeck) return;
    const name = deck.name || 'Untitled deck';
    if (!await confirmInMap({
      title: `Delete \u201c${name}\u201d?`,
      body: 'It goes out of the library for good, and undo on the map will not bring it'
        + ' back. Whatever is on screen stays.',
      yes: 'Delete it'
    })) return;
    // The library may be on a server, and the answer is not instant or certain.
    if ((await onDeleteDeck(deck)) === false) { setDeckNote(`Could not delete \u201c${name}\u201d.`); return; }
    setLoadId('');
    // Save over a deck that no longer exists and the save would quietly make
    // a new one under the old name instead.
    if (deckTarget === deck.id) setDeckTarget('');
    setDeckNote(`Deleted \u201c${name}\u201d.`);
  };
  const rHeldRef = useRef(false);     // R is down: a click turns the map
  const rUsedRef = useRef(false);     // ...and a tap of R turns the stamp instead
  const spaceRef = useRef(false);     // Space is down: a drag pans

  // Which window this is. The projector's copy hides what the table must
  // not see; the GM's own tab shows it.
  const projecting = Boolean(win);

  // Never shrunk to fit a canvas: the deck is drawn a window at a time (see
  // `paint`), so a square is always the size the projector was calibrated to.
  const px = m.pxPerSquare;

  const weapon = useMemo(() => {
    if (/^(psy|nav):/.test(weaponKey)) return powerOverlay(weaponKey, psyRating, psyMode);
    const entry = GEAR[weaponKey];
    // The kind and the name as well as the numbers: a sword's stat line does
    // not say it is a sword, and the overlay has to know that to draw it as
    // one rather than as a lane across the deck.
    return entry
      ? weaponOverlay(entry.stats, { kind: entry.kind, name: weaponKey, perSquare: m.metresPerSquare })
      : null;
  }, [weaponKey, m.metresPerSquare, psyRating, psyMode]);

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

  /* ---- the prop tokens ----

     A door, a crate stack, a pillar, a fire: sixteen pictures per ground, cut
     off that ground's sprite sheet by tools/slice-sprites.mjs and served from
     public/maps/tokens. Before these the props were drawn as grey boxes and
     coloured stripes, which read perfectly well and looked like a programmer's
     placeholder, because that is what they were.

     Fetched square by square rather than by the setful: tokensNeeded() reads
     the deck and asks for the pictures the deck actually uses, so a corridor
     with two bulkheads pulls down two files instead of half a megabyte of
     crates and foliage nobody placed.

     Keyed "<ground>/<role>", so the same crate on an ice square and a deck
     square are two different pictures and both are cached. A value of null
     means "asked for and not there" — which is not an error and not retried:
     those squares keep the flat drawing, and a ground the GM generated has no
     sheet until they generate one. */
  const tokensRef = useRef(new Map());
  const [tokenTick, setTokenTick] = useState(0);
  const tokenNeeds = useMemo(() => tokensNeeded(m), [m]);
  const tokenKey = tokenNeeds.join('|');

  /* Where a ground's prop pictures come from. Only the nine that ship have a
     folder of cut tokens; a ground the GM generated carries its own sixteen
     as one sheet on the ground record, cut up below, and one they merely
     uploaded a floor for has none at all. */
  const tokenSrc = (ground, role) => {
    const custom = resolveTheme(ground, customThemes);
    if (custom && custom.custom) return null;
    const dir = tokenDirFor(ground);
    return dir ? `/maps/tokens/${dir}/${role}.webp` : null;
  };

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(tokenNeeds);
    // Props the GM has since erased are dropped, the way the floors are: a
    // session spent trying cover types should not end holding every token in
    // the set decoded.
    for (const k of [...tokensRef.current.keys()]) {
      if (!wanted.has(k)) tokensRef.current.delete(k);
    }
    for (const k of wanted) {
      if (tokensRef.current.has(k)) continue;
      const cut = k.indexOf('/');
      const src = tokenSrc(k.slice(0, cut), k.slice(cut + 1));
      if (!src) { tokensRef.current.set(k, null); continue; }
      // Claimed before the load finishes, or a redraw mid-flight queues the
      // same file again — and a deck of forty crates would ask forty times.
      tokensRef.current.set(k, null);
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        tokensRef.current.set(k, img);
        setTokenTick((t) => t + 1);
      };
      img.onerror = () => { if (!cancelled) setTokenTick((t) => t + 1); };
      img.src = src;
    }
    setTokenTick((t) => t + 1);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenKey, customThemes]);

  /* ---- a generated ground's own props ----

     A ground the GM generated carries its sixteen props as ONE sheet rather
     than sixteen files, because that is how it was generated and how it is
     stored: one blob in one Redis record, which is also why the props keep
     the light and the wear of the floor they belong to.

     So it is cut up here, once per ground, and held as sixteen canvases. */
  const sheetsRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    for (const id of groundIds) {
      const t = resolveTheme(id, customThemes);
      /* THE INDEX CARRIES A BOOLEAN, NOT A SHEET. The grounds list is fetched
         without its pictures — that is the whole point of the split — so a
         ground arrives saying `sprites: true` and only gets the data URL once
         its floor is fetched. Slicing whatever is in the field meant trying to
         decode `true`, and the cache claim below then blocked the real sheet
         from ever being sliced when it turned up a moment later. */
      const sheet = t && t.custom && typeof t.sprites === 'string' ? t.sprites : null;
      const have = sheetsRef.current.get(id);
      // Cached against the sheet it was cut from, so the arrival of the real
      // one replaces a claim made against nothing.
      if (!sheet || (have && have.src === sheet)) continue;
      sheetsRef.current.set(id, { src: sheet, cells: null });
      imageFrom(sheet)
        .then((img) => {
          if (cancelled) return;
          sheetsRef.current.set(id, { src: sheet, cells: sliceSheet(img) });
          setTokenTick((n) => n + 1);
        })
        // A sheet that will not decode leaves that ground's props flat, which
        // is what a ground with no sheet at all does.
        .catch(() => { if (!cancelled) setTokenTick((n) => n + 1); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundKey, customThemes]);

  /* The picture for one square's prop, or null to draw it the old way.

     `turn` is what the SQUARE says, and it is ADDED to what the role says.
     The two mean different things and both are wanted: spriteTurn breaks up a
     run of identical props that have no front, while the square's own turn is
     a barrier the GM deliberately stood on end. Adding them means a barrier
     (which spriteTurn leaves alone, having a front) obeys the GM exactly,
     while crates (which carry no turn of their own) keep being scattered. */
  const tokenAt = (kind, id, state, cx, cy, turn = 0) => {
    const at = { x: cx, y: cy };
    const role = spriteRole(kind, id, state, at);
    if (!role) return null;
    const ground = (m.ground && m.ground[cellKey(cx, cy)]) || m.theme;
    const sheet = sheetsRef.current.get(ground);
    const img = (sheet && sheet.cells && sheet.cells[role])
      || tokensRef.current.get(ground + '/' + role);
    return img ? { img, turn: (spriteTurn(role, at) + turn) % 4 } : null;
  };

  const measurement = useMemo(() => {
    if (!measureFrom || !measureTo) return null;
    return reachBetween({
      from: measureFrom, to: measureTo, map: m,
      weaponRangeM: weapon ? weapon.range : null
    });
  }, [measureFrom, measureTo, m, weapon]);

  /* What the target's square adds to the shot beyond its range: the cover it
     is behind, as it stands after the hits it has taken, and the light it is
     standing in, with what that costs to hit (SITUATION_MODIFIERS). */
  const targetConditions = (shot, to) => {
    if (!shot || !to) return '';
    const bits = [];
    if (shot.cover) {
      bits.push(`behind ${shot.cover.name.toLowerCase()}, ${shot.cover.ap} AP`
        + (shot.cover.wear ? ` (${shot.cover.wear} shot off)` : ''));
    }
    const lit = lightAt(m, to);
    if (lit.situationIds.length) {
      const mod = lit.situationIds.reduce((n, id) => n + ((SITUATION_MODIFIERS.find((x) => x.id === id) || {}).mod || 0), 0);
      bits.push(`${lit.name.toLowerCase()} there, ${mod} to hit`);
    }
    return bits.length ? ' \u00b7 ' + bits.join(' \u00b7 ') : '';
  };

  /* ---- input ---- */

  // Which square a pointer event is over. Worked out from where the stage is
  // scrolled to, because the canvas is only a window onto the deck.
  const posFromEvent = (e) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const sx = e.clientX - rect.left - stage.clientLeft + stage.scrollLeft;
    const sy = e.clientY - rect.top - stage.clientTop + stage.scrollTop;
    const x = Math.floor(sx / zoom / px);
    const y = Math.floor(sy / zoom / px);
    if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) return null;
    return { x, y };
  };

  /* The thin-wall tool works on the EDGE under the pointer, not the square,
     so it needs the position in fractions of a square. */
  const fracFromEvent = (e) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - stage.clientLeft + stage.scrollLeft) / zoom / px,
      y: (e.clientY - rect.top - stage.clientTop + stage.scrollTop) / zoom / px
    };
  };
  const edgeFromEvent = (e) => {
    const f = fracFromEvent(e);
    if (!f) return null;
    const edge = edgeNear(f.x, f.y);
    if (!edge) return null;
    // Both its sides on the grid: the deck's outer edge is a wall already.
    const inside = edge.bit === WALL_EAST
      ? edge.x + 1 < m.cols && edge.y < m.rows
      : edge.y + 1 < m.rows && edge.x < m.cols;
    return inside ? edge : null;
  };
  /* PLACING THE PICTURE by hand, while its panel is open: a drag on it moves
     it, a drag on its corner sizes it with its shape kept. Worked out from
     where the drag began, so a fast pointer does not drift; Shift lands the
     corner on whole squares. */
  const PIC_HANDLE = 0.45;    // squares from the corner that count as the corner
  // The corner that sizes it, kept on the grid: a picture hanging off the
  // deck's edge is sized from the last corner of it that can be reached.
  const picCorner = (b) => ({ x: Math.min(b.x + b.w, m.cols), y: Math.min(b.y + b.h, m.rows) });
  const picHit = (f) => {
    const b = m.backdrop;
    if (!picOpen || !b || !f) return null;
    const c = picCorner(b);
    if (Math.abs(f.x - c.x) <= PIC_HANDLE && Math.abs(f.y - c.y) <= PIC_HANDLE) return 'size';
    return f.x >= b.x && f.x <= b.x + b.w && f.y >= b.y && f.y <= b.y + b.h ? 'move' : null;
  };
  const picDragRef = useRef(null);
  const [picHover, setPicHover] = useState(null);
  const hundredth = (v) => Math.round(v * 100) / 100;
  const dragPicture = (e) => {
    const d = picDragRef.current;
    const f = fracFromEvent(e);
    if (!d || !f) return;
    const dx = f.x - d.from.x, dy = f.y - d.from.y;
    const s0 = d.start;
    if (d.kind === 'move') {
      let x = s0.x + dx, y = s0.y + dy;
      if (e.shiftKey) { x = Math.round(x); y = Math.round(y); }
      patch({ backdrop: readBackdrop({ ...m.backdrop, x: hundredth(x), y: hundredth(y) }) });
      return;
    }
    const ratio = s0.h / s0.w;
    // Whichever way the corner moved further, kept to the picture's shape.
    let w = Math.abs(dx) >= Math.abs(dy / ratio) ? s0.w + dx : s0.w + dy / ratio;
    if (e.shiftKey) w = Math.round(s0.x + w) - s0.x;
    w = Math.max(0.5, w);
    patch({ backdrop: readBackdrop({ ...m.backdrop, w: hundredth(w), h: hundredth(w * ratio) }) });
  };
  /* Followed on the whole window, not the canvas: a picture sized from the
     deck's edge is dragged straight off the canvas, and a drag that stopped
     there would stop the moment it began. Read through a ref so each move
     works on the deck as it is now. */
  const dragPictureRef = useRef(null);
  dragPictureRef.current = dragPicture;
  /* Drawing a stroke: started on the press, a point added each time the
     pointer has moved an eighth of a square, finished on the release (here or
     anywhere in the window), made lighter and kept on the deck's sketch. The
     eraser takes off the stroke nearest the click. */
  const setSketch = (next) => patch({ sketch: next && (next.strokes.length || next.plan || next.example) ? next : null });
  const startStroke = (f) => {
    if (!f) return;
    if (sketchPen === 'erase') {
      let best = null, d = 0.7;
      for (const st of sketch.strokes) { const g = distanceToStroke(st, f.x, f.y); if (g < d) { d = g; best = st; } }
      if (best) setSketch({ ...sketch, strokes: sketch.strokes.filter((st) => st.id !== best.id) });
      return;
    }
    strokeRef.current = { pen: sketchPen, pts: [[f.x, f.y]] };
    setStrokeTick((t) => t + 1);
  };
  const moveStroke = (f) => {
    const cur = strokeRef.current;
    if (!cur || !f) return;
    const [lx, ly] = cur.pts[cur.pts.length - 1];
    if (Math.hypot(f.x - lx, f.y - ly) < 0.12) return;
    cur.pts.push([f.x, f.y]);
    setStrokeTick((t) => t + 1);
  };
  const finishStroke = () => {
    const cur = strokeRef.current;
    if (!cur) return;
    strokeRef.current = null;
    setStrokeTick((t) => t + 1);
    const pts = simplify(cur.pts, 0.12);
    if (cur.pen === 'room' && pts.length < 3) { setSketchMsg('A room is a loop: draw round it.'); return; }
    if (cur.pen === 'passage' && pts.length < 2) { setSketchMsg('A passage is a line from one room to another.'); return; }
    const st = readStroke({
      id: newStrokeId(), pen: cur.pen, pts,
      mark: cur.pen === 'mark' ? sketchMark : null,
      detail: cur.pen === 'mark' ? (sketchMark === 'hazard' ? sketchHazard : sketchMark === 'fixture' ? sketchFixture : null)
        : cur.pen === 'passage' && sketchPassage === 'open' ? 'open' : null
    });
    if (st) { setSketchMsg(''); setSketch({ ...sketch, strokes: [...sketch.strokes, st] }); }
  };
  const finishStrokeRef = useRef(finishStroke);
  finishStrokeRef.current = finishStroke;
  useEffect(() => {
    if (mode !== 'sketch') return undefined;
    const w = win || window;
    const up = () => finishStrokeRef.current();
    w.addEventListener('mouseup', up);
    return () => w.removeEventListener('mouseup', up);
  }, [mode, win]);

  const startPictureDrag = (kind, from) => {
    picDragRef.current = { kind, from, start: { ...m.backdrop } };
    const w = win || window;
    const move = (ev) => { if (picDragRef.current) dragPictureRef.current(ev); };
    const up = () => {
      picDragRef.current = null;
      w.removeEventListener('mousemove', move);
      w.removeEventListener('mouseup', up);
    };
    w.addEventListener('mousemove', move);
    w.addEventListener('mouseup', up);
  };
  // The arrow keys, read by the key handler bound once below.
  const nudgeRef = useRef(null);
  nudgeRef.current = (key, big) => {
    if (!picOpen || !m.backdrop) return false;
    const step = big ? 1 : 0.05;
    const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key];
    if (!d) return false;
    patch({ backdrop: readBackdrop({ ...m.backdrop, x: hundredth(m.backdrop.x + d[0]), y: hundredth(m.backdrop.y + d[1]) }) });
    return true;
  };
  const strokeWall = (e, starting) => {
    const edge = edgeFromEvent(e);
    if (!edge) return;
    if (starting) wallStrokeRef.current = !hasWall(m.walls, edge);
    const on = wallStrokeRef.current;
    if (on === null || hasWall(m.walls, edge) === on) return;
    patch({ walls: setWall(m.walls, edge, on) });
  };

  /* A door clicked in play. `to` sets a state directly (the menu); without it
     the door steps on. Opening one is a noise, the same as under the door tool:
     anything hidden within earshot comes up on the scope as a ping. */
  const clickDoor = (pos, to = null) => {
    const p = playDoor(m, pos, to);
    if (!p || !p.doors) return;
    const opened = p.doors[cellKey(pos.x, pos.y)].state === 'open';
    patch(opened ? { ...p, contacts: noisePing(m, pos, 'door') } : p);
  };

  // The effect that opens the right-click menu is bound once, so it reads the
  // current square-finder through a ref rather than the one it was bound with.
  const cellAtRef = useRef(null);
  cellAtRef.current = posFromEvent;

  /* What a click takes off a square, as a patch, or null when it holds none of
     the environment the menu lays. The target token first, then fire and gas,
     then smoke; a square with several is cleared one click at a time, top
     down. A cloud goes the way it came: the size it was laid at, around the
     clicked square, and only the smoke of that density. */
  const liftEnvironmentAt = (pos) => {
    const k = cellKey(pos.x, pos.y);
    // A terminal is part of the deck, not something laid mid-session: it is
    // worked by a click, never lifted by one.
    if (m.markers[k] && !FIXTURES.has(m.markers[k].type)) { const markers = { ...m.markers }; delete markers[k]; return { markers }; }
    if (m.hazards[k]) { const hazards = { ...m.hazards }; delete hazards[k]; return { hazards }; }
    const density = m.obscuring[k];
    if (density) {
      const obscuring = { ...m.obscuring };
      for (const c of brushCells(pos, cloud, m)) {
        const ck = cellKey(c.x, c.y);
        if (obscuring[ck] === density) delete obscuring[ck];
      }
      return { obscuring };
    }
    return null;
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
      const light = { ...m.light };
      for (const c of cells) {
        const ck = cellKey(c.x, c.y);
        delete doors[ck]; delete markers[ck]; delete cover[ck]; delete hazards[ck];
        delete ground[ck]; delete obscuring[ck]; delete light[ck];
      }
      patch({
        floor: paintCells(m.floor, cells, false), doors, markers, cover, hazards, ground, obscuring, light,
        walls: clearWallsAround(m.walls, cells)
      });
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
    /* LIGHT. A click lights the room it lands in, which is what "the lumens
       are out in there" means at the table; on the brush instead, a drag
       paints squares. The deck's own light is the absence of paint, as the
       deck's own ground is, so choosing it is how paint comes off. */
    if (mode === 'light') {
      const byRoom = lightScope === 'room';
      if (byRoom && dragging) return;
      const cells = byRoom ? regionAt(m, pos) : onDeck(m, brushCells(pos, brush, m));
      if (!cells.length) return;
      const light = { ...m.light };
      const lifting = lightType === m.lighting || (!dragging && light[k] === lightType);
      for (const c of cells) {
        const ck = cellKey(c.x, c.y);
        if (lifting) delete light[ck]; else light[ck] = lightType;
      }
      patch({ light });
      return;
    }
    // Revealing is a drag as well as a click: a corridor is swept, not
    // clicked square by square.
    if (mode === 'fog' && dragging) {
      patch({ explored: { ...m.explored, [k]: true } });
      return;
    }
    // The rest place one thing per click, but for the zones and areas, which
    // are painted by dragging (they handle a drag themselves, below). This
    // guard stood above them, so a trigger zone was never painted by a drag.
    if (dragging && mode !== 'trigger' && mode !== 'area') return;

    if (mode === 'stamp') {
      patch({ floor: paintCells(m.floor, stampCells(tileId, pos, rotation, m), true) });
      return;
    }
    // The room the party arrives in. Click inside it; click inside it again
    // to take the choice back.
    if (mode === 'start') {
      /* ONE CLICK AND IT IS DONE. The flag is a thing you set once, not a
         tool you hold: left in hand it eats every click on the Play tab, so
         the GM reaching for a door or a room to reveal moves the party's
         starting point instead. Setting it hands the tool straight back to
         whatever was in hand before — the fog, usually — and the fog that
         the flag lifts comes back with it. */
      patch({ start: setStartRoom(m, pos) });
      setMode(beforeStartRef.current || 'fog');
      beforeStartRef.current = null;
      return;
    }
    if (mode === 'door') {
      // With the fog on this is a game, not a drawing: a click on a door of
      // the kind in hand is what it is under the fog tool, a door that opens
      // and lights what is beyond.
      if (m.fog && m.doors[k] && m.doors[k].kind === doorKind) { clickDoor(pos); return; }
      const doors = { ...m.doors };
      const here = doors[k];
      // Clicking a door of the same kind cycles its state; clicking with a
      // different kind selected swaps it, which is how a bulkhead becomes a
      // hatch without erasing it first.
      doors[k] = (here && here.kind === doorKind)
        ? { ...here, state: nextDoorState(here.state) }
        : { kind: doorKind, state: 'closed' };
      // Opening a door is a noise: anything hidden within earshot comes up
      // on the scope as a ping, without saying what it is.
      const opened = doors[k].state === 'open' && !(here && here.state === 'open');
      patch(opened ? { doors, contacts: noisePing(m, pos, 'door') } : { doors });
      return;
    }
    if (mode === 'cover') {
      const cover = { ...m.cover };
      const have = readCover(cover[k]);
      const want = writeCover(coverType, coverTurn);
      /* Clicking the same cover the same way round lifts it, as it always
         did. Clicking it the OTHER way round turns it instead — the GM
         walking a railing along a corridor and reaching the corner wants to
         turn that square, not clear it and lay it again. */
      if (have && have.id === coverType && have.turn === coverTurn) delete cover[k];
      else cover[k] = want;
      patch({ cover });
      return;
    }
    if (mode === 'hazard') {
      const hazards = { ...m.hazards };
      // Whatever is burning there goes out with a click, not only the kind in
      // hand: a fire set from the right-click menu should not need the Fire
      // chip chosen to be put out.
      if (hazards[k]) delete hazards[k]; else hazards[k] = hazardType;
      patch({ hazards });
      return;
    }
    if (mode === 'noise') {
      patch({ contacts: noisePing(m, pos, noiseKind) });
      return;
    }
    /* TRIGGER ZONES. Played, a click on a zone springs it by hand. Built, a
       click or a drag paints squares into the zone in hand, or lifts them
       when the stroke began on one of its squares; with none in hand, the
       first square starts a new one. */
    if (mode === 'trigger') {
      if (tab === 'play') {
        if (!dragging) fireByHand(triggerAt(m.triggers, k));
        return;
      }
      const cur = trigId ? triggerById(m.triggers, trigId) : null;
      if (!cur) {
        if (dragging) return;
        const t = newTrigger(m.triggers.length + 1);
        setTrigId(t.id);
        trigStrokeRef.current = true;
        patch({ triggers: paintTrigger([...m.triggers, t], t.id, [k], true) });
        return;
      }
      if (!dragging) trigStrokeRef.current = !cur.cells.includes(k);
      const on = trigStrokeRef.current;
      if (on === null || cur.cells.includes(k) === on) return;
      patch({ triggers: paintTrigger(m.triggers, cur.id, [k], on) });
      return;
    }
    /* NAMED AREAS. Built, a click or a drag paints squares into the area in
       hand (or lifts them, when the stroke began on one of its squares), and
       with none in hand the first square starts a new one. Played, a click
       picks the area there, for its note and its way in. */
    if (mode === 'area') {
      if (tab === 'play') {
        if (!dragging) { const a = areaAt(m.areas, k); setAreaId(a ? a.id : null); setAreaNote(''); }
        return;
      }
      const cur = areaId ? areaById(m.areas, areaId) : null;
      if (!cur) {
        if (dragging) return;
        const a = newArea(m.areas);
        setAreaId(a.id);
        areaStrokeRef.current = true;
        patch({ areas: paintArea([...m.areas, a], a.id, [k], true) });
        return;
      }
      if (!dragging) areaStrokeRef.current = !cur.cells.includes(k);
      const on = areaStrokeRef.current;
      if (on === null || cur.cells.includes(k) === on) return;
      patch({ areas: paintArea(m.areas, cur.id, [k], on) });
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
      // A door is clicked as a door: it steps to its next state, and opening
      // it lights what it joins.
      if (m.doors[k]) { clickDoor(pos); return; }
      // A terminal is clicked as a terminal: in, or locked out again. The
      // Tech-Use test is the table's; this records how it went. A burnt-out
      // one does nothing — that is what burnt out means.
      const term = terminalAt(m, pos);
      if (term) {
        if (term.state !== 'dead') patch(setTerminal(m, pos, term.state === 'open' ? 'locked' : 'open'));
        return;
      }
      // A turret is switched off and on, as a terminal is got into.
      const tur = turretAt(m, pos);
      if (tur) { patch(setTurret(m, pos, { state: tur.state === 'active' ? 'off' : 'active' })); return; }
      // A vent with a far end is gone through: the party comes out there.
      if (m.markers[k] && m.markers[k].type === 'vent') {
        const crawl = crawlThrough(m, pos);
        if (crawl) { patch(crawl); return; }
      }
      // A square holding a target, a fire or a cloud of smoke is clicked OUT:
      // those are laid mid-session from the menu and are lifted the same way,
      // without going back to the menu. Click the room beside it to reveal.
      const lifted = liftEnvironmentAt(pos);
      if (lifted) { patch(lifted); return; }
      // A PLACE at a time, which is the reveal the table expects: click
      // inside a room and the room is there.
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
      // Clicking a marker lifts it, whatever kind it is, so one tool both
      // places and removes. A target set from the right-click menu goes with a
      // click, without choosing its kind first.
      if (markers[k]) delete markers[k];
      // A vent joins the end that is waiting for one; see placeVent.
      else if (markerType === 'vent') { patch(placeVent(m, pos, markerTypeById('vent').name)); return; }
      else if (markerType === 'turret') {
        markers[k] = { type: 'turret', label: markerTypeById('turret').name, facing: turretFacing };
      } else markers[k] = { type: markerType, label: markerTypeById(markerType).name };
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
      // A question is up and waiting: it owns the keyboard. Otherwise H would
      // hide the toolbars behind the dialog and R would turn the deck the GM
      // is being asked about.
      if (askRef.current) return;
      const k = e.key.toLowerCase();
      // Undo and redo, the way every editor does them.
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        else if (k === 'y') { e.preventDefault(); redo(); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;    // leave browser shortcuts alone
      // The arrows nudge a picture being placed, and do nothing else here.
      if (k.startsWith('arrow') && nudgeRef.current && nudgeRef.current(k, e.shiftKey)) { e.preventDefault(); return; }
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
    const armed = () => spaceRef.current || panOnRef.current;
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
      if (!drag) cursor(armed() ? 'ready' : null);
    };
    const onDown = (e) => {
      if (!armed() || e.button !== 0) return;
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
      cursor(armed() ? 'ready' : null);
    };
    const onBlur = () => { spaceRef.current = false; drag = null; cursor(armed() ? 'ready' : null); };
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

  // The Pan tool's cursor, set from here because the effect above only knows
  // about the moment a drag starts and ends.
  useEffect(() => {
    const el = stageRef.current;
    if (el && !el.classList.contains('panning')) el.classList.toggle('pan-ready', panOn);
  }, [panOn]);

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
    const aimed = kind === 'beam' || kind === 'melee' || kind === 'bolt'
      || (kind === 'gaze' && !weapon.gazeAll);
    const shot = target && aimed
      ? reachBetween({ from: origin, to: target, map: m, weaponRangeM: weapon.range })
      : null;
    /* A TEMPLATE: THE SQUARES IT CATCHES, AND WHAT ITS ART IS CLIPPED TO.

       The caught squares are what the GM rules on, trimmed to what the
       template can physically reach — fire does not cross a sealed bulkhead
       and a grenade does not blast through a wall.

       The smooth art over them is clipped to those squares PLUS the ring of
       deck squares around them that the template could also reach. The ring
       is the point. A cone's straight edge and a shield's round one run
       through squares whose centres fall just outside the template, so
       clipped to the caught squares alone the art could only ever be squares:
       a flamer drew a staircase, a field drew a plus sign, and the tip of the
       cone was cut off short of the firer where no square's centre was inside
       it. With the ring, the art keeps its own edge wherever it has room, and
       is cut only where a wall or a shut door actually stands — on the line
       of the wall, which is where fire stops.

       An earlier fix clipped to the whole deck when nothing was in the way
       and to the caught squares when anything was. One blocked square
       anywhere — a doorway behind the far wall — dropped the whole cone back
       to a staircase, which is why the same cone broke at some angles in a
       room and not at others. There is no switch now. */
    const template = (centre, cells) => {
      const caught = unobstructed(m, centre, onDeck(m, cells));
      const seen = new Set(caught.map((c) => cellKey(c.x, c.y)));
      const ring = [];
      for (const c of caught) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const k = cellKey(c.x + dx, c.y + dy);
            if (!seen.has(k)) { seen.add(k); ring.push({ x: c.x + dx, y: c.y + dy }); }
          }
        }
      }
      return { cells: caught, clip: caught.concat(unobstructed(m, centre, onDeck(m, ring))) };
    };
    const blastT = weapon && weapon.blastM && target
      ? template(target, areaCells(m, target, weapon.blastM)) : null;
    // A flamer's cone is as wide as the GM sets it; a psychic cone is as wide
    // as its rule says.
    const coneT = weapon && (weapon.isFlame || kind === 'cone') && target
      ? template(origin, coneCells(m, origin, target, weapon.range, (weapon.coneDeg || coneAngle) / 2)) : null;
    // A power that bursts around the psyker: the same template as a grenade,
    // centred on the one who made it.
    const burstT = kind === 'burst' ? template(origin, areaCells(m, origin, weapon.burstM)) : null;
    /* A power laid along a line — Wall of Fire. From the psyker toward the
       aim, as long as the power says, and stopped by the first wall: fire
       conjured along a line does not run through a bulkhead either. */
    let line = [];
    if (kind === 'line' && target && !(target.x === origin.x && target.y === origin.y)) {
      const per = m.metresPerSquare || 1;
      const len = weapon.lineM / per;
      const d = Math.hypot(target.x - origin.x, target.y - origin.y);
      const ux = (target.x - origin.x) / d, uy = (target.y - origin.y) / d;
      const seen = new Set();
      const ray = [];
      for (let t = 0.5; t <= len + 1e-9; t += 0.5) {
        const c = { x: Math.round(origin.x + ux * t), y: Math.round(origin.y + uy * t) };
        const k = cellKey(c.x, c.y);
        if (!seen.has(k)) { seen.add(k); ray.push(c); }
      }
      line = onDeck(m, unobstructed(m, origin, ray));
    }
    const auraT = kind === 'field'
      ? template(origin, areaCells(m, origin, weapon.auraM)) : null;

    return {
      kind,
      shot,
      target,
      // Range bands are a shooting thing: a sword has none, and neither does a
      // power, which is in range or is not.
      rings: showRings && weapon && !weapon.isField && !weapon.isMelee && !weapon.power
        ? rangeRings(weapon.range, m) : [],
      blast: blastT ? blastT.cells : [],
      blastClip: blastT ? blastT.clip : [],
      cone: coneT ? coneT.cells : [],
      coneClip: coneT ? coneT.clip : [],
      aura: auraT ? auraT.cells : [],
      auraClip: auraT ? auraT.clip : [],
      // The squares a melee weapon threatens from where its bearer stands.
      // Trimmed like any other template: you cannot stab through a bulkhead.
      threat: kind === 'melee'
        ? onDeck(m, unobstructed(m, origin, areaCells(m, origin, weapon.reachM))) : [],
      // Whether the thing being pointed at is actually within reach of it: a
      // sword's reach, or a power's range.
      reaches: !shot ? null
        : kind === 'melee' ? meleeReaches(weapon, shot.metres)
          : kind === 'bolt' ? shot.metres <= weapon.reachM + 1e-9 : null,
      burst: burstT ? burstT.cells : [],
      burstClip: burstT ? burstT.clip : [],
      line
    };
  }, [mode, origin, aim, hover, weapon, showRings, coneAngle, m]);

  // Who and what the template's squares hold (caughtBy), for the readout and
  // a ring on the map. Only the templates that hit: a blast, a cone, a burst,
  // a wall of fire.
  const caught = useMemo(() => (overlay
    ? caughtBy(m, [...overlay.blast, ...overlay.cone, ...overlay.burst, ...overlay.line]) : null),
  [overlay, m]);
  const caughtLine = caught ? caughtText(caught, { gm: !projecting }) : '';

  /* ---- rendering ----

     THE CANVAS IS A WINDOW ONTO THE DECK, NOT THE DECK. It used to be one
     bitmap of cols x px by rows x px, which is why a deck could not be bigger
     than a browser's largest image and why a big one had its squares shrunk to
     fit (decalibrating the projector, the one thing that must not move). Now
     the bitmap is only as big as the stage, sticks to the top-left of what is
     scrolled into view, and is redrawn for whatever part of the deck is under
     it, at the current zoom. Squares stay the size they were calibrated to,
     and a deck can be as big as its data.

     Only the squares in view are visited, found by looking them up rather than
     by walking every record, so a redraw costs what is on screen. Zoomed so
     far out that a square is a few pixels, the details are not worth drawing
     and an overview (one pixel per square, kept until the map changes) is
     scaled up instead. */

  /* What the fog shows, worked out when the deck changes, not on every redraw.

     TWO THINGS SEE THROUGH IT.

     The Build tab, because you cannot draw a deck you cannot see: feeling
     about in the dark to place a crate was the reason the fog had to be
     switched off to build, which threw away what the party had found.

     And the starting-room tool, wherever it is used, because choosing the
     room the party arrives in means looking at the rooms. Picking one through
     the fog is picking a black square and hoping.

     IN EVERY WINDOW, including the popped-out one. An earlier version refused
     this to the popped-out copy, on the reasoning that it is the projector
     and the table must not see what the GM does. That was wrong about how the
     window is used: it is the GM's own workspace, the one they build in, so
     refusing it there refused it exactly where it was wanted. The table is
     not shown a deck by accident either way — Build and the flag are things
     a GM does, and neither is reached by playing.

     Nothing is stored and nothing is revealed: this is the drawing mask, not
     the explored record, so stepping back to Play shows exactly the fog the
     party had left. */
  const seeAll = tab === 'build' || mode === 'start';
  const shown = useMemo(
    () => (m.fog && !seeAll ? visibleExplored(m) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.fog, m.explored, m.doors, m.floor, m.viewpoint, seeAll]);

  // The room the starting-room tool would choose, drawn tinted while it is in
  // hand. Worked out only then: it walks the room.
  const startCells = useMemo(
    () => (mode === 'start' && m.start ? regionAt(m, m.start) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, m.start, m.floor, m.doors]);

  /* ---- the tabs ----
     Going to a tab puts in hand the tool last used there, or the tab's first.
     Remembering the tool on the way out is what makes Build -> Play -> Build
     land back on the tile that was about to be stamped. */
  const chooseTab = (t) => {
    const from = tabRef.current;
    lastToolRef.current[from] = modeRef.current;
    const ids = t === 'play' ? PLAY_TOOLS : BUILD_TOOLS;
    const want = lastToolRef.current[t];
    /* Play opens on the fog, never on the flag. Arriving with the flag in
       hand would mean the first click meant for a door moved the party's
       starting point instead; the flag is reached by pressing it. */
    const next = ids.includes(want) ? want : ids[0];
    if (t === from && modeRef.current === next) return;
    tabRef.current = t;
    modeRef.current = next;
    setTab(t);
    setMode(next);
    // Ground, Deck and Grid are panels for drawing a deck; they do not follow
    // the GM to a table with the fog on.
    if (t === 'play') { setGenOpen(false); setDeckOpen(false); setGridOpen(false); setPicOpen(false); }
  };
  // Picking a tool by any road (the toolbar, the menu) is remembered for its tab.
  // The flag is a one-shot and is never what a tab is "left on": remembering
  // it would hand it back on the next visit, which is the interference all
  // of this is trying to avoid.
  useEffect(() => { if (mode !== 'start') lastToolRef.current[tabRef.current] = mode; }, [mode]);
  // A different map is on screen: the tab that suits it. The live map has the
  // fog on and is played; a deck out of the library is built.
  useEffect(() => { chooseTab(m.fog ? 'play' : 'build'); }, [historyKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  // The fog going on over the map already here is the same thing: it is being
  // played now, and the first click on a door must not lay floor over it.
  useEffect(() => { if (m.fog) chooseTab('play'); }, [m.fog]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Dead ground for the sight overlay, asked of a square the first time it is
     drawn and remembered. Working out every square a weapon might see used to
     be done up front, on every move of the pointer. */
  const seeable = useMemo(() => {
    const gaze = weapon && weapon.overlayKind === 'gaze';
    if (mode !== 'overlay' || !origin || !(showLos || gaze)) return null;
    const per = m.metresPerSquare || 1;
    const reach = weapon && weapon.range ? (weapon.range * 3) / per : Infinity;
    const limit = Math.min(reach, LOS_MAX_SQUARES);
    const cache = new Map();
    return (x, y) => {
      const k = x + ',' + y;
      let v = cache.get(k);
      if (v === undefined) {
        v = Math.hypot(x - origin.x, y - origin.y) <= limit && !lineBlocked(m, origin, { x, y });
        cache.set(k, v);
      }
      return v;
    };
  }, [mode, origin, showLos, weapon, m]);

  const drawRef = useRef(() => {});

  /* THE WARP DOES NOT HOLD STILL. While a rift is on the deck or a psychic
     power is in hand, the map is redrawn about fifteen times a second so its
     colours keep turning. Nothing else animates, so a deck with no warp on it
     costs exactly what it did. The redraw calls the current draw directly
     rather than through React, which would re-render this whole component
     fifteen times a second to move a colour. Off for anyone whose system asks
     for reduced motion: the colours are still the warp's, just still. */
  const warpOnDeck = useMemo(() => Object.values(m.hazards).includes('warp'), [m.hazards]);

  /* What reaches past its own square, worked out when the deck changes rather
     than every frame: a turret's arc walks a line to every square in it, and
     the air's way out of a breach walks the deck. */
  const turretFans = useMemo(() => {
    const out = [];
    for (const [k, v] of Object.entries(m.markers)) {
      if (v.type === 'turret' && v.state === 'active') out.push(...turretCells(m, parseKey(k)));
    }
    return out;
  }, [m]);
  const holyGround = useMemo(() => [...sanctified(m)].map(parseKey), [m]);
  const dragField = useMemo(() => ventField(m), [m]);
  // The two ends of each crawlway, for the line drawn between them on Build.
  const ductLines = useMemo(() => {
    const ends = new Map();
    for (const [k, v] of Object.entries(m.markers)) {
      if (v.type !== 'vent' || !v.pair) continue;
      if (!ends.has(v.pair)) ends.set(v.pair, []);
      ends.get(v.pair).push(parseKey(k));
    }
    return [...ends.values()].filter((e) => e.length === 2);
  }, [m.markers]);
  const warpInHand = mode === 'overlay' && Boolean(origin) && Boolean(weapon)
    && weapon.power === 'psy' && !weapon.fire;
  /* AND THE DECK ITSELF, when it has something that moves (motion.js) or a
     video for a floor. Each at the rate it needs: a video near its own,
     rain and smoke at twenty frames, the warp at fifteen. */
  const moving = useMemo(() => !controlsOnly && deckMoves(m), [m, controlsOnly]);
  const videoUp = !controlsOnly && mediaState === 'ready' && Boolean(m.backdrop) && m.backdrop.kind === 'video';
  // On the GSAP ticker of the window the map is in (gsapcdn.js), or that
  // window's own frames when GSAP cannot be had.
  useEffect(() => {
    if (reducedMotion) return undefined;
    const warp = warpOnDeck || warpInHand;
    if (!warp && !moving && !videoUp) return undefined;
    const every = videoUp ? VIDEO_FRAME_MS : moving ? MOTION_FRAME_MS : 66;
    return runFrames(win || window, every, () => drawRef.current());
  }, [warpOnDeck, warpInHand, moving, videoUp, reducedMotion, win]);

  /* What moves on the deck, drawn over the squares in view (see motion.js).
     Rain falls wherever the deck is lit by rain and not painted otherwise;
     smoke and shadow swell and thin; a lit square in a darker deck flickers
     like a failing lumen; smoke and foliage drift; fire flickers, current
     arcs, gas swirls, radiation pulses, and the air runs to a breach. */
  const drawMotion = (ctx, v, t) => {
    const deckRain = m.lighting === 'rain';
    const thin = Math.max(1, px * 0.03);
    ctx.save();
    for (let x = v.c0; x <= v.c1; x++) {
      for (let y = v.r0; y <= v.r1; y++) {
        const k = x + ',' + y;
        if (!m.floor[k]) continue;
        const x0 = x * px, y0 = y * px;
        const painted = m.light[k] && m.light[k] !== m.lighting ? m.light[k] : null;
        if (painted ? painted === 'rain' : deckRain) {
          ctx.strokeStyle = 'rgba(190,215,240,0.42)';
          ctx.lineWidth = thin;
          ctx.beginPath();
          for (const r of rainStreaks(x, y, t, 2)) {
            ctx.moveTo(x0 + r.x0 * px, y0 + Math.max(0, r.y0) * px);
            ctx.lineTo(x0 + r.x1 * px, y0 + r.y1 * px);
          }
          ctx.stroke();
        }
        if (painted === 'smoke') {
          ctx.fillStyle = `rgba(130,132,138,${(0.05 + 0.14 * drift(x, y, t)).toFixed(3)})`;
          ctx.fillRect(x0, y0, px, px);
        } else if (painted === 'dim') {
          ctx.fillStyle = `rgba(10,14,24,${(0.04 + 0.1 * drift(x, y, t, 9)).toFixed(3)})`;
          ctx.fillRect(x0, y0, px, px);
        } else if (painted === 'clear') {
          ctx.fillStyle = `rgba(255,226,150,${(0.02 + 0.06 * flicker(x, y, t * 0.6)).toFixed(3)})`;
          ctx.fillRect(x0, y0, px, px);
        }
        if (m.obscuring[k]) {
          const d = drift(x, y, t, 7);
          ctx.fillStyle = `rgba(205,210,214,${(0.04 + 0.08 * d).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x0 + px * (0.25 + 0.5 * d), y0 + px * (0.35 + 0.3 * drift(x, y, t + 2, 9)), px * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        const hz = m.hazards[k];
        if (hz === 'fire') {
          const f = flicker(x, y, t);
          const g = ctx.createRadialGradient(x0 + px / 2, y0 + px * 0.6, px * 0.05, x0 + px / 2, y0 + px * 0.6, px * 0.7);
          g.addColorStop(0, `rgba(255,190,80,${(0.25 + 0.35 * f).toFixed(3)})`);
          g.addColorStop(1, 'rgba(255,90,20,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x0 - px * 0.2, y0 - px * 0.2, px * 1.4, px * 1.4);
        } else if (hz === 'electrical') {
          const arc = sparkArc(x, y, t);
          if (arc) {
            ctx.strokeStyle = 'rgba(215,195,255,0.95)';
            ctx.lineWidth = Math.max(1.5, px * 0.045);
            ctx.beginPath();
            arc.forEach((p2, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x0 + p2.x * px, y0 + p2.y * px));
            ctx.stroke();
          }
        } else if (hz === 'toxic') {
          const d = drift(x, y, t, 4);
          ctx.fillStyle = `rgba(95,224,106,${(0.06 + 0.12 * d).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x0 + px * (0.3 + 0.4 * drift(x, y, t + 1, 5)), y0 + px * (0.3 + 0.4 * d), px * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else if (hz === 'radiation') {
          const d = drift(x, y, t, 2);
          ctx.strokeStyle = `rgba(227,210,60,${(0.6 * (1 - d)).toFixed(3)})`;
          ctx.lineWidth = Math.max(1, px * 0.04);
          ctx.beginPath();
          ctx.arc(x0 + px / 2, y0 + px / 2, px * (0.12 + 0.36 * d), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    // The air on its way out: a streak riding each square's pull.
    for (const c of dragField) {
      if (c.x < v.c0 || c.x > v.c1 || c.y < v.r0 || c.y > v.r1) continue;
      const r = rush(t + c.x * 0.37 + c.y * 0.61);
      const cx = c.x * px + px / 2 + c.dx * (r - 0.5) * px * 0.8;
      const cy = c.y * px + px / 2 + c.dy * (r - 0.5) * px * 0.8;
      ctx.strokeStyle = `rgba(170,210,255,${(0.7 * (1 - r)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, px * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - c.dx * px * 0.15, cy - c.dy * px * 0.15);
      ctx.lineTo(cx, cy);
      ctx.stroke();
    }
    ctx.restore();
  };
  const overviewRef = useRef(null);
  const OVERVIEW_BELOW = 6;       // screen pixels per square under which only the overview is drawn

  // One pixel per square, for when the whole deck is on screen at once.
  // With a picture floor, the squares under it are left clear for the picture
  // to show through, and so is the void, which is drawn dark underneath.
  const buildOverview = (pic = null) => {
    const have = overviewRef.current;
    if (have && have.m === m && have.shown === shown && have.projecting === projecting && have.tick === textureTick
      && have.pic === Boolean(pic)) return have.canvas;
    const doc = (win || window).document;
    const c = have && have.canvas ? have.canvas : doc.createElement('canvas');
    c.width = m.cols; c.height = m.rows;
    const g = c.getContext('2d');
    g.clearRect(0, 0, m.cols, m.rows);
    const b = pic ? m.backdrop : null;
    const under = (x, y) => b && x + 0.5 > b.x && x + 0.5 < b.x + b.w && y + 0.5 > b.y && y + 0.5 < b.y + b.h;
    if (!pic) {
      g.fillStyle = '#05070a';
      g.fillRect(0, 0, m.cols, m.rows);
    }
    const tint = new Map();
    const colourOf = (id) => {
      if (!tint.has(id)) tint.set(id, (resolveTheme(id, customThemes) || theme).fallback);
      return tint.get(id);
    };
    for (const k of Object.keys(m.floor)) {
      const p = parseKey(k);
      if (!p || under(p.x, p.y)) continue;
      g.fillStyle = colourOf(m.ground[k] || m.theme);
      g.fillRect(p.x, p.y, 1, 1);
    }
    for (const [k, id] of Object.entries(m.hazards)) {
      const p = parseKey(k); const hz = hazardById(id);
      if (p && hz) { g.fillStyle = hz.colour; g.fillRect(p.x, p.y, 1, 1); }
    }
    for (const [k, id] of Object.entries(m.cover)) {
      const p = parseKey(k);
      if (p && coverAt(id)) { g.fillStyle = '#7d8991'; g.fillRect(p.x, p.y, 1, 1); }
    }
    for (const [k, id] of Object.entries(m.obscuring)) {
      const p = parseKey(k); const ob = obscuringById(id);
      if (p && ob) { g.globalAlpha = Math.min(0.85, ob.alpha + 0.3); g.fillStyle = ob.colour; g.fillRect(p.x, p.y, 1, 1); g.globalAlpha = 1; }
    }
    for (const [k, door] of Object.entries(m.doors)) {
      const p = parseKey(k);
      if (p) {
        g.fillStyle = door.state === 'open' ? '#2ecc71' : door.state === 'jammed' ? '#f39c12' : '#e74c3c';
        g.fillRect(p.x, p.y, 1, 1);
      }
    }
    for (const [k, mk] of Object.entries(m.markers)) {
      const p = parseKey(k);
      if (p) { g.fillStyle = markerTypeById(mk.type).colour; g.fillRect(p.x, p.y, 1, 1); }
    }
    if (shown) {
      g.fillStyle = projecting ? 'rgb(3,4,6)' : 'rgba(3,4,6,0.82)';
      for (let x = 0; x < m.cols; x++) {
        for (let y = 0; y < m.rows; y++) if (!shown[x + ',' + y]) g.fillRect(x, y, 1, 1);
      }
    }
    overviewRef.current = { m, shown, projecting, tick: textureTick, pic: Boolean(pic), canvas: c };
    return c;
  };

  /* Draws the deck into `ctx` as seen through `frame`: the part of the
     zoomed deck, in screen pixels, that the canvas shows. Everything below is
     in map pixels; the transform does the scrolling and the zoom. */
  const paint = (ctx, frame) => {
    const z = frame.zoom;
    const w = m.cols * px;
    const h = m.rows * px;
    // The visible part of the deck, in map pixels and in squares.
    const vx0 = frame.left / z, vy0 = frame.top / z;
    const vw = frame.width / z, vh = frame.height / z;
    const vx1 = vx0 + vw, vy1 = vy0 + vh;
    const c0 = Math.max(0, Math.floor(vx0 / px) - 1), c1 = Math.min(m.cols - 1, Math.ceil(vx1 / px));
    const r0 = Math.max(0, Math.floor(vy0 / px) - 1), r1 = Math.min(m.rows - 1, Math.ceil(vy1 / px));
    const overview = px * z < OVERVIEW_BELOW;
    // The squares in view that hold something in a layer.
    const each = (layer, fn) => {
      for (let x = c0; x <= c1; x++) {
        for (let y = r0; y <= r1; y++) {
          const v = layer[x + ',' + y];
          if (v) fn(x, y, v);
        }
      }
    };

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, frame.width, frame.height);
    ctx.setTransform(z, 0, 0, z, -frame.left, -frame.top);

    const fill = (cells, colour) => {
      ctx.fillStyle = colour;
      for (const c of cells) ctx.fillRect(c.x * px, c.y * px, px, px);
    };

    /* The picture floor, under everything: the deck's other layers are laid
       on it the way they are laid on the tiled ground. Only once its file is
       decoded — until then, and on a computer that does not have the file,
       the deck is drawn on its tiled ground as before. */
    const pic = m.backdrop && mediaRef.current && mediaRef.current.id === m.backdrop.id ? mediaRef.current : null;
    const bd = pic ? m.backdrop : null;
    const underPic = (x, y) => Boolean(bd) && x + 0.5 > bd.x && x + 0.5 < bd.x + bd.w && y + 0.5 > bd.y && y + 0.5 < bd.y + bd.h;
    if (pic) {
      try { ctx.drawImage(pic.el, bd.x * px, bd.y * px, bd.w * px, bd.h * px); } catch { /* not decoded yet */ }
    }

    if (overview) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buildOverview(pic), 0, 0, w, h);
    } else {
      // 1. The deck, textured, clipped to the painted cells so unbuilt grid
      //    stays void rather than becoming a rectangle of corridor.
      /* Grouped by the ground painted on each square, so a deck that runs
         from ice to deck plate is drawn in one pass per terrain rather than
         one per square. Unpainted squares fall to the deck's own ground. */
      const byGround = new Map();
      for (let x = c0; x <= c1; x++) {
        for (let y = r0; y <= r1; y++) {
          const k = x + ',' + y;
          if (!m.floor[k] || underPic(x, y)) continue;
          const id = m.ground[k] || m.theme;
          const list = byGround.get(id);
          if (list) list.push(x, y); else byGround.set(id, [x, y]);
        }
      }
      for (const [id, xy] of byGround) {
        // Each ground brings its OWN fallback and wash: the wash is tuned to
        // how bright that particular floor is, so sharing the deck's would
        // wash a pale ice shelf like dark deck plate.
        const t = resolveTheme(id, customThemes) || theme;
        const src = groundSrc(id);
        const img = src ? texturesRef.current.get(src) : null;
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < xy.length; i += 2) ctx.rect(xy[i] * px, xy[i + 1] * px, px, px);
        ctx.clip();
        ctx.fillStyle = img ? (ctx.createPattern(img, 'repeat') || t.fallback) : t.fallback;
        ctx.fillRect(c0 * px, r0 * px, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px);
        // The wash knocks a busy photographic deck back so tokens, the grid
        // and the templates read over it. A pale drawn deck has none of that
        // noise and a dark grid of its own, so washing it would only turn a
        // deliberately clean floor grey.
        ctx.fillStyle = `rgba(0,0,0,${t.wash})`;
        ctx.fillRect(c0 * px, r0 * px, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px);
        ctx.restore();
      }
    }

    // 2. Deployment zones, under everything else.
    if (showZones) {
      const zn = deploymentRows(m, 1);
      ctx.fillStyle = 'rgba(192,57,43,0.18)';
      ctx.fillRect(0, zn.hostile.y0 * px, w, (zn.hostile.y1 - zn.hostile.y0 + 1) * px);
      ctx.fillStyle = 'rgba(52,152,219,0.18)';
      ctx.fillRect(0, zn.crew.y0 * px, w, (zn.crew.y1 - zn.crew.y0 + 1) * px);
    }

    if (!overview) {
      // 3. Walls, derived from the floor every frame — never stored, so they
      //    cannot disagree with the deck they edge.
      const thick = Math.max(3, Math.floor(px * 0.16));
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      const line = (ax, ay, bx, by) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); };
      each(m.floor, (cx, cy) => {
        // A picture shows its own walls.
        if (bd && underPic(cx, cy)) return;
        const x0 = cx * px, y0 = cy * px;
        const mask = wallMask(m.floor, cx, cy);
        if (mask) {
          ctx.fillStyle = 'rgba(8,10,14,0.92)';
          if (mask & WALL_N) ctx.fillRect(x0, y0, px, thick);
          if (mask & WALL_S) ctx.fillRect(x0, y0 + px - thick, px, thick);
          if (mask & WALL_W) ctx.fillRect(x0, y0, thick, px);
          if (mask & WALL_E) ctx.fillRect(x0 + px - thick, y0, thick, px);
          if (mask & WALL_N) line(x0, y0 + thick, x0 + px, y0 + thick);
          if (mask & WALL_S) line(x0, y0 + px - thick, x0 + px, y0 + px - thick);
          if (mask & WALL_W) line(x0 + thick, y0, x0 + thick, y0 + px);
          if (mask & WALL_E) line(x0 + px - thick, y0, x0 + px - thick, y0 + px);
        }
        // Corner pillars, including the inner corner a four-sided mask misses.
        // Drawn as structure, not highlight: in the grid colour they lit every
        // corner and buried the deck under confetti.
        ctx.fillStyle = 'rgba(4,6,9,0.95)';
        const c = thick + 1;
        if (cornerPillar(m.floor, cx, cy, -1, -1)) ctx.fillRect(x0, y0, c, c);
        if (cornerPillar(m.floor, cx, cy, 1, -1)) ctx.fillRect(x0 + px - c, y0, c, c);
        if (cornerPillar(m.floor, cx, cy, -1, 1)) ctx.fillRect(x0, y0 + px - c, c, c);
        if (cornerPillar(m.floor, cx, cy, 1, 1)) ctx.fillRect(x0 + px - c, y0 + px - c, c, c);
      });

      // 3a. Thin walls, on the grid lines between two squares of deck. Over a
      //     picture the picture shows its own, so the table's screen leaves
      //     these out and the GM's own shows them as a bright line to build
      //     against; on the tiled ground they are drawn like any other wall.
      let anyThin = false;
      for (const _k in m.walls) { anyThin = true; break; }
      if (anyThin && (!bd || !projecting || tab === 'build')) {
        ctx.save();
        ctx.lineCap = 'square';
        const seg = (ax, ay, bx2, by2) => {
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2);
          if (bd) {
            ctx.strokeStyle = 'rgba(0,229,255,0.9)'; ctx.lineWidth = Math.max(2, px * 0.07); ctx.stroke();
          } else {
            ctx.strokeStyle = 'rgba(8,10,14,0.95)'; ctx.lineWidth = thick; ctx.stroke();
            ctx.strokeStyle = theme.accent; ctx.lineWidth = 1; ctx.stroke();
          }
        };
        for (let x = c0 - 1; x <= c1; x++) {
          for (let y = r0 - 1; y <= r1; y++) {
            const bits = m.walls[x + ',' + y];
            if (!bits) continue;
            if (bits & WALL_EAST) seg((x + 1) * px, y * px, (x + 1) * px, (y + 1) * px);
            if (bits & WALL_SOUTH) seg(x * px, (y + 1) * px, (x + 1) * px, (y + 1) * px);
          }
        }
        ctx.restore();
      }

      // 3b. Hazards, as a tinted square with a warning stripe. Under the
      //     cover and the markers, because something can stand in a fire.
      each(m.hazards, (cx, cy, id) => {
        const hz = hazardById(id);
        if (!hz) return;
        const x0 = cx * px, y0 = cy * px;
        if (hz.id === 'warp') { drawWarpRift(ctx, x0, y0, px, performance.now()); return; }
        /* With a picture for this hazard, the picture IS the warning and the
           stripes come off — a fire that looks like fire does not also need
           hatching. The coloured edge stays: it is what says which hazard
           this is from across the table, and smoke and gas are much the same
           shape of grey cloud. */
        const tok = tokenAt('hazard', id, null, cx, cy);
        if (tok) {
          drawToken(ctx, tok, x0, y0, px);
          ctx.strokeStyle = hz.colour;
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x0 + 1, y0 + 1, px - 2, px - 2);
          ctx.globalAlpha = 1;
          return;
        }
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
      });

      // 3b2. What reaches past its own square: holy ground, a turret's field
      //      of fire, and the air running to a breach. Over the deck, under
      //      the props, and under the fog like everything else on it.
      // Each with its edge drawn: a tint alone is lost on a rusty floor.
      const outline = (cells, colour, dash = []) => {
        const inSet = new Set(cells.map((c) => c.x + ',' + c.y));
        ctx.save();
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(1.5, px * 0.06);
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (const c of cells) {
          const x0 = c.x * px, y0 = c.y * px;
          if (!inSet.has(c.x + ',' + (c.y - 1))) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0); }
          if (!inSet.has(c.x + ',' + (c.y + 1))) { ctx.moveTo(x0, y0 + px); ctx.lineTo(x0 + px, y0 + px); }
          if (!inSet.has((c.x - 1) + ',' + c.y)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + px); }
          if (!inSet.has((c.x + 1) + ',' + c.y)) { ctx.moveTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 + px); }
        }
        ctx.stroke();
        ctx.restore();
      };
      if (holyGround.length) {
        fill(holyGround, 'rgba(241,196,15,0.12)');
        outline(holyGround, 'rgba(241,196,15,0.7)', [px * 0.15, px * 0.1]);
      }
      if (turretFans.length) {
        fill(turretFans, 'rgba(230,126,34,0.22)');
        outline(turretFans, 'rgba(255,140,40,0.85)');
      }
      for (const c of dragField) {
        if (c.x < c0 || c.x > c1 || c.y < r0 || c.y > r1) continue;
        drawDrag(ctx, c.x * px, c.y * px, px, c.dx, c.dy, c.d, VENT_REACH_SQUARES);
      }

      // 3c. Cover. Sight-blocking cover fills its square; cover you can shoot
      //     over is drawn as a low bar, so the two are told apart at a glance
      //     from across the table rather than by remembering which is which.
      each(m.cover, (cx, cy, raw) => {
        const rec = readCover(raw);
        const cv = rec && coverById(rec.id);
        if (!cv) return;
        const x0 = cx * px, y0 = cy * px;
        // Shot-up cover says what it has left, whatever it is drawn as.
        const worn = () => { if (rec.wear) drawWear(ctx, x0, y0, px, cv.ap - rec.wear); };
        if (cv.volatile) { drawTank(ctx, x0, y0, px); worn(); return; }
        /* The art says which cover this is and roughly how tall it stands,
           which is the distinction the grey boxes were drawing by hand. */
        const tok = tokenAt('cover', rec.id, null, cx, cy, rec.turn);
        if (tok) { drawToken(ctx, tok, x0, y0, px); worn(); return; }
        /* No picture for it: the flat drawing, and a barrier drawn flat
           follows its own direction too — a bar along the bottom edge when it
           lies across the square, down the right-hand edge when it stands. */
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
          const bh = Math.max(3, px * 0.2);
          const long = px * 0.84, off = px * 0.08, back = px - bh - px * 0.12;
          // Across the bottom of the square, or down its right-hand side when
          // the GM stood it on end — the same two states the token has.
          const bar = rec.turn
            ? [x0 + back, y0 + off, bh, long]
            : [x0 + off, y0 + back, long, bh];
          ctx.fillStyle = 'rgba(120,135,145,0.9)';
          ctx.fillRect(...bar);
          ctx.strokeStyle = 'rgba(200,215,225,0.9)';
          ctx.lineWidth = 1;
          ctx.strokeRect(...bar);
        }
        worn();
      });

      // 3d. Foliage and smoke: a green wash, denser where sight stops sooner.
      //     Drawn on the projector too — it is terrain, not a secret.
      each(m.obscuring, (cx, cy, id) => {
        const ob = obscuringById(id);
        if (!ob) return;
        const tok = tokenAt('obscure', id, null, cx, cy);
        if (tok) { drawToken(ctx, tok, cx * px, cy * px, px); return; }
        ctx.save();
        ctx.globalAlpha = ob.alpha;
        ctx.fillStyle = ob.colour;
        ctx.fillRect(cx * px, cy * px, px, px);
        ctx.globalAlpha = Math.min(0.9, ob.alpha + 0.25);
        ctx.fillStyle = ob.colour;
        for (const [fx, fy] of [[0.28, 0.3], [0.7, 0.35], [0.45, 0.7]]) {
          ctx.beginPath();
          ctx.arc(cx * px + px * fx, cy * px + px * fy, px * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // 4. The grid, for the table to count squares off. Only the lines in
      //    view: a deck 500 across has a thousand of them. Over a picture
      //    that carries its own grid, the GM may leave this one off.
      if (!bd || bd.grid) {
      ctx.save();
      ctx.globalAlpha = theme.gridAlpha;
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      const gy0 = r0 * px, gy1 = (r1 + 1) * px, gx0 = c0 * px, gx1 = (c1 + 1) * px;
      for (let c = c0; c <= c1 + 1; c++) { ctx.beginPath(); ctx.moveTo(c * px, gy0); ctx.lineTo(c * px, gy1); ctx.stroke(); }
      for (let r = r0; r <= r1 + 1; r++) { ctx.beginPath(); ctx.moveTo(gx0, r * px); ctx.lineTo(gx1, r * px); ctx.stroke(); }
      ctx.restore();
      }

      // 5. Bulkheads.
      each(m.doors, (cx, cy, door) => {
        const { kind, state } = door;
        const x0 = cx * px, y0 = cy * px;
        const stateColour = state === 'open' ? '#2ecc71' : state === 'jammed' ? '#f39c12' : '#e74c3c';
        /* A door drawn as a picture still has to say whether it is SHUT, and
           the pictures cannot: open has its own art, but jammed and closed are
           the same leaf and the difference decides whether the party can walk
           through. So the state keeps its colour, as a frame around the art
           rather than the bar that was the whole drawing before. */
        /* A cave's neck (caverns.js) has no leaf: open, it is a dashed
           threshold, enough to see the cavern ends there; shut, it is a
           rockfall. */
        if (kind === 'passage') {
          ctx.save();
          if (state === 'open') {
            ctx.setLineDash([px * 0.12, px * 0.1]);
            ctx.strokeStyle = 'rgba(46,204,113,0.75)';
            ctx.lineWidth = Math.max(1.5, px * 0.05);
            ctx.strokeRect(x0 + px * 0.14, y0 + px * 0.14, px * 0.72, px * 0.72);
          } else {
            ctx.fillStyle = 'rgba(122,112,100,0.95)';
            for (const [fx, fy, fr] of [[0.3, 0.35, 0.16], [0.62, 0.3, 0.13], [0.5, 0.62, 0.19], [0.24, 0.7, 0.11], [0.76, 0.66, 0.12]]) {
              ctx.beginPath(); ctx.arc(x0 + px * fx, y0 + px * fy, px * fr, 0, Math.PI * 2); ctx.fill();
            }
            ctx.strokeStyle = stateColour; ctx.lineWidth = Math.max(1.5, px * 0.05);
            ctx.strokeRect(x0 + 1, y0 + 1, px - 2, px - 2);
          }
          ctx.restore();
          return;
        }
        /* An airlock is a door that can open onto nothing, and it is ringed in
           hazard stripes so nobody opens one by mistake. */
        const lockStripes = () => {
          if (kind !== 'airlock') return;
          ctx.save();
          ctx.lineWidth = Math.max(2, px * 0.08);
          const o = px * 0.14;
          ctx.strokeStyle = 'rgba(241,196,15,0.95)';
          ctx.strokeRect(x0 + o, y0 + o, px - o * 2, px - o * 2);
          ctx.strokeStyle = 'rgba(15,15,15,0.95)';
          ctx.setLineDash([px * 0.1, px * 0.1]);
          ctx.strokeRect(x0 + o, y0 + o, px - o * 2, px - o * 2);
          ctx.restore();
        };
        /* A door in a doorway on a grid line: the leaf along that side of
           its square, in the colour of its state, solid while it is shut and
           an outline once it is open. The square is ringed faintly, because
           the square is what is clicked. */
        if (door.edge) {
          const t2 = Math.max(4, px * 0.16), in2 = px * 0.06;
          const leaf = door.edge === 'e' ? [x0 + px - t2, y0 + in2, t2, px - in2 * 2]
            : door.edge === 'w' ? [x0, y0 + in2, t2, px - in2 * 2]
              : door.edge === 's' ? [x0 + in2, y0 + px - t2, px - in2 * 2, t2]
                : [x0 + in2, y0, px - in2 * 2, t2];
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = stateColour;
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 + 1, y0 + 1, px - 2, px - 2);
          ctx.globalAlpha = 1;
          if (state === 'open') {
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = stateColour; ctx.lineWidth = 2;
            ctx.strokeRect(...leaf);
          } else {
            ctx.fillStyle = stateColour; ctx.fillRect(...leaf);
            ctx.strokeStyle = '#0b0e14'; ctx.lineWidth = 1; ctx.strokeRect(...leaf);
          }
          ctx.restore();
          lockStripes();
          return;
        }
        const tok = tokenAt('door', kind, state, cx, cy);
        if (tok) {
          drawToken(ctx, tok, x0, y0, px);
          lockStripes();
          ctx.strokeStyle = stateColour;
          ctx.lineWidth = Math.max(1.5, px * 0.05);
          ctx.globalAlpha = 0.9;
          const o = ctx.lineWidth / 2;
          ctx.strokeRect(x0 + o, y0 + o, px - ctx.lineWidth, px - ctx.lineWidth);
          ctx.globalAlpha = 1;
          return;
        }
        ctx.fillStyle = stateColour;
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
        lockStripes();
      });

      // 6. Markers.
      each(m.markers, (cx, cy, mk) => {
        const mx = cx * px + px / 2, my = cy * px + px / 2;
        if (mk.type === 'cogitator') {
          drawTerminal(ctx, cx * px, cy * px, px, mk.state, tokenAt('cover', 'machinery', null, cx, cy));
          return;
        }
        if (mk.type === 'turret') { drawTurret(ctx, cx * px, cy * px, px, mk.facing, mk.state); return; }
        if (mk.type === 'shrine') { drawShrine(ctx, cx * px, cy * px, px); return; }
        if (mk.type === 'vent') { drawVent(ctx, cx * px, cy * px, px, tokenAt('marker', 'vent', null, cx, cy)); return; }
        ctx.fillStyle = markerTypeById(mk.type).colour;
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(mx, my, px * 0.36, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        // A target carries a bonus to hit: ringed twice with sights at the
        // four sides and the number, so a hostile is picked out from across the
        // table and the bonus is read off the screen.
        if (Number.isFinite(mk.bonus)) {
          const r = px * 0.46;
          ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = Math.max(2, px * 0.07);
          ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            ctx.moveTo(mx + dx * r * 0.7, my + dy * r * 0.7);
            ctx.lineTo(mx + dx * r * 1.25, my + dy * r * 1.25);
          }
          ctx.stroke();
          ctx.font = `bold ${Math.max(9, Math.round(px * 0.3))}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = '#000';
          const tag = `${mk.bonus >= 0 ? '+' : ''}${mk.bonus}`;
          ctx.strokeText(tag, mx, my); ctx.fillStyle = '#fff'; ctx.fillText(tag, mx, my);
        }
      });


      // 6. Light painted on the deck, over everything standing in it. A square
      //    painted with what is now the deck's own light draws as the rest do.
      each(m.light, (cx, cy, id) => {
        if (id !== m.lighting && m.floor[cx + ',' + cy]) drawLight(ctx, cx * px, cy * px, px, id);
      });

      // 6. And moving, under the fog like everything else on the deck.
      if (moving && !reducedMotion && (c1 - c0 + 1) * (r1 - r0 + 1) <= MOTION_MAX_SQUARES) {
        drawMotion(ctx, { c0, c1, r0, r1 }, performance.now() / 1000);
      }

      // 6. The crawlways, while the deck is being built: a dashed line from
      //    each vent to the one it leads to. In play the party finds out by
      //    going in.
      if (tab === 'build' && ductLines.length) {
        ctx.save();
        ctx.setLineDash([px * 0.2, px * 0.15]);
        ctx.strokeStyle = 'rgba(149,165,166,0.8)';
        ctx.lineWidth = Math.max(1.5, px * 0.06);
        for (const [a, b] of ductLines) {
          ctx.beginPath();
          ctx.moveTo(a.x * px + px / 2, a.y * px + px / 2);
          ctx.lineTo(b.x * px + px / 2, b.y * px + px / 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 6a. Where the party starts: the GM's own note on the deck, never on the
      //     projector. While the starting-room tool is in hand the whole room
      //     is tinted, so it is clear what a click would choose.
      if (m.start && !projecting) {
        if (mode === 'start') {
          ctx.fillStyle = 'rgba(243,201,110,0.16)';
          for (const c of startCells) ctx.fillRect(c.x * px, c.y * px, px, px);
        }
        const fx = m.start.x * px + px / 2, fy = m.start.y * px + px / 2;
        ctx.save();
        ctx.strokeStyle = '#f3c96e'; ctx.fillStyle = '#f3c96e';
        ctx.lineWidth = Math.max(1.5, px * 0.07);
        ctx.beginPath(); ctx.arc(fx, fy, px * 0.4, 0, Math.PI * 2);
        ctx.globalAlpha = 0.85; ctx.stroke();
        ctx.globalAlpha = 1;
        const pole = fx - px * 0.1;
        ctx.beginPath(); ctx.moveTo(pole, fy + px * 0.22); ctx.lineTo(pole, fy - px * 0.24); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pole, fy - px * 0.24); ctx.lineTo(pole + px * 0.26, fy - px * 0.14); ctx.lineTo(pole, fy - px * 0.03);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // 6b. Fog of war, over the deck and the grid both: an unexplored square
      //     must not even show how big it is.
      //
      //     IT IS DRAWN DIFFERENTLY IN THE TWO WINDOWS. The projector's copy is
      //     solid, because the table must not read through it. The GM's own tab
      //     is dimmed rather than blacked, because the GM is the one building
      //     the deck and reaching for the next square to reveal, and a tool you
      //     cannot see to aim is no tool.
      if (shown) {
        // What is DRAWN is what they have seen and can still reach through
        // open doors, so shutting a bulkhead takes the room beyond it off the
        // board without forgetting it was ever found.
        ctx.fillStyle = projecting ? 'rgb(3,4,6)' : 'rgba(3,4,6,0.82)';
        for (let x = c0; x <= c1; x++) {
          for (let y = r0; y <= r1; y++) {
            if (!shown[x + ',' + y]) ctx.fillRect(x * px, y * px, px, px);
          }
        }
        /* A DOWNLOADED PLAN, as a blueprint under the fog. A mapped square
           the party has not seen shows its walls and its doors in a thin
           cyan line and nothing else: they know where the rooms are, not
           what is in them. Drawn after the fog so it sits on top of it. */
        // Asked with a loop that stops at the first key: a whole deck's plan
        // can be a quarter of a million squares, and this runs every frame.
        let planned = false;
        for (const _k in m.mapped) { planned = true; break; }
        if (planned) {
          ctx.save();
          ctx.strokeStyle = 'rgba(90,200,255,0.6)';
          ctx.lineWidth = Math.max(1, px * 0.04);
          for (let x = c0; x <= c1; x++) {
            for (let y = r0; y <= r1; y++) {
              const k = x + ',' + y;
              if (shown[k] || !m.mapped[k] || !m.floor[k]) continue;
              const x0 = x * px, y0 = y * px;
              ctx.fillStyle = 'rgba(20,60,90,0.28)';
              ctx.fillRect(x0, y0, px, px);
              const mask = wallMask(m.floor, x, y);
              ctx.beginPath();
              if (mask & WALL_N) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0); }
              if (mask & WALL_S) { ctx.moveTo(x0, y0 + px); ctx.lineTo(x0 + px, y0 + px); }
              if (mask & WALL_W) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + px); }
              if (mask & WALL_E) { ctx.moveTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 + px); }
              ctx.stroke();
              if (m.doors[k]) ctx.strokeRect(x0 + px * 0.3, y0 + px * 0.3, px * 0.4, px * 0.4);
            }
          }
          ctx.restore();
        }
      }

      // 6b2. Trigger zones: the GM's own, over their dimmed fog. Never on the
      //      table's screen while it is being played.
      if (m.triggers.length && (!projecting || tab === 'build')) {
        ctx.save();
        for (const t of m.triggers) {
          const on = mode === 'trigger' && t.id === trigId;
          ctx.fillStyle = t.armed ? `rgba(168,85,247,${on ? 0.3 : 0.16})` : 'rgba(140,140,150,0.12)';
          const pts = t.cells.map(parseKey).filter((c) => c && c.x >= c0 && c.x <= c1 && c.y >= r0 && c.y <= r1);
          for (const c of pts) ctx.fillRect(c.x * px, c.y * px, px, px);
          if (pts.length) {
            ctx.setLineDash([px * 0.15, px * 0.1]);
            ctx.strokeStyle = t.armed ? 'rgba(200,140,255,0.9)' : 'rgba(170,170,180,0.6)';
            ctx.lineWidth = Math.max(1.5, px * (on ? 0.07 : 0.04));
            const inSet = new Set(t.cells);
            ctx.beginPath();
            for (const c of pts) {
              const x0 = c.x * px, y0 = c.y * px;
              if (!inSet.has(c.x + ',' + (c.y - 1))) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0); }
              if (!inSet.has(c.x + ',' + (c.y + 1))) { ctx.moveTo(x0, y0 + px); ctx.lineTo(x0 + px, y0 + px); }
              if (!inSet.has((c.x - 1) + ',' + c.y)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + px); }
              if (!inSet.has((c.x + 1) + ',' + c.y)) { ctx.moveTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 + px); }
            }
            ctx.stroke();
            ctx.setLineDash([]);
            const first = pts[0];
            ctx.font = `${Math.max(9, Math.floor(px * 0.26))}px system-ui, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillStyle = t.armed ? 'rgba(235,215,255,0.95)' : 'rgba(200,200,205,0.8)';
            ctx.fillText((t.name || 'Trigger') + (t.armed ? '' : ' \u2713'), first.x * px + 3, first.y * px + Math.max(10, px * 0.3));
          }
        }
        ctx.restore();
      }
    }

    // 6b3. Named areas (areas.js): on the GM's screens all of them, on the
    //      table's only those the GM has shown it, and there only on squares
    //      the party has seen, so a label never gives away a room in the dark.
    {
      const list = projecting ? areasForTable(m.areas) : m.areas;
      if (list.length) {
        ctx.save();
        const rgbaOf = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
        for (const a of list) {
          const cells = projecting && shown ? a.cells.filter((k) => shown[k]) : a.cells;
          const pts = cells.map(parseKey).filter((c) => c && c.x >= c0 && c.x <= c1 && c.y >= r0 && c.y <= r1);
          if (!pts.length) continue;
          const col = areaColour(a.colour);
          const on = !projecting && mode === 'area' && a.id === areaId;
          ctx.fillStyle = rgbaOf(col, on ? 0.3 : 0.16);
          for (const c of pts) ctx.fillRect(c.x * px, c.y * px, px, px);
          const inSet = new Set(cells);
          ctx.strokeStyle = rgbaOf(col, 0.95);
          ctx.lineWidth = Math.max(1.5, px * (on ? 0.09 : 0.05));
          ctx.beginPath();
          for (const c of pts) {
            const x0 = c.x * px, y0 = c.y * px;
            if (!inSet.has(c.x + ',' + (c.y - 1))) { ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0); }
            if (!inSet.has(c.x + ',' + (c.y + 1))) { ctx.moveTo(x0, y0 + px); ctx.lineTo(x0 + px, y0 + px); }
            if (!inSet.has((c.x - 1) + ',' + c.y)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + px); }
            if (!inSet.has((c.x + 1) + ',' + c.y)) { ctx.moveTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 + px); }
          }
          ctx.stroke();
          const lc = labelCell(cells);
          if (lc && a.name) {
            const fs = Math.max(10, Math.floor(px * 0.4));
            ctx.font = `600 ${fs}px "Cinzel", "EB Garamond", Georgia, serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const tx = lc.x * px + px / 2, ty = lc.y * px + px / 2;
            const label = a.name + (!projecting && a.deck ? ' \u25b8' : '');
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(4,6,10,0.74)';
            ctx.fillRect(tx - tw / 2 - 6, ty - fs * 0.72, tw + 12, fs * 1.44);
            ctx.fillStyle = col;
            ctx.fillText(label, tx, ty);
          }
        }
        ctx.restore();
      }
    }

    // 6b4. The sketch, while the Sketch tool is in hand and never on the
    //      table's screen: the picture it is traced or read from, faint, under
    //      it all; how it was read (each room outlined and named, each passage
    //      dotted along the squares it was drawn through, a lock as a red bar),
    //      then the strokes themselves over it, then the stroke being drawn.
    if (mode === 'sketch' && !projecting) {
      ctx.save();
      if (sketchPic && sketchPic.show) {
        const { x, y, across } = sketchPic.place;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(sketchPic.img, x * px, y * px, across * px, (across / sketchPic.aspect) * px);
        ctx.globalAlpha = 1;
      }
      const fs = Math.max(10, Math.floor(px * 0.36));
      ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const r of sketchPlan.rooms) {
        const tint = r.tags.includes('start') ? '90,200,120' : r.tags.includes('objective') ? '241,196,15' : '232,194,90';
        ctx.fillStyle = `rgba(${tint},0.12)`;
        ctx.strokeStyle = `rgba(${tint},0.85)`;
        ctx.lineWidth = Math.max(1.5, px * 0.05);
        ctx.setLineDash([px * 0.18, px * 0.12]);
        if (r.shape === 'box') {
          const [bx, by, bw, bh] = r.box;
          ctx.fillRect(bx * px, by * px, bw * px, bh * px);
          ctx.strokeRect(bx * px, by * px, bw * px, bh * px);
        } else {
          const inSet = new Set(r.cells);
          ctx.beginPath();
          for (const k of r.cells) {
            const [cx, cy] = k.split(',').map(Number);
            ctx.fillRect(cx * px, cy * px, px, px);
            if (!inSet.has(cx + ',' + (cy - 1))) { ctx.moveTo(cx * px, cy * px); ctx.lineTo(cx * px + px, cy * px); }
            if (!inSet.has(cx + ',' + (cy + 1))) { ctx.moveTo(cx * px, cy * px + px); ctx.lineTo(cx * px + px, cy * px + px); }
            if (!inSet.has((cx - 1) + ',' + cy)) { ctx.moveTo(cx * px, cy * px); ctx.lineTo(cx * px, cy * px + px); }
            if (!inSet.has((cx + 1) + ',' + cy)) { ctx.moveTo(cx * px + px, cy * px); ctx.lineTo(cx * px + px, cy * px + px); }
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
        const tag = (r.name || r.id) + (r.tags.includes('start') ? ' start' : '') + (r.tags.includes('objective') ? ' objective' : '')
          + (r.hazards.length ? ` ${r.hazards.join(',')}` : '');
        ctx.fillStyle = 'rgba(4,6,10,0.75)';
        ctx.fillRect(r.box[0] * px + 3, r.box[1] * px + 3, ctx.measureText(tag).width + 8, fs + 6);
        ctx.fillStyle = `rgb(${tint})`;
        ctx.fillText(tag, r.box[0] * px + 7, r.box[1] * px + 6);
      }
      for (const l of sketchPlan.links) {
        ctx.fillStyle = l.kind === 'locked' ? 'rgba(255,106,90,0.8)' : l.kind === 'open' ? 'rgba(120,230,150,0.75)' : 'rgba(90,200,230,0.7)';
        for (const [x, y] of l.path) {
          ctx.beginPath(); ctx.arc(x * px + px / 2, y * px + px / 2, Math.max(2, px * 0.09), 0, Math.PI * 2); ctx.fill();
        }
        if (l.kind === 'locked' && l.path.length) {
          const [mx, my] = l.path[Math.floor(l.path.length / 2)];
          ctx.fillStyle = '#ff6a5a';
          ctx.fillRect(mx * px + px * 0.15, my * px + px * 0.38, px * 0.7, px * 0.24);
        }
      }
      const drawStroke = (st, colour, width) => {
        ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = width;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (st.pen === 'mark' && st.pts.length <= 2) {
          const [x, y] = st.pts[0];
          ctx.beginPath(); ctx.arc(x * px, y * px, px * 0.32, 0, Math.PI * 2); ctx.stroke();
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText((({ start: 'S', objective: 'O', lock: 'L', hazard: 'H', fixture: 'F' })[st.mark] || '?') + (st.unsure ? '?' : ''), x * px, y * px);
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          return;
        }
        ctx.beginPath();
        st.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * px, y * px) : ctx.moveTo(x * px, y * px)));
        if (st.pen === 'room' && st.pts.length > 2 && st !== strokeRef.current) ctx.closePath();
        ctx.stroke();
      };
      const PEN_COLOUR = { room: 'rgba(255,214,120,0.95)', passage: 'rgba(120,220,255,0.95)', mark: 'rgba(255,140,200,0.95)' };
      for (const st of sketch.strokes) drawStroke(st, PEN_COLOUR[st.pen], Math.max(2, px * 0.07));
      if (strokeRef.current) drawStroke({ ...strokeRef.current, mark: sketchMark }, '#ffffff', Math.max(2.5, px * 0.09));
      ctx.restore();
    }

    // 6c. Contacts. The fight is played with miniatures, so these are not
    //     models on a board — they are what the GM knows and the auspex
    //     leaks. A ping is drawn OVER the fog on purpose: that is the whole
    //     mechanic, something on the scope with the deck still dark.
    each(m.contacts, (cx, cy, c) => {
      const mx = cx * px + px / 2, my = cy * px + px / 2;
      if (c.state === 'hidden') {
        // Never on the projector: the GM's note to themselves.
        if (projecting) return;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(220,120,120,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(mx, my, px * 0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        return;
      }
      if (c.state === 'ping') {
        // A contact, not a creature: concentric rings, no name, no shape.
        // The party learns that something is out there and nothing else.
        for (const r of [0.44, 0.3, 0.16]) {
          ctx.beginPath();
          ctx.arc(mx, my, px * r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,70,70,${0.35 + (0.5 - r)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,70,70,0.9)';
        ctx.beginPath(); ctx.arc(mx, my, px * 0.07, 0, Math.PI * 2); ctx.fill();
        return;
      }
      // seen
      ctx.beginPath();
      ctx.arc(mx, my, px * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(192,57,43,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#0b0e14';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, Math.floor(px * 0.26))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(c.name.slice(0, 2).toUpperCase(), mx, my + px * 0.09);
    });

    // 7. THE OVERLAYS — the reason this is worth projecting at all.
    if (overlay) {
      const ox = origin.x * px + px / 2, oy = origin.y * px + px / 2;

      // Dead ground first, so everything else paints over it: what cannot be
      // seen from the firing square is dimmed rather than hidden, because
      // the GM still needs to see the deck they are ruling on. Not at an
      // overview, where the squares are too small to read it.
      if (seeable && !overview) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let x = c0; x <= c1; x++) {
          for (let y = r0; y <= r1; y++) {
            if (!seeable(x, y)) ctx.fillRect(x * px, y * px, px, px);
          }
        }
      }

      // The caught squares are tinted faintly UNDER the template art: the
      // smooth shape is what the table reads, but the GM still needs to see
      // exactly which squares are in it, and a gradient edge alone is a
      // thing to argue over.
      fill(overlay.aura, 'rgba(0,229,255,0.10)');
      fill(overlay.cone, weapon.power && !weapon.fire ? `rgba(${warpRgb(performance.now(), 1)},0.14)` : 'rgba(255,170,40,0.12)');
      fill(overlay.blast, 'rgba(231,76,60,0.12)');
      fill(overlay.burst, 'rgba(255,120,40,0.14)');

      const target = aim || hover;
      const inSquares = (metres) => (metres / (m.metresPerSquare || 1)) * px;

      if (overlay.aura.length) {
        clipToCells(ctx, overlay.auraClip.length ? overlay.auraClip : overlay.aura, px,
          () => drawShield(ctx, ox, oy, inSquares(weapon.auraM)));
      }
      if (overlay.cone.length && target) {
        clipToCells(ctx, overlay.coneClip.length ? overlay.coneClip : overlay.cone, px, () => drawCone(
          ctx, ox, oy,
          Math.atan2(target.y - origin.y, target.x - origin.x),
          inSquares(weapon.range),
          ((weapon.coneDeg || coneAngle) / 2) * Math.PI / 180,
          weapon.power === 'psy' && !weapon.fire
        ));
      }
      // A power bursting round the psyker: the blast art, centred on them.
      if (overlay.burst.length) {
        clipToCells(ctx, overlay.burstClip, px, () => drawBlast(ctx, ox, oy, inSquares(weapon.burstM)));
      }
      // A wall of warp-fire along a line: the caught squares lit, and a
      // burning seam down the middle of them so it reads as one wall.
      if (overlay.line.length) {
        fill(overlay.line, 'rgba(255,120,40,0.32)');
        const end = overlay.line[overlay.line.length - 1];
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,170,60,0.55)';
        ctx.lineWidth = px * 0.55;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(end.x * px + px / 2, end.y * px + px / 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,240,190,0.9)';
        ctx.lineWidth = Math.max(1.5, px * 0.08);
        ctx.stroke();
        ctx.restore();
      }
      // A personal power: a glow round the psyker's own square.
      if (overlay.kind === 'personal') {
        const rgb = weapon.fire ? '255,140,40' : warpRgb(performance.now());
        const gl = ctx.createRadialGradient(ox, oy, px * 0.2, ox, oy, px * 0.95);
        gl.addColorStop(0, `rgba(${rgb},0)`);
        gl.addColorStop(0.6, `rgba(${rgb},0.55)`);
        gl.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(ox, oy, px * 0.95, 0, Math.PI * 2); ctx.fill();
      }
      if (overlay.blast.length && target) {
        clipToCells(ctx, overlay.blastClip.length ? overlay.blastClip : overlay.blast, px, () => drawBlast(
          ctx, target.x * px + px / 2, target.y * px + px / 2,
          inSquares(weapon.blastM)
        ));
      }

      // What it catches, ringed: the contacts the party knows of (and, on the
      // GM's own view, those it does not), the marked targets, the tanks.
      if (caught) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,90,60,0.95)';
        ctx.lineWidth = Math.max(2, px * 0.08);
        const ringAt = (c) => { ctx.beginPath(); ctx.arc(c.x * px + px / 2, c.y * px + px / 2, px * 0.47, 0, Math.PI * 2); ctx.stroke(); };
        for (const c of caught.contacts) if (c.state !== 'hidden' || !projecting) ringAt(c);
        for (const c of caught.targets) ringAt(c);
        for (const c of caught.volatile) ringAt(c);
        ctx.restore();
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
      /* The squares a melee weapon threatens, under everything else: a ring
         of reach around its bearer, green while the target is inside it and
         red once it is not. Out of reach is no attack, the melee answer to
         being out of range. */
      if (overlay.threat && overlay.threat.length) {
        fill(overlay.threat, overlay.reaches === false
          ? 'rgba(231,76,60,0.12)' : 'rgba(126,217,87,0.14)');
        ctx.strokeStyle = overlay.reaches === false
          ? 'rgba(231,76,60,0.8)' : 'rgba(126,217,87,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ox, oy, (weapon.reachM / (m.metresPerSquare || 1)) * px + px * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (overlay.kind === 'bolt' && Number.isFinite(weapon.reachM) && weapon.reachM > 0) {
        ctx.strokeStyle = overlay.reaches === false ? 'rgba(231,76,60,0.85)'
          : weapon.fire ? 'rgba(255,140,40,0.85)' : `rgba(${warpRgb(performance.now(), 2)},0.85)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(ox, oy, inSquares(weapon.reachM), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (overlay.shot && overlay.target) {
        drawShot(ctx, px, origin, overlay.target, overlay.shot.blocked, {
          // A power or a gaze is a stream of the warp, not a round: its own
          // colour, so nobody reads a psychic bolt as a lasgun shot.
          rgb: weapon.power === 'nav' ? '120,255,200'
            : weapon.power === 'psy' ? (weapon.fire ? '255,140,40' : warpRgb(performance.now())) : null,
          scatter: weapon.isScatter,
          burst: Boolean(weapon.burst) && !weapon.isScatter,
          thrown: weapon.isThrown,
          heavy: weapon.isHeavy,
          accurate: weapon.isAccurate
        });
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
    } else if (hoverEdge && mode === 'wall') {
      const e = hoverEdge;
      const on = hasWall(m.walls, e);
      ctx.save();
      ctx.strokeStyle = on ? 'rgba(231,76,60,0.95)' : 'rgba(46,204,113,0.95)';
      ctx.lineWidth = Math.max(3, px * 0.12);
      ctx.beginPath();
      if (e.bit === WALL_EAST) { ctx.moveTo((e.x + 1) * px, e.y * px); ctx.lineTo((e.x + 1) * px, (e.y + 1) * px); }
      else { ctx.moveTo(e.x * px, (e.y + 1) * px); ctx.lineTo((e.x + 1) * px, (e.y + 1) * px); }
      ctx.stroke();
      ctx.restore();
    } else if (hover && mode === 'obscure') {
      fill(brushCells(hover, brush, m), 'rgba(95,159,85,0.45)');
    } else if (hover && mode === 'light' && lightScope === 'brush') {
      fill(onDeck(m, brushCells(hover, brush, m)), 'rgba(255,226,150,0.3)');
    } else if (hover && mode === 'noise' && !projecting) {
      // How far this sound carries, as the GM lines it up.
      const n = noiseById(noiseKind);
      if (n) fill(areaCells(m, hover, n.radiusM), 'rgba(255,200,60,0.16)');
    }

    // 8b. The picture being placed: its edge, and the corner that sizes it.
    if (picOpen && m.backdrop) {
      const b = m.backdrop;
      ctx.save();
      ctx.setLineDash([px * 0.2, px * 0.12]);
      ctx.strokeStyle = 'rgba(243,201,110,0.95)';
      ctx.lineWidth = Math.max(2, px * 0.06);
      ctx.strokeRect(b.x * px, b.y * px, b.w * px, b.h * px);
      ctx.setLineDash([]);
      const hs = px * PIC_HANDLE;
      const c = picCorner(b);
      ctx.fillStyle = picHover === 'size' ? 'rgba(255,226,150,1)' : 'rgba(243,201,110,0.9)';
      ctx.fillRect(c.x * px - hs / 2, c.y * px - hs / 2, hs, hs);
      ctx.strokeStyle = '#0b0e14'; ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x * px - hs / 2, c.y * px - hs / 2, hs, hs);
      ctx.restore();
    }

    // 9. The measuring tape.
    if (measureFrom && measureTo && measurement) {
      drawShot(ctx, px, measureFrom, measureTo, measurement.blocked);
    }

    // 10. The calibration bar. Drawn last and over everything, because its
    //     whole job is to be measured against a ruler on the table. Kept in
    //     the corner of what is in view, so it is never off-screen.
    if (showCalibration) {
      const bar = calibrationBar(m, { targetMm: 100 });
      const bx = Math.max(0, vx0) + px, by = Math.min(h, vy1) - px * 0.9;
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
    ctx.restore();
  };

  // Sizes the canvas to the part of the deck in view and draws it. Called from
  // the effect below whenever anything it shows changes, and straight from the
  // scroll listener, so the picture never trails the scroll by a frame.
  const draw = () => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const wrapW = Math.max(1, Math.round(m.cols * px * zoom));
    const wrapH = Math.max(1, Math.round(m.rows * px * zoom));
    const cw = Math.max(1, Math.min(stage.clientWidth || wrapW, wrapW));
    const ch = Math.max(1, Math.min(stage.clientHeight || wrapH, wrapH));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const left = Math.max(0, Math.min(stage.scrollLeft, wrapW - cw));
    const top = Math.max(0, Math.min(stage.scrollTop, wrapH - ch));
    paint(canvas.getContext('2d'), { left, top, width: cw, height: ch, zoom });
  };
  drawRef.current = draw;

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, px, theme, hover, mode, tileId, rotation, brush, overlay, origin, aim, weapon, coneAngle, projecting,
      measureFrom, measureTo, measurement, showZones, showCalibration, seeable, shown, textureTick, caught,
      tokenTick, noiseKind, zoom, showOptions, startCells, lightScope, tab, mediaTick, hoverEdge, moving, trigId,
      picOpen, picHover, areaId, strokeTick, sketchPlan, sketchPic]);

  // Scrolling and resizing the stage move the window over the deck.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const w = win || window;
    const again = () => drawRef.current();
    el.addEventListener('scroll', again, { passive: true });
    const ro = typeof w.ResizeObserver === 'function' ? new w.ResizeObserver(again) : null;
    if (ro) ro.observe(el);
    return () => {
      el.removeEventListener('scroll', again);
      if (ro) ro.disconnect();
    };
  }, [win]);

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
        // Clicked into, the number is selected, so what is typed replaces it.
        onFocus={selectAll} onDoubleClick={selectAll}
        onChange={(e) => {
          noLeadingZero(e.target);
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
    const pad = 2;    // the stage's border
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

  /* Zooms to `target`, holding the point under (clientX, clientY) still. The
     wheel passes the pointer; the buttons pass the middle of the stage. Only
     refs and setters are touched, so the effect below can keep the copy it
     was bound with. */
  const zoomAt = (target, clientX, clientY) => {
    const el = stageRef.current;
    if (!el) return;
    const w = win || window;
    const box = el.getBoundingClientRect();
    const px0 = clientX === undefined ? box.left + el.clientWidth / 2 : clientX;
    const py0 = clientY === undefined ? box.top + el.clientHeight / 2 : clientY;
    const atX = px0 - box.left + el.scrollLeft;
    const atY = py0 - box.top + el.scrollTop;
    const cur = zoomRef.current;
    const next = clampZoom(target);
    if (next === cur) return;
    const k = next / cur;
    zoomRef.current = next;
    setZoom(next);
    setZoomPct(String(Math.round(next * 100)));
    // About the point, after the browser has laid the bigger deck out.
    // Without the correction the deck slides out from under the cursor.
    w.requestAnimationFrame(() => {
      el.scrollLeft = atX * k - (px0 - box.left);
      el.scrollTop = atY * k - (py0 - box.top);
    });
  };
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
      if (rightHeld) { rightZoomedRef.current = true; setMenu(null); }
      // A pinch arrives as many small deltas; a wheel notch as one large one.
      const step = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.12 : 1 / 1.12);
      zoomAt(zoomRef.current * step, e.clientX, e.clientY);
    };
    /* The right button does two things here: with the wheel it zooms, on its
       own it opens the menu. Which one it was is only known once the button
       comes up — except that macOS reports the menu on the press — so a press
       is held as "maybe a menu" and opened on release if no zoom happened.
       Ctrl-click is left to the fog tool, which uses it to take a place back. */
    let pending = null;
    const onContextMenu = (e) => {
      e.preventDefault();
      if (rightZoomedRef.current) { rightZoomedRef.current = false; pending = null; return; }
      if (e.ctrlKey) return;
      const cell = cellAtRef.current ? cellAtRef.current(e) : null;
      if ((e.buttons & 2) === 2) { pending = { x: e.clientX, y: e.clientY, cell }; return; }
      setMenu({ x: e.clientX, y: e.clientY, cell });
    };
    const onMouseUp = (e) => {
      if (e.button !== 2) return;
      if (pending && !rightZoomedRef.current) setMenu(pending);
      pending = null;
    };
    const onMouseDown = (e) => { if (e.button === 2) { rightZoomedRef.current = false; pending = null; } };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('mousedown', onMouseDown);
    w.addEventListener('keydown', onKeyDown);
    w.addEventListener('keyup', onKeyUp);
    w.addEventListener('blur', onBlur);
    w.addEventListener('mouseup', onMouseUp);
    return () => {
      w.removeEventListener('mouseup', onMouseUp);
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

  const clearAll = async () => {
    if (!await confirmInMap({
      title: 'Clear the deck?',
      body: 'Everything drawn on this deck goes: the floor and its walls, the doors,'
        + ' cover, hazards, foliage, markers, contacts, painted terrain and light, and what the'
        + ' party has explored. The grid size, the ground, the picture and the calibration stay.',
      yes: 'Clear it'
    })) return;
    /* EVERYTHING THAT STOOD ON THE DECK, not just the floor.

       It used to clear the floor, the doors and the markers, which left the
       crates, the fires, the foliage, the painted terrain and the fog
       behind — floating over a deck that was no longer there. With the props
       drawn as grey boxes that read as faint debris; now that they are
       photographs of crates it reads as the deck not having cleared at all. */
    patch({
      floor: {}, doors: {}, markers: {}, cover: {}, hazards: {}, obscuring: {},
      contacts: {}, ground: {}, explored: {}, mapped: {}, light: {}, walls: {}, viewpoint: null
    });
    originRef.current = null; measureRef.current = null;
    setMeasureFrom(null); setMeasureTo(null); setOrigin(null); setAim(null);
  };

  /* ---- laying a picture floor ----
     Measured before it is laid: its size in pixels is what its size in
     squares comes from. */
  const measureFile = (file, kind) => measureMedia(file, kind, win);
  const picSquares = (size) => squaresFor(size, picHow === 'grid' ? { pxPerSquare: Number(picPps) }
    : picHow === 'tv' ? { across: tvSquaresAcross(Number(picTv)) } : { across: Number(picAcross) });
  // The grid that holds a picture, and deck on every square under it.
  const fittedTo = (b) => {
    const g = gridFor(b);
    const floor = {};
    for (const c of squaresUnder(b, g.cols, g.rows)) floor[cellKey(c.x, c.y)] = true;
    return { cols: g.cols, rows: g.rows, floor };
  };
  // `across`: a generated picture is made in the grid's shape and laid across it.
  const choosePicture = async (file, { across = null } = {}) => {
    if (!file) return;
    const kind = backdropKindOf(file.type);
    if (!kind) { setPicNote('That is not a picture or a video the map can show: PNG, JPEG, WebP or GIF, MP4 or WebM.'); return; }
    const size = await measureFile(file, kind);
    if (!size) { setPicNote(`${file.name} would not open.`); return; }
    const sq = across ? squaresFor(size, { across }) : picSquares(size);
    if (!sq) { setPicNote('Say how big the picture is first.'); return; }
    const id = newBackdropId();
    try { await putLocalFile(id, file, { name: file.name }); } catch {
      setPicNote('This browser would not keep the file. A private window keeps nothing; try an ordinary one.');
      return;
    }
    const b = readBackdrop({ id, kind, name: file.name, x: 0, y: 0, w: sq.w, h: sq.h, grid: true });
    /* A deck with nothing on it becomes the picture: the grid fitted round
       it and every square under it deck, so the fog and the rooms have
       somewhere to run. A deck already drawn is left as it is. */
    const empty = Object.keys(m.floor).length === 0;
    patch(empty ? { backdrop: b, ...fittedTo(b) } : { backdrop: b });
    setPicNote(`${file.name}: ${size.width}\u00d7${size.height}, laid ${sq.w} squares across and ${sq.h} down. `
      + (empty ? 'The grid is fitted to it and every square under it is deck.'
        : 'When it sits right, fit the grid to it and lay the deck under it.'));
  };
  // The same deck on a different computer: the file chosen again, under the
  // id the deck already carries.
  /* What GenerateFloor.jsx hands back lands a while after it was asked for:
     laid with the deck and the writer as they are THEN, not as they were. */
  const genRef = useRef(null);
  genRef.current = { m, patch, choosePicture };
  const layGeneratedPicture = (file) => genRef.current.choosePicture(file, { across: genRef.current.m.cols });
  const layGeneratedVideo = async (file, crop, from) => {
    const id = newBackdropId();
    try { await putLocalFile(id, file, { name: file.name }); } catch { setPicNote('This browser would not keep the clip.'); return; }
    const { m: cur, patch: write } = genRef.current;
    const b = cur.backdrop && from && cur.backdrop.id === from.id ? cur.backdrop : from;
    write({ backdrop: readBackdrop({ id, kind: 'video', name: file.name, ...placeOver(b, crop), grid: b.grid }) });
    setPicNote('The picture is moving: a looping clip in its place, over the part of it the clip was made from. Undo puts the still back.');
  };

  const relinkPicture = async (file) => {
    if (!file || !m.backdrop) return;
    const kind = backdropKindOf(file.type);
    if (!kind) { setPicNote('That is not a picture or a video the map can show.'); return; }
    try { await putLocalFile(m.backdrop.id, file, { name: file.name }); } catch {
      setPicNote('This browser would not keep the file.');
      return;
    }
    if (kind !== m.backdrop.kind || file.name !== m.backdrop.name) patch({ backdrop: { ...m.backdrop, kind, name: file.name } });
    media.reload();
    setPicNote(`${file.name} is on this computer now.`);
  };
  /* A MAP FROM ANOTHER PROGRAM (uvtt.js): Dungeondraft, Dungeon Alchemist,
     DungeonFog and the rest export one JSON file holding the picture, its
     walls, its doors and its lights. It replaces the deck, after asking, and
     undo puts the old one back. */
  const importMapFile = async (file) => {
    if (!file) return;
    let u = null;
    try { u = readUvtt(JSON.parse(await file.text())); } catch { u = null; }
    if (!u) {
      setPicNote(`${file.name} is not a map this can read: it wants a Universal VTT export (.dd2vtt, .uvtt or .df2vtt).`);
      return;
    }
    if (Object.keys(m.floor).length && !await confirmInMap({
      title: 'Replace this deck?',
      body: `\u201c${file.name}\u201d takes the place of everything on this deck. Undo (Cmd/Ctrl+Z) brings it back.`,
      yes: 'Import it'
    })) return;
    setPicNote(`Reading ${file.name}\u2026`);
    let backdrop = null;
    let kept = true;
    if (u.image) {
      const id = newBackdropId();
      try {
        const blob = await (await fetch(`data:${u.imageType};base64,${u.image}`)).blob();
        await putLocalFile(id, blob, { name: file.name });
        backdrop = { id, kind: 'image', name: file.name.replace(/\.[^.]+$/, '') };
      } catch { kept = false; }
    }
    const { map: im, notes } = uvttToMap(u, { backdrop });
    patch({
      cols: im.cols, rows: im.rows, metresPerSquare: im.metresPerSquare, lighting: im.lighting,
      floor: im.floor, walls: im.walls, doors: im.doors, light: im.light, backdrop: im.backdrop,
      ground: {}, cover: {}, hazards: {}, obscuring: {}, markers: {}, contacts: {},
      explored: {}, mapped: {}, viewpoint: null, start: null, customTexture: null
    });
    const lit = notes.lighting !== 'clear'
      ? ` Its light is ${notes.lighting === 'dark' ? 'Total Darkness' : 'Fog, Mist or Shadow'} for the dice, with the ${notes.lit} squares its ${notes.lights} light${notes.lights === 1 ? '' : 's'} reach painted lit.`
      : '';
    setPicNote(`${file.name}: ${notes.cols}\u00d7${notes.rows} squares, ${notes.walls} wall edges and ${notes.doors} door${notes.doors === 1 ? '' : 's'}.`
      + lit
      + ` A square is ${UVTT_METRES_PER_SQUARE} m, because these maps are drawn five feet to the square; change it under Grid if you read them otherwise.`
      + (!u.image ? ' The file has no picture in it, so it is laid on the tiled ground.' : '')
      + (!kept ? ' This browser would not keep the picture, so the walls and doors are on the tiled ground.' : '')
      + ' Choose the room the party starts in with the flag before playing it.');
  };
  const movePicture = (next) => patch({ backdrop: readBackdrop({ ...m.backdrop, ...next }) });
  // Wider or narrower, keeping the picture's shape.
  const sizePicture = (across) => {
    const b = m.backdrop;
    const media = mediaRef.current;
    const ratio = media && media.width ? media.height / media.width : b.h / b.w;
    movePicture({ w: across, h: across * ratio });
  };

  /* Grows the deck by repeating what is already built, rather than adding
     bare grid for the GM to paint. Nothing is asked first: it is additive
     where it grows, and `Expand deck` back to the old numbers puts it back —
     except where it SHRINKS, which drops squares, so that is confirmed. */
  const expandDeck = async () => {
    const plan = expandPlan(m, growCols, growRows);
    if (!onChange) return;
    if (m.backdrop) {
      setDeckMsg('A deck laid over a picture is as big as the picture. Change the grid in the Picture panel instead.');
      return;
    }
    /* THE DEFAULT GROWS FROM WHAT IS PAINTED. The painted deck stays where it
       is and new rooms are built in the added space, each joined to the deck
       and carrying its ground on. Repeating the deck (flipped or not) is still
       here for the one case it suits, a deck designed to be tiled. */
    if (growHow === 'grow' && !plan.shrinking) {
      const out = buildAroundDeck(m, { cols: plan.cols, rows: plan.rows, style: genStyle, seed: genSeed.trim() || undefined });
      setGenSeed(out.seed);
      const g = out.map;
      patch({ cols: g.cols, rows: g.rows, floor: g.floor, doors: g.doors, ground: g.ground });
      setDeckMsg(`Built ${out.rooms} new room${out.rooms === 1 ? '' : 's'} off the painted deck (seed ${out.seed}).`);
      return;
    }
    if (plan.shrinking && !await confirmInMap({
      title: 'Shrink the deck?',
      body: `${plan.cols}\u00d7${plan.rows} is smaller than this deck. Every square outside`
        + ' it is dropped, along with whatever is standing on it.',
      yes: 'Shrink it'
    })) return;
    remember(mapRef.current);
    gestureRef.current = false;
    onChange(expandMap(m, growCols, growRows, { mirror: growHow !== 'repeat' }));
    setDeckMsg('');
  };

  /* Lays out a deck: compartments, the runs between them, and a door at
     every junction. The seed is what makes it a deck rather than a roll —
     written down, it comes back, so an edit that goes wrong is recoverable
     and a layout worth keeping can be handed to someone else.

     REPLACES THE FLOOR, so it asks first when there is one. What it does not
     touch is the ground, the calibration or the deck's name: those are the
     GM's, and a generator that reset them would be taking more than it was
     asked for. */
  /* Lays terrain over the deck (or the whole grid) from the prompt and the
     grounds ticked. One undoable step, and it says what it understood. */
  const generateTerrainNow = () => {
    const ticked = terrainPick || [...new Set([m.theme, ...customThemes.map((t) => t.id)])];
    const out = generateTerrain({
      map: m, grounds: allGrounds, palette: ticked, prompt: terrainPrompt,
      seed: terrainSeed.trim() || undefined, size: terrainSize, scope: terrainScope,
      // On a blank deck this builds rooms and corridors to paint onto, and
      // uses the layout style the Deck panel is set to rather than a second
      // picker saying the same thing.
      style: genStyle
    });
    setTerrainSeed(out.seed);
    if (out.empty) {
      setTerrainNote('There is nothing to cover: the deck has no squares without terrain on them. Try \u201cOver the painted deck\u201d or \u201cThe whole grid\u201d.');
      return;
    }
    const next = { ground: out.ground, obscuring: out.obscuring, cover: out.cover, hazards: out.hazards };
    if (out.laid) next.floor = out.floor;
    // A layout it built brings its own bulkheads.
    if (out.built) next.doors = out.doors;
    patch(next);
    const c = out.counts;
    setTerrainNote(
      `${out.built ? `Built ${out.rooms} rooms and laid ` : 'Laid '}${c.squares.toLocaleString()} squares in ${c.regions} regions from ${c.grounds} ground${c.grounds === 1 ? '' : 's'}`
      + `${c.foliage ? `, ${c.foliage} of foliage` : ''}${c.cover ? `, ${c.cover} of cover` : ''}`
      + `${c.hazards ? `, ${c.hazards} of hazard` : ''}${c.band ? ', and a ' + (terrainRead.band ? terrainRead.band.kind : 'band') : ''}. Seed ${out.seed}.`);
  };

  /* The deck from the sketch (plandeck.js), in place of what is drawn:
     the ground, the grid, the calibration, the picture floor, the trigger
     zones, the areas and the sketch itself are kept, everything that stood on
     the old deck goes, and Undo brings it all back. The seed is kept on the
     sketch, so the same sketch makes the same deck again. */
  const generateFromSketch = async () => {
    if (!sketchPlan.rooms.length) { setSketchMsg('Draw a room first: a loop with the Room pen.'); return; }
    if (Object.keys(m.floor).length && !await confirmInMap({
      title: 'Replace the deck?',
      body: 'The sketch is built in place of what is drawn here. The ground, the grid size, the calibration and the'
        + ' sketch are kept. Undo brings this deck back.',
      yes: 'Generate it'
    })) return;
    const seed = (sketch.seed || '').trim() || newSeed();
    const d = deckFromPlan(sketchPlan, { cols: m.cols, rows: m.rows, layout: sketch.layout, seed, fill: sketch.fill });
    patch({
      floor: d.floor, doors: d.doors, markers: d.markers, hazards: d.hazards, start: d.start,
      cover: {}, contacts: {}, explored: {}, viewpoint: null, walls: {},
      sketch: { ...sketch, seed }
    });
    setSketchMsg(`Built ${d.rooms} room${d.rooms === 1 ? '' : 's'} from the sketch (seed ${seed}).`
      + (d.unplaced.length ? ` ${d.unplaced.join(' ')}` : ''));
  };

  /* A picture under the sketch: laid to fill the grid, to trace for nothing,
     or read (one of the day's images) into strokes that take the place of
     what is drawn, laid where the picture lies. Moving the picture moves the
     sketch with it, so what was traced or read stays on what it came from. */
  const chooseSketchPicture = async (file) => {
    if (!file) return;
    try {
      const pic = await pictureForSketch(file);
      setSketchPic({ ...pic, place: placePicture(pic.aspect, { cols: m.cols, rows: m.rows }), show: true });
      setSketchMsg('The picture is under the sketch. Trace it with the pens, or have it read.');
    } catch (e) {
      setSketchMsg(e.message || 'That picture would not open.');
    }
  };
  const readSketchPic = async () => {
    if (!sketchPic || sketchPicBusy) return;
    setSketchPicBusy(true);
    setSketchMsg('Reading the picture… about ten seconds.');
    try {
      const reading = await readSketchPicture({ data: sketchPic.data, source: sketchPicSource, note: sketchPicNote });
      if (!reading.rooms.length) {
        setSketchMsg(`No rooms could be read from it.${reading.unclear.length ? ' ' + reading.unclear.join(' ') : ''}`);
        return;
      }
      if (sketch.strokes.length && !await confirmInMap({
        title: 'Replace the sketch?',
        body: 'What was read from the picture takes the place of the strokes drawn here. Undo brings them back.',
        yes: 'Replace it'
      })) { setSketchMsg(''); return; }
      const place = placePicture(sketchPic.aspect, { cols: m.cols, rows: m.rows }, reading);
      const got = strokesFromReading(reading, place, sketchPic.aspect);
      setSketchPic((p) => p && { ...p, place, show: true });
      setSketch({ ...sketch, strokes: got.strokes.map(readStroke).filter(Boolean), plan: null, notes: got.notes });
      const nr = reading.rooms.length, nl = reading.links.length;
      setSketchMsg(`Read ${nr} room${nr === 1 ? '' : 's'} and ${nl} way${nl === 1 ? '' : 's'} between them`
        + `${reading.title ? ` from “${reading.title}”` : ''}. Check them against the picture and put right what is wrong with the`
        + ' pens, then Generate from sketch.');
    } catch (e) {
      setSketchMsg(e.message || 'The picture could not be read.');
    } finally {
      setSketchPicBusy(false);
    }
  };
  const placeSketchPic = (field, value) => {
    if (!sketchPic) return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const from = sketchPic.place;
    const to = { ...from, [field]: field === 'across' ? Math.min(MAX_GRID * 2, Math.max(2, n)) : Math.max(-MAX_GRID, Math.min(MAX_GRID, n)) };
    setSketchPic({ ...sketchPic, place: to });
    if (sketch.strokes.length) setSketch({ ...sketch, strokes: moveStrokes(sketch.strokes, from, to) });
  };

  /* Growing the deck from an example (wfc.js): the example is kept on the
     sketch, so the deck can be grown again from it with another seed after
     this one has been replaced. */
  const takeExample = (choice) => {
    const ex = choice === 'painted' ? exampleFromMap(m) : readExample(stockExample(choice));
    if (!ex) return;
    if (ex.error) { setSketchMsg(ex.error); return; }
    setSketch({ ...sketch, example: ex });
    setSketchMsg(`${ex.name || 'The example'} is the example: ${ex.rows[0].length - 2} × ${ex.rows.length - 2} squares. Grow the deck from it.`);
  };
  const growFromExample = async () => {
    const ex = sketch.example;
    if (!ex) return;
    if (Object.keys(m.floor).length && !await confirmInMap({
      title: 'Replace the deck?',
      body: 'A deck grown from the example takes the place of what is drawn here. The ground, the grid size, the calibration and'
        + ' the example are kept. Undo brings this deck back.',
      yes: 'Grow it'
    })) return;
    const seed = (sketch.seed || '').trim() || newSeed();
    const d = deckFromExample(ex, { cols: m.cols, rows: m.rows, seed });
    if (d.error) { setSketchMsg(d.error); return; }
    patch({
      floor: d.floor, doors: d.doors, markers: {}, hazards: {}, start: null,
      cover: {}, contacts: {}, explored: {}, viewpoint: null, walls: {},
      sketch: { ...sketch, seed }
    });
    setSketchMsg(`Grew ${d.rooms} room${d.rooms === 1 ? '' : 's'} from ${ex.name || 'the example'} (seed ${seed}), from ${d.patterns} patterns`
      + (d.joined ? `; ${d.joined} island${d.joined === 1 ? '' : 's'} joined by a corridor` : '')
      + (d.split ? `; ${d.split} wide opening${d.split === 1 ? '' : 's'} given a door` : '')
      + (d.merged ? `; ${d.merged} small room${d.merged === 1 ? '' : 's'} opened into the next` : '') + '.'
      + (d.clipped ? ` Grown over the first ${d.cols} × ${d.rows} squares of the grid.` : '')
      + (d.share > 0.5 ? ' It came out open, one room more than half of it: try another seed.' : ''));
  };

  const rollDeck = async () => {
    const seed = genSeed.trim() || newSeed();
    /* With a deck already painted, the default is to build around it: the
       generator fills the empty ground with rooms joined to what is there,
       and nothing painted is touched. Replacing it is the other choice. */
    if (Object.keys(m.floor).length && buildAround) {
      const built = buildAroundDeck(m, { cols: m.cols, rows: m.rows, style: genStyle, seed });
      setGenSeed(built.seed);
      const g = built.map;
      patch({ floor: g.floor, doors: g.doors, ground: g.ground });
      setDeckMsg(`Built ${built.rooms} new room${built.rooms === 1 ? '' : 's'} around the painted deck (seed ${built.seed}).`);
      return;
    }
    if (Object.keys(m.floor).length && !await confirmInMap({
      title: 'Replace the deck?',
      body: 'A generated layout takes the place of what is drawn here. The ground, the'
        + ' grid size and the calibration are kept. Undo brings this deck back.',
      yes: 'Generate it'
    })) return;
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

  /* The props that stand on that floor: sixteen doors, barriers, crates,
     pillars, fires and thickets, generated as ONE 4x4 sheet from the same
     description the floor came from.

     One image rather than sixteen, which is one call rather than sixteen —
     but the reason is not the bill. Generated one at a time they come back in
     sixteen different lights and sixteen degrees of wear, and a deck dressed
     in them looks like a collage; asked for together, the model is composing
     a set. It is the same reason the nine that ship are sheets. */
  const generateProps = async () => {
    if (!preview) return;
    setGenErr(''); setPropsBusy(true);
    try {
      const res = await fetch('/api/generate-texture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'sprites', describe: genDescribe, cover: genCover, condition: genCond
        })
      });
      if (!res.ok) {
        let why = `Generation failed (${res.status})`;
        try { why = (await res.json()).error || why; } catch { /* not json */ }
        throw new Error(why);
      }
      const sprites = await keySheet(await res.blob());
      if (sprites.length > MAX_CUSTOM_SPRITES) {
        throw new Error('That sheet came back too large to store. Try generating it again.');
      }
      setPreview((p) => (p ? { ...p, sprites } : p));
    } catch (e) {
      setGenErr(e.message || 'Generation failed');
    } finally {
      setPropsBusy(false);
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
      // Null rather than absent when there are none: the store reads an
      // absent sheet as "leave what is there alone", which is what renaming a
      // dressed ground wants, and an explicit null as "it has none".
      sprites: preview.sprites || null,
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

  // The whole deck, drawn into a canvas of its own: the one on screen is only
  // the part in view. Scaled down so a very big deck stays a picture a browser
  // will make rather than a canvas it refuses.
  const exportPng = () => {
    const doc = (win || window).document;
    const scale = Math.min(1, 8000 / (Math.max(m.cols, m.rows) * px));
    const c = doc.createElement('canvas');
    c.width = Math.max(1, Math.round(m.cols * px * scale));
    c.height = Math.max(1, Math.round(m.rows * px * scale));
    paint(c.getContext('2d'), { left: 0, top: 0, width: c.width, height: c.height, zoom: scale });
    const el = doc.createElement('a');
    el.download = `boarding-map-${m.theme}.png`;
    el.href = c.toDataURL('image/png');
    el.click();
  };

  /* ---- the right-click menu ----
     The toolbar can be hidden for a clean map, and the map is then all there
     is on the glass. A right click brings up the tools and what they need
     without bringing the toolbar back: pick a tool, set its option (door kind,
     brush, terrain, weapon…), switch fog, set the light, undo, turn, zoom.
     Everything here is what the toolbar does, through the same handlers.

     Every choice closes the menu; only a group's heading unfolds it. */
  const doMenu = (fn) => () => { fn(); setMenu(null); };
  const radio = (key, label, checked, run) => ({ key, label, checked, run });
  const menuGroups = () => {
    const out = [];
    const add = (id, title, items) => out.push({
      id, title, items, current: (items.find((i) => i.checked) || {}).label || ''
    });
    if (mode === 'stamp') {
      add('tile', 'Tile', TILE_CATALOG.map((t) => radio(t.id, `${t.name} (${t.w}\u00d7${t.h})`, tileId === t.id, () => setTileId(t.id))));
    }
    if (mode === 'light') {
      add('lighttype', 'Light', LIGHTING_PRESETS.map((lp) => radio('lt' + lp.id,
        lp.id === m.lighting ? `${lp.name} (the deck\u2019s own \u2014 lifts paint)` : lp.name, lightType === lp.id, () => setLightType(lp.id))));
      add('lightscope', 'A click lights', [
        radio('room', 'The whole room', lightScope === 'room', () => setLightScope('room')),
        radio('brush', 'Squares, with the brush', lightScope === 'brush', () => setLightScope('brush'))
      ]);
    }
    if (mode === 'marker' && markerType === 'turret') {
      add('facing', 'Turret faces', FACINGS.map((f, i) => radio('f' + i, f, turretFacing === i, () => setTurretFacing(i))));
    }
    if (['paint', 'erase', 'ground', 'obscure'].includes(mode) || (mode === 'light' && lightScope === 'brush')) {
      add('brush', 'Brush size', [1, 2, 3, 5, 7, 10].map((n) => radio('b' + n, `${n}\u00d7${n}`, brush === n, () => setBrush(n))));
    }
    if (mode === 'ground') {
      add('terrain', 'Terrain', [
        radio('own', `This deck's ground (${theme.name}) \u2014 lifts paint`, paintGround === m.theme, () => setPaintGround(m.theme)),
        ...allGrounds.filter((t) => t.id !== m.theme).map((t) => radio(t.id, t.name + (t.custom ? ' \u2605' : ''), paintGround === t.id, () => setPaintGround(t.id)))
      ]);
    }
    if (mode === 'obscure') {
      add('density', 'Density', OBSCURING.map((o) => radio(o.id, `${o.name} \u00b7 stops sight after ${o.blocksAfterM} m`, obscureType === o.id, () => setObscureType(o.id))));
    }
    if (mode === 'door') add('door', 'Door kind', DOOR_KINDS.map((d) => radio(d.id, `${d.name} \u00b7 AP ${d.ap}`, doorKind === d.id, () => setDoorKind(d.id))));
    if (mode === 'cover') {
      add('cover', 'Cover', COVER_TYPES.map((c) => radio(c.id, `${c.name} \u00b7 AP ${c.ap}`, coverType === c.id, () => setCoverType(c.id))));
      // Reachable with the toolbars hidden, which is how the map is run on a
      // projector \u2014 and laying a barrier is exactly a mid-session job.
      if (coverType === 'low') {
        add('coverturn', 'Barrier lies', [
          radio('across', 'Across \u2014 horizontal', coverTurn === 0, () => setCoverTurn(0)),
          radio('along', 'Along \u2014 vertical', coverTurn === 1, () => setCoverTurn(1))
        ]);
      }
    }
    if (mode === 'hazard') add('hazard', 'Hazard', HAZARD_TYPES.map((h) => radio(h.id, h.name, hazardType === h.id, () => setHazardType(h.id))));
    if (mode === 'noise') add('noise', 'Sound', NOISE.map((n) => radio(n.id, `${n.name} \u00b7 heard to ${n.radiusM} m`, noiseKind === n.id, () => setNoiseKind(n.id))));
    if (mode === 'marker') add('marker', 'Marker', MARKER_TYPES.map((t) => radio(t.id, t.name, markerType === t.id, () => setMarkerType(t.id))));
    if (mode === 'contact') {
      add('enc', 'Encounter', [
        radio('none', '\u2014 none \u2014', !contactEnc, () => { setContactEnc(''); setContactHostile(''); }),
        ...encounters.map((e) => radio(e.id, e.name || 'Untitled', contactEnc === e.id, () => { setContactEnc(e.id); setContactHostile(''); }))
      ]);
      const enc = encounters.find((e) => e.id === contactEnc);
      if (enc) add('hostile', 'Hostile', (enc.hostiles || []).map((h, i) => radio('h' + i, h.name, contactHostile === String(i), () => setContactHostile(String(i)))));
    }
    if (mode === 'overlay' || mode === 'measure') {
      add('weapon', 'Weapon', [
        radio('none', 'No weapon', !weaponKey, () => setWeaponKey('')),
        ...ARMED.map((a) => radio(a.key, `${a.label} \u00b7 ${a.kind}`, weaponKey === a.key, () => setWeaponKey(a.key))),
        ...(mode === 'overlay' ? POWER_GROUPS.flatMap((g) => g.items.map((i) =>
          radio(i.key, `${i.label} \u00b7 ${g.group}`, weaponKey === i.key, () => setWeaponKey(i.key)))) : [])
      ]);
    }
    add('light', 'The deck\u2019s light', LIGHTING_PRESETS.map((p) => radio(p.id, p.name, m.lighting === p.id, () => patch({ lighting: p.id }))));
    return out;
  };
  const menuActions = () => {
    const a = [];
    /* THE DOOR UNDER THE POINTER. A click opens or shuts a door and nothing
       else, so jamming one — the mechanism wrecked, the lock fused — is asked
       for here, by name, on the door that was right-clicked. */
    const at = menu && menu.cell;
    const here = at && m.doors[cellKey(at.x, at.y)];
    if (here) {
      for (const st of DOOR_STATES) {
        a.push({
          key: 'door-' + st,
          label: `${st === 'jammed' ? 'Jam' : st === 'open' ? 'Open' : 'Shut'} the ${
            doorKindById(here.kind).name.toLowerCase()}`,
          checked: here.state === st,
          run: () => clickDoor({ x: at.x, y: at.y }, st)
        });
      }
    }
    /* A TERMINAL UNDER THE POINTER. Its state by name, and — once the party
       is in — what it can do: work the doors of its room, hand over the
       deck's plan, or sweep for contacts from where it stands. */
    const term = at ? terminalAt(m, at) : null;
    if (term) {
      for (const [st, label] of [['locked', 'Terminal locked'], ['open', 'Terminal accessed'], ['dead', 'Terminal burnt out']]) {
        a.push({ key: 'term-' + st, label, checked: term.state === st, run: () => patch(setTerminal(m, at, st)) });
      }
      if (term.state === 'open') {
        const doorsTo = (state, label) => ({
          key: 'term-doors-' + state, label,
          run: () => {
            const p = workRoomDoors(m, at, state);
            if (p) patch(p);
            else confirmInMap({ title: 'No doors', body: 'This terminal\u2019s room has no doors for it to work.', yes: 'Done', info: true });
          }
        });
        a.push(doorsTo('open', 'Open every door in this room'));
        a.push(doorsTo('closed', 'Seal every door in this room'));
        a.push(doorsTo('jammed', 'Lock every door in this room'));
        a.push({ key: 'term-plan', label: 'Download the deck plan', run: () => patch(downloadSchematics(m)) });
        a.push({ key: 'term-sweep', label: 'Auspex sweep from the terminal', run: () => patch({ contacts: auspexSweep(m, at, auspexM) }) });
        // The deck's defence grid, when it has one.
        const guns = Object.values(m.markers).filter((v) => v.type === 'turret');
        if (guns.length) {
          if (guns.some((v) => v.state === 'active')) {
            a.push({ key: 'term-guns-off', label: 'Shut down the deck\u2019s turrets', run: () => patch(setDeckTurrets(m, 'off')) });
          }
          if (guns.some((v) => v.state === 'off')) {
            a.push({ key: 'term-guns-on', label: 'Wake the deck\u2019s turrets', run: () => patch(setDeckTurrets(m, 'active')) });
          }
        }
      }
    }
    /* A TURRET UNDER THE POINTER: turned an eighth at a time, and switched off
       or woken. A click in play does the switching too. */
    const gun = at ? turretAt(m, at) : null;
    if (gun) {
      a.push({ key: 'tur-on', label: 'Turret active', checked: gun.state === 'active', run: () => patch(setTurret(m, at, { state: 'active' })) });
      a.push({ key: 'tur-off', label: 'Turret switched off', checked: gun.state === 'off', run: () => patch(setTurret(m, at, { state: 'off' })) });
      a.push({ key: 'tur-left', label: `Turn it left (now facing ${FACINGS[gun.facing].toLowerCase()})`, run: () => patch(setTurret(m, at, { turn: -1 })) });
      a.push({ key: 'tur-right', label: 'Turn it right', run: () => patch(setTurret(m, at, { turn: 1 })) });
    }
    /* COVER UNDER THE POINTER. A hit that gets through it costs it an Armour
       Point; a GM who wants it back patches it. Promethium goes up. */
    const cov = at ? readCover(m.cover[cellKey(at.x, at.y)]) : null;
    const covType = cov && coverById(cov.id);
    if (covType) {
      const left = covType.ap - cov.wear;
      const blowUp = (p) => {
        if (!p) return;
        patch({ cover: p.cover, hazards: p.hazards });
        confirmInMap({
          title: 'The tanks go up',
          body: `${p.tanks === 1 ? 'The tank goes' : `${p.tanks} tanks go`} up. ${p.burnt.length} squares are burning.`,
          yes: 'Done', info: true
        });
      };
      if (!covType.sturdy) {
        a.push({
          key: 'cov-hit', label: left > 1 ? `Shot through: \u22121 AP (${left - 1} left)` : (covType.volatile ? 'Shot through: it goes up' : 'Shot through: it is gone'),
          run: () => {
            const p = wearCover(m, at, 1);
            if (p && p.blew) blowUp(p); else if (p) patch({ cover: p.cover });
          }
        });
      }
      if (cov.wear) a.push({ key: 'cov-fix', label: `Patch it up (back to ${covType.ap} AP)`, run: () => patch(wearCover(m, at, -cov.wear)) });
      if (covType.volatile) a.push({ key: 'cov-boom', label: 'Set the tanks off', run: () => blowUp(detonateTank(m, at)) });
    }
    /* A VENT UNDER THE POINTER: into it and out of the far end, if it has one. */
    const mkAt = at ? m.markers[cellKey(at.x, at.y)] : null;
    if (mkAt && mkAt.type === 'vent') {
      const far = ventPartner(m, at);
      a.push(far
        ? { key: 'vent-go', label: `Crawl through to the other end (${far.x},${far.y})`, run: () => patch(crawlThrough(m, at)) }
        : { key: 'vent-none', label: 'This vent leads nowhere yet: lay a second to join it', disabled: true, run: () => {} });
    }
    /* A WARP RIFT UNDER THE POINTER: the warp's own tables, rolled where it
       happened. Phenomena of 75 or more escalates to Perils, as the rules
       have it, and both results are shown together. */
    if (at && m.hazards[cellKey(at.x, at.y)] === 'warp') {
      const d100 = () => 1 + Math.floor(Math.random() * 100);
      const say = (r) => (r ? `${r.name}. ${r.effect}` : 'Nothing comes of it.');
      a.push({
        key: 'warp-phen', label: 'Roll Psychic Phenomena',
        run: () => {
          const roll = d100();
          const ph = phenomenaResult(roll);
          let body = `${roll}: ${say(ph)}`;
          if (escalatesToPerils(roll)) {
            const pr = d100();
            body += ` The warp does not let go. Perils of the Warp, ${pr}: ${say(perilsResult(pr))}`;
          }
          confirmInMap({ title: 'Psychic Phenomena', body, yes: 'Done', info: true });
        }
      });
      a.push({
        key: 'warp-perils', label: 'Roll Perils of the Warp',
        run: () => {
          const roll = d100();
          confirmInMap({ title: 'Perils of the Warp', body: `${roll}: ${say(perilsResult(roll))}`, yes: 'Done', info: true });
        }
      });
      // The GM's lever for a rift left open: once a round, or when the dice say.
      a.push({
        key: 'warp-spread', label: 'Spread the warp (every rift grows a square)',
        run: () => {
          const p = spreadWarp(m);
          if (p) patch({ hazards: p.hazards });
          else confirmInMap({ title: 'The warp is held', body: 'No rift on the deck has anywhere to grow: walls, doors and holy ground hold it.', yes: 'Done', info: true });
        }
      });
      a.push({ key: 'warp-seal', label: 'Seal this rift', run: () => patch(sealWarp(m, at)) });
    }
    if (library) {
      a.push({ key: 'library', label: 'Library\u2026 (decks, environments, files)', icon: 'save',
        run: () => { setLibOpen(true); setShowOptions(true); } });
    }
    if (mode === 'stamp') a.push({ key: 'rot', label: `Rotate the tile (now ${rotation}\u00b0)`, hint: 'R', run: () => setRotation((r) => (r + 90) % 360) });
    if (mode === 'ground') {
      a.push({
        key: 'terrain', label: 'Procedural terrain\u2026', icon: 'ground',
        run: () => { setGroundTab('terrain'); setGenOpen(true); setShowOptions(true); }
      });
    }
    if (mode === 'fog') {
      if (m.start) a.push({ key: 'restart', label: 'Back to the starting room', run: () => patch(startPlay(m)) });
      a.push({ key: 'reveal', label: 'Reveal everything', run: () => patch({ explored: allExplored() }) });
      a.push({ key: 'hide', label: 'Hide everything', run: () => patch({ explored: {} }) });
    }
    if (mode === 'overlay') {
      a.push({ key: 'bands', label: 'Range bands', checked: showRings, run: () => setShowRings((v) => !v) });
      a.push({ key: 'los', label: 'Line of sight', checked: showLos, run: () => setShowLos((v) => !v) });
      a.push({ key: 'clear', label: 'Clear the overlay', run: () => { originRef.current = null; setOrigin(null); setAim(null); } });
    }
    return a;
  };
  /* ---- what the right-clicked square can be given ----
     The tools lay hazards, smoke and tokens by clicking, and that means picking
     the tool first, which is a trip to the toolbar the projector view does not
     have. So the square under the pointer can be given these directly, on either
     tab and with whatever tool is in hand: set fire to it, fill it with smoke,
     mark it as a target, drop a hostile on it. Choosing what is already there
     takes it off again, the way the tools do. */
  const hereCell = menu && menu.cell ? menu.cell : null;
  const hereKey = hereCell ? cellKey(hereCell.x, hereCell.y) : null;
  const hereHas = hereCell
    ? Boolean(m.hazards[hereKey] || m.obscuring[hereKey] || m.markers[hereKey] || m.contacts[hereKey])
    : false;
  const hereGroups = () => {
    if (!hereCell) return [];
    const out = [];
    const add = (id, title, items) => out.push({
      id, title, items, current: (items.find((i) => i.checked) || {}).label || ''
    });
    /* A door or hatch on this square, of any kind: the Door tool without the
       tool. A square that already has one keeps its state when the kind is
       changed, so a jammed hatch swapped for a bulkhead is still jammed. Its
       open, closed and jammed are further up the menu, and "Remove the door"
       is below. */
    add('h-door', 'Door or hatch', DOOR_KINDS.map((d) => radio('dr-' + d.id, `${d.name} \u00b7 AP ${d.ap}`,
      Boolean(m.doors[hereKey] && m.doors[hereKey].kind === d.id), () => {
        const doors = { ...m.doors };
        const here = doors[hereKey];
        doors[hereKey] = { ...(here || {}), kind: d.id, state: here ? here.state : 'closed' };
        patch({ doors });
      })));
    add('h-hazard', 'Fire, gas, radiation\u2026', HAZARD_TYPES.map((h) => radio('hz-' + h.id, h.name, m.hazards[hereKey] === h.id, () => {
      const hazards = { ...m.hazards };
      if (hazards[hereKey] === h.id) delete hazards[hereKey]; else hazards[hereKey] = h.id;
      patch({ hazards });
    })));
    add('h-smoke', 'Smoke or foliage', OBSCURING.map((o) => radio('sm-' + o.id, `${o.name} \u00b7 ${cloud}\u00d7${cloud}`, m.obscuring[hereKey] === o.id, () => {
      const obscuring = { ...m.obscuring };
      const lifting = obscuring[hereKey] === o.id;
      for (const c of brushCells(hereCell, cloud, m)) {
        const ck = cellKey(c.x, c.y);
        if (lifting) delete obscuring[ck]; else obscuring[ck] = o.id;
      }
      patch({ obscuring });
    })));
    add('h-cloud', 'Cloud size', [1, 3, 5, 7].map((n) => radio('cl' + n, `${n}\u00d7${n}`, cloud === n, () => setCloud(n))));
    /* The light in the room this square is in: the lumens failing in one
       compartment, a hold filling with smoke. The deck's own light lifts it. */
    if (m.floor[hereKey]) {
      const roomLight = m.light[hereKey] || m.lighting;
      add('h-light', 'Light in this room', LIGHTING_PRESETS.map((lp) => radio('lt-' + lp.id,
        lp.id === m.lighting ? `${lp.name} (the deck\u2019s own)` : lp.name, roomLight === lp.id, () => {
          const light = { ...m.light };
          for (const c of regionAt(m, hereCell)) {
            const ck = cellKey(c.x, c.y);
            if (lp.id === m.lighting) delete light[ck]; else light[ck] = lp.id;
          }
          patch({ light });
        })));
    }
    /* A target is an Objective that carries a bonus to hit. The plain kinds
       below it are the scenery the Marker tool lays, with no bonus. */
    const mkHere = m.markers[hereKey] || null;
    add('h-token', 'Target or token', [
      radio('mk-target', `Target (${TARGET_BONUS >= 0 ? '+' : ''}${TARGET_BONUS} to hit)`,
        Boolean(mkHere && Number.isFinite(mkHere.bonus)), () => {
          const markers = { ...m.markers };
          if (markers[hereKey] && Number.isFinite(markers[hereKey].bonus)) delete markers[hereKey];
          else markers[hereKey] = { type: 'objective', label: 'Target', bonus: TARGET_BONUS };
          patch({ markers });
        }),
      ...MARKER_TYPES.map((t) => radio('mk-' + t.id, t.name,
        Boolean(mkHere && mkHere.type === t.id && !Number.isFinite(mkHere.bonus)), () => {
          const markers = { ...m.markers };
          if (markers[hereKey] && markers[hereKey].type === t.id && !Number.isFinite(markers[hereKey].bonus)) delete markers[hereKey];
          else if (t.id === 'vent') { patch(placeVent({ ...m, markers }, hereCell, t.name)); return; }
          else markers[hereKey] = t.id === 'turret'
            ? { type: 'turret', label: t.name, facing: turretFacing }
            : { type: t.id, label: markerTypeById(t.id).name };
          patch({ markers });
        }))
    ]);
    if (mkHere && Number.isFinite(mkHere.bonus)) {
      add('h-bonus', 'Bonus to hit this target', [5, 10, 20].map((n) => radio('bn' + n, `+${n}`, mkHere.bonus === n, () => {
        patch({ markers: { ...m.markers, [hereKey]: { ...mkHere, bonus: n } } });
      })));
    }
    // The hostiles an encounter was prepared with, as contacts the table has
    // not found yet: the same thing the Contacts tool lays, without picking it.
    const pool = [];
    for (const e of encounters) (e.hostiles || []).forEach((h, i) => pool.push({ e, h, i }));
    if (pool.length) {
      add('h-hostile', 'Hostile contact', pool.slice(0, 24).map(({ e, h, i }) => radio(
        `ct-${e.id}-${i}`, encounters.length > 1 ? `${h.name} \u00b7 ${e.name || 'Untitled'}` : h.name,
        Boolean(m.contacts[hereKey] && m.contacts[hereKey].encounterId === e.id && m.contacts[hereKey].hostileId === String(i)),
        () => {
          const contacts = { ...m.contacts };
          const here = contacts[hereKey];
          if (here && here.encounterId === e.id && here.hostileId === String(i)) delete contacts[hereKey];
          else contacts[hereKey] = { name: h.name, encounterId: e.id, hostileId: String(i), state: 'hidden' };
          patch({ contacts });
        }
      )));
    }
    return out;
  };
  const clearHere = () => {
    const hazards = { ...m.hazards }; const obscuring = { ...m.obscuring };
    const markers = { ...m.markers }; const contacts = { ...m.contacts };
    delete hazards[hereKey]; delete obscuring[hereKey]; delete markers[hereKey]; delete contacts[hereKey];
    patch({ hazards, obscuring, markers, contacts });
  };
  /* ---- the firing overlay, from the menu ----
     The overlay is two clicks and a weapon: where the firer stands, what they
     point at. With the toolbars hidden (full screen, the projector) there is
     nowhere to pick the weapon and no way to set either square except by
     already holding the Overlay tool, so the menu does all three from any tool,
     on either tab. Choosing "Fire from here" brings the Overlay tool up with
     it, on the Play tab where it lives, so the rings and the line are drawn. */
  const openOverlay = () => {
    if (tabRef.current !== 'play') chooseTab('play');
    modeRef.current = 'overlay';
    setMode('overlay');
  };
  const overlayItems = () => {
    if (!hereCell) return [];
    const a = [];
    if (origin) {
      const name = (ARMED.find((x) => x.key === weaponKey) || {}).label;
      const shot = weapon && weapon.range
        ? reachBetween({ from: origin, to: hereCell, map: m, weaponRangeM: weapon.range }) : null;
      const sign = (n) => `${n >= 0 ? '+' : ''}${n}`;
      a.push({
        key: 'ov-info', disabled: true,
        label: `From ${origin.x},${origin.y}${name ? ` with ${name}` : ''}`
          + (shot ? ` \u00b7 here ${shot.metres} m, ${shot.band.replace('_', ' ')}, `
            + (shot.total === null ? 'out of range' : `${sign(shot.total)} to hit${shot.marked ? ' (target)' : ''}`)
            + targetConditions(shot, hereCell) : '')
      });
      a.push({ key: 'ov-aim', label: 'Aim at here', icon: 'overlay', run: () => { openOverlay(); setAim(hereCell); } });
    }
    a.push({
      key: 'ov-from', label: origin ? 'Fire from here instead' : 'Fire from here', icon: 'overlay',
      run: () => { openOverlay(); originRef.current = hereCell; setOrigin(hereCell); setAim(null); }
    });
    if (origin && mode !== 'overlay') {
      a.push({ key: 'ov-clear', label: 'Clear the overlay', run: () => { originRef.current = null; setOrigin(null); setAim(null); } });
    }
    return a;
  };
  // The weapon is a group in the Overlay and Measure tools' own menu already;
  // from any other tool it is offered here, so it can be chosen before firing.
  const overlayGroups = () => {
    if (!hereCell || mode === 'overlay' || mode === 'measure') return [];
    return [{
      id: 'h-weapon', title: 'Weapon',
      current: (ARMED.find((x) => x.key === weaponKey) || {}).label || powerLabel(weaponKey),
      items: [
        radio('none', 'No weapon', !weaponKey, () => setWeaponKey('')),
        ...ARMED.map((x) => radio(x.key, `${x.label} \u00b7 ${x.kind}`, weaponKey === x.key, () => setWeaponKey(x.key))),
        ...POWER_GROUPS.flatMap((g) => g.items.map((i) =>
          radio(i.key, `${i.label} \u00b7 ${g.group}`, weaponKey === i.key, () => setWeaponKey(i.key))))
      ]
    }];
  };
  const renderGroup = (g) => (
    <div key={g.id} className="rt-bm-menu-group">
      <button type="button" className="rt-bm-menu-item head" aria-expanded={menuOpen === g.id}
        onClick={() => setMenuOpen(menuOpen === g.id ? null : g.id)}>
        <span className="rt-bm-menu-tick">{menuOpen === g.id ? '\u25BE' : '\u25B8'}</span>
        <span>{g.title}</span>
        <em>{g.current}</em>
      </button>
      {menuOpen === g.id && <div className="rt-bm-menu-list">{g.items.map(menuItem)}</div>}
    </div>
  );
  const menuItem = (i) => (
    <button key={i.key} type="button" disabled={i.disabled}
      role={i.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={i.checked}
      className={'rt-bm-menu-item' + (i.checked ? ' on' : '')} onClick={doMenu(i.run)}>
      {i.icon ? <Icon name={i.icon} size={15} /> : <span className="rt-bm-menu-tick">{i.checked ? '\u2713' : ''}</span>}
      <span>{i.label}</span>
      {i.hint ? <kbd>{i.hint}</kbd> : null}
    </button>
  );

  // Kept on the screen: opened low or at the right edge, it is moved back in.
  useLayoutEffect(() => {
    if (!menu) return;
    const el = menuRef.current;
    if (!el) return;
    const w = win || window;
    const r = el.getBoundingClientRect();
    setMenuAt({
      x: Math.max(4, Math.min(menu.x, w.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(menu.y, w.innerHeight - r.height - 4))
    });
    /* The menu is taller than a small or full-screen window can show, and it
       scrolls. A group that has just been unfolded is brought into view, or its
       list would open below the edge with nothing to say it was there. */
    const list = el.querySelector('.rt-bm-menu-list');
    if (list && list.scrollIntoView) list.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, menuOpen]);

  // A click elsewhere, Escape, or leaving the window closes it. The click that
  // dismisses it on the map is not also a click on the map.
  useEffect(() => {
    if (!menu) return undefined;
    const w = win || window;
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setMenu(null);
      if (e.button === 0 && stageRef.current && stageRef.current.contains(e.target)) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); setMenu(null); } };
    const close = () => setMenu(null);
    w.addEventListener('mousedown', onDown, true);
    w.addEventListener('keydown', onKey);
    w.addEventListener('blur', close);
    w.addEventListener('resize', close);
    return () => {
      w.removeEventListener('mousedown', onDown, true);
      w.removeEventListener('keydown', onKey);
      w.removeEventListener('blur', close);
      w.removeEventListener('resize', close);
    };
  }, [menu, win]);

  const bar = calibrationBar(m, { targetMm: 100 });
  const tool = MODES.find((x) => x.id === mode) || MODES[0];

  return (
    <div className={'rt-bm' + (win ? ' rt-bm-win' : '') + (isFull ? ' rt-bm-full' : '')} style={{ position: 'relative' }}>
      {!showOptions && (
        <button type="button" className="rt-btn rt-bm-peek" onClick={() => setShowOptions(true)}
          title="Show the map options (H)">Options</button>
      )}
      {/* THE OVERLAY'S OWN PICKER, with everything else hidden.

          A projected map is run with the toolbars away, and the overlay is
          the one tool that is used WHILE it is projected: the GM aims a
          weapon, the table watches the ring. Changing which weapon meant
          bringing the whole menu up over the deck the table is looking at,
          so the overlay keeps a picker of its own — just the weapon and a
          way to clear it. */}
      {!showOptions && mode === 'overlay' && (
        <div className="rt-bm-aim">
          <select value={weaponKey} aria-label="Weapon or power for the overlay"
            onChange={(e) => setWeaponKey(e.target.value)}>
            <WeaponOptions />
          </select>
          {origin && (
            <button type="button" className="rt-btn ghost"
              onClick={() => { originRef.current = null; setOrigin(null); setAim(null); }}>Clear</button>
          )}
        </div>
      )}
      {showOptions && (
      <div className="rt-bm-opts">
      <div className="rt-bm-bar rt-bm-top">
        {/* Build the deck, or play it. What is in the rest of this bar, and in
            the right-click menu, follows the tab. */}
        <div className="rt-bm-group rt-bm-tabs" role="tablist" aria-label="Map tabs">
          {[['build', 'Build'], ['play', 'Play']].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id}
              className={'rt-btn rt-bm-mode rt-bm-tab' + (tab === id ? ' on' : '')}
              title={id === 'play'
                ? 'Run the deck: click doors to open, close or jam them, click rooms to reveal them'
                : 'Draw the deck: tiles, floor, doors, cover, hazards and the starting room'}
              onClick={() => chooseTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'build' && <select value={m.theme}
          onChange={(e) => patch({ theme: e.target.value, customTexture: null })}>
          <optgroup label="Built in">
            {MAP_THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
          {customThemes.length > 0 && (
            <optgroup label="My grounds">
              {customThemes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          )}
        </select>}

        {/* Panels, folded away until wanted. */}
        <div className="rt-bm-group" role="group" aria-label="Panels">
          {tab === 'build' && (
            <button type="button"
              className={'rt-btn rt-bm-mode' + (genOpen ? ' on' : '')}
              onClick={() => setGenOpen((v) => !v)}>
              Ground{m.customTexture ? ' · generated' : ''}
            </button>
          )}
          {tab === 'build' && (
            <button type="button"
              className={'rt-btn rt-bm-mode' + (deckOpen ? ' on' : '')}
              onClick={() => setDeckOpen((v) => !v)}>
              Deck
            </button>
          )}
          {tab === 'build' && (
            <button type="button"
              className={'rt-btn rt-bm-mode' + (picOpen ? ' on' : '')}
              title="Lay one picture or looping video over the grid, in place of the tiled ground"
              onClick={() => setPicOpen((v) => !v)}>
              Picture{m.backdrop ? (mediaState === 'missing' ? ' \u00b7 not here' : ' \u00b7 on') : ''}
            </button>
          )}
          <IconButton icon="save" label="Save and load decks" on={libOpen} onClick={() => setLibOpen((v) => !v)} />
          {tab === 'build' && <IconButton icon="grid" label="Grid, scale and light" on={gridOpen} onClick={() => setGridOpen((v) => !v)} />}
        </div>

        {/* The tools: one icon each, the name in the tooltip, and the active
            one named in the row of options below. */}
        <div className="rt-bm-group" role="group" aria-label="Tools">
          {toolsOf(tab).map((x) => (
            <IconButton key={x.id} icon={x.icon} label={x.label} on={mode === x.id}
              onClick={() => pickTool(x.id)} />
          ))}
        </div>

        <div className="rt-bm-group" role="group" aria-label="View">
          <IconButton icon="pan" label="Pan: drag the map to move it (or hold Space)" on={panOn}
            onClick={() => setPanOn((v) => !v)} />
          <IconButton icon="zoomOut" label="Zoom out" onClick={() => zoomAt(zoomRef.current / 1.25)} />
          {/* Reads its own value, so it needs no tooltip of ours — but it did
              need a name, which it had only for the pointer. */}
          <button type="button" className="rt-ico-btn rt-ico-text"
            title="Back to 100%. Hold Z or the right button and scroll to zoom."
            aria-label={`Zoom ${Math.round(zoom * 100)}%. Click for 100%.`}
            onClick={() => zoomAt(1)}>{Math.round(zoom * 100)}%</button>
          <IconButton icon="zoomIn" label="Zoom in" onClick={() => zoomAt(zoomRef.current * 1.25)} />
          <IconButton icon="fit" label="Fit the grid to the screen" onClick={fitToStage} />
        </div>

        <div className="rt-bm-group" role="group" aria-label="Edit">
          <IconButton icon="undo" label="Undo (Cmd/Ctrl+Z)" onClick={undo}
            disabled={historyRef.current.past.length === 0} />
          <IconButton icon="redo" label="Redo (Shift+Cmd/Ctrl+Z)" onClick={redo}
            disabled={historyRef.current.future.length === 0} />
          {tab === 'build' && <IconButton icon="rotateLeft" label="Turn what is painted 90° anticlockwise (R+Shift+click)" onClick={() => rotateMapBy(-1)} />}
          {tab === 'build' && <IconButton icon="rotateRight" label="Turn what is painted 90° clockwise (R+click)" onClick={() => rotateMapBy(1)} />}
        </div>

        <div className="rt-bm-group" role="group" aria-label="Deck">
          <IconButton icon="download" label="Export the deck as a PNG" onClick={exportPng} />
          <IconButton icon="trash" label="Clear the deck" onClick={clearAll} />
        </div>

        <div className="rt-bm-group" role="group" aria-label="Window">
          <IconButton icon="hide" label="Hide the options for a clean map (H). Right-click the map for a menu." onClick={() => setShowOptions(false)} />
          {win && (<>
            <IconButton icon="full" label={isFull ? 'Leave full screen (F)' : 'Full screen (F)'} on={isFull} onClick={toggleFullscreen} />
            <IconButton icon="present" label="Full screen with the options hidden, for the projector (P)" onClick={present} />
          </>)}
        </div>
        {turnNote ? <span className="rt-bm-hint">{turnNote}</span> : null}
      </div>

      {m.backdrop && mediaState === 'missing' && !picOpen && (
        <p className="rt-warn">
          This deck is laid over {m.backdrop.name ? `\u201c${m.backdrop.name}\u201d` : 'a picture'}, which is not on this
          computer. It is drawn on its tiled ground until the file is chosen again in the Picture panel.
        </p>
      )}

      {picOpen && (
        <div className="rt-bm-gen">
          <div className="rt-sechead">
            <h4>Picture floor</h4>
            <button type="button" className="rt-btn ghost" onClick={() => setPicOpen(false)}>Close</button>
          </div>
          <p className="rt-bm-hint">
            One picture or looping video laid over the grid in place of the tiled ground: a battle map drawn in another
            program, or a moving map made for a TV. The file stays in this browser on this computer; the deck only
            remembers which file it is and where it lies.
          </p>
          <div className="rt-bm-bar">
            <button type="button" className="rt-btn" onClick={() => importFileRef.current && importFileRef.current.click()}
              title="A Universal VTT export: the picture, its walls, its doors and its lights, all at once">
              Import a map from Dungeondraft or Dungeon Alchemist{'\u2026'}
            </button>
            <input ref={importFileRef} type="file" hidden aria-label="Map export to import"
              accept=".dd2vtt,.uvtt,.df2vtt,.json,application/json"
              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; importMapFile(f); }} />
            <span className="rt-bm-hint">.dd2vtt, .uvtt or .df2vtt {'\u2014'} DungeonFog and Arkenforge export the same.</span>
          </div>
          {!m.backdrop ? (
            <div className="rt-bm-bar">
              <label className="rt-bm-num"><span>Its size</span>
                <select value={picHow} aria-label="How big the picture is" onChange={(e) => setPicHow(e.target.value)}>
                  <option value="grid">Drawn at so many pixels to the square</option>
                  <option value="tv">Made for a TV, an inch to the square</option>
                  <option value="across">So many squares across</option>
                </select>
              </label>
              {picHow === 'grid' && (
                <label className="rt-bm-num"><span>Pixels / square</span>
                  <input type="number" min={10} max={2000} value={picPps} aria-label="Pixels to the square"
                    onWheel={(e) => e.currentTarget.blur()} onFocus={selectAll} onDoubleClick={selectAll}
                    onChange={(e) => { noLeadingZero(e.target); setPicPps(e.target.value); }} />
                </label>
              )}
              {picHow === 'tv' && (
                <label className="rt-bm-num"><span>Screen</span>
                  <select value={picTv} aria-label="Screen size" onChange={(e) => setPicTv(e.target.value)}>
                    {TV_SIZES.map((n) => (
                      <option key={n} value={String(n)}>{n}-inch, {tvSquaresAcross(n)} squares across</option>
                    ))}
                  </select>
                </label>
              )}
              {picHow === 'across' && (
                <label className="rt-bm-num"><span>Squares across</span>
                  <input type="number" min={1} max={MAX_GRID} step={0.5} value={picAcross} aria-label="Squares across"
                    onWheel={(e) => e.currentTarget.blur()} onFocus={selectAll} onDoubleClick={selectAll}
                    onChange={(e) => { noLeadingZero(e.target); setPicAcross(e.target.value); }} />
                </label>
              )}
              <button type="button" className="rt-btn" onClick={() => picFileRef.current && picFileRef.current.click()}>
                Choose a picture or video{'\u2026'}
              </button>
              <input ref={picFileRef} type="file" hidden aria-label="Picture or video for the floor"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; choosePicture(f); }} />
            </div>
          ) : (<>
            <div className="rt-bm-bar">
              <span className="rt-bm-hint">
                <strong>{m.backdrop.name || 'Picture'}</strong>
                {' \u00b7 '}{m.backdrop.kind === 'video' ? 'looping video' : 'picture'}
                {' \u00b7 '}{mediaState === 'missing' ? 'not on this computer'
                  : mediaState === 'loading' ? 'opening\u2026'
                    : `${m.backdrop.w} \u00d7 ${m.backdrop.h} squares`}
              </span>
              {mediaState === 'missing' && (<>
                <button type="button" className="rt-btn" onClick={() => relinkFileRef.current && relinkFileRef.current.click()}>
                  Find the file on this computer{'\u2026'}
                </button>
              </>)}
              <input ref={relinkFileRef} type="file" hidden aria-label="The same picture or video again"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; relinkPicture(f); }} />
            </div>
            <div className="rt-bm-bar">
              {num('Squares across', m.backdrop.w, sizePicture, 0.5, MAX_GRID, 0.5)}
              {num('From the left', m.backdrop.x, (v) => movePicture({ x: v }), -MAX_GRID, MAX_GRID, 0.25)}
              {num('From the top', m.backdrop.y, (v) => movePicture({ y: v }), -MAX_GRID, MAX_GRID, 0.25)}
              <label className="rt-bm-num"><input type="checkbox" checked={m.backdrop.grid}
                onChange={(e) => movePicture({ grid: e.target.checked })} /><span>Grid lines over it</span></label>
            </div>
            <div className="rt-bm-bar">
              <button type="button" className="rt-btn" onClick={() => {
                const g = gridFor(m.backdrop);
                patch({ cols: g.cols, rows: g.rows });
              }} title="Make the grid exactly as big as the picture">Fit the grid to it</button>
              <button type="button" className="rt-btn" onClick={() => patch({
                floor: paintCells(m.floor, squaresUnder(m.backdrop, m.cols, m.rows), true)
              })} title="Every square the picture covers becomes deck, so the fog and the rooms run over it">
                Make every square under it deck
              </button>
              <button type="button" className="rt-btn ghost" onClick={() => patch({ backdrop: null })}
                title="The deck goes back to its tiled ground. Undo puts the picture back.">Take the picture off</button>
            </div>
            <p className="rt-bm-hint">
              While this panel is open, drag the picture on the map to move it and drag its corner to size it (hold Shift
              to land on whole squares); the arrow keys nudge it a twentieth of a square, or a whole one with Shift.
            </p>
            <p className="rt-bm-hint">
              Line the picture{'\u2019'}s own grid up with the map{'\u2019'}s, then draw its walls with the Thin wall tool:
              click a grid line to put a wall on it, drag along to draw a run, and click it again to take it down. The fog,
              the rooms, sight and blasts all stop at them. Doors go on the square beside the doorway.
            </p>
          </>)}
          <GenerateFloor target="deck" cols={m.cols} rows={m.rows} backdrop={m.backdrop} hintClass="rt-bm-hint"
            mediaReady={mediaState === 'ready'} onPicture={layGeneratedPicture} onVideo={layGeneratedVideo}
            planMask={{ has: () => Object.keys(m.floor).length > 0, make: () => deckPlanMask(m) }} />
          {picNote ? <p className="rt-bm-hint" role="status">{picNote}</p> : null}
        </div>
      )}

      {mode === 'trigger' && (() => {
        const cur = trigId ? triggerById(m.triggers, trigId) : null;
        const set = (patchT) => patch({ triggers: updateTrigger(m.triggers, cur.id, patchT) });
        const pick = (label, value, onSet, options, aria) => (
          <label className="rt-bm-num"><span>{label}</span>
            <select value={value} aria-label={aria || label} onChange={(e) => onSet(e.target.value)}>
              {options.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </label>
        );
        return (
          <div className="rt-bm-gen">
            <div className="rt-sechead"><h4>Trigger zones</h4></div>
            <p className="rt-bm-hint">
              {tab === 'build'
                ? 'Squares that do something when the party gets there. Pick a trigger and paint its squares; a stroke that starts on one of its squares lifts them. With none picked, the first square painted starts a new one.'
                : 'They go off on their own: when the party is placed on one (revealing where they stand, or opening a door from it) or when one first comes into view. Click a zone to spring it by hand. Only you see them.'}
            </p>
            <div className="rt-bm-bar">
              <select value={cur ? cur.id : ''} aria-label="Trigger in hand" onChange={(e) => setTrigId(e.target.value || null)}>
                <option value="">{tab === 'build' ? '\u2014 a new one \u2014' : '\u2014 pick one \u2014'}</option>
                {m.triggers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name || 'Trigger'} ({t.armed ? 'armed' : 'spent'}, {t.cells.length} sq)</option>
                ))}
              </select>
              {tab === 'build' && (
                <button type="button" className="rt-btn" onClick={() => setTrigId(null)}>New trigger</button>
              )}
              {m.triggers.some((t) => !t.armed) && (
                <button type="button" className="rt-btn ghost" onClick={() => patch({ triggers: rearmAll(m.triggers) })}>Arm them all</button>
              )}
            </div>
            {cur && (<>
              <div className="rt-bm-bar">
                <input className="rt-field" value={cur.name} maxLength={40} aria-label="Trigger name"
                  onChange={(e) => set({ name: e.target.value })} />
                {pick('Goes off', cur.when, (v) => set({ when: v }), TRIGGER_WHEN.map((w) => [w.id, w.name]), 'When it goes off')}
                <label className="rt-bm-num"><input type="checkbox" checked={!cur.once}
                  onChange={(e) => set({ once: !e.target.checked })} /><span>Every time</span></label>
                <span className="rt-bm-hint">{cur.cells.length} square{cur.cells.length === 1 ? '' : 's'} {'\u00b7'} {cur.armed ? 'armed' : 'spent'}</span>
              </div>
              <div className="rt-bm-bar">
                <label className="rt-bm-num"><input type="checkbox" checked={cur.reveal}
                  onChange={(e) => set({ reveal: e.target.checked })} /><span>Lift the fog off its room</span></label>
                <label className="rt-bm-num"><input type="checkbox" checked={cur.contacts}
                  onChange={(e) => set({ contacts: e.target.checked })} /><span>Bring out what waits in its room</span></label>
                {pick('Doors', cur.doors, (v) => set({ doors: v }), TRIGGER_DOORS.map((d) => [d.id, d.name]), 'Its room\u2019s doors')}
              </div>
              <div className="rt-bm-bar">
                {pick('Light', cur.light, (v) => set({ light: v }), [['', 'Leave the light'], ...LIGHTING_PRESETS.map((lp) => [lp.id, lp.name])], 'Its room\u2019s light')}
                {pick('Sets off', cur.hazard, (v) => set({ hazard: v }), [['', 'Nothing'], ...HAZARD_TYPES.map((h) => [h.id, h.name])], 'A hazard on its squares')}
                {pick('Noise', cur.noise, (v) => set({ noise: v }), [['', 'None'], ...NOISE.map((n) => [n.id, n.name])], 'A noise from it')}
              </div>
              <div className="rt-bm-bar">
                {pick('Sound', cur.cue, (v) => set({ cue: v }), [['', 'No sound'], ...cues.map((c) => [c.id, c.name])], 'A sound from the ambience board')}
                {pick('Handout', cur.handout, (v) => set({ handout: v }), [['', 'No handout'], ...handouts.map((h) => [h.id, h.name])], 'A handout on the table\u2019s screen')}
              </div>
              <textarea className="rt-ta" rows={2} value={cur.note} maxLength={600} aria-label="Note for the GM"
                placeholder={'For you alone: what happened, and what they roll. \u201cClick. Awareness (+0) to step off it in time.\u201d'}
                onChange={(e) => set({ note: e.target.value })} />
              <div className="rt-bm-bar">
                <button type="button" className="rt-btn" onClick={() => fireByHand(cur)}>Spring it now</button>
                <button type="button" className="rt-btn ghost" onClick={() => set({ armed: !cur.armed })}>{cur.armed ? 'Disarm it' : 'Arm it'}</button>
                <button type="button" className="rt-btn ghost" onClick={() => {
                  patch({ triggers: m.triggers.filter((t) => t.id !== cur.id) });
                  setTrigId(null);
                }}>Take the trigger off</button>
              </div>
            </>)}
          </div>
        );
      })()}

      {mode === 'sketch' && (
        <div className="rt-bm-gen">
          <div className="rt-sechead"><h4>Sketch</h4></div>
          <p className="rt-bm-hint">
            Show the map what you mean. Draw each room as a loop with the Room pen (a loop that fills its corners is a
            compartment, a rounder one a chamber), each passage as a line from one room to another, and mark what
            matters. Generate from sketch builds the deck: rooms where you drew them, corridors along your lines, doors
            where they meet. The sketch stays with the deck so it can be made again, and is left behind when the deck is
            published for play.
          </p>
          <div className="rt-bm-bar" role="group" aria-label="Pen">
            {PENS.map((pn) => (
              <button key={pn.id} type="button" title={pn.note} aria-pressed={sketchPen === pn.id ? 'true' : 'false'}
                className={'rt-btn' + (sketchPen === pn.id ? ' on' : ' ghost')} onClick={() => setSketchPen(pn.id)}>{pn.name}</button>
            ))}
            {sketchPen === 'passage' && (
              <select value={sketchPassage} aria-label="Which passage" onChange={(e) => setSketchPassage(e.target.value)}>
                {PASSAGE_KINDS.map((pk) => <option key={pk.id} value={pk.id} title={pk.note}>{pk.name}</option>)}
              </select>
            )}
            {sketchPen === 'mark' && (<>
              <select value={sketchMark} aria-label="Which mark" onChange={(e) => setSketchMark(e.target.value)}>
                {MARKS.map((mk) => <option key={mk.id} value={mk.id} title={mk.note}>{mk.name}</option>)}
              </select>
              {sketchMark === 'hazard' && (
                <select value={sketchHazard} aria-label="Which hazard" onChange={(e) => setSketchHazard(e.target.value)}>
                  {HAZARD_TYPES.map((hz) => <option key={hz.id} value={hz.id}>{hz.name}</option>)}
                </select>
              )}
              {sketchMark === 'fixture' && (
                <select value={sketchFixture} aria-label="Which fixture" onChange={(e) => setSketchFixture(e.target.value)}>
                  {MARKER_TYPES.filter((mt) => ['cogitator', 'turret', 'shrine', 'vent', 'objective', 'deploy'].includes(mt.id))
                    .map((mt) => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
                </select>
              )}
            </>)}
          </div>
          <p className="rt-bm-hint" role="status">
            <strong>Read as:</strong> {describePlan(sketchPlan)}
            {sketchPlan.unclear.length > 0 && <>{' '}Not sure of: {sketchPlan.unclear.join(' ')}</>}
          </p>
          {sketch.notes && sketch.notes.length > 0 && (
            <p className="rt-bm-hint"><strong>From the picture:</strong> {sketch.notes.join(' · ')}</p>
          )}
          <div className="rt-bm-bar">
            <label className="rt-bm-num"><span>Layout</span>
              <select value={sketch.layout} aria-label="Layout" onChange={(e) => setSketch({ ...sketch, layout: e.target.value })}
                disabled={!sketch.strokes.length && !sketch.plan}>
                {LAYOUTS.map((ly) => <option key={ly.id} value={ly.id} title={ly.note}>{ly.name}</option>)}
              </select>
            </label>
            <label className="rt-bm-num"><input type="checkbox" checked={sketch.fill} disabled={!sketch.strokes.length && !sketch.plan}
              onChange={(e) => setSketch({ ...sketch, fill: e.target.checked })} /><span>Fill the rest of the grid</span></label>
            <label className="rt-bm-num"><span>Seed</span>
              <input className="rt-field" style={{ width: 90 }} value={sketch.seed} placeholder="random" aria-label="Sketch seed"
                disabled={!sketch.strokes.length && !sketch.plan && !sketch.example}
                onChange={(e) => setSketch({ ...sketch, seed: e.target.value.toUpperCase().slice(0, 40) })} />
            </label>
          </div>
          <div className="rt-bm-bar">
            <button type="button" className="rt-btn" disabled={!sketchPlan.rooms.length} onClick={generateFromSketch}>Generate from sketch</button>
            <button type="button" className="rt-btn ghost" disabled={!sketch.strokes.length && !sketch.example}
              onClick={() => setSketch({ ...sketch, seed: newSeed() })}>New seed</button>
            <button type="button" className="rt-btn ghost" disabled={!sketch.strokes.length && !sketch.plan}
              onClick={() => { setSketch({ ...sketch, strokes: [], plan: null, notes: [] }); setSketchMsg('Sketch cleared. Undo brings it back.'); }}>Clear the sketch</button>
          </div>
          {sketchMsg && <p className="rt-bm-hint" role="status">{sketchMsg}</p>}

          <details className="rt-bm-more" open={Boolean(sketchPic)}>
          <summary>From a picture<span className="rt-bm-hint">a photographed plan, or a map to copy</span></summary>
          <p className="rt-bm-hint">
            A photograph of a plan drawn on paper, or a map from a book or a game: it lies under the sketch to trace with the
            pens, or it can be read into strokes for you to check and correct. The picture is not kept with the deck; what is
            traced or read from it is.
          </p>
          <div className="rt-bm-bar">
            <input ref={sketchFileRef} type="file" accept="image/*" hidden aria-label="A picture to sketch from"
              onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; chooseSketchPicture(f); }} />
            <button type="button" className="rt-btn ghost" onClick={() => sketchFileRef.current && sketchFileRef.current.click()}>
              {sketchPic ? 'Another picture…' : 'Choose a picture…'}
            </button>
            {sketchPic && (<>
              <label className="rt-bm-num"><input type="checkbox" checked={sketchPic.show}
                onChange={(e) => setSketchPic({ ...sketchPic, show: e.target.checked })} /><span>Show it</span></label>
              <button type="button" className="rt-btn ghost" onClick={() => setSketchPic(null)}>Put it away</button>
            </>)}
          </div>
          {sketchPic && (<>
            <div className="rt-bm-bar">
              <label className="rt-bm-num"><span>It is</span>
                <select value={sketchPicSource} aria-label="What the picture is" onChange={(e) => setSketchPicSource(e.target.value)}>
                  {SKETCH_SOURCES.map((sc) => <option key={sc.id} value={sc.id} title={sc.note}>{sc.name}</option>)}
                </select>
              </label>
              <input className="rt-field" style={{ flex: '1 1 200px' }} value={sketchPicNote} maxLength={MAX_READ_NOTE}
                aria-label="What it is" placeholder="What it is, if it helps: deck 3 of a Rak'Gol hulk…"
                onChange={(e) => setSketchPicNote(e.target.value)} />
            </div>
            <div className="rt-bm-bar">
              <button type="button" className="rt-btn" disabled={sketchPicBusy} onClick={readSketchPic}>
                {sketchPicBusy ? 'Reading…' : 'Read it'}
              </button>
              <span className="rt-bm-hint">Rooms, the ways between them, starts, objectives, locks, hazards and fixtures. One of the day{'’'}s images.</span>
            </div>
            <div className="rt-bm-bar" role="group" aria-label="Where the picture lies">
              <label className="rt-bm-num"><span>Squares across</span>
                <input className="rt-field" type="number" step="1" style={{ width: 70 }} aria-label="Picture squares across"
                  value={Math.round(sketchPic.place.across * 10) / 10} onChange={(e) => placeSketchPic('across', e.target.value)} /></label>
              <label className="rt-bm-num"><span>Left</span>
                <input className="rt-field" type="number" step="1" style={{ width: 60 }} aria-label="Picture left"
                  value={Math.round(sketchPic.place.x * 10) / 10} onChange={(e) => placeSketchPic('x', e.target.value)} /></label>
              <label className="rt-bm-num"><span>Top</span>
                <input className="rt-field" type="number" step="1" style={{ width: 60 }} aria-label="Picture top"
                  value={Math.round(sketchPic.place.y * 10) / 10} onChange={(e) => placeSketchPic('y', e.target.value)} /></label>
              <span className="rt-bm-hint">The sketch moves with it.</span>
            </div>
          </>)}

          </details>

          <details className="rt-bm-more" open={Boolean(sketch.example)}>
          <summary>Grow from an example<span className="rt-bm-hint">a warren or a ruin, grown from a few painted rooms</span></summary>
          <p className="rt-bm-hint">
            Paint a few rooms the way the whole deck should look (up to 24 squares a side, on an empty deck) or take a stock
            one, and the deck is grown from it: rooms the size you painted them, walls as thick, doors the way they sit. It copies
            the texture, not a plan, so it suits warrens and ruins; for a deck with a shape in mind, draw it above.
          </p>
          <div className="rt-bm-bar">
            <button type="button" className="rt-btn ghost" disabled={!Object.keys(m.floor).length}
              onClick={() => takeExample('painted')}>Take what is painted</button>
            <select value="" aria-label="A stock example" onChange={(e) => { if (e.target.value) takeExample(e.target.value); }}>
              <option value="">or a stock example…</option>
              {STOCK_EXAMPLES.map((ex) => <option key={ex.id} value={ex.id} title={ex.note}>{ex.name}</option>)}
            </select>
          </div>
          {sketch.example && (() => {
            const ex = sketch.example;
            const sq = 6;
            return (<>
              <div className="rt-bm-bar">
                <svg width={ex.rows[0].length * sq} height={ex.rows.length * sq} role="img"
                  aria-label={`The example, ${ex.rows[0].length - 2} by ${ex.rows.length - 2} squares`} style={{ background: '#05070b', borderRadius: 3 }}>
                  {ex.rows.flatMap((row, y) => [...row].map((ch, x) => (ch === '#' ? null
                    : <rect key={`${x},${y}`} x={x * sq} y={y * sq} width={sq} height={sq} fill={ch === '+' ? '#e8a33d' : '#7f93a8'} />)))}
                </svg>
                <span className="rt-bm-hint">{ex.name || 'Example'}: {ex.rows[0].length - 2} × {ex.rows.length - 2} squares; doors:{' '}
                  {(DOOR_KINDS.find((dk) => dk.id === ex.doorKind) || { name: ex.doorKind }).name.toLowerCase()}.</span>
              </div>
              <div className="rt-bm-bar">
                <label className="rt-bm-num"><span>Merge rooms smaller than</span>
                  <input className="rt-field" type="number" min="0" max="40" step="1" style={{ width: 60 }} aria-label="Merge rooms smaller than"
                    value={ex.merge} onChange={(e) => setSketch({ ...sketch, example: readExample({ ...ex, merge: e.target.value }) || ex })} />
                  <span>squares</span></label>
                <button type="button" className="rt-btn" onClick={growFromExample}>Grow the deck</button>
                <button type="button" className="rt-btn ghost" onClick={() => setSketch({ ...sketch, example: null })}>Drop the example</button>
              </div>
            </>);
          })()}
          </details>
        </div>
      )}

      {mode === 'area' && (() => {
        const cur = areaId ? areaById(m.areas, areaId) : null;
        const set = (patchA) => { if (cur) patch({ areas: updateArea(m.areas, cur.id, patchA) }); };
        const deckList = (decks.length ? decks : (library && library.decks) || [])
          .filter((d) => !library || d.id !== library.currentDeckId);
        const linked = cur && cur.deck ? deckList.find((d) => d.id === cur.deck) : null;
        return (
          <div className="rt-bm-gen">
            <div className="rt-sechead"><h4>Named areas</h4></div>
            <p className="rt-bm-hint">
              {tab === 'build'
                ? 'Name the parts of the deck: lay a picture under it (a station\u2019s plan, a photograph of the model, a map from another program) and paint over each part. Click or drag to paint squares into the area in hand; a stroke that starts on one of its squares lifts them. With none in hand, the first square starts a new one. An area can open a deck of its own.'
                : 'Click an area for its note, and its way in where it has a deck of its own.'}
            </p>
            <div className="rt-bm-bar">
              <select value={cur ? cur.id : ''} aria-label="Area in hand" onChange={(e) => { setAreaId(e.target.value || null); setAreaNote(''); }}>
                <option value="">{tab === 'build' ? 'A new area: paint its first square' : 'Click an area on the map\u2026'}</option>
                {m.areas.map((a) => <option key={a.id} value={a.id}>{a.name || 'Area'} ({a.cells.length})</option>)}
              </select>
              {tab === 'build' && <button type="button" className="rt-btn" onClick={() => setAreaId(null)}>New area</button>}
            </div>
            {/* Always all there, disabled with no area in hand: the panel sits
                over the map, and a panel that grew on the first square of a
                new area slid the map down under a drag still painting it. */}
            {tab === 'build' && (<>
              <div className="rt-bm-bar">
                <input className="rt-field" value={cur ? cur.name : ''} maxLength={60} aria-label="Area name" disabled={!cur}
                  placeholder="Paint a square to start one" onChange={(e) => set({ name: e.target.value })} />
                <span className="rt-area-swatches" role="group" aria-label="Colour">
                  {AREA_COLOURS.map((c) => (
                    <button key={c.id} type="button" className={'rt-area-swatch' + (cur && cur.colour === c.id ? ' on' : '')} disabled={!cur}
                      style={{ background: c.hex }} title={c.name} aria-label={c.name} aria-pressed={cur && cur.colour === c.id ? 'true' : 'false'}
                      onClick={() => set({ colour: c.id })} />
                  ))}
                </span>
                <label className="rt-bm-num"><input type="checkbox" checked={Boolean(cur && cur.show)} disabled={!cur}
                  onChange={(e) => set({ show: e.target.checked })} /><span>The table sees its name</span></label>
                <span className="rt-bm-hint">{cur ? `${cur.cells.length} square${cur.cells.length === 1 ? '' : 's'}` : ''}</span>
              </div>
              <textarea className="rt-ta" rows={2} value={cur ? cur.note : ''} maxLength={600} aria-label="Area note" disabled={!cur}
                placeholder={'What it is and what is in it. \u201cThe distillation hub: three tanks, one cracked.\u201d'}
                onChange={(e) => set({ note: e.target.value })} />
              <div className="rt-bm-bar">
                <label className="rt-bm-num"><span>Opens</span>
                  <select value={cur && cur.deck ? cur.deck : ''} aria-label="The deck it opens" disabled={!cur} onChange={(e) => set({ deck: e.target.value || null })}>
                    <option value="">No deck of its own</option>
                    {deckList.map((d) => <option key={d.id} value={d.id}>{d.name || 'Untitled deck'}</option>)}
                  </select>
                </label>
                <button type="button" className="rt-btn ghost" disabled={!linked} onClick={() => openAreaDeck(cur)}>Open it</button>
                <button type="button" className="rt-btn ghost" disabled={!cur} onClick={() => { patch({ areas: removeArea(m.areas, cur.id) }); setAreaId(null); }}>
                  Take the area off
                </button>
              </div>
            </>)}
            {cur && tab === 'play' && (
              <div className="rt-area-card" style={{ borderColor: areaColour(cur.colour) }}>
                <strong style={{ color: areaColour(cur.colour) }}>{cur.name || 'Area'}</strong>
                {cur.note && <p className="rt-bm-hint">{cur.note}</p>}
                {linked
                  ? <button type="button" className="rt-btn" onClick={() => openAreaDeck(cur)}>Go into it: {linked.name || 'its deck'}</button>
                  : cur.deck ? <p className="rt-bm-hint">Its deck is no longer in the library.</p> : null}
              </div>
            )}
            {areaNote && <p className="rt-bm-hint" role="status">{areaNote}</p>}
          </div>
        );
      })()}

      {libOpen && (
        <div className="rt-bm-gen">
          <div className="rt-sechead">
            <h4>{library ? 'Library' : 'Save and load decks'}</h4>
            {!library && <button type="button" className="rt-btn ghost" onClick={() => setLibOpen(false)}>Close</button>}
          </div>
          {library && (
            <MapLibrary lib={library} win={win} liveMap={m}
              onOpen={library.open} onPlay={playFromLibrary}
              onUseGround={(id) => patch({ theme: id, customTexture: null })}
              onClose={() => setLibOpen(false)} />
          )}
          {!library && <div className="rt-bm-bar">
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
                  setDeckNote(`Saved to “${saved.name}”.`);
                  setDeckTarget(saved.id);
                  setDeckName('');
                }
              }}>Save deck</button>
            </>)}
            {/* One picker, two things to do with what it picks. */}
            {(onLoadDeck || onDeleteDeck) && decks.length > 0 && (<>
              <select value={loadId} onChange={(e) => setLoadId(e.target.value)}>
                <option value="">Pick a saved deck…</option>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name || 'Untitled deck'}</option>)}
              </select>
              {onLoadDeck && (
                <button type="button" className="rt-btn" disabled={!loadId} onClick={loadChosenDeck}
                  title="Bring a saved deck onto the map. Undo takes it back.">Load deck</button>
              )}
              {onDeleteDeck && (
                <IconButton icon="trash" disabled={!loadId} onClick={deleteChosenDeck}
                  label="Delete the chosen deck from the library. This cannot be undone." />
              )}
            </>)}
            {/* The dashboard keeps its own deck row above this map, so the
                library is already in front of the GM and this panel has
                nothing to add. It used to say "open the map from the GM
                dashboard", which is where it was being read. */}
            {!onSaveDeck && !onLoadDeck && !onDeleteDeck && (
              <span className="rt-bm-hint">
                Decks are picked, named, published and deleted in the row above.
              </span>
            )}
            {deckNote ? <span className="rt-bm-hint">{deckNote}</span> : null}
          </div>}
        </div>
      )}

      {gridOpen && (
        <div className="rt-bm-gen">
          <div className="rt-sechead">
            <h4>Grid, scale and light</h4>
            <button type="button" className="rt-btn ghost" onClick={() => setGridOpen(false)}>Close</button>
          </div>
          <div className="rt-bm-bar">
            {num('Cols', m.cols, (v) => patch({ cols: v }), MIN_GRID, MAX_GRID)}
            {num('Rows', m.rows, (v) => patch({ rows: v }), MIN_GRID, MAX_GRID)}
            {num('Px / square', m.pxPerSquare, (v) => patch({ pxPerSquare: v }), 10, 200, 2)}
            {num('mm / square', m.mmPerSquare, (v) => patch({ mmPerSquare: v }), 5, 100)}
            {num('Metres / square', m.metresPerSquare, (v) => patch({ metresPerSquare: v }), 0.5, 10, 0.5)}
            <label className="rt-bm-num"><span>Light</span>
              <select value={m.lighting} onChange={(e) => patch({ lighting: e.target.value })}
                title="Shooting in poor light carries a penalty to hit (Rogue Trader pp.248-249)">
                {LIGHTING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="rt-bm-num">
              <span>Zoom %</span>
              {/* Typed, not picked: a GM matching the deck to a projector wants
                  83%, not the nearest of eight. */}
              <input type="number" value={zoomPct}
                min={Math.round(MIN_ZOOM * 100)} max={Math.round(MAX_ZOOM * 100)} step={5}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => {
                  setZoomPct(e.target.value);
                  if (e.target.value.trim() !== '') setZoom(clampZoom(Number(e.target.value) / 100));
                }}
                onBlur={() => setZoomPct(String(Math.round(zoom * 100)))} />
            </label>
            <label className="rt-bm-num"><input type="checkbox" checked={showZones}
              onChange={(e) => setShowZones(e.target.checked)} /><span>Deployment</span></label>
            <label className="rt-bm-num"><input type="checkbox" checked={showCalibration}
              onChange={(e) => setShowCalibration(e.target.checked)} /><span>Calibrate</span></label>
            <label className="rt-bm-num" title={reducedMotion
              ? 'This computer asks for reduced motion, so nothing moves here whatever this says'
              : 'Rain falling, smoke drifting, fire and lumens flickering'}>
              <input type="checkbox" checked={m.motion}
                onChange={(e) => patch({ motion: e.target.checked })} /><span>Moving effects</span></label>
          </div>
          <p className="rt-bm-hint">
            Up to {MAX_GRID}×{MAX_GRID} squares. Squares keep the size the projector was
            calibrated to however big the grid is; zoom out to see it all.
          </p>
        </div>
      )}

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
            {Object.keys(m.floor).length > 0 && (
              <label className="rt-bm-num" title="Keep everything that is painted and build rooms around it. Untick to replace the deck.">
                <input type="checkbox" checked={buildAround}
                  onChange={(e) => setBuildAround(e.target.checked)} />
                <span>Build around what is painted</span>
              </label>
            )}
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
              <span>How</span>
              <select value={growHow} onChange={(e) => setGrowHow(e.target.value)}>
                <option value="grow">Grow from what is painted</option>
                <option value="repeat">Repeat the deck</option>
                <option value="mirror">Repeat, flipped at the seams</option>
              </select>
            </label>
            <button type="button" className="rt-btn" onClick={expandDeck}>
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
              if (growHow === 'grow') {
                return `Grows the grid to ${p.cols}×${p.rows} and builds new rooms in the added space, `
                  + 'each joined to your deck with a door where they meet, and carrying its ground on. '
                  + 'What is painted does not move. Hostiles and fog are untouched.';
              }
              if (p.copies <= 1) return `${p.cols}×${p.rows} holds one copy of this deck.`;
              return `${p.across}×${p.down} copies of the current ${m.cols}×${m.rows} deck`
                + `${p.partial ? ', the last one cut short' : ''}`
                + `${growHow === 'mirror' ? ', flipped at each seam so the runs meet' : ', repeated as-is'}.`
                + ' Hostiles and fog are not copied.';
            })()}
          </p>

          <p className="rt-bm-hint">
            {styleById(genStyle).note} Laid out across the current
            {' '}{m.cols}×{m.rows} grid, with a door wherever a run meets a
            compartment — so one fog click reveals one room, not the deck.
            {Object.keys(m.floor).length > 0 && buildAround
              ? ' Builds around what is painted: nothing there moves.'
              : ' Replaces the floor and the bulkheads; the ground, the calibration and the deck\'s name are kept.'}
          </p>
          {deckMsg ? <p className="rt-bm-hint" role="status">{deckMsg}</p> : null}
        </div>
      )}

      {genOpen && (
        <div className="rt-bm-gen">
          <div className="rt-sechead">
            <h4>Ground</h4>
            <button type="button" className="rt-btn ghost"
              onClick={() => {
                setGenOpen(false); setPreview(null); setGenErr(''); closeCrop();
              }}>Close</button>
          </div>

          <div className="rt-bm-bar" role="tablist" aria-label="Ground">
            <button type="button" role="tab" aria-selected={groundTab === 'make'}
              className={'rt-btn rt-bm-mode' + (groundTab === 'make' ? ' on' : '')}
              onClick={() => setGroundTab('make')}>Generate or upload a ground</button>
            <button type="button" role="tab" aria-selected={groundTab === 'terrain'}
              className={'rt-btn rt-bm-mode' + (groundTab === 'terrain' ? ' on' : '')}
              onClick={() => setGroundTab('terrain')}>Procedural terrain</button>
          </div>

          {groundTab === 'make' && (<>
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

            {/* The props that stand on it. Offered rather than automatic: it
                is a second trip to the model, and the first floor generated
                is usually not the one kept. */}
            <div className="rt-bm-bar">
              <button type="button" className="rt-btn" onClick={generateProps}
                disabled={propsBusy || genBusy}
                title="Doors, cover, hazards and foliage built of this ground's own materials, as one sheet">
                {propsBusy ? 'Generating props…'
                  : preview.sprites ? 'Generate the props again' : 'Generate matching props'}
              </button>
              {preview.sprites ? (
                <span className="rt-bm-hint">
                  Sixteen props, saved with this ground and drawn on any deck that uses it.
                </span>
              ) : (
                <span className="rt-bm-hint">
                  Optional. Without them a deck on this ground draws its doors and cover
                  as plain shapes, the way it always has.
                </span>
              )}
            </div>
            {preview.sprites && (
              <div className="rt-bm-sheet" title="The sixteen props, cut from the generated sheet">
                {SPRITE_SLOTS.map((s) => (
                  <i key={s.role} title={s.name}
                    style={{ backgroundImage: `url(${preview.sprites})`,
                      backgroundPosition: `${(s.slot % 4) * 33.333}% ${Math.floor(s.slot / 4) * 33.333}%` }} />
                ))}
              </div>
            )}

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
          </>)}

          {groundTab === 'terrain' && (<>
            <label className="rt-bm-field">
              <span className="rt-der-k">The terrain</span>
              <textarea rows={3} maxLength={400} value={terrainPrompt}
                placeholder="A flooded marsh with dry islands of scrub, a river cutting through it, ruins and rubble, patches of thick smoke"
                onChange={(e) => setTerrainPrompt(e.target.value)} />
            </label>
            <p className="rt-bm-hint">
              {terrainRead.notes.length
                ? terrainRead.notes.join(' ')
                : 'Name grounds (marsh, ice, jungle…), foliage, cover (ruins, crates, rocks), hazards (fire, toxic gas), a river or a road. Words like dense, sparse, wide, small, ragged and neat shape it.'}
            </p>
            <span className="rt-der-k">Grounds to use</span>
            <div className="rt-bm-palette">
              {allGrounds.map((g) => {
                const ticked = terrainPick || [...new Set([m.theme, ...customThemes.map((t) => t.id)])];
                const on = ticked.includes(g.id);
                return (
                  <label key={g.id} className={'rt-bm-chip' + (on ? ' on' : '')} title={g.custom ? 'A ground you saved (generated or uploaded)' : 'Built in'}>
                    <input type="checkbox" checked={on}
                      onChange={() => setTerrainPick(on ? ticked.filter((id) => id !== g.id) : [...ticked, g.id])} />
                    <i style={{ background: g.fallback }} />
                    <span>{g.name}{g.custom ? ' \u2605' : ''}</span>
                  </label>
                );
              })}
            </div>
            <p className="rt-bm-hint">
              Every ground you have saved is here, whether it was generated or uploaded. A ground the
              description names is used even if it is not ticked.
            </p>
            <div className="rt-bm-bar">
              <label className="rt-bm-num"><span>Patches</span>
                <select value={terrainSize} onChange={(e) => setTerrainSize(e.target.value)}>
                  {TERRAIN_SIZES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <label className="rt-bm-num"><span>Where</span>
                <select value={terrainScope} onChange={(e) => setTerrainScope(e.target.value)}>
                  {TERRAIN_SCOPES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <label className="rt-bm-num"><span>Seed</span>
                <input className="rt-field" value={terrainSeed} maxLength={24} placeholder="blank to roll"
                  onChange={(e) => setTerrainSeed(e.target.value)} />
              </label>
              <button type="button" className="rt-btn ghost" onClick={() => setTerrainSeed(newSeed())}>New seed</button>
              <button type="button" className="rt-btn" onClick={generateTerrainNow}>Generate terrain</button>
            </div>
            {terrainNote ? <p className="rt-bm-hint" role="status">{terrainNote}</p> : null}
            <p className="rt-bm-hint">
              Cuts the deck into regions the way the deck generator cuts rooms, gives each one a ground,
              roughens the edges, then sows foliage, cover and hazards as described. Undo takes it back.
            </p>
          </>)}
        </div>
      )}
      {genErr ? <p className="rt-warn">{genErr}</p> : null}

      {/* The tool's own options. NOT .rt-bm-opts, which is the whole panel:
          in the map's window that class lifts the panel over the deck, and
          on this row it lifted the row over the toolbar above it. */}
      <div className="rt-bm-bar rt-bm-toolrow">
        <strong className="rt-bm-toolname"><Icon name={tool.icon} size={16} /> {tool.label}</strong>
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

        {(mode === 'paint' || mode === 'erase' || mode === 'ground' || (mode === 'light' && lightScope === 'brush')) && (
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
          <button type="button" className="rt-btn" onClick={() => { setGroundTab('terrain'); setGenOpen(true); }}
            title="Lay whole regions of terrain at once, from a description, using any ground you have">Procedural terrain…</button>
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

        {mode === 'marker' && (<>
          <select value={markerType} onChange={(e) => setMarkerType(e.target.value)}>
            {MARKER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {markerType === 'turret' && (
            <label className="rt-bm-num">
              <span>Faces</span>
              <select value={turretFacing} onChange={(e) => setTurretFacing(Number(e.target.value))}>
                {FACINGS.map((f, i) => <option key={f} value={i}>{f}</option>)}
              </select>
            </label>
          )}
          {markerType === 'turret' && (
            <span className="rt-bm-hint">
              A heavy stubber watching a 90{'\u00b0'} arc, cut at walls and shut doors. Right-click it to turn
              it or switch it off; in play a click switches it, and a terminal the party is into can shut
              down every turret on the deck.
            </span>
          )}
          {markerType === 'shrine' && (
            <span className="rt-bm-hint">
              Sanctified ground for 3 m round it, drawn in gold. A warp rift cannot spread onto it.
            </span>
          )}
          {markerType === 'vent' && (
            <span className="rt-bm-hint">
              Lay two: the second joins the first, and the line between them shows on Build. In play,
              click one (or right-click it) and the party comes out of the other.
            </span>
          )}
        </>)}

        {mode === 'light' && (<>
          <select value={lightType} onChange={(e) => setLightType(e.target.value)}>
            {LIGHTING_PRESETS.map((lp) => (
              <option key={lp.id} value={lp.id}>
                {lp.name}{lp.id === m.lighting ? ' (the deck\u2019s own \u2014 lifts paint)' : ''}
              </option>
            ))}
          </select>
          <label className="rt-bm-num">
            <span>A click lights</span>
            <select value={lightScope} onChange={(e) => setLightScope(e.target.value)}>
              <option value="room">The whole room</option>
              <option value="brush">Squares, with the brush</option>
            </select>
          </label>
          <span className="rt-bm-hint">
            Over the deck{'\u2019'}s own light ({lightingById(m.lighting).name.toLowerCase()}): a dark corridor
            in a lit ship, a hold full of smoke. Click again to lift it. The ruler and the overlay give the
            light at the target and what it costs to hit.
          </span>
        </>)}

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

        {mode === 'trigger' && (
          <span className="rt-bm-hint">
            {m.triggers.filter((t) => t.armed).length} armed, {m.triggers.filter((t) => !t.armed).length} spent.
          </span>
        )}

        {mode === 'wall' && (
          <span className="rt-bm-hint">
            A wall on a grid line, between two squares that are both deck: the walls of a room drawn over a picture, or a
            partition across a hall. Click a line to put one up, again to take it down; drag to draw a run. The fog,
            sight, blasts and the air all stop at it.
          </span>
        )}

        {mode === 'cover' && (<>
          <select value={coverType} onChange={(e) => setCoverType(e.target.value)}>
            {COVER_TYPES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · AP {c.ap} · {c.blocksSight ? 'blocks sight' : 'see over'}
              </option>
            ))}
          </select>
          {/* Only the low barrier: it is the one cover with a direction. The
              rest fill their square, and are already turned by position so a
              run of them is not one stamp repeated. */}
          {coverType === 'low' && (
            <label className="rt-bm-num">
              <span>Lies</span>
              <select value={coverTurn} onChange={(e) => setCoverTurn(Number(e.target.value))}>
                <option value={0}>Across {'—'} horizontal</option>
                <option value={1}>Along {'—'} vertical</option>
              </select>
            </label>
          )}
          <span className="rt-bm-hint">
            {coverType === 'low'
              ? 'Lay it along a corridor or across one. Clicking a barrier the other way round turns it; the same way round lifts it.'
              : (coverById(coverType) || {}).note}
          </span>
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

        {mode === 'start' && (<>
          <span className="rt-bm-hint">
            {m.start
              ? `The party starts in the room marked with the flag (${m.start.x}, ${m.start.y}). Click inside another room to move it, or inside this one to take the choice back.`
              : 'Click inside the room the party arrives in. Publishing the deck for play lights that room, puts the party in it, and leaves everything else dark until a door is opened.'}
          </span>
          {m.start && (
            <button type="button" className="rt-btn" onClick={() => patch({ start: null })}>Clear the start</button>
          )}
        </>)}

        {mode === 'fog' && (<>
          <label className="rt-bm-num">
            <input type="checkbox" checked={m.fog}
              onChange={(e) => patch(e.target.checked
                // Turning fog on over a deck with a starting room and nothing
                // explored opens on that room, the way publishing does.
                ? (m.start && Object.keys(m.explored).length === 0 ? startPlay(m) : { fog: true })
                : { fog: false })} /><span>Fog of war</span>
          </label>
          {m.start && (
            <button type="button" className="rt-btn"
              title="Light the starting room again and put the party back in it. Doors stay as they are."
              onClick={() => patch(startPlay(m))}>Back to the start</button>
          )}
          <button type="button" className="rt-btn"
            onClick={() => patch({ explored: allExplored() })}>Reveal all</button>
          <button type="button" className="rt-btn"
            onClick={() => patch({ explored: {} })}>Hide all</button>
          {num('Auspex m', auspexM, setAuspexM, 1, 500, 5)}
          <span className="rt-bm-hint">
            Click a DOOR to open or shut it — right-click one to jam it, which
            blocks like a shut door. Opening lights what it joins and brings the
            party to the threshold; shutting it takes that room back off the board
            and leaves the way they came alone, and opening it again shows it once
            more. Click a room to reveal it by hand. Ctrl-click takes a place back, drag reveals square by
            square, alt-click reveals line of sight from a square, and shift-click
            is an auspex sweep — it reads through bulkheads and pings contacts
            without opening the deck.
            {m.start ? '' : ' Press the flag to pick a starting room \u2014 one click inside it and the tool hands itself back \u2014 and a published deck opens there instead of in the dark.'}
          </span>
        </>)}

        {(mode === 'overlay' || mode === 'measure') && (
          <select value={weaponKey} onChange={(e) => setWeaponKey(e.target.value)}>
            <WeaponOptions powers={mode === 'overlay'} />
          </select>
        )}

        {mode === 'overlay' && (<>
          {/* A force field has no range bands, so the toggle for them is not
              offered rather than sitting there doing nothing. */}
          {!(weapon && (weapon.isField || weapon.power)) && (
            <label className="rt-bm-num"><input type="checkbox" checked={showRings}
              onChange={(e) => setShowRings(e.target.checked)} /><span>Range bands</span></label>
          )}
          {/* What "× PR" means for the power in hand: the psyker's rating, and
              how they channel it — Fettered halves it, a Push adds to it. */}
          {weapon && weapon.power === 'psy' && (<>
            {num('Psy Rating', psyRating, setPsyRating, 1, 10, 1)}
            <select value={psyMode} aria-label="How the power is channelled"
              onChange={(e) => setPsyMode(e.target.value)}>
              {PSY_MODES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </>)}
          <label className="rt-bm-num"><input type="checkbox" checked={showLos}
            onChange={(e) => setShowLos(e.target.checked)} /><span>Line of sight</span></label>
          {weapon && weapon.isFlame && num('Cone, whole °', coneAngle, setConeAngle, 10, 180, 5)}
          <button type="button" className="rt-btn"
            onClick={() => { originRef.current = null; setOrigin(null); setAim(null); }}>Clear overlay</button>
        </>)}
      </div>

      {mode === 'overlay' && (
        <div className="rt-bm-measure">
          {!origin
            ? (weapon && weapon.power
              ? `Click the square the ${weapon.power === 'nav' ? 'Navigator' : 'psyker'} is standing in. Click it again to clear.`
              : 'Click the square the firer is standing in. Click it again to clear.')
            : weapon && weapon.power ? (
              /* A power reads differently from a gun: in range or not, in
                 sight or not, and no range bands — the Focus Power Test is
                 its own roll. */
              <>
                <strong>{weapon.power === 'nav' ? 'Gazing' : 'Manifesting'} from {origin.x},{origin.y}</strong>
                <span> · {weapon.name}</span>
                {weapon.power === 'psy' && (
                  <span> · PR {weapon.pr} · {weapon.rangeText}{weapon.test ? ` · test ${weapon.test}` : ''}</span>
                )}
                {weapon.power === 'nav' && <span> · {weapon.note}</span>}
                {overlay && overlay.kind === 'personal' && <span> · on the psyker alone</span>}
                {overlay && overlay.kind === 'burst' && <span> · {weapon.burstM} m all round</span>}
                {overlay && overlay.kind === 'cone' && <span> · {weapon.coneDeg}° cone, {weapon.range} m{!overlay.target ? ' \u2014 click to aim' : ''}</span>}
                {overlay && overlay.kind === 'line' && <span> · a line {weapon.lineM} m long{!overlay.target ? ' \u2014 click to lay it' : ''}</span>}
                {overlay && overlay.kind === 'gaze' && weapon.gazeAll && (
                  <span> · the lit squares can see the Navigator; the shaded ones cannot</span>
                )}
                {caughtLine ? <strong> · {caughtLine}</strong> : null}
                {overlay && overlay.shot ? (
                  <span>
                    {' · '}{overlay.shot.metres} m
                    {overlay.kind === 'bolt' && (overlay.reaches
                      ? (Number.isFinite(weapon.reachM) ? ` \u2014 in range (${weapon.reachM} m)` : ' \u2014 in sight')
                      : ` \u2014 OUT OF RANGE (${weapon.reachM} m)`)}
                    {overlay.kind === 'gaze' && (overlay.shot.blocked ? '' : ' \u2014 meets the gaze')}
                    {overlay.shot.blocked ? (
                      <strong> · {overlay.kind === 'gaze' ? 'OUT OF SIGHT' : 'no line of sight'}: blocked by {blockedText(overlay.shot.blocked)}</strong>
                    ) : null}
                  </span>
                ) : null}
              </>
            ) : <>
                <strong>{weapon && weapon.isMelee ? 'Fighting from' : 'Firing from'} {origin.x},{origin.y}</strong>
                {weapon && weapon.range ? <span> · range {weapon.range} m</span> : null}
                {weapon && weapon.isMelee
                  ? <span> · reach {weapon.reachM} m</span> : null}
                {weapon && !weapon.range && !weapon.isMelee && !weapon.isField
                  ? <span> · no ranged profile</span> : null}
                {weapon && weapon.blastM ? <span> · Blast {weapon.blastM} m</span> : null}
                {weapon && weapon.isFlame ? <span> · flame cone — click to aim</span> : null}
                {caughtLine ? <strong> · {caughtLine}</strong> : null}
                {/* The shot the GM is actually about to roll, so the band and
                    its modifier are on screen without switching to Measure. */}
                {/* A sword is in reach or it is not. The shooting bands say
                    nothing about it: with no range in its stat line a knife
                    reported "standard range, no modifier" from across the
                    deck, because that is what rangeBand falls back to when
                    it is handed nothing. */}
                {overlay && overlay.shot && weapon && weapon.isMelee ? (
                  <span>
                    {' · '}{overlay.shot.metres} m — {overlay.reaches ? 'in reach' : 'OUT OF REACH'}
                    {overlay.shot.blocked ? (
                      <strong> · blocked by {blockedText(overlay.shot.blocked)}</strong>
                    ) : null}
                  </span>
                ) : null}
                {overlay && overlay.shot && !(weapon && weapon.isMelee) ? (
                  <span>
                    {' · '}{overlay.shot.metres} m — {overlay.shot.band.replace('_', ' ')}
                    {' ('}{overlay.shot.total === null
                      ? 'out of range'
                      : `${overlay.shot.total >= 0 ? '+' : ''}${overlay.shot.total} to hit`}
                    {overlay.shot.total !== null && overlay.shot.marked
                      ? ` \u2014 ${overlay.shot.mod >= 0 ? '+' : ''}${overlay.shot.mod} range, ${overlay.shot.marked >= 0 ? '+' : ''}${overlay.shot.marked} marked target`
                      : ''}{')'}
                    {overlay.shot.blocked ? (
                      <strong> · blocked by {blockedText(overlay.shot.blocked)}</strong>
                    ) : null}
                    {targetConditions(overlay.shot, overlay.target)}
                  </span>
                ) : null}
                {weapon && weapon.isField ? (
                  <span> · field, Protection Rating {weapon.protectionRating}
                    {weapon.auraM > 1 ? ` — covers ${weapon.auraM} m` : ' — covers the bearer only'}</span>
                ) : null}
              </>}
        </div>
      )}

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
          <span> ({measurement.total === null ? 'out of range' : `${measurement.total >= 0 ? '+' : ''}${measurement.total} to hit`}
            {measurement.total !== null && measurement.marked
              ? ` \u2014 ${measurement.mod >= 0 ? '+' : ''}${measurement.mod} range, ${measurement.marked >= 0 ? '+' : ''}${measurement.marked} marked target`
              : ''})</span>
          {measurement.blocked && (
            <span> · blocked by {blockedText(measurement.blocked)} at {measurement.blocked.x},{measurement.blocked.y}</span>
          )}
          <span>{targetConditions(measurement, measureTo)}</span>
        </div>
      )}

      </div>
      )}

      {/* THE MAP ITSELF, which a controls-only copy leaves out: it is a
          second panel of tools for the GM while the only map is on the
          projector, not a second map to keep painted. */}
      {!controlsOnly && (<>
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
            if (mode === 'wall') setHoverEdge(edgeFromEvent(e));
            if (picDragRef.current) return;      // the window is following the drag
            if (picOpen) { const h = picHit(fracFromEvent(e)); if (h !== picHover) setPicHover(h); }
            if (spaceRef.current || panOnRef.current || rHeldRef.current) return;   // panning, or turning the map
            if (e.buttons === 1 && mode === 'wall') { strokeWall(e, false); return; }
            if (mode === 'sketch') { if (e.buttons === 1) moveStroke(fracFromEvent(e)); return; }
            if (e.buttons === 1 && (mode === 'paint' || mode === 'erase' || mode === 'ground' || mode === 'obscure'
              || (mode === 'light' && lightScope === 'brush') || (mode === 'trigger' && tab === 'build')
              || (mode === 'area' && tab === 'build'))) {
              applyAt(pos, true);
            }
          }}
          onMouseLeave={() => { setHover(null); setHoverEdge(null); }}
          onMouseDown={(e) => {
            // R held: this click turns the map, a quarter turn clockwise, or
            // anticlockwise with Shift, and does nothing else.
            if (e.button === 0 && rHeldRef.current) {
              rUsedRef.current = true;
              rotateMapBy(e.shiftKey ? -1 : 1);
              return;
            }
            // With the Picture panel open, a press on the picture places it
            // rather than working the tool in hand.
            if (e.button === 0 && picOpen && m.backdrop && !spaceRef.current && !panOnRef.current) {
              const f = fracFromEvent(e);
              const hit = picHit(f);
              if (hit) { startPictureDrag(hit, f); return; }
            }
            if (e.button === 0 && mode === 'wall') { strokeWall(e, true); return; }
            if (e.button === 0 && mode === 'sketch') { startStroke(fracFromEvent(e)); return; }
            if (e.button === 0) applyAt(posFromEvent(e), false, e.shiftKey, e.altKey, e.ctrlKey || e.metaKey);
          }}
          style={{ cursor: picHover === 'size' ? 'nwse-resize' : picHover === 'move' ? 'move'
            : mode === 'measure' || mode === 'overlay' ? 'crosshair' : 'pointer' }}
        />
        </div>
      </div>
      </>)}

      {/* WHAT WENT OFF, for the GM: on every copy of the map but the table's
          own screen, with the note written for it. */}
      {sprung && sprung.length > 0 && !projecting && (
        <div className="rt-bm-sprung" ref={sprungRef} role="status">
          {sprung.map((f) => (
            <p key={f.id}><strong>{f.name || 'A trigger'} went off.</strong>{f.note ? ' ' + f.note : ''}</p>
          ))}
          {onDismissSprung && (
            <button type="button" className="rt-btn ghost" onClick={onDismissSprung}>Dismiss</button>
          )}
        </div>
      )}

      {/* Deliberately outside the toolbars' own gate: the map is run with the
          options hidden on a projector, and a question asked there has to be
          answerable without first bringing the toolbars back. */}
      {ask && (
        <div className="rt-bm-askwrap" role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeAsk(false); }}>
          <div className="rt-bm-ask" role="alertdialog" aria-modal="true"
            aria-labelledby="rt-ask-t" aria-describedby="rt-ask-b"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); closeAsk(false); }
              if (e.key === 'Enter') { e.preventDefault(); closeAsk(true); }
            }}>
            <h4 id="rt-ask-t">{ask.title}</h4>
            <p id="rt-ask-b">{ask.body}</p>
            <div className="rt-bm-askrow">
              {/* Autofocused so Enter answers it and Escape dismisses it
                  without the GM reaching for the mouse mid-session. */}
              <button type="button" className="rt-btn" autoFocus
                onClick={() => closeAsk(true)}>{ask.yes || 'Yes'}</button>
              <button type="button" className="rt-btn ghost"
                onClick={() => closeAsk(false)} hidden={Boolean(ask.info)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div className="rt-bm-menu" ref={menuRef} role="menu" aria-label="Map menu"
          style={{ left: menuAt.x, top: menuAt.y }}
          onContextMenu={(e) => e.preventDefault()}>
          <div className="rt-bm-menu-h">Tab</div>
          <div className="rt-bm-menu-tools">
            {[['build', 'Build', 'paint'], ['play', 'Play', 'fog']].map(([id, label, icon]) => (
              <button key={id} type="button" role="menuitemradio" aria-checked={tab === id}
                className={'rt-bm-menu-tool' + (tab === id ? ' on' : '')}
                onClick={doMenu(() => chooseTab(id))}>
                <Icon name={icon} size={16} /><span>{label}</span>
              </button>
            ))}
          </div>
          <div className="rt-bm-menu-h">Tool</div>
          <div className="rt-bm-menu-tools">
            {toolsOf(tab).map((x) => (
              <button key={x.id} type="button" role="menuitemradio" aria-checked={mode === x.id}
                className={'rt-bm-menu-tool' + (mode === x.id ? ' on' : '')}
                onClick={doMenu(() => pickTool(x.id))}>
                <Icon name={x.icon} size={16} /><span>{x.label}</span>
              </button>
            ))}
          </div>
          <div className="rt-bm-menu-sep" />
          {menuActions().map(menuItem)}
          {menuGroups().map(renderGroup)}
          {hereCell && (
            <>
              <div className="rt-bm-menu-sep" />
              <div className="rt-bm-menu-h">At this square</div>
              {hereGroups().map(renderGroup)}
              {hereHas && menuItem({ key: 'clear-here', label: 'Clear this square', run: clearHere })}
              {m.doors[hereKey] && menuItem({
                key: 'remove-door', label: `Remove the ${m.doors[hereKey].kind === 'hatch' ? 'hatch' : 'door'}`,
                run: () => { const doors = { ...m.doors }; delete doors[hereKey]; patch({ doors }); }
              })}
              <div className="rt-bm-menu-sep" />
              <div className="rt-bm-menu-h">Firing overlay</div>
              {overlayItems().map(menuItem)}
              {overlayGroups().map(renderGroup)}
            </>
          )}
          {menuItem({ key: 'fog', label: 'Fog of war', checked: m.fog, run: () => patch({ fog: !m.fog }) })}
          {menuItem({ key: 'motion', label: 'Moving effects', checked: m.motion, run: () => patch({ motion: !m.motion }) })}
          <div className="rt-bm-menu-sep" />
          <div className="rt-bm-menu-icons">
            <IconButton icon="undo" label="Undo" onClick={doMenu(undo)} disabled={historyRef.current.past.length === 0} />
            <IconButton icon="redo" label="Redo" onClick={doMenu(redo)} disabled={historyRef.current.future.length === 0} />
            <IconButton icon="rotateLeft" label="Turn what is painted 90° anticlockwise" onClick={doMenu(() => rotateMapBy(-1))} />
            <IconButton icon="rotateRight" label="Turn what is painted 90° clockwise" onClick={doMenu(() => rotateMapBy(1))} />
            <IconButton icon="pan" label="Pan tool" on={panOn} onClick={doMenu(() => setPanOn((v) => !v))} />
            <IconButton icon="zoomOut" label="Zoom out" onClick={doMenu(() => zoomAt(zoomRef.current / 1.25))} />
            <IconButton icon="zoomIn" label="Zoom in" onClick={doMenu(() => zoomAt(zoomRef.current * 1.25))} />
            <IconButton icon="fit" label="Fit the grid to the screen" onClick={doMenu(fitToStage)} />
          </div>
          <div className="rt-bm-menu-sep" />
          {menuItem({ key: 'opts', label: showOptions ? 'Hide the options' : 'Show the options', hint: 'H', icon: showOptions ? 'hide' : 'show', run: () => setShowOptions((v) => !v) })}
          {win && menuItem({ key: 'full', label: isFull ? 'Leave full screen' : 'Full screen', hint: 'F', icon: 'full', run: toggleFullscreen })}
          {win && menuItem({ key: 'present', label: 'Present', hint: 'P', icon: 'present', run: present })}
        </div>
      )}

    </div>
  );
}
