import Card from '@/components/Card';
import Button from '@/components/Button';  // Optional if you want a reusable Button

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-efddc2 via-white to-0080FF text-gray-800">
      <main className="flex flex-col items-center p-8">
        <section className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">Welcome to Aljama Wallet</h1>
          <p className="text-lg text-gray-600">
            Forge your vault. Unlock your key. Manage your assets securely.
          </p>
        </section>

        <div className="flex gap-8 justify-center w-full max-w-5xl">
          <Card title="Create Wallet" description="Start your journey by creating a secure wallet.">
            <button className="w-full py-3 bg-blue-500 text-white rounded hover:bg-blue-600">
              Create Wallet
            </button>
          </Card>
          <Card title="Unlock Wallet" description="Access your wallet securely with your private key.">
            <button className="w-full py-3 bg-green-500 text-white rounded hover:bg-green-600">
              Unlock Wallet
            </button>
          </Card>
          <Card title="Manage Assets" description="Check balance, send tokens, and track activity.">
            <button className="w-full py-3 bg-yellow-500 text-white rounded hover:bg-yellow-600">
              Manage Assets
            </button>
          </Card>
        </div>
      </main>
    </div>
  );
}
