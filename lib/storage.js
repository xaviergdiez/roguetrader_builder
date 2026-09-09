// Lives outside /api on purpose: Vercel turns every .js file under /api into a
// serverless function, and the Hobby plan caps a deployment at 12.
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Every key this app writes carries this prefix, so one Upstash database can
// hold this build alongside the Shadowrun ("sr:") and D&D (unprefixed) ones
// without them seeing each other. The collision it prevents is not per-character
// state but the user record: auth keys on the Google account alone, so
// unprefixed all three apps would share one user object.
export const NS = "rt:";

export { redis };
