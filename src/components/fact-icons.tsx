import type { ReactNode } from "react";

/**
 * Small line icons for the hero's key facts, keyed by the spec's key (the product type's own key: "year" is the first registration of a car). A key
 * without an entry has no icon, so other product types show none. 24 x 24, stroke in the label's colour (currentColor), no fill, decorative (aria-hidden):
 * the label beside it says what it is.
 */
const ICONS: Record<string, ReactNode> = {
  // first registration: a calendar
  year: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  // mileage: a road running away from the viewer, its middle line dashed
  mileage: (
    <>
      <path d="M9 3 5 21M15 3l4 18" />
      <path d="M12 5v3M12 11v3M12 17v3" />
    </>
  ),
  // power: an engine block with its intake on top and a shaft on each side
  power: (
    <>
      <rect x="6.5" y="9.5" width="11" height="9" rx="1.5" />
      <path d="M9.5 9.5v-3h5v3M3 12v3.5M6.5 14H3M21 12v3.5M17.5 14H21" />
    </>
  ),
  // gearbox: the H pattern of a gear shift
  gearbox: (
    <>
      <path d="M7 6v12M17 6v12M7 12h10" />
      <circle cx="7" cy="4.5" r="1.5" />
      <circle cx="17" cy="4.5" r="1.5" />
      <circle cx="7" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </>
  ),
};

/** The icon of a fact, or null when its key has none. */
export function FactIcon({ factKey }: { factKey: string }) {
  const icon = ICONS[factKey];
  if (!icon) return null;
  return (
    <svg className="hero__fact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {icon}
    </svg>
  );
}
