"use client";

import { useEffect, useState } from "react";
import { languageEntry, type Language } from "@/lib/languages";

/**
 * Links to the same page in the other languages, labelled with each language's own name. The server renders plain
 * `/<lang>` links (they work without JavaScript); once mounted, the current #fragment (a block anchor or a gallery deep
 * link) is added so the visitor stays where they were. Shown only by the header when the seller offers several languages.
 */
export function LanguageSwitcher({ languages, current, label }: { languages: readonly Language[]; current: Language; label: string }) {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  return (
    <nav className="lang-switch" aria-label={label}>
      {languages.map((code) => {
        const entry = languageEntry(code);
        return (
          <a key={code} href={`/${code}${hash}`} lang={code} hrefLang={code} aria-current={code === current ? "true" : undefined}>
            {entry.name}
          </a>
        );
      })}
    </nav>
  );
}
