'use client'

const fogLayers = [
  {
    className: 'top-[-10%] left-[-10%] h-[36rem] w-[36rem] bg-[radial-gradient(circle_at_30%_30%,rgba(233,180,133,0.24),transparent_55%)]',
    animation: 'animate-float-slower',
  },
  {
    className: 'top-[20%] right-[-15%] h-[28rem] w-[28rem] bg-[radial-gradient(circle_at_70%_40%,rgba(52,211,153,0.2),transparent_50%)]',
    animation: 'animate-float-slow',
  },
  {
    className: 'bottom-[-12%] left-[20%] h-[32rem] w-[32rem] bg-[radial-gradient(circle_at_40%_70%,rgba(255,255,255,0.12),transparent_55%)]',
    animation: 'animate-float',
  },
]

export default function FogParticleOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(247,199,179,0.12),transparent_55%)] blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.06),transparent_55%)] blur-[120px]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.06),transparent_35%,rgba(255,255,255,0.05)_65%,transparent_90%)] opacity-70 mix-blend-screen" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.04),transparent_55%)] bg-[length:140%_140%] opacity-50" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:100%_32px] opacity-30" />

      {fogLayers.map((layer, index) => (
        <div key={index} className={`absolute ${layer.className} blur-[110px] ${layer.animation}`} />
      ))}

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_90%,rgba(186,230,253,0.06),transparent_35%)] mix-blend-screen" />
    </div>
  )
}
