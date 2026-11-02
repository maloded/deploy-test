"use client";

import { useSyncExternalStore } from "react";
import { THEME_PAIR } from "@/lib/theme-pref";

/** Follows the data-theme attribute of <html>: the head script, the header's toggle or anything else that sets it. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/**
 * Whether the page is in the dark theme now. `serverTheme` is the theme the server rendered (the first, hydrating render uses it, so
 * the markup matches); after that the answer is the real data-theme, so the card changes with the header's toggle.
 */
export function useDarkTheme(serverTheme?: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute("data-theme") === THEME_PAIR.dark,
    () => serverTheme === THEME_PAIR.dark,
  );
}
