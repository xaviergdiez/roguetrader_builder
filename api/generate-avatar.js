// Generates a character portrait with Gemini.
//
// Behind sign-in deliberately: this spends money per call, so an open endpoint
// is a billing liability however harmless it looks.
//
// Returns the image bytes rather than base64 JSON — base64 inflates a ~900KB
// portrait by a third for no benefit, and the browser re-encodes it anyway.
//
// Unlike shadow-run_builder's version there is no sharp dependency and no
// Upstash write: this app keeps portraits as data URLs in the browser, so the
// caller shrinks the image client-side. See shrinkToDataUrl in the component.

import { requireUser } from "../lib/auth.js";
import { buildPrompt } from "../lib/prompt.js";

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
    // The prompt is assembled here, from the character's origin path, rather
    // than accepted from the client: a signed-in caller should not be able to
    // turn this into a general-purpose image generator on the owner's key.
    const prompt = buildPrompt(req.body || {});
    const { buf, mime } = await callGeminiImage(prompt, apiKey.trim());
    res.setHeader("Content-Type", mime);
    res.setHeader("X-Prompt", encodeURIComponent(prompt.slice(0, 900)));
    return res.status(200).send(buf);
  } catch (err) {
    console.error("[generate-avatar]", err && err.message);
    return res.status(502).json({ error: err.message || "generation_failed" });
  }
}
