// app/(site)/page.tsx
import HomeClientGate from "@/components/home/HomeClientGate"
import HomeGateShell from "@/components/home/HomeGateShell.client"

export default function HomePage() {
  return (
    <HomeClientGate>
      <main className="mx-auto flex min-h-[70vh] max-w-7xl items-center px-6 py-20">
        <HomeGateShell />
      </main>
    </HomeClientGate>
  )
}
