import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Review (demo) switches, all from environment variables so the same code serves development, a password
 * protected review site and a final release.
 */

/** The review password, or undefined when it is missing or empty (then nothing is protected). */
export function reviewPassword(env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env.REVIEW_PASSWORD;
  return value && value.length > 0 ? value : undefined;
}

/** REVIEW_THEME_SWITCHER=1 shows the theme switcher in production (set it for a review only, never for a release). */
export function reviewSwitcherEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_THEME_SWITCHER === "1";
}

/** NEXT_PUBLIC_PROTOTYPE_NOTE (any non-empty value) shows the "Prototype" note in the footer. */
export function prototypeNoteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_PROTOTYPE_NOTE);
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Checks an "Authorization: Basic ..." header against the password. Any user name is accepted. Both sides are
 * hashed to the same length first, so the comparison is timing-safe whatever the lengths are.
 */
export function basicAuthOk(header: string | null | undefined, password: string): boolean {
  let given = "";
  const match = /^Basic\s+(.+)$/i.exec(header ?? "");
  if (match) {
    try {
      const decoded = Buffer.from(match[1].trim(), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon >= 0) given = decoded.slice(colon + 1); // the user name (before the first colon) is ignored
    } catch {
      given = "";
    }
  }
  const same = timingSafeEqual(digest(given), digest(password));
  return same && match !== null && given.length > 0;
}
