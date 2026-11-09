// Brings a picture floor to life: a short looping video made from the picture
// already under a deck or the void chart, with Gemini Omni Flash.
//
// The same footing as generate-texture.js: behind sign-in, the owner's key,
// a daily allowance (videos have their own, smaller one: lib/quota.js), and
// the prompt built here from what the GM said rather than taken whole
// (lib/mapprompt.js). What is particular to video is in lib/omni.js: it takes
// a minute or more, so this endpoint STARTS a clip, ANSWERS how it is going,
// and hands the finished one back in PARTS small enough for a function to
// send. One endpoint with three actions rather than three endpoints, for the
// plan's cap on functions.
//
//   { action: 'start', target, describe, image, mime, aspect } -> { id }
//   { action: 'poll', id }  -> { status: 'working' | 'completed' | 'failed', parts?, bytes?, error? }
//   { action: 'part', id, n } -> the bytes of part n (video/mp4)
//
// A clip belongs to the account that started it: the id is kept against the
// account for a day, and anyone else asking after it is told it does not exist.

import { requireUser } from "../lib/auth.js";
import { buildVideoPrompt, VIDEO_ASPECTS, VIDEO_SECONDS } from "../lib/mapprompt.js";
import { redis } from "../lib/storage.js";
import {
  takeAllowance, giveBack, videoDailyLimit, videoLimitMessage, secondsToReset
} from "../lib/quota.js";
import {
  omniRequest, videoOf, stateOf, isInteractionId, partsIn, partOf, whyFailed,
  INTERACTIONS_URL, VIDEO_IMAGE_TYPES, MAX_IMAGE_CHARS
} from "../lib/omni.js";

const DAY = 24 * 60 * 60;
const jobKey = (id) => `rt:video:${id}`;

async function google(url, apiKey, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, ...(init.headers || {}) }
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    const why = (json && json.error && json.error.message) || text.slice(0, 300);
    throw new Error(`Video service ${res.status}: ${why}`);
  }
  return json || {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  res.setHeader("Cache-Control", "no-store");

  const uid = await requireUser(req, res);
  if (!uid) return;

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return res.status(503).json({ error: "GEMINI_API_KEY is not configured on this deployment" });

  const body = req.body || {};

  if (body.action === "start") {
    const image = typeof body.image === "string" ? body.image : "";
    const mime = VIDEO_IMAGE_TYPES.includes(body.mime) ? body.mime : null;
    const aspect = VIDEO_ASPECTS.includes(body.aspect) ? body.aspect : null;
    if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image) || !mime || !aspect) {
      return res.status(400).json({ error: "Send the picture as a JPEG, PNG or WebP, 16:9 or 9:16, under 3MB." });
    }
    const allowance = await takeAllowance(redis, { uid, limit: videoDailyLimit(), kind: "videos" });
    if (!allowance.ok) {
      res.setHeader("Retry-After", String(secondsToReset()));
      return res.status(429).json({ error: videoLimitMessage(allowance.limit) });
    }
    try {
      const prompt = buildVideoPrompt({ target: body.target, describe: body.describe });
      const started = await google(INTERACTIONS_URL, apiKey, {
        method: "POST",
        body: JSON.stringify(omniRequest({ prompt, image, mime, aspect, seconds: VIDEO_SECONDS }))
      });
      if (!isInteractionId(started.id)) throw new Error("The video service did not say which clip it started");
      await redis.set(jobKey(started.id), { uid, q: allowance.key }, { ex: DAY });
      return res.status(200).json({ id: started.id });
    } catch (err) {
      await giveBack(redis, allowance.key);        // nothing was started, so nothing is spent
      console.error("[generate-video] start", err && err.message);
      return res.status(502).json({ error: err.message || "video_failed" });
    }
  }

  if (body.action === "poll" || body.action === "part") {
    const id = body.id;
    if (!isInteractionId(id)) return res.status(400).json({ error: "Which clip?" });
    let job = await redis.get(jobKey(id));
    if (typeof job === "string") { try { job = JSON.parse(job); } catch { job = null; } }
    if (!job || job.uid !== uid) return res.status(404).json({ error: "There is no such clip on this account." });
    let it;
    try {
      it = await google(`${INTERACTIONS_URL}/${encodeURIComponent(id)}`, apiKey);
    } catch (err) {
      console.error("[generate-video] poll", err && err.message);
      return res.status(502).json({ error: err.message || "video_failed" });
    }
    const state = stateOf(it);
    const clip = state === "completed" ? videoOf(it) : null;
    if (state === "failed" || (state === "completed" && !clip)) {
      // Paid for and not delivered: handed back, once.
      if (!job.refunded) {
        await giveBack(redis, job.q);
        await redis.set(jobKey(id), { ...job, refunded: true }, { ex: DAY });
      }
      return res.status(200).json({ status: "failed", error: whyFailed(it) });
    }
    if (state !== "completed") return res.status(200).json({ status: "working" });
    const buf = Buffer.from(clip.data, "base64");
    const parts = partsIn(buf.length);
    if (body.action === "poll") return res.status(200).json({ status: "completed", parts, bytes: buf.length, mime: clip.mime });
    const n = Number(body.n);
    if (!Number.isInteger(n) || n < 0 || n >= parts) return res.status(400).json({ error: "No such part." });
    res.setHeader("Content-Type", clip.mime);
    res.setHeader("X-Parts", String(parts));
    return res.status(200).send(partOf(buf, n));
  }

  return res.status(400).json({ error: "Unknown action." });
}
