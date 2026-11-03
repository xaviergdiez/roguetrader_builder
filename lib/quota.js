/* A daily allowance for what costs money on every call.

   Portrait and battle-map image generation are billed per call to the owner's
   Gemini key. They are behind sign-in, and OWNER_EMAIL can narrow who may sign
   in, but with that unset any Google account could run up the bill without
   limit. This counts each account's calls per UTC day and says no past a limit.

   The counter is Redis INCR on a key that carries the day, set to expire a day
   after it stops mattering, so there is nothing to reset or clean up. A call
   that then fails on Google's side is handed back with giveBack, so an outage
   does not use up anyone's allowance. Pure, with the client passed in: see
   quota.check.mjs. */

export const DEFAULT_DAILY_IMAGES = 40;
const TWO_DAYS = 2 * 24 * 60 * 60;

export const dayStamp = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// IMAGE_DAILY_LIMIT, if it is a whole number of 1 or more; otherwise the default. 0 is not "off":
// it would silently disable a feature, so it is treated as a typo.
export function dailyLimit(env = process.env) {
  const n = Number(String(env.IMAGE_DAILY_LIMIT ?? '').trim());
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_DAILY_IMAGES;
}

export async function takeAllowance(redis, { uid, limit = DEFAULT_DAILY_IMAGES, kind = 'images', ns = 'rt:', now = Date.now() } = {}) {
  const key = `${ns}quota:${kind}:${uid}:${dayStamp(now)}`;
  const counted = await redis.incr(key);
  if (counted === 1) await redis.expire(key, TWO_DAYS);
  if (counted > limit) {
    // A refusal is not a generation: take its count back, so the counter says what was made
    // and a client that keeps asking cannot inflate it.
    await redis.decr(key);
    return { ok: false, used: limit, limit, key };
  }
  return { ok: true, used: counted, limit, key };
}

// Hands one back after a call that did not produce what was paid for. Never throws: it runs in an error path.
export async function giveBack(redis, key) {
  try { await redis.decr(key); } catch { /* the allowance stays spent; the call already failed */ }
}

export const limitMessage = (limit) =>
  `That is today's limit of ${limit} generated images on this account. It resets at midnight UTC.`;

// Seconds until the next UTC midnight, for Retry-After.
export const secondsToReset = (now = Date.now()) => {
  const d = new Date(now);
  return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000));
};
