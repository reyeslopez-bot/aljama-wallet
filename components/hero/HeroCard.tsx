'use client';

import { useState } from "react";
import { useWalletPanels } from "../wallet/context/WalletPanelsContext";
import { useAljamaWallet } from "../wallet/context/WalletContext"; // ✅ global wallet context

export default function Hero() {
  const { openPanels } = useWalletPanels();
  const { setWalletFromData } = useAljamaWallet(); // ✅ pull from context

  const [walletData, setWalletData] = useState<null | {
    address: string;
    mnemonic: string;
  }>(null);

  const createWallet = async () => {
    try {
      const res = await fetch("/api/create-wallet", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create wallet");
      const data = await res.json();

      // ✅ Store private key in sessionStorage and global context
      setWalletFromData({ privateKey: data.privateKey });

      // Show secure modal
      setWalletData({
        address: data.address,
        mnemonic: data.mnemonic,
      });
    } catch (err) {
      console.error("Wallet creation failed", err);
      alert("❌ Failed to create wallet.");
    }
  };

  return (
    <section className="relative h-screen overflow-x-hidden bg-no-repeat bg-cover bg-[position:center_bottom] animate-dunes flex items-center justify-center p-6 text-center">
      <div className="relative z-20 max-w-2xl animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#faf3e0] tracking-tight leading-tight drop-shadow-xl font-display mb-4">
          Your Sacred Key to Web3
        </h1>
        <p className="text-lg md:text-xl font-medium italic text-[#faf3e0] tracking-tight leading-tight drop-shadow-md mb-6">
          Securely store, manage, and explore the decentralized world with Aljama Wallet.
        </p>
        <button
          onClick={createWallet}
          className="bg-[#d96f42] hover:bg-[#bf5f38] text-white px-8 py-4 rounded-full text-lg font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 relative overflow-hidden group"
        >
          <span className="relative z-10">Create Wallet</span>
          <span className="absolute inset-0 bg-white opacity-10 group-hover:opacity-20 blur-sm transition-all duration-500" />
        </button>
      </div>

      {/* 🔐 Secure Modal shown only once */}
      {walletData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] text-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-[#d96f42] space-y-4 animate-fade-in">
            <h2 className="text-2xl font-bold text-[#d96f42]">🪪 Wallet Created</h2>
            <div className="text-sm break-words">
              <p><span className="font-semibold">Address:</span><br />{walletData.address}</p>
              <p className="mt-4">
                <span className="font-semibold text-red-400">Mnemonic (Secret):</span><br />
                <span className="italic">{walletData.mnemonic}</span>
              </p>
              <p className="mt-2 text-yellow-400 text-xs">
                ⚠️ Make sure to copy and save this safely. It will not be shown again.
              </p>
            </div>
            <button
              onClick={() => setWalletData(null)}
              className="w-full mt-4 bg-[#d96f42] hover:bg-[#bf5f38] text-white py-2 px-4 rounded font-semibold transition"
            >
              I have saved it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

