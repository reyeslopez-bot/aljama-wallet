const featureCards = [
  {
    title: 'Session-first security',
    subtitle: 'Toy-safe demo flows',
    body: 'Everything encrypts in-memory and lives in sessionStorage. Perfect for demos and onboarding labs.',
    accent: 'amber',
    badge: 'Session only',
  },
  {
    title: 'Wagmi-ready wiring',
    subtitle: 'EVM networks',
    body: 'Hooks and detectors stay synced with wagmi connection status so the UI never falls behind the wallet.',
    accent: 'emerald',
    badge: 'Realtime',
  },
  {
    title: 'Composable rituals',
    subtitle: 'Next.js + Tailwind',
    body: 'Sections are data-driven so you can swap copy, animations, and layouts without rewiring logic.',
    accent: 'indigo',
    badge: 'Composable',
  },
]

const rituals = [
  {
    title: 'Create + encrypt',
    detail: 'Password gated with optimistic UI + error surfacing.',
  },
  {
    title: 'Track connections',
    detail: 'useTrackUserWallet posts to /api/track-wallet when sessions change.',
  },
  {
    title: 'Guide unlocks',
    detail: 'WalletDetector hovers unobtrusively with status + actions.',
  },
]

export function FeatureShowcase() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/40" />
      <div className="relative grid gap-10 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.16em] text-amber-100/80">Design language</p>
          <h2 className="text-3xl font-semibold text-[#f7f0e6] sm:text-4xl">Dune-slick UI with pragmatic wiring</h2>
          <p className="text-base text-white/70">
            Each block keeps copy editable and logic decoupled. Use this surface to showcase new rituals, L2 support,
            or ENS/WalletConnect flows without rewriting the landing page.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {rituals.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/10 bg-black/40 p-3 shadow-inner shadow-black/40">
                <p className="text-sm font-semibold text-[#f7f0e6]">{item.title}</p>
                <p className="text-xs text-white/60">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureCards.map((card) => (
            <article
              key={card.title}
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-5 shadow-lg shadow-black/40"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <span
                className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]
                ${card.accent === 'amber' ? 'bg-amber-400/15 text-amber-100' : ''}
                ${card.accent === 'emerald' ? 'bg-emerald-400/15 text-emerald-100' : ''}
                ${card.accent === 'indigo' ? 'bg-indigo-400/15 text-indigo-100' : ''}
              `}
              >
                {card.badge}
              </span>
              <h3 className="mt-3 text-xl font-semibold text-[#f7f0e6]">{card.title}</h3>
              <p className="text-sm text-white/60">{card.subtitle}</p>
              <p className="mt-3 text-sm text-white/70">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
