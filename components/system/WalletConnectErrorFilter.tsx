// components/system/WalletConnectErrorFilter.tsx
"use client";

import { useEffect } from "react";

const TARGET_SUBSTRING = "Connection request reset";

export function WalletConnectErrorFilter() {
  useEffect(() => {
    function rejectionHandler(event: PromiseRejectionEvent) {
      try {
        const r = event.reason as any;
        const msg =
          (typeof r === "string" && r) ||
          r?.message ||
          r?.toString?.() ||
          "";

        if (msg.includes(TARGET_SUBSTRING)) {
          event.preventDefault();
          console.info("[WC] Ignored connection reset (unhandledrejection)");
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener("unhandledrejection", rejectionHandler);

    function errorHandler(event: ErrorEvent) {
      try {
        const msg =
          event.message ||
          (event.error && (event.error as any).message) ||
          event.error?.toString?.() ||
          "";

        if (msg.includes(TARGET_SUBSTRING)) {
          event.preventDefault();
          console.info("[WC] Ignored connection reset (error event)");
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener("error", errorHandler);

    // 3) Patch console.error AFTER Next's patch, but don't call it on filtered msgs
    const originalConsoleError = console.error;

    function patchedConsoleError(...args: any[]) {
      try {
        const flat = args
          .map((a) =>
            typeof a === "string" ? a : a?.message || a?.toString?.() || ""
          )
          .join(" ");

        if (flat.includes(TARGET_SUBSTRING)) {
          console.info("[WC] Ignored connection reset (console.error filtered)");
          return;
        }
      } catch {
        // fallback
      }

      originalConsoleError(...args);
    }

    console.error = patchedConsoleError;

    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
      window.removeEventListener("error", errorHandler);
      console.error = originalConsoleError;
    };
  }, []);

  return null;
}
