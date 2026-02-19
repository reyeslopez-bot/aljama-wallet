// app/[locale]/(site)/page.tsx
import HomeContent from '@/components/home/HomeContent'
import HomeConsentGate from '@/components/home/HomeConsentGate.client'

export default function HomePage() {
  return (
    <main className="px-6">
      <HomeConsentGate>
        <HomeContent />
      </HomeConsentGate>
    </main>
  )
}
