const featureCards = [
  {
    title: 'Onchain metadata',
    subtitle: 'Definition + URI',
    body: `Put key asset info onchain, or link docs via URI.
Always verifiable, always discoverable.`,
    accent: 'saffron',
    badge: 'Metadata',
  },
  {
    title: 'Shared asset context',
    subtitle: 'Wallets + apps',
    body: `One canonical reference across wallets and dApps.
Consistent display, less confusion.`,
    accent: 'lapis',
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
    <section className="surface-panel panel-glow-rose relative p-7 sm:p-8">
      <div className="absolute inset-x-8 top-5 ornament-line" />

      {/* SINGLE COLUMN: header -> rituals -> cards */}
      <div className="relative space-y-6">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-saffron/80">Design language</p>

          <h2 className="font-display text-3xl font-semibold text-ivory sm:text-4xl">
            Geometry-forward surfaces, calm by design
          </h2>

          <p className="max-w-prose text-base text-ivory/70">
            Layered surfaces for wallet flows and onchain context, with clear hierarchy and low noise.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {rituals.map((item) => (
            <div
              key={item.title}
              className="surface-inner p-4"
            >
              <p className="text-sm font-semibold text-ivory">{item.title}</p>
              <p className="text-xs leading-relaxed text-ivory/60">{item.detail}</p>
            </div>
          ))}
        </div>

        {/* Cards full width (stacked) */}
        <div className="grid gap-4">
          {featureCards.map((card) => (
            <article
              key={card.title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-5 shadow-lg shadow-black/40 transition hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-ivory">{card.title}</h3>
                  <p className="text-sm text-ivory/60">{card.subtitle}</p>
                </div>

                <span
                  className={[
                    'shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
                    card.accent === 'saffron' ? 'bg-saffron/15 text-saffron' : '',
                    card.accent === 'lapis' ? 'bg-lapis/20 text-lapis' : '',
                  ].join(' ')}
                >
                  {card.badge}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ivory/70">{card.body}</p>

              <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition group-hover:opacity-100" />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
