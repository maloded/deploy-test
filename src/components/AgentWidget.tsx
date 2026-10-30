"use client";

import { createElement, useEffect, useState } from "react";
import { buildPageContext } from "@/lib/agent-context";
import { registerAgentBridge } from "@/lib/agent-bridge";
import { getFormSnapshot } from "@/lib/form-snapshot";
import type { ResolvedAvatar } from "@/lib/avatar-manifest";
import type { WidgetHost } from "@/lib/hanc-bridge";
import type { Language } from "@/lib/schema";
import type { SellerAgent } from "@/lib/seller";
import { ui } from "@/lib/ui-strings";
import { AgentAvatarCard } from "./AgentAvatarCard";
import { AgentStartButton } from "./AgentStartButton";

/**
 * The voice assistant widget. It is rendered only for a seller that has an `agent` object in seller.json. The widget
 * package is imported here, in the browser, after the page has loaded (never during the build or on the server, and never
 * from a CDN), so the prerendered HTML holds only the heading of the inline strip.
 *
 * Elements (hanc-webrtc-widgets 2.11.0): inline = <hanc-ai-inline-call>, pill = <hanc-ai-pill-call>, floating = <hanc-ai-pill-floating-call>.
 * placement "header": the pill in the header; "top": a slim strip below the header; "bottom" (default): the strip above the footer.
 * With an `avatar` (agent.avatar in seller.json) none of these applies: the card in the bottom-right corner holds the widget as its
 * start button (<hanc-ai-pill-floating-call position="static">, the one pill without `contain: layout`, see AgentAvatarCard), and
 * variant and placement are ignored. If the widget package cannot be loaded, the card offers the contact link instead.
 */
export function AgentWidget({ agent, lang, product, avatar, requestType, heroSlot = false }: { agent: SellerAgent; lang: Language; product: string; avatar?: ResolvedAvatar | null; requestType?: string; heroSlot?: boolean }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [host, setHost] = useState<WidgetHost | null>(null); // the widget element of the avatar card, for its own start button

  useEffect(() => {
    let live = true;
    import("hanc-webrtc-widgets").then(
      () => live && setReady(true),
      () => live && setFailed(true), // the widget is an extra: a failed load leaves the page as it is (the card offers the contact link)
    );
    return () => {
      live = false;
    };
  }, []);

  // the command handler exists only while the widget is mounted
  useEffect(() => {
    if (!ready) return;
    return registerAgentBridge({ lang, answer: () => buildPageContext({ language: lang, product, path: window.location.pathname, title: document.title, snapshot: getFormSnapshot() }) });
  }, [ready, lang, product]);

  const common = {
    "agent-id": agent.id,
    "voice-service-url": agent.voiceServiceUrl,
    "button-start-text": ui("agent.start", lang),
    "button-connecting-text": ui("agent.connecting", lang),
    ...(agent.theme ? { theme: agent.theme } : {}),
  };

  if (avatar) {
    return (
      <AgentAvatarCard avatar={avatar} lang={lang} host={host} slot={heroSlot}>
        {ready ? (
          <>
            {createElement("hanc-ai-pill-floating-call", { ...common, position: "static", "button-end-text": ui("agent.end", lang), "orb-size": "36", ref: setHost })}
            <AgentStartButton host={host} lang={lang} name={avatar.name} startLabel={avatar.startLabel} endLabel={avatar.endLabel} icon={avatar.buttonIcon} />
          </>
        ) : (
          failed && (
            <a className="button button--small" href="#contact" data-request-type={requestType}>
              {ui("header.cta", lang)}
            </a>
          )
        )}
      </AgentAvatarCard>
    );
  }

  if (agent.variant === "floating") {
    // fixed in the corner; the footer keeps room below its last line for it (Footer, site-footer--agent-floating)
    return ready ? createElement("hanc-ai-pill-floating-call", { ...common, position: "bottom-right" }) : null;
  }

  const top = agent.placement === "top";
  const widget =
    ready &&
    (agent.variant === "pill"
      ? createElement("hanc-ai-pill-call", { ...common, "button-start-text": ui("agent.pill", lang), "button-end-text": ui("agent.end", lang), "orb-size": "36" })
      : createElement("hanc-ai-inline-call", top ? { ...common, size: "100", "container-padding": "8" } : { ...common, size: "220", "container-padding": "20" }));

  if (agent.placement === "header" && agent.variant === "pill") {
    // in the header (rendered by Header): just the widget in a slot of fixed height, so mounting it moves nothing
    return <div className="site-header__widget">{widget}</div>;
  }
  if (top) {
    // right below the header, in normal flow: the hero's height accounts for it (--agent-top-h, set by ProductLayout)
    return (
      <section className="agent-strip agent-strip--top" data-block="agent" data-placement="top" aria-label={ui("agent.heading", lang)}>
        <div className="container agent-strip__inner agent-strip__inner--top">
          <p className="agent-strip__text">{ui("agent.top", lang)}</p>
          <div className="agent-strip__widget agent-strip__widget--top">{widget}</div>
        </div>
      </section>
    );
  }
  return (
    <section className={agent.variant === "pill" ? "agent-strip agent-strip--pill" : "agent-strip"} data-block="agent" aria-labelledby="agent-heading">
      <div className="container agent-strip__inner">
        <h2 id="agent-heading" className="agent-strip__heading">
          {ui("agent.heading", lang)}
        </h2>
        <div className="agent-strip__widget">{widget}</div>
      </div>
    </section>
  );
}
