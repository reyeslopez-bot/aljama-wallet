import { useState } from "react";
import CreateWalletModal from "./CreateWalletModal";
import {
    FloatingSigils,
    ArabicTitleCalligraphy,
    FogParticlesOverlay,
} from "./HeroExtras";

export default function Hero() {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <section
                className="relative h-screen w-screen overflow-x-hidden bg-no-repeat bg-cover bg-[position:center_bottom] bg-[url('/backgrounds/dunes-night.png')] animate-dunes flex items-center justify-center p-6 text-center"
            >
                <FloatingSigils />
                <ArabicTitleCalligraphy />
                <FogParticlesOverlay />

                <div className="relative z-20 max-w-2xl animate-fade-in">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-[#faf3e0] tracking-tight leading-tight drop-shadow-xl font-display mb-4">
                        Your Sacred Key to Web3
                    </h1>
                    <p className="text-lg md:text-xl font-medium italic text-[#faf3e0] tracking-tight leading-tight drop-shadow-md mb-6">
                        Securely store, manage, and explore the decentralized world with Aljama Wallet.
                    </p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#d96f42] hover:bg-[#bf5f38] text-white px-8 py-4 rounded-full text-lg font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 relative overflow-hidden group"
                    >
                        <span className="relative z-10">Create Wallet</span>
                        <span className="absolute inset-0 bg-white opacity-10 group-hover:opacity-20 blur-sm transition-all duration-500" />
                    </button>
                </div>
            </section>

            {showModal && <CreateWalletModal onClose={() => setShowModal(false)} />}
        </>
    );
}

