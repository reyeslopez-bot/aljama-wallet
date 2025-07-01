const { setWalletFromData } = useAljamaWallet(); // ✅ ADD THIS

const createWallet = async () => {
  try {
    const res = await fetch("/api/create-wallet", { method: "POST" });
    if (!res.ok) throw new Error("Failed to create wallet");
    const data = await res.json();

    // ✅ Save to global wallet context and sessionStorage
    setWalletFromData({ privateKey: data.privateKey });

    setWalletData({
      address: data.address,
      mnemonic: data.mnemonic,
    });
  } catch (err) {
    console.error("Wallet creation failed", err);
    alert("❌ Failed to create wallet.");
  }
};

