// components/wallet/ImportWalletForm.tsx
import Button from '@/components/ui/Button';

export default function ImportWalletForm() {
    return (
        <form className="max-w-md mx-auto p-4 border rounded-lg">
            <h2 className='text-xl font-bold mb-2'>Import Wallet</h2>
            <textarea
                placeholder="Enter Seed Phrase"
                className="w-full border p-2 rounded resize-none"
                rows={3}
            />
            <input
                type="password"
                placeholder="Set a New Password"
                className="w-full border p-2 rounded"
            />
            <Button
                label="Import Wallet"
                size="md"
                className="flex"
                action={() => console.log('Importing wallet...')}
            />
        </form>
    );
}


