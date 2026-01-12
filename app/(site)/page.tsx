// app/%28site%29/page.tsx
import SecureGate from "@/components/SecureGate"
import HomeGateShell from "@/components/home/HomeGateShell.client"

export default function HomePage() {
  return (
    <SecureGate passcode="123456" storageKey="home_secure_gate_v1">
      <main className="mx-auto flex min-h-[70vh] max-w-7xl items-center px-6 py-20">
        <HomeGateShell />
      </main>
    </SecureGate>
  )
}
