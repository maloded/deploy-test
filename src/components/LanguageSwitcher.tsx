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
 * seller offers several languages: two languages are two plain text links showing the language CODES ("DE / EN": the current one
 * bright, the other muted; a wide screen shows both, a narrow one only the other, as one short toggle). LANGUAGE_MENU_FROM or more: a
 * compact button with the current language's CODE ("EN ▾", a small globe before it) and a dropdown with one row per language: the code in a
 * pill, the language's own name, the current one marked (a check mark and the accent colour). It is
 * a <details> disclosure of the same links (it opens and closes without JavaScript); the script adds Escape (closes, focus back on the
 * button), ArrowDown/ArrowUp/Home/End between the rows, and a click or Tab outside closes it. A row's accessible name is the language's own name.
 */
export function LanguageSwitcher({ languages, current, label, choose, registry = LANGUAGE_REGISTRY }: { languages: readonly string[]; current: string; label: string; choose?: string; registry?: readonly Named[] }) {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (languages.length < 2) return null;
  const nameOf = (code: string) => registry.find((l) => l.code === code)?.name ?? code;
  const href = (code: string) => `/${code}${hash}`;

  if (languages.length < LANGUAGE_MENU_FROM) {
    return (
      <nav className="lang-switch lang-switch--codes" aria-label={label}>
        {languages.map((code, i) => (
          <Fragment key={code}>
            {i > 0 && (
              <span className="lang-switch__sep" aria-hidden="true">
                /
              </span>
            )}
            <a href={href(code)} lang={code} hrefLang={code} aria-current={code === current ? "true" : undefined} aria-label={nameOf(code)}>
              {code.toUpperCase()}
            </a>
          </Fragment>
        ))}
      </nav>
    );
  }
  const title = choose ?? label;
  return (
    <nav className="lang-switch lang-switch--menu" aria-label={title}>
      <LanguageMenu title={title} currentName={nameOf(current)} currentCode={current}>
        {languages.map((code) => {
          const isCurrent = code === current;
          return (
            <li key={code}>
              <a href={href(code)} lang={code} hrefLang={code} aria-current={isCurrent ? "true" : undefined}>
                <span className="lang-menu__code" aria-hidden="true">
                  {code.toUpperCase()}
                </span>
                <span className="lang-menu__name">{nameOf(code)}</span>
                <svg className="lang-menu__check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </li>
          );
        })}
      </LanguageMenu>
    </nav>
  );
}

function LanguageMenu({ title, currentName, currentCode, children }: { title: string; currentName: string; currentCode: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const summary = () => menu.querySelector<HTMLElement>("summary");
    const rows = () => Array.from(menu.querySelectorAll<HTMLAnchorElement>(".lang-menu__list a"));
    const close = (refocus: boolean) => {
      if (!menu.open) return;
      menu.open = false;
      if (refocus) summary()?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close(true);
      const list = rows();
      const at = list.indexOf(document.activeElement as HTMLAnchorElement);
      const onButton = document.activeElement === summary();
      let next = -1;
      if (e.key === "ArrowDown") next = onButton ? Math.max(0, list.findIndex((a) => a.getAttribute("aria-current") === "true")) : (at + 1) % list.length;
      else if (e.key === "ArrowUp" && !onButton) next = (at - 1 + list.length) % list.length;
      else if (e.key === "Home" && !onButton) next = 0;
      else if (e.key === "End" && !onButton) next = list.length - 1;
      if (next < 0) return;
      e.preventDefault();
      menu.open = true;
      list[next]?.focus();
    };
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
      <summary className="lang-menu__current" aria-label={`${title}: ${currentName}`}>
        <svg className="lang-menu__globe" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="8" cy="8" r="6.4" />
            <ellipse cx="8" cy="8" rx="2.8" ry="6.4" />
            <path d="M1.6 8h12.8" />
          </g>
        </svg>
        <span className="lang-menu__current-code" lang={currentCode}>
          {currentCode.toUpperCase()}
        </span>
      </summary>
      <ul className="lang-menu__list">{children}</ul>
    </details>
  );
}
