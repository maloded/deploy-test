"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SpecGroupView } from "@/lib/specs";

/** The phone: below 900px (the header's breakpoint, 56.25em). Wider screens show every group, as ever. */
const PHONE = "(width < 56.25em)";
const subscribe = (notify: () => void) => {
  const q = window.matchMedia?.(PHONE);
  q?.addEventListener?.("change", notify);
  return () => q?.removeEventListener?.("change", notify);
};
const phoneNow = () => Boolean(window.matchMedia?.(PHONE).matches);

export type SpecsStrings = { other: string; showAll: string; showLess: string };

/**
 * The groups of the specifications. Everything is in the HTML for search engines, screen readers and keyboards; on a phone only the first group is open and
 * the others are rows (title and chevron) that open and close with one tap (an accordion: several may be open), under them a text button that opens them
 * all and then says "Show less" and scrolls the section's title back into view as it closes them. The height animates over 250 ms (grid rows 0fr to 1fr; nothing
 * under reduced motion). Wide screens see every group as before: the toggles are inert there and the panels always shown.
 *
 * State is `data-open` on the group, in the server's HTML already, so a phone's first paint is the collapsed one (no jump after the script runs); the toggles are
 * buttons with aria-expanded and aria-controls. A link (or the agent) that targets a group or a row inside a collapsed group opens that group first, at once.
 */
export function SpecsGroups({ groups, strings }: { groups: SpecGroupView[]; strings: SpecsStrings }) {
  const first = groups[0]?.id;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(first ? [first] : []));
  // true on the server and in the first render: the markup is the phone's (collapsed); a wide window then switches to "all shown" at hydration
  const phone = useSyncExternalStore(subscribe, phoneNow, () => true);
  const root = useRef<HTMLDivElement>(null);
  const allOpen = open.size === groups.length;

  const toggle = (id: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const scrollTitle = useCallback(() => {
    const title = document.getElementById("specs")?.querySelector<HTMLElement>(".section-title");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    title?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  const toggleAll = () => {
    if (allOpen) {
      setOpen(new Set(first ? [first] : [])); // back to how it began
      requestAnimationFrame(scrollTitle);
    } else setOpen(new Set(groups.map((g) => g.id)));
  };

  // a hash that targets a group or a row of the specifications: open its group (at once, no animation) and bring the target into view
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const group = target?.closest<HTMLElement>("[data-group]");
      if (!target || !group || !root.current?.contains(target)) return;
      const gid = group.dataset.group!;
      if (!phoneNow() || group.dataset.open === "true") return; // wide window, or already open: the browser's own scroll is right
      root.current.dataset.instant = "";
      setOpen((now) => new Set(now).add(gid));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          target.scrollIntoView?.({ block: "start" });
          delete root.current?.dataset.instant;
        }),
      );
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  return (
    <div className="specs__body" ref={root}>
      <div className="specs__groups">
        {groups.map((g) => {
          const isOpen = open.has(g.id);
          const title = g.label ?? strings.other;
          return (
            <div className="specs__group" key={g.id} data-group={g.id} data-open={isOpen ? "true" : "false"}>
              <h3 className="label specs__heading">
                <button
                  type="button"
                  className="specs__toggle"
                  id={`specs-toggle-${g.id}`}
                  aria-expanded={phone ? isOpen : true}
                  aria-controls={`specs-panel-${g.id}`}
                  disabled={!phone}
                  onClick={() => toggle(g.id)}
                >
                  <span>{title}</span>
                  <svg className="specs__chevron" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </h3>
              <div className="specs__panel" id={`specs-panel-${g.id}`} role="region" aria-labelledby={`specs-toggle-${g.id}`}>
                <dl className="details">
                  {g.rows.map((r) => (
                    <div className="details__row" key={r.key} id={`spec-${r.key}`}>
                      <dt className="details__label">{r.label}</dt>
                      <dd className="details__value">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          );
        })}
      </div>
      {groups.length > 1 && (
        <button type="button" className="specs__all" aria-expanded={allOpen} aria-controls={groups.map((g) => `specs-panel-${g.id}`).join(" ")} onClick={toggleAll}>
          {allOpen ? strings.showLess : strings.showAll}
        </button>
      )}
    </div>
  );
}
