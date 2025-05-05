// components/wallet/ImportWalletForm.tsx
import Button from '@/components/Button';

export default function ImportWalletForm() {
    return (
        <form className="space-y-3">
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
                color="blue"
                size="md"
                className="w-full"
                action={() => console.log('Importing wallet...')}
            />
        </form>
    );
}

