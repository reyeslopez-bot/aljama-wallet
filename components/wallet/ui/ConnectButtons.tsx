// /components/wallet/ui/ConnectButtons.tsx
"use client";

import { useState } from "react";
import { useConnect } from "wagmi";

const IGNORABLE_SUBSTRINGS = [
  "Connection request reset",
  "Connection request cancelled",
  "User closed modal",
];

function isIgnorableError(err: unknown): boolean {
  const msg =
    typeof err === "string"
      ? err
      : (err as any)?.message || (err as any)?.toString?.() || "";

  return IGNORABLE_SUBSTRINGS.some((s) => msg.includes(s));
}

export default function ConnectButtons() {
  const { connectors, connectAsync, isPending } = useConnect();
  const [error, setError] = useState<string | null>(null);

  async function handleConnect(connectorId?: string) {
    setError(null);

    // pick connector (you can change this to your own logic)
    const connector =
      connectors.find((c) => c.id === connectorId) ?? connectors[0];

    if (!connector) {
      setError("No wallet connectors are configured.");
      return;
    }

    try {
      await connectAsync({ connector });
      // success → nothing else to do, wagmi state will flip isConnected
    } catch (err) {
      if (isIgnorableError(err)) {
        // WC modal closed / reset: do not crash, no UI error
        console.info("WalletConnect request reset/cancelled:", err);
        return;
      }

      console.error("Wallet connect failed:", err);
      setError("Failed to connect wallet. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Single primary button; you can render per-connector buttons if you want */}
      <button
        type="button"
        onClick={() => handleConnect()}
        disabled={isPending}
        className="px-6 py-3 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium shadow-lg hover:brightness-110 disabled:opacity-60"
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center max-w-xs">{error}</p>
      )}
    </div>
  );
}
