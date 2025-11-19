"use client";

import { useEffect } from "react";

export function WalletConnectErrorFilter() {
  useEffect(() => {
    // 1) Filter unhandled promise rejections
    function rejectionHandler(event: PromiseRejectionEvent) {
      try {
        const r = event.reason as any;
        const msg =
          (typeof r === "string" && r) ||
          r?.message ||
          r?.toString?.() ||
          "";

        if (msg.includes("Connection request reset")) {
          event.preventDefault(); // swallow this specific WC cancel
          console.info("[WC] Ignored connection reset (unhandledrejection)");
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener("unhandledrejection", rejectionHandler);

    // 2) Patch console.error so Next dev overlay doesn't show for this message
    const originalConsoleError = console.error;

    function patchedConsoleError(...args: any[]) {
      try {
        const flat = args
          .map((a) =>
            typeof a === "string"
              ? a
              : a?.message || a?.toString?.() || ""
          )
          .join(" ");

        if (flat.includes("Connection request reset")) {
          // Log in a softer way, but don't trigger overlay
          originalConsoleError(
            "[WC filtered] Connection request reset (suppressed for overlay)"
          );
          return;
        }
      } catch {
        // fall through
      }

      originalConsoleError(...args);
    }

    console.error = patchedConsoleError;

    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
      console.error = originalConsoleError;
    };
  }, []);

  return null;
}
