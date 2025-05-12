// components/CreateWalletModal.tsx
import { useState } from "react";
import React from "react";

export default function CreateWalletModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-sand rounded-lg p-8 max-w-md w-full shadow-xl border border-dune">
                <h2 className="text-2xl font-bold mb-4 text-dune">Create Wallet</h2>
                <form className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-800">Create password</label>
                        <input
                            type="password"
                            className="w-full mt-1 px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-dune"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800">Confirm password</label>
                        <input
                            type="password"
                            className="w-full mt-1 px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-dune"
                        />
                    </div>
                    <div className="text-sm text-gray-700">
                        <input type="checkbox" className="mr-2" /> I agree to the{" "}
                        <a href="/terms" className="underline text-dune">Terms of Service</a>
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-dune text-white py-2 rounded-md hover:opacity-90"
                    >
                        Create Wallet
                    </button>
                </form>
                <button onClick={onClose} className="mt-4 text-sm text-gray-500 underline">
                    Cancel
                </button>
            </div>
        </div>
    );
}

