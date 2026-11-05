/**
 * The hero's three measured fits, in ONE self-contained function, so that the very same code runs in two places:
 *  - as an inline script right after the hero's markup (heroFitScript, see Hero.tsx): before the first paint, so the page is painted with its final layout
 *    and nothing moves when the scripts of the page have loaded and hydrated;
 *  - from the page's script (HeroFit.tsx), again on every resize and when the fonts have arrived.
 * The fits: the key facts in ONE row (--fact-scale and data-fact-row, see fact-fit.ts), the invitation's heading on ONE line (--intro-scale) and the height of the
 * hero's row for the card's slot (--hero-slot-h: the slot is 4:5 of it wide, see .hero__slot).
 *
 * WHERE the results go: React renders none of these properties, and the script must not touch an attribute React renders (the hero's elements are hydrated, and a
 * script that changed one before hydration is a mismatch React reports and does not patch). So the numbers go on <html> (custom properties inherit; --fact-scale,
 * --intro-scale and --hero-slot-h are read by the elements below it) and the one attribute the CSS needs, the facts' row mode, is data-fact-row on <html> as well. <html> is
 * the one element the layout already marks suppressHydrationWarning, for the theme script that sets its data-theme before hydration.
 *
 * It must stay free of imports and helpers (its source text is inlined into the page) and of syntax that a build turns into a helper call; the numbers are
 * those of fact-fit.ts (a test compares the two). Nothing here may throw: an inline script that throws only costs the early fit.
 */
export type HeroFitParts = { facts?: string; heading?: string; slot?: string };

export function heroFit(hero: HTMLElement | null, parts: HeroFitParts): void {
  if (!hero) return;
  const root = document.documentElement;
  const wide = !!window.matchMedia && window.matchMedia("(min-width: 56em)").matches;

  // the key facts: the largest scale (0.8 to 1) at which one row fits; below it the values wrap inside their tiles
  const row = parts.facts ? hero.querySelector<HTMLElement>(parts.facts) : null;
  if (row) {
    if (!wide || row.clientWidth < 640) {
      root.style.setProperty("--fact-scale", "1");
      delete root.dataset.factRow;
    } else {
      root.style.setProperty("--fact-scale", "1");
      delete root.dataset.factRow;
      const needs: { value: number; label: number }[] = [];
      const facts = row.querySelectorAll<HTMLElement>(".hero__fact");
      for (let i = 0; i < facts.length; i++) {
        const value = facts[i].querySelector<HTMLElement>(".hero__fact-value");
        const label = facts[i].querySelector<HTMLElement>(".hero__fact-label");
        let v = 0;
        if (value) {
          const r = document.createRange();
          r.selectNodeContents(value);
          v = r.getBoundingClientRect().width;
        }
        let l = 0;
        if (label) {
          const before = label.style.width;
          label.style.width = "min-content";
          l = label.getBoundingClientRect().width;
          label.style.width = before;
          if (!label.getAttribute("style")) label.removeAttribute("style"); // React rendered none: leave no empty attribute behind
        }
        needs.push({ value: v, label: l });
      }
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const available = row.clientWidth;
      const width = (scale: number) => {
        let sum = gap * Math.max(0, needs.length - 1);
        for (let i = 0; i < needs.length; i++) sum += Math.max(needs[i].value * scale, needs[i].label);
        return sum;
      };
      let scale = 1;
      let wrap = false;
      if (needs.length > 0 && width(1) > available) {
        if (width(0.8) > available) {
          scale = 0.8;
          wrap = true;
        } else {
          let lo = 0.8;
          let hi = 1;
          for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) / 2;
            if (width(mid) <= available) lo = mid;
            else hi = mid;
          }
          scale = Math.floor(lo * 1000) / 1000;
        }
      }
      root.style.setProperty("--fact-scale", String(scale));
      root.dataset.factRow = wrap ? "wrap" : "one";
    }
  }

  // the invitation's heading: one line; the size scales down (0.75 at the least) to fit 97 % of its room
  const heading = parts.heading ? hero.querySelector<HTMLElement>(parts.heading) : null;
  if (heading) {
    if (!wide) root.style.removeProperty("--intro-scale");
    else {
      root.style.setProperty("--intro-scale", "1");
      const r = document.createRange();
      r.selectNodeContents(heading);
      const natural = r.getBoundingClientRect().width;
      const room = heading.clientWidth;
      let scale = 1;
      if (natural > 0 && room > 0 && natural > room * 0.97) scale = Math.max(0.75, Math.floor(((room * 0.97) / natural) * 1000) / 1000);
      root.style.setProperty("--intro-scale", String(scale));
    }
  }

  // the card's slot: its row's height (the facts above may have changed the bottom row, so this comes last)
  const slot = parts.slot ? hero.querySelector<HTMLElement>(parts.slot) : null;
  const slotRow = slot && slot.parentElement;
  if (slotRow) root.style.setProperty("--hero-slot-h", `${slotRow.getBoundingClientRect().height}px`);
}

/**
 * The page's inline script: fit now (before the first paint), then again when the fonts in use have arrived, and only then show the hero (data-hero-pending on <html>, see the CSS).
 * `parts` are the selectors of what this page has (the facts' row, the invitation's heading, the card's slot); a page without one leaves it out.
 */
export function heroFitScript(parts: HeroFitParts): string {
  return `(function(){var h=document.getElementById("hero");if(!h)return;var p=${JSON.stringify(parts)};var fit=${heroFit.toString()};var done=function(){try{fit(h,p)}catch(e){}document.documentElement.removeAttribute("data-hero-pending")};try{fit(h,p)}catch(e){}if(document.fonts&&document.fonts.ready){document.fonts.ready.then(done,done)}else done()})()`;
}
