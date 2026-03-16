// components/home/HomeActionButtons.client.tsx
'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useGsapPressable } from '@/hooks/useGsapPressable'

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

function ActionSurface({ button }: { button: Btn }) {
  const interactions = useGsapPressable<HTMLDivElement>({
    hover: { y: button.tone === 'primary' ? -2 : -1 },
    press: { scale: button.tone === 'primary' ? 0.98 : 0.99 },
  })

  return (
    <div
      ref={interactions.ref}
      onPointerEnter={interactions.onPointerEnter}
      onPointerLeave={interactions.onPointerLeave}
      onPointerDown={interactions.onPointerDown}
      onPointerUp={interactions.onPointerUp}
      onPointerCancel={interactions.onPointerCancel}
      onBlur={interactions.onBlur}
      className={`flex h-[72px] w-full items-center justify-center rounded-full px-6 text-base font-semibold tracking-wide transition-all md:h-[76px] md:text-[17px] ${
        button.tone === 'primary'
          ? 'text-[#20140e] drop-shadow-[0_1px_0_rgba(255,255,255,0.26)]'
          : 'text-ivory'
      }`}
      style={surface(button.bg, button.tone)}
    >
      <span>{button.label}</span>
    </div>
  )
}

export default function HomeActionButtons() {
  const t = useTranslations('actions')
  const locale = useLocale()
  const { status: sessionStatus } = useSession()
  const locked = sessionStatus !== 'authenticated'

  const buttons: Btn[] = [
    {
      kind: 'anchor',
      label: t('createWallet'),
      href: locked ? `/${locale}?mode=register#wallet` : `/${locale}#create`,
      bg: 'linear-gradient(135deg, #f3d9aa 0%, #e0ad70 45%, #c67a4a 100%)',
      testId: 'home-action-button-create-wallet',
      tone: 'primary',
    },
    {
      kind: 'anchor',
      label: t('connectWallet'),
      href: locked ? `/${locale}?mode=login#wallet` : `/${locale}#connect`,
      bg: 'linear-gradient(135deg, #7fb0d9 0%, #5c8db4 50%, #4b7c79 100%)',
      testId: 'home-action-button-connect-wallet',
      tone: 'secondary',
    },
  ]

  return (
    <div data-testid="home-action-buttons" className="w-full" role="group" aria-label="Primary wallet actions">
      <div
        data-testid="home-action-buttons-list"
        className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
        role="list"
      >
        {buttons.map((button) => (
          <Link
            key={button.label}
            data-testid={button.testId}
            href={button.href}
            className={`block w-full appearance-none border-0 bg-transparent p-0 outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
              locked ? 'opacity-90' : ''
            }`}
            aria-label={locked ? `${button.label}. Sign in or sign up first.` : button.label}
            role="listitem"
          >
            <ActionSurface button={button} />
          </Link>
        ))}
      </div>
    </div>
  )
}
