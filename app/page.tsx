'use client';

import Card from '@/components/Card';
import Button from '@/components/Button';

export default function Home() {
    return (
        <div className="min-h-screen bg-[url('/backgrounds/dunes-background.png')] bg-cover bg-center bg-no-repeat bg-fixed text-gray-800">
            <main className="flex flex-col items-center p-8">
                <section className="text-center mb-16">
                    <h1 className="text-5xl font-oleo font-bold text-alloy drop-shadow-lg tracking-wide">
                        Welcome to Aljama Wallet
                    </h1>
                    <p className="text-lg font-oleo text-gray-600">
                        Forge your vault. Unlock your key. Manage your assets securely.
                    </p>
                </section>

                {/* Cards container */}
                <div className="flex flex-wrap justify-center gap-8 w-full max-w-6xl">
                    <Card
                        title={<span className="font-oleo text-3xl">Create Wallet</span>}
                        description={
                            <span className="text-md">
                                Start your journey by creating a secure wallet.
                            </span>
                        }
                    >
                        <Button
                            label="Create Wallet"
                            color="blue"
                            onClick={() => console.log('Create Wallet')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Unlock Wallet</span>}
                        description={
                            <span className="text-md">
                                Access your wallet securely with your private key.
                            </span>
                        }
                    >
                        <Button
                            label="Unlock Wallet"
                            color="orange"
                            onClick={() => console.log('Unlock Wallet')}
                        />
                    </Card>

                    <Card
                        title={<span className="font-oleo text-3xl">Manage Wallet</span>}
                        description={
                            <span className="text-md">
                                Check balance, send tokens, and track activity.
                            </span>
                        }
                    >
                        <Button
                            label="Manage Wallet"
                            color="yellow"
                            onClick={() => console.log('Manage Wallet')}
                        />
                    </Card>
                </div>
            </main>
        </div>
    );
}

