// Switching the theme in the browser: load the other theme's stylesheet on demand (first click), then flip data-theme and
// remember the mode. Browser-only helpers; the choice logic (which theme to start in) is in theme-pref.ts.
import { THEMES_URL, writeStoredMode, type ThemeMode, type ThemePair } from "./theme-pref";

/** How long to wait for a stylesheet before giving up (the theme then stays as it is). */
export const THEME_LOAD_TIMEOUT_MS = 8000;

const linkOf = (doc: Document, theme: string) => doc.querySelector<HTMLLinkElement>(`link[data-theme-css="${theme}"]`);

/**
 * Resolves when the theme's stylesheet is in the page and loaded: at once when it already is (the server's, or one the head
 * script wrote, or an earlier click), otherwise after fetching it. Rejects when it fails or takes too long.
 */
export function loadThemeStylesheet(doc: Document, theme: string, timeoutMs: number = THEME_LOAD_TIMEOUT_MS): Promise<void> {
  const existing = linkOf(doc, theme);
  if (existing?.sheet) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const link = existing ?? doc.createElement("link");
    const timer = setTimeout(() => done(new Error(`theme "${theme}" took too long to load`)), timeoutMs);
    function done(error?: Error) {
      clearTimeout(timer);
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", onError);
      if (error) {
        if (!existing) link.remove(); // a failed fetch leaves no dead link behind, so the next click can try again
        reject(error);
      } else resolve();
    }
    const onLoad = () => done();
    const onError = () => done(new Error(`theme "${theme}" could not be loaded`));
    link.addEventListener("load", onLoad);
    link.addEventListener("error", onError);
    if (!existing) {
      link.rel = "stylesheet";
      link.href = `${THEMES_URL}${theme}.css`;
      link.setAttribute("data-theme-css", theme);
      doc.head.appendChild(link);
    }
  });
}

/** The phone's address-bar colour follows the theme's page background (the same --bg token the server used for the first theme). */
function syncThemeColor(doc: Document) {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const bg = doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue("--bg").trim();
  if (bg) meta.content = bg;
}

/** Switches to a mode: loads its stylesheet if needed, then sets data-theme and stores the choice. Rejects (changing nothing) when the stylesheet cannot be loaded. */
export async function applyThemeMode(doc: Document, storage: Pick<Storage, "getItem" | "setItem"> | undefined, pair: ThemePair, mode: ThemeMode): Promise<void> {
  const theme = pair[mode];
  await loadThemeStylesheet(doc, theme);
  doc.documentElement.setAttribute("data-theme", theme);
  writeStoredMode(storage, mode);
  syncThemeColor(doc);
}
