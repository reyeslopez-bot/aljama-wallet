// components/wallet/forms/ImportWalletForm.tsx
'use client'

import Button from '@/components/ui/Button'

export default function ImportWalletForm() {
    return (
        <form className="max-w-md mx-auto p-4 border rounded-lg">
            <h2 className="text-xl font-bold mb-2">Import Wallet</h2>
            <label className="block mb-2">
                <span className="text-sm w-full border mt-1 font-medium mb-2">Seed Phrase</span>
                <textarea
                    placeholder="Enter Seed Phrase"
                    className="w-full border p-2 rounded resize-none"
                    rows={3}
                />
            </label>
            <label className="block mb-2">
                <span className="text-sm w-full border mt-1 font-medium mb-2">Password</span>
                <input
                    type="password"
                    placeholder="Set a New Password"
                    className="w-full border p-2 rounded"
                />
            </label>
            <label className="block mb-2">
                <Button
                    label="Import Wallet"
                    size="md"
                    className="flex"
                    action={() => console.log('Importing wallet...')}
                />
            </label>
        </form>
    );
}


