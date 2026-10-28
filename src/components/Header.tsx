import { pick } from "@/lib/i18n";
import { startTrackId } from "@/lib/music";
import { ui } from "@/lib/ui-strings";
import type { SellerAgent } from "@/lib/seller";
import { AgentWidget } from "./AgentWidget";
import type { Site } from "./blocks";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MusicPlayer } from "./MusicPlayer";
import { presetFor } from "./request-presets";

/**
 * Header strip: the seller's brand on the left; on the right the language switcher (only when the seller offers more
 * than one language), the background music player (only when the product has music) and the primary button to #contact. Not sticky. With the assistant in the header (`agent`, placement
 * "header") the button is not rendered: the right side is the language switcher, a short label and the widget (the form
 * stays reachable through the hero and offer buttons and the footer).
 */
export function Header({ site, agent }: { site: Site; agent?: SellerAgent | null }) {
  const { lang } = site;
  const { languages, music } = site.product;
  return (
    <header className={agent ? "site-header site-header--agent" : "site-header"}>
      <div className="site-header__inner container">
        <span className="site-header__name">{site.seller.displayName}</span>
        <div className="site-header__end">
          {languages.length > 1 && <LanguageSwitcher languages={languages} current={lang} label={ui("lang.switch", lang)} />}
          {music && (
            <MusicPlayer
              lang={lang}
              tracks={music.tracks.map((t) => ({ id: t.id, title: pick(t.title, lang), src: `/media/${site.ref}/${t.file}` }))}
              defaultTrack={startTrackId(music)}
              volume={music.volume}
              autostart={music.autostart}
            />
          )}
          {agent ? (
            <div className="site-header__agent">
              <span className="site-header__ask">{ui("agent.ask", lang)}</span>
              <AgentWidget agent={agent} lang={lang} product={site.ref} />
            </div>
          ) : (
            <a className="button button--small" href="#contact" data-request-type={presetFor("header", site)}>
              {ui("header.cta", lang)}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
