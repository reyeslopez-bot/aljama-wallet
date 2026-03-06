// components/home/HomeActionButtons.client.tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import UnlockActionsLink from '@/components/ui/UnlockActionsLink.client'

type ButtonTone = 'primary' | 'secondary'

type Btn = {
  kind: 'anchor'
  label: string
  href: string
  bg: string
  testId: string
  tone: ButtonTone
}

const surface = (bg: string, tone: ButtonTone) =>
  ({
    backgroundImage: bg,
    borderRadius: '9999px',
    boxShadow:
      tone === 'primary'
        ? '0 16px 36px rgba(12,10,8,0.28), inset 0 0 0 1px rgba(255,255,255,0.6)'
        : '0 12px 26px rgba(6,9,14,0.32), inset 0 0 0 1px rgba(255,255,255,0.16)',
    border: tone === 'primary' ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.14)',
  }) as const

export default function HomeActionButtons() {
  const t = useTranslations('actions')
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus === 'unauthenticated'
  const unlockHintId = 'home-action-buttons-unlock'

  const buttons: Btn[] = [
    {
      kind: 'anchor',
      label: t('createWallet'),
      href: `/${locale}#create`,
      bg: 'linear-gradient(135deg, #f3d9aa 0%, #e0ad70 45%, #c67a4a 100%)',
      testId: 'home-action-button-create-wallet',
      tone: 'primary',
    },
    {
      kind: 'anchor',
      label: t('connectWallet'),
      href: `/${locale}#connect`,
      bg: 'linear-gradient(135deg, rgba(127,176,217,0.2) 0%, rgba(92,141,180,0.18) 50%, rgba(75,124,121,0.2) 100%)',
      testId: 'home-action-button-connect-wallet',
      tone: 'secondary',
    },
    {
      kind: 'anchor',
      label: t('xrpl'),
      href: `/${locale}#xrpl`,
      bg: 'linear-gradient(135deg, rgba(232,210,162,0.18) 0%, rgba(200,171,114,0.16) 50%, rgba(161,128,79,0.2) 100%)',
      testId: 'home-action-button-xrpl',
      tone: 'secondary',
    },
  ]

  return (
    <div data-testid="home-action-buttons" className="w-full" role="group" aria-label="Primary wallet actions">
      <div
        data-testid="home-action-buttons-list"
        className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
        role="list"
      >
        {buttons.map((button) => (
          <Link
            key={button.label}
            data-testid={button.testId}
            href={button.href}
            onClick={(event) => {
              if (locked) event.preventDefault()
            }}
            aria-disabled={locked}
            tabIndex={locked ? -1 : 0}
            aria-describedby={locked ? unlockHintId : undefined}
            className={`block w-full appearance-none border-0 bg-transparent p-0 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
              locked ? 'pointer-events-none opacity-60' : ''
            }`}
            aria-label={locked ? `${button.label}. Sign in required.` : button.label}
            role="listitem"
          >
            <motion.div
              whileHover={{ y: button.tone === 'primary' ? -2 : -1 }}
              whileTap={{ scale: button.tone === 'primary' ? 0.98 : 0.99 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className={`flex w-full items-center justify-center rounded-full px-7 tracking-wide transition-all ${
                button.tone === 'primary'
                  ? 'h-[84px] text-[18px] font-semibold text-[#20140e] drop-shadow-[0_1px_0_rgba(255,255,255,0.26)] md:h-[88px]'
                  : 'h-[72px] text-[15px] font-medium text-ivory/86 md:h-[80px]'
              }`}
              style={surface(button.bg, button.tone)}
            >
              <span>{button.label}</span>
            </motion.div>
          </Link>
        ))}
      </div>

      {locked && (
        <div id={unlockHintId} data-testid="home-action-buttons-unlock">
          <UnlockActionsLink className="mt-4 block w-full text-center text-xs uppercase tracking-[0.18em] text-saffron/75" />
        </div>
      )}
    </div>
  )
}
