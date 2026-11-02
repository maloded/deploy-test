// What the visitor is looking at, for the voice agent's page_context answer (`view`). Read at the moment of the question, from the
// page itself, so it is right after a swipe or a tap and needs no observer or stored copy. No personal data: ids and counts.

import type { GalleryCategory } from "./gallery-model";

export type PageView = {
  /** The block most in view (hero, gallery, ...), or null. */
  section: string | null;
  category: GalleryCategory | null;
  /** The id of the photo on screen. */
  photo: string | null;
  /** 1-based, as in the counter "3 / 14". */
  index: number | null;
  total: number | null;
  /** The id of the open hotspot. */
  spot: string | null;
  /** Always false: the gallery has no full-screen viewer. The key stays so the agent's contract does not change. */
  fullscreen: boolean;
};

export const EMPTY_VIEW: PageView = { section: null, category: null, photo: null, index: null, total: null, spot: null, fullscreen: false };

/** The id of the box with the largest part inside the viewport (ties: the earlier one); null when none is in it. */
export function mostVisible(boxes: readonly { id: string; top: number; bottom: number }[], viewportHeight: number): string | null {
  let best: string | null = null;
  let bestPart = 0;
  for (const b of boxes) {
    const part = Math.min(b.bottom, viewportHeight) - Math.max(b.top, 0);
    if (part > bestPart) {
      best = b.id;
      bestPart = part;
    }
  }
  return best;
}

type GalleryLike = HTMLElement & { getView?: () => Omit<PageView, "section" | "fullscreen"> & { category: GalleryCategory } };

/** Reads the view from the document: the section by what is on screen, the gallery from its own getView(). */
export function readPageView(doc: Document = document): PageView {
  const order = (doc.querySelector<HTMLElement>("[data-block-order]")?.dataset.blockOrder ?? "").split(" ").filter(Boolean);
  const boxes = order.flatMap((id) => {
    const el = doc.getElementById(id);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return [{ id, top: r.top, bottom: r.bottom }];
  });
  const gallery = doc.getElementById("gallery") as GalleryLike | null;
  const g = typeof gallery?.getView === "function" ? gallery.getView() : null;
  const section = mostVisible(boxes, doc.defaultView?.innerHeight ?? 0);
  return g ? { section, category: g.category, photo: g.photo, index: g.index, total: g.total, spot: g.spot, fullscreen: false } : { ...EMPTY_VIEW, section };
}
