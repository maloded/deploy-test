import { createHash, randomBytes } from "node:crypto";

/**
 * A fixed-window counter per client, IN MEMORY. This is enough for the prototype and is not more: every server
 * instance has its own counters and they are lost on a restart, so on a host with several instances the real limit is
 * higher. A production site needs a shared store or the host's own rate limiting. The client address is only used to
 * build a salted hash that lives in memory; the address itself is never kept or logged.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private salt = randomBytes(16);

  constructor(
    private limit: number,
    private windowMs: number,
    private maxKeys = 10_000,
  ) {}

  /** Counts one request; false when the client is over the limit. */
  allow(client: string, now: number = Date.now()): boolean {
    const key = createHash("sha256").update(this.salt).update(client).digest("base64url");
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  /** Drops expired entries; when everything is still live the oldest half goes (the map must not grow without bound). */
  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    if (this.hits.size >= this.maxKeys) [...this.hits.keys()].slice(0, Math.ceil(this.maxKeys / 2)).forEach((k) => this.hits.delete(k));
  }

  reset() {
    this.hits.clear();
  }
}

/** 5 posts per client per 10 minutes. */
export const leadLimiter = new RateLimiter(5, 10 * 60_000);
