/* HANDOUTS: something the GM puts in front of the players. A data-slate
   recovered from a body, an intercepted vox log, an astropath's message, a
   pict of the suspect, a sealed writ.

   Two copies of one handout, kept apart on purpose:

   THE GM'S, in their library (homebrew), written ahead of the session:
     { id, kind, title, text, image, imageName }
   `image` is the id of a picture kept in this browser (localfiles.js), like a
   deck's picture floor, or null. It is shown on the table's screen straight
   from there.

   THE TABLE'S, sent to the shared bridge when the GM hands it over:
     { id, kind, title, text, hasImage, to, at }
   `to` is 'all' or the characters it is for. Everybody polls the same ship
   document, so the server filters each copy by who it is addressed to, the
   way it filters a private word; and the picture is kept under a key of its
   own and fetched only by those who may see it, so the document every
   browser polls never carries an image.

   Pure: see handouts.check.mjs. */

export const HANDOUT_KINDS = [
  { id: 'dataslate', name: 'Data-slate', note: 'Text on a slate: records, orders, a confession, a manifest.' },
  { id: 'vox', name: 'Vox intercept', note: 'Words caught on an open channel. It can be read out in a vox voice.' },
  { id: 'astropath', name: 'Astropathic message', note: 'A message sent across the warp, and the images it came as.' },
  { id: 'pict', name: 'Pict-capture', note: 'A picture: a face, a place, a sigil scratched on a wall.' },
  { id: 'missive', name: 'Missive', note: 'A letter, a seal, a writ under someone’s authority.' }
];
export const kindById = (id) => HANDOUT_KINDS.find((k) => k.id === id) || HANDOUT_KINDS[0];

export const MAX_HANDOUTS = 60;
export const MAX_TITLE = 80;
export const MAX_TEXT = 4000;
// On the ship: the newest this many, so the document stays small.
export const MAX_DELIVERED = 30;
// A picture sent to the table, as a data URL: a 1024px JPEG with room to spare.
export const MAX_HANDOUT_IMAGE = 700_000;
export const HANDOUT_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const HANDOUT_ID = /^h[a-z0-9]{4,40}$/;
const CHAR_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/i;

const line = (v, max) => String(v == null ? '' : v).replace(/\s+$/, '').slice(0, max);

let seq = 0;
export const newHandoutId = () => 'h' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

export function readHandout(v) {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !HANDOUT_ID.test(v.id)) return null;
  return {
    id: v.id,
    kind: kindById(v.kind).id,
    title: line(v.title, MAX_TITLE),
    text: line(v.text, MAX_TEXT),
    image: typeof v.image === 'string' && FILE_ID.test(v.image) ? v.image : null,
    imageName: line(v.imageName, 120)
  };
}

export const readHandouts = (list) => {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const h = readHandout(raw);
    if (!h || seen.has(h.id) || out.length >= MAX_HANDOUTS) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
};

export const newHandout = (kind = 'dataslate') =>
  readHandout({ id: newHandoutId(), kind, title: '', text: '' });

// What a handout is called when it has no title of its own.
export const handoutLabel = (h) => (h && h.title.trim()) || kindById(h && h.kind).name;

/* ------------------------------ on the table ------------------------------ */

// 'all', or the characters it is for: only real ids, each once.
export function readRecipients(to) {
  if (to === 'all') return 'all';
  const list = (Array.isArray(to) ? to : [to]).filter((x) => typeof x === 'string' && CHAR_ID.test(x));
  return list.length ? [...new Set(list)].slice(0, 20) : null;
}

export function readDelivered(v) {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !HANDOUT_ID.test(v.id)) return null;
  const to = readRecipients(v.to);
  if (!to) return null;
  const at = Number(v.at);
  return {
    id: v.id,
    kind: kindById(v.kind).id,
    title: line(v.title, MAX_TITLE),
    text: line(v.text, MAX_TEXT),
    hasImage: Boolean(v.hasImage),
    to,
    at: Number.isFinite(at) ? at : 0
  };
}

// May someone holding these characters read it?
export const handoutFor = (h, charIds = []) =>
  Boolean(h) && (h.to === 'all' || (Array.isArray(h.to) && h.to.some((id) => charIds.includes(id))));
