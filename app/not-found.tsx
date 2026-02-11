import Link from 'next/link'
import { defaultLocale } from '@/i18n/routing'

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 px-6 text-center text-ivory">
      <h1 className="font-display text-4xl">Not found</h1>
      <p className="text-sm text-ivory/70">This page could not be found.</p>
      <Link
        href={`/${defaultLocale}`}
        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-ivory transition hover:bg-white/10"
      >
        Go home
      </Link>
    </div>
  )
}
