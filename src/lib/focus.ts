import type { Focus } from "./schema";

/** CSS object-position for a photo's focus point; undefined (browser default: centre) when not set. */
export function objectPosition(focus: Focus | undefined): string | undefined {
  if (!focus) return undefined;
  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  return `${pct(focus.x)} ${pct(focus.y)}`;
}
