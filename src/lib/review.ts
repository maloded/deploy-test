/**
 * Review (demo) switches, all from environment variables so the same code serves development, a review site
 * and a final release.
 */

/** REVIEW_THEME_SWITCHER=1 shows the theme switcher in production (set it for a review only, never for a release). */
export function reviewSwitcherEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.REVIEW_THEME_SWITCHER === "1";
}

/** NEXT_PUBLIC_PROTOTYPE_NOTE (any non-empty value) shows the "Prototype" note in the footer. */
export function prototypeNoteEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_PROTOTYPE_NOTE);
}
