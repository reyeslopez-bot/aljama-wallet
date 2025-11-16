// WalletManager.tsx
'use client';

import Button from '@/components/ui/Button';
import { useWalletPanels } from '@/components/wallet/context/WalletPanelsContext';

export default function WalletManager() {
  const { openPanels } = useWalletPanels();

  return (
    <div className="flex flex-col gap-4">
      <Button label="Create Wallet" variant="accent" action={() => openPanels('create')} />
      <Button label="Unlock Wallet" variant="primary" action={() => openPanels('unlock')} />
      <Button label="Import Wallet" variant="default" action={() => openPanels('import')} />
    </div>
  );
}
