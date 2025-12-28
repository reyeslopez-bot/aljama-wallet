// constants/brand.ts

export const BRAND = {
  name: 'Aljama Wallet',
  tagline: 'Wealth-grade self custody for a desert age.',
  description:
    'Create encrypted session vaults, move across EVM networks, and maintain full sovereign control without onboarding noise.',
} as const

export const NAV = {
  title: BRAND.name,
} as const

export const HERO = {
  eyebrow: BRAND.name,
  headline: BRAND.tagline,
  subcopy: BRAND.description,
  stats: [
    { label: 'Mainnet posture', value: 'EVM-First', detail: 'Wagmi + Ethers production stack' },
    { label: 'Security model', value: 'Session-local', detail: 'Encrypted, no remote custody' },
    { label: 'UX philosophy', value: 'Frictionless', detail: 'Zero clutter, guided flows' },
  ],
} as const
