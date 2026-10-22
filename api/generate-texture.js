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
import { buildTexturePrompt } from "../lib/mapprompt.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-3.1-flash-image";

async function callGeminiImage(prompt, apiKey) {
  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] }
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

  try {
    const prompt = buildTexturePrompt(req.body || {});
    const { buf, mime } = await callGeminiImage(prompt, apiKey.trim());
    res.setHeader("Content-Type", mime);
    res.setHeader("X-Prompt", encodeURIComponent(prompt.slice(0, 900)));
    return res.status(200).send(buf);
  } catch (err) {
    console.error("[generate-texture]", err && err.message);
    return res.status(502).json({ error: err.message || "generation_failed" });
  }
}
