// components/wallet/UnlockWalletForm.tsx
import Button from '@/components/Button';

export default function UnlockWalletForm() {
    return (
        <form className="space-y-3">
            <input
                type="password"
                placeholder="Enter Password"
                className="w-full border p-2 rounded"
            />
            <Button
                label="Unlock Wallet"
                color="green"
                size="md"
                className="w-full"
                action={() => console.log('Unlocking wallet...')}
            />
        </form>
    );
}

