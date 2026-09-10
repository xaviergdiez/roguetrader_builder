// Lives outside /api on purpose: Vercel turns every .js file under /api into a
// serverless function, and the Hobby plan caps a deployment at 12.
import { Redis } from "@upstash/redis";

// Every key this app writes carries this prefix, so one Upstash database can
// hold this build alongside the Shadowrun ("sr:") and D&D (unprefixed) ones
// without them seeing each other. The collision it prevents is not per-character
// state but the user record: auth keys on the Google account alone, so
// unprefixed all three apps would share one user object.
export const NS = "rt:";

// Vercel's Upstash integration provisions KV_REST_API_URL / KV_REST_API_TOKEN,
// but Redis.fromEnv() only looks at UPSTASH_REDIS_REST_URL / _TOKEN. Accept
// either pair, and treat an empty string as absent: `vercel env pull` writes
// the names it has no value for as "", which fromEnv() would happily take and
// then fail on at request time. Pure so storage.check.mjs can exercise it.
export function redisConfigFromEnv(env = process.env) {
  const pick = (...names) => {
    for (const name of names) {
      const v = env[name];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  return {
    url: pick("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"),
    token: pick("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"),
  };
}

// One key per character rather than one blob for the roster. Upstash caps a
// record at 1MB and a portrait is a few hundred KB as a data URL, so a single
// list would break at a handful of saved characters. The small {id,name,career}
// index lives on the user record instead; only the body lands here.
export const charKey = (uid, cid) => `${NS}char:${uid}:${cid}`;

// Character ids reach this from the client and are concatenated into a Redis
// key, so they are checked rather than trusted: a ":" or "*" would let a caller
// address keys outside their own namespace.
export const isCharId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);

const cfg = redisConfigFromEnv();
if (!cfg.url || !cfg.token) {
  // Fail loudly at cold start rather than with an opaque error mid-request.
  throw new Error(
    "Redis is not configured. Set UPSTASH_REDIS_REST_URL and " +
      "UPSTASH_REDIS_REST_TOKEN, or the KV_REST_API_URL / KV_REST_API_TOKEN " +
      "pair that the Vercel Upstash integration provides."
  );
}

const redis = new Redis({ url: cfg.url, token: cfg.token });

export { redis };
