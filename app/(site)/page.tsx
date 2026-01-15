// app/(site)/page.tsx
import HomeActionButtons from "@/components/home/HomeActionButtons.client"

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-7xl items-center px-6 py-20">
      <HomeActionButtons />
    </main>
  )
}
