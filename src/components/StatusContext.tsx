"use client";

import { createContext, useContext, type ReactNode } from "react";

/** What the error boundary of a language route needs, and nothing more: the few texts of the error page, the brand and the way back. */
export type StatusValue = { lang: string; brand: string; homeHref: string; title: string; text: string; retry: string; back: string };

const StatusContext = createContext<StatusValue | null>(null);

/** Set by the [lang] layout (a server component), which hands over only these few strings, never the UI string bundle. */
export function StatusProvider({ value, children }: { value: StatusValue; children: ReactNode }) {
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export const useStatus = (): StatusValue | null => useContext(StatusContext);
