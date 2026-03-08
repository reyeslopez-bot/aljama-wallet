import type { ReactNode } from 'react'
import { vi } from 'vitest'
import messages from '../messages/en.json'

process.env.NEXTAUTH_DEV_SECRET ??= 'test-nextauth-dev-secret'

type MessageTree = Record<string, unknown>

function resolveMessage(namespace: string, key: string): string {
  const root = (messages as MessageTree)[namespace] as MessageTree | string | undefined
  if (!root) return `${namespace}.${key}`

  const value = key.split('.').reduce<MessageTree | string | undefined>((acc, part) => {
    if (!acc || typeof acc === 'string') return undefined
    return (acc as MessageTree)[part] as MessageTree | string | undefined
  }, root)

  return typeof value === 'string' ? value : `${namespace}.${key}`
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => resolveMessage(namespace, key),
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}))

const gsapTween = () => ({ kill: vi.fn() })
const gsapMock = {
  killTweensOf: vi.fn(),
  set: vi.fn(),
  to: vi.fn((_target: unknown, vars?: Record<string, unknown>) => {
    const onUpdate = vars?.onUpdate
    const onComplete = vars?.onComplete
    if (typeof onUpdate === 'function') onUpdate()
    if (typeof onComplete === 'function') onComplete()
    return gsapTween()
  }),
  fromTo: vi.fn((_target: unknown, _fromVars?: Record<string, unknown>, toVars?: Record<string, unknown>) => {
    const onUpdate = toVars?.onUpdate
    const onComplete = toVars?.onComplete
    if (typeof onUpdate === 'function') onUpdate()
    if (typeof onComplete === 'function') onComplete()
    return gsapTween()
  }),
  getProperty: vi.fn((_target: unknown, property: string) => (property === 'scale' ? 1 : 0)),
}

vi.mock('gsap', () => ({
  gsap: gsapMock,
}))

const mockUseSession = vi.fn(() => ({
  data: { user: { id: 'test-user', email: 'test@example.com' } },
  status: 'authenticated',
}))
const mockSignIn = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: mockUseSession,
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  signIn: mockSignIn,
}))

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
