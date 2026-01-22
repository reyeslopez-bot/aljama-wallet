const featureCards = [
  {
    title: 'Onchain metadata',
    subtitle: 'Definition + URI',
    body: `Put key asset info onchain, or link docs via URI.
Always verifiable, always discoverable.`,
    accent: 'amber',
    badge: 'Metadata',
  },
  {
    title: 'Shared asset context',
    subtitle: 'Wallets + apps',
    body: `One canonical reference across wallets and dApps.
Consistent display, less confusion.`,
    accent: 'indigo',
    badge: 'Onchain ready',
  },
]

const rituals = [
  {
    title: 'Create + encrypt',
    detail: 'Password-gated creation with clear UI feedback.',
  },
  {
    title: 'Track connections',
    detail: 'Instant UI sync when wallet state changes.',
  },
]

export function FeatureShowcase() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-white/5 p-6 shadow-xl shadow-black/30 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/40" />

      {/* TWO COLUMNS TOTAL (on lg): LEFT = copy/rituals, RIGHT = cards stacked */}
      <div className="relative grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
        {/* LEFT */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.16em] text-amber-100/80">
            Design language
          </p>

          <h2 className="text-3xl font-semibold text-[#f7f0e6] sm:text-4xl">
            Dune-slick UI with pragmatic wiring
          </h2>

          <p className="max-w-prose text-base text-white/70">
            Modular surfaces for wallet flows and onchain context —
            without tight coupling.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {rituals.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner shadow-black/40"
              >
                <p className="text-sm font-semibold text-[#f7f0e6]">
                  {item.title}
                </p>
                <p className="text-xs leading-relaxed text-white/60">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT (stack cards so they’re wider, not tubes) */}
        <div className="grid gap-4">
          {featureCards.map((card) => (
            <article
              key={card.title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-5 shadow-lg shadow-black/40 transition hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-[#f7f0e6]">
                    {card.title}
                  </h3>
                  <p className="text-sm text-white/60">{card.subtitle}</p>
                </div>

                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]
                  ${card.accent === 'amber' ? 'bg-amber-400/15 text-amber-100' : ''}
                  ${card.accent === 'indigo' ? 'bg-indigo-400/15 text-indigo-100' : ''}
                `}
                >
                  {card.badge}
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-white/70">
                {card.body}
              </p>

              <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition group-hover:opacity-100" />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
