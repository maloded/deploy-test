// Where a hotspot sits on the screen. The stage shows a photo with object-fit: cover (cropped to the stage's ratio around its focus point),
// but a spot is placed on the PHOTO (0..1). This maps the photo's coordinates to the stage's, in percent of the stage.

export type Focus = { px: number; py: number };

/** "25% 75%" (the object-position of a slide) as fractions; centred when there is none or it is not in percent. */
export function parseFocus(position: string | undefined): Focus {
  const m = position ? /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(position) : null;
  return m ? { px: Number(m[1]) / 100, py: Number(m[2]) / 100 } : { px: 0.5, py: 0.5 };
}

/**
 * @param spot   x, y in 0..1 of the photo
 * @param image  the photo's size (any unit: only the ratio counts)
 * @param box    the stage's size (same: only the ratio counts); zero or missing means unknown and the spot is placed as is
 * @returns left and top in percent of the stage. A spot cropped away by the cover is clamped to the nearest edge, so it stays reachable.
 */
export function spotPlacement(
  spot: { x: number; y: number },
  image: { width: number; height: number },
  box: { width: number; height: number } | null,
  focus: Focus = { px: 0.5, py: 0.5 },
): { left: number; top: number } {
  if (!box || box.width <= 0 || box.height <= 0 || image.width <= 0 || image.height <= 0) return { left: spot.x * 100, top: spot.y * 100 };
  const r = image.width / image.height;
  const R = box.width / box.height;
  let left = spot.x;
  let top = spot.y;
  if (r > R) {
    const scale = r / R; // the photo is wider than the stage: its sides are cropped
    left = (1 - scale) * focus.px + spot.x * scale;
  } else if (r < R) {
    const scale = R / r; // taller: top and bottom are cropped
    top = (1 - scale) * focus.py + spot.y * scale;
  }
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { left: clamp(left) * 100, top: clamp(top) * 100 };
}
