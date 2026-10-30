"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { LANGUAGE_REGISTRY } from "@/lib/languages";

/** From this many languages on the header shows a dropdown with the current language instead of one text link per language. */
export const LANGUAGE_MENU_FROM = 3;

type Named = { code: string; name: string };

/**
 * Links to the same page in the other languages, labelled with each language's own name (`registry`: the languages' names, the
 * template's own list by default). The server renders plain `/<lang>` links (they work without JavaScript); once mounted, the current
 * #fragment (a block anchor or a gallery deep link) is added so the visitor stays where they were. Shown only by the header when the
 * seller offers several languages: two languages are two text links, LANGUAGE_MENU_FROM or more a dropdown (a <details> disclosure
 * of the same links: it opens and closes without JavaScript, with Escape and a click outside as the script's extras).
 */
export function LanguageSwitcher({ languages, current, label, registry = LANGUAGE_REGISTRY }: { languages: readonly string[]; current: string; label: string; registry?: readonly Named[] }) {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (languages.length < 2) return null;
  const nameOf = (code: string) => registry.find((l) => l.code === code)?.name ?? code;
  const link = (code: string) => (
    <a href={`/${code}${hash}`} lang={code} hrefLang={code} aria-current={code === current ? "true" : undefined}>
      {nameOf(code)}
    </a>
  );

  if (languages.length < LANGUAGE_MENU_FROM) {
    return (
      <nav className="lang-switch" aria-label={label}>
        {languages.map((code) => (
          <Fragment key={code}>{link(code)}</Fragment>
        ))}
      </nav>
    );
  }
  return (
    <nav className="lang-switch lang-switch--menu" aria-label={label}>
      <LanguageMenu label={label} currentName={nameOf(current)} currentCode={current}>
        {languages.map((code) => (
          <li key={code}>{link(code)}</li>
        ))}
      </LanguageMenu>
    </nav>
  );
}

function LanguageMenu({ label, currentName, currentCode, children }: { label: string; currentName: string; currentCode: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const close = (refocus: boolean) => {
      if (!menu.open) return;
      menu.open = false;
      if (refocus) menu.querySelector("summary")?.focus();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onPointer = (e: Event) => !menu.contains(e.target as Node | null) && close(false);
    const onFocusOut = (e: FocusEvent) => e.relatedTarget && !menu.contains(e.relatedTarget as Node) && close(false); // Tab out of the list
    menu.addEventListener("keydown", onKey);
    menu.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      menu.removeEventListener("keydown", onKey);
      menu.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);
  return (
    <details ref={ref} className="lang-menu">
      <summary className="lang-menu__current" aria-label={`${label}: ${currentName}`}>
        <span lang={currentCode}>{currentName}</span>
      </summary>
      <ul className="lang-menu__list">{children}</ul>
    </details>
  );
}
