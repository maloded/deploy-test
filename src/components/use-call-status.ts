"use client";

import { useEffect, useState } from "react";
import { watchCallStatus, type CallStatus, type WidgetHost } from "@/lib/hanc-bridge";

/** The call status of the widget (idle, connecting, connected, error), read through the bridge; idle until the widget is there. */
export function useCallStatus(host?: WidgetHost | null): CallStatus {
  const [status, setStatus] = useState<CallStatus>("idle");
  useEffect(() => {
    if (!host) return;
    const stop = watchCallStatus(host, setStatus);
    return () => {
      stop();
      setStatus("idle");
    };
  }, [host]);
  return status;
}
