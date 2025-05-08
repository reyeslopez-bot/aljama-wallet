// components/wallet/CreateWalletForm.tsx
import Button from '@/components/Button';

export default function CreateWalletForm() {
    return (
        <form className="space-y-3">
            <input type="password" placeholder="New Password" className="w-full border p-2 rounded" />
            <input type="password" placeholder="Confirm Password" className="w-full border p-2 rounded" />
            <Button
                label="Create"
                color="yellow"
                size="md"
                className="w-full"
                action={() => console.log('Creating wallet...')}
            />
        </form>
    );
}


