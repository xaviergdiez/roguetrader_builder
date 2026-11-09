// The video side of a picture floor: what is asked of Google's video model and
// what is read back from it. Pure, and outside /api so Vercel does not count
// it against the function cap. See omni.check.mjs; api/generate-video.js is
// the glue round it.
//
// WHY THIS MODEL. Veo was the video model on this key until Google shut its
// Gemini API previews on 2026-10-22 and pointed at Gemini Omni Flash, which
// is reached through the Interactions API rather than generateContent. It
// takes a picture as its first frame, and with a second picture as its LAST
// frame it interpolates between the two: sent the same picture twice it makes
// a clip that ends where it began, which is a loop. About $0.07 a second at
// 720p, so an eight-second loop is about fifty cents; hence its own, smaller
// daily allowance (lib/quota.js).
//
// WHY IN THE BACKGROUND. A clip takes a minute or more, longer than a function
// should hold a request open, so it is started with `background: true` and
// the browser asks after it every few seconds. The finished clip comes back
// inline, as base64 on the interaction, and is handed to the browser in parts
// under the 4.5MB a function may answer with.

export const OMNI_MODEL = 'gemini-omni-1.2-flash';
export const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const VIDEO_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// The picture sent up, as base64: a 1280x720 JPEG is a few hundred KB, and a
// request body may be 4.5MB.
export const MAX_IMAGE_CHARS = 4_000_000;
export const PART_BYTES = 3 * 1024 * 1024;

// An interaction's id is Google's ("v1_..."); it goes into a URL path and a
// Redis key, so it is checked rather than trusted.
export const isInteractionId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{4,200}$/.test(v);

export function omniRequest({ prompt, image, mime, aspect, seconds }) {
  const frame = { type: 'image', data: image, mime_type: mime };
  return {
    model: OMNI_MODEL,
    // First frame, last frame, then what to do between them.
    input: [frame, { ...frame }, { type: 'text', text: prompt }],
    response_format: { type: 'video', duration: `${seconds}s`, aspect_ratio: aspect, resolution: '720p' },
    background: true
  };
}

// The finished clip on an interaction, or null: the model_output step's video,
// inline. (`output_video` is the SDKs' convenience; the REST body has steps.)
export function videoOf(interaction) {
  const steps = interaction && Array.isArray(interaction.steps) ? interaction.steps : [];
  for (const st of steps) {
    if (!st || st.type !== 'model_output' || !Array.isArray(st.content)) continue;
    const v = st.content.find((c) => c && c.type === 'video' && typeof c.data === 'string' && c.data);
    if (v) return { data: v.data, mime: v.mime_type || 'video/mp4' };
  }
  const o = interaction && interaction.output_video;
  if (o && typeof o.data === 'string' && o.data) return { data: o.data, mime: o.mime_type || 'video/mp4' };
  return null;
}

// Where an interaction stands, in the four words the browser needs.
export function stateOf(interaction) {
  const s = String((interaction && interaction.status) || '').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'failed' || s === 'cancelled' || s === 'requires_action') return 'failed';
  return 'working';
}

export const partsIn = (bytes) => Math.max(1, Math.ceil(bytes / PART_BYTES));
export const partOf = (buf, n) => buf.subarray(n * PART_BYTES, (n + 1) * PART_BYTES);

// What Google said went wrong, short enough to show the GM.
export function whyFailed(interaction) {
  const e = interaction && (interaction.error || interaction.failure);
  const msg = e && (e.message || e.reason || (typeof e === 'string' ? e : ''));
  return msg ? String(msg).slice(0, 240) : 'The video service could not make that one. Try a different picture or description.';
}
