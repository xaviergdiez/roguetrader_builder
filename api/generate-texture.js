// Generates a battle-map floor texture with Gemini.
//
// Same shape, same key and the same reasoning as generate-avatar.js:
//
//   - Behind sign-in, because it spends money per call and an open endpoint is
//     a billing liability however harmless it looks.
//   - The prompt is assembled server-side from an environment id and an
//     optional condition id (see lib/mapprompt.js). A signed-in caller cannot
//     turn the owner's key into a general-purpose image generator, and the
//     grimdark rules the rest of the set follows are enforced here rather than
//     left to whoever is typing.
//   - Returns the image bytes rather than base64 JSON; base64 inflates it by a
//     third for no benefit and the browser re-encodes it anyway. The caller
//     shrinks it client-side, as it does for a portrait.

import { requireUser } from "../lib/auth.js";
import {
  buildTexturePrompt, buildSpritesPrompt, buildVoidSpritesPrompt, buildBackdropPrompt, IMAGE_ASPECTS
} from "../lib/mapprompt.js";
import { redis } from "../lib/storage.js";
import { takeAllowance, giveBack, dailyLimit, limitMessage, secondsToReset } from "../lib/quota.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-3.1-flash-image";

async function callGeminiImage(prompt, apiKey, imageConfig = null) {
  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], ...(imageConfig ? { imageConfig } : {}) }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("Gemini returned no image data");
  return {
    buf: Buffer.from(part.inlineData.data, "base64"),
    mime: part.inlineData.mimeType || "image/png"
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  res.setHeader("Cache-Control", "no-store");

  const uid = await requireUser(req, res);
  if (!uid) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(503).json({ error: "GEMINI_API_KEY is not configured on this deployment" });
  }

  // The daily allowance: this spends the owner's money on every call.
  const allowance = await takeAllowance(redis, { uid, limit: dailyLimit() });
  if (!allowance.ok) {
    res.setHeader("Retry-After", String(secondsToReset()));
    return res.status(429).json({ error: limitMessage(allowance.limit) });
  }

  try {
    /* Two things this endpoint makes, from the same description: the floor,
       and the sixteen props that stand on it. One endpoint rather than two
       because this project is on a plan that allows twelve serverless
       functions (ten in use, with generate-video.js); the shape of the call is identical and
       only the wrapper around the description differs. */
    /* And two more since: the void chart's own sheet of worlds, rocks and
       ships, and a whole picture to lie under a deck or the chart, asked for
       in the shape of what it covers and at 2K, since it is drawn across a
       whole screen rather than tiled from a corner of one. */
    const body = req.body || {};
    let prompt;
    let imageConfig = null;
    if (body.kind === "sprites") prompt = buildSpritesPrompt(body);
    else if (body.kind === "void_sprites") {
      prompt = buildVoidSpritesPrompt(body);
      imageConfig = { aspectRatio: "1:1", imageSize: "2K" };
    } else if (body.kind === "backdrop") {
      const aspect = IMAGE_ASPECTS.includes(body.aspect) ? body.aspect : "16:9";
      prompt = buildBackdropPrompt({ ...body, aspect });
      imageConfig = { aspectRatio: aspect, imageSize: "2K" };
    } else prompt = buildTexturePrompt(body);
    const { buf, mime } = await callGeminiImage(prompt, apiKey.trim(), imageConfig);
    res.setHeader("Content-Type", mime);
    res.setHeader("X-Prompt", encodeURIComponent(prompt.slice(0, 900)));
    return res.status(200).send(buf);
  } catch (err) {
    await giveBack(redis, allowance.key);          // nothing was made, so nothing is spent
    console.error("[generate-texture]", err && err.message);
    return res.status(502).json({ error: err.message || "generation_failed" });
  }
}
