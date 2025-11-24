// components/system/WalletConnectErrorFilter.tsx
"use client";

import { useEffect } from "react";

// All WalletConnect “normal cancel/timeout” messages we want to ignore
const TARGET_SUBSTRINGS = [
  "Connection request reset",
  "Connection request cancelled",
  "User closed modal",
  "Proposal expired",
];

function includesAny(msg: string): boolean {
  if (!msg) return false;
  return TARGET_SUBSTRINGS.some((s) => msg.includes(s));
}

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

        if (includesAny(msg)) {
          event.preventDefault();
          console.info("[WC] Ignored soft-cancel (unhandledrejection)", msg);
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

        if (includesAny(msg)) {
          event.preventDefault();
          console.info("[WC] Ignored soft-cancel (error event)", msg);
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener("error", errorHandler);

    // Patch console.error AFTER Next's patch, but skip filtered messages
    const originalConsoleError = console.error;

    function patchedConsoleError(...args: any[]) {
      try {
        const flat = args
          .map((a) =>
            typeof a === "string" ? a : a?.message || a?.toString?.() || ""
          )
          .join(" ");

        if (includesAny(flat)) {
          console.info("[WC] Ignored soft-cancel (console.error filtered)");
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
