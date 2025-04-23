'use client';

import Card from '@/components/Card';
import Button from '@/components/Button';

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-pearl via-white to-azure text-gray-800">
            <main className="flex flex-col items-center p-8">
                <section className="text-center mb-16">
                    <h1 className="text-5xl font-bold mb-4">Welcome to Aljama Wallet</h1>
                    <p className="text-lg text-gray-600">
                        Forge your vault. Unlock your key. Manage your assets securely.
                    </p>
                </section>

                <div className="flex gap-8 justify-center w-full max-w-5xl flex-wrap">
                    <Card
                        title="Create Wallet"
                        description="Start your journey by creating a secure wallet."
                    >
                        <Button
                            label="Create Wallet"
                            color="blue"
                            onClick={() => console.log('Create Wallet')}
                        />
                    </Card>

                    <Card
                        title="Unlock Wallet"
                        description="Access your wallet securely with your private key."
                    >
                        <Button
                            label="Unlock Wallet"
                            color="orange"
                            onClick={() => console.log('Unlock Wallet')}
                        />
                    </Card>

                    <Card
                        title="Manage Assets"
                        description="Check balance, send tokens, and track activity."
                    >
                        <Button
                            label="Manage Assets"
                            color="yellow"
                            onClick={() => console.log('Manage Assets')}
                        />
                    </Card>
                </div>
            </main>
        </div>
    );
}

