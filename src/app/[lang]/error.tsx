"use client";

import { StatusPage } from "@/components/StatusPage";
import { useStatus } from "@/components/StatusContext";
import { statusText } from "@/lib/status-texts";

/**
 * The error page of a language route (an error while the page runs; the layout stays). It never shows the error: no message, no stack, no
 * digest (the `error` prop is not even read). Its few texts come from the layout through StatusProvider, English from status-texts if
 * that is missing. noindex like every status page.
 */
export default function Error({ reset }: { error: unknown; reset: () => void }) {
  const s = useStatus();
  return (
    <StatusPage
      noindex
      brand={s?.brand ?? ""}
      title={s?.title ?? statusText("error.title", "en")}
      text={s?.text ?? statusText("error.text", "en")}
      homeHref={s?.homeHref ?? "/"}
      homeLabel={s?.back ?? statusText("page.back", "en")}
    >
      <button type="button" className="button button--outline" onClick={() => reset()}>
        {s?.retry ?? statusText("error.retry", "en")}
      </button>
    </StatusPage>
  );
}
