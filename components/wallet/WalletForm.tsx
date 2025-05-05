'use client'

import Button from '@/components/Button'

interface Props {
    mode: 'create' | 'unlock' | 'import'
}

export default function WalletForm({ mode }: Props) {
    if (mode === 'create') {
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
        )
    }

    if (mode === 'unlock') {
        return (
            <form className="space-y-3">
                <input type="text" placeholder="Enter Private Key" className="w-full border p-2 rounded" />
                <Button
                    label="Unlock"
                    color="yellow"
                    size="md"
                    className="w-full"
                    action={() => console.log('Unlocking wallet...')}
                />
            </form>
        )
    }

    // import
    return (
        <form className="space-y-3">
            <input type="text" placeholder="Paste Mnemonic" className="w-full border p-2 rounded" />
            <Button
                label="Import"
                color="yellow"
                size="md"
                className="w-full"
                action={() => console.log('Importing wallet...')}
            />
        </form>
    )
}

