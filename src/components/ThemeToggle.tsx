"use client";

import { useRef, useSyncExternalStore } from "react";
import type { Language } from "@/lib/schema";
import { applyThemeMode } from "@/lib/theme-apply";
import { modeOf, type ThemePair } from "@/lib/theme-pref";
import { ui } from "@/lib/ui-strings";

/** Follows the data-theme attribute of <html>: the head script, a click here or anything else that sets it. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined; // the accessor itself can throw (blocked site data)
  }
};

/**
 * The light/dark switch in the header: a toggle button (aria-pressed is "dark theme is on"; the label does not change, the
 * state does). It swaps the product's theme for the other bundled one. The other theme's stylesheet and fonts are fetched at
 * the first click, not before; the choice is stored as "light" or "dark" (try/catch) and applied before paint by the head
 * script on the next visit. The icon shows what a click switches to. Rendered only when the product's theme has a counterpart.
 */
export function ThemeToggle({ lang, theme, pair }: { lang: Language; theme: string; pair: ThemePair }) {
  const current = useSyncExternalStore(subscribe, () => document.documentElement.getAttribute("data-theme") ?? theme, () => theme);
  const busy = useRef(false);
  const dark = modeOf(current, pair) === "dark";

  const toggle = () => {
    if (busy.current) return; // a click while the stylesheet is still coming in
    busy.current = true;
    applyThemeMode(document, storage(), pair, dark ? "light" : "dark")
      .catch(() => {}) // the stylesheet did not load: the page stays in its theme
      .finally(() => {
        busy.current = false;
      });
  };

  return (
    <button type="button" className="theme-toggle" aria-pressed={dark} aria-label={ui("theme.toggle", lang)} onClick={toggle}>
      {dark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
        </svg>
      )}
    </button>
  );
}
