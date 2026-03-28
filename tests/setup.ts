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

function formatMessage(template: string, values?: Record<string, unknown>): string {
  if (!values) return template

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token) => {
    const value = values[token]
    return value === undefined || value === null ? match : String(value)
  })
}

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, unknown>) =>
      formatMessage(resolveMessage(namespace, key), values),
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}))

const gsapTween = () => ({ kill: vi.fn() })
const gsapTimeline = () => {
  const timeline = {
    addLabel: vi.fn(() => timeline),
    call: vi.fn((callback?: () => void) => {
      if (typeof callback === 'function') callback()
      return timeline
    }),
    from: vi.fn((_target: unknown, vars?: Record<string, unknown>) => {
      const onUpdate = vars?.onUpdate
      const onComplete = vars?.onComplete
      if (typeof onUpdate === 'function') onUpdate()
      if (typeof onComplete === 'function') onComplete()
      return timeline
    }),
    fromTo: vi.fn((_target: unknown, _fromVars?: Record<string, unknown>, toVars?: Record<string, unknown>) => {
      const onUpdate = toVars?.onUpdate
      const onComplete = toVars?.onComplete
      if (typeof onUpdate === 'function') onUpdate()
      if (typeof onComplete === 'function') onComplete()
      return timeline
    }),
    set: vi.fn(() => timeline),
    to: vi.fn((_target: unknown, vars?: Record<string, unknown>) => {
      const onUpdate = vars?.onUpdate
      const onComplete = vars?.onComplete
      if (typeof onUpdate === 'function') onUpdate()
      if (typeof onComplete === 'function') onComplete()
      return timeline
    }),
  }
  return timeline
}
const gsapMock = {
  context: vi.fn((callback: () => void) => {
    callback()
    return { revert: vi.fn() }
  }),
  killTweensOf: vi.fn(),
  quickTo: vi.fn((_target: unknown, _property: string, vars?: Record<string, unknown>) => {
    const setter = vi.fn((_value: unknown) => {
      const onUpdate = vars?.onUpdate
      const onComplete = vars?.onComplete
      if (typeof onUpdate === 'function') onUpdate()
      if (typeof onComplete === 'function') onComplete()
    })
    return setter
  }),
  registerPlugin: vi.fn(),
  set: vi.fn(),
  timeline: vi.fn(() => gsapTimeline()),
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
  utils: {
    toArray: vi.fn((selector: string) => Array.from(document.querySelectorAll(selector))),
  },
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

if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 8,
  })

  Object.defineProperty(navigator, 'deviceMemory', {
    configurable: true,
    value: 8,
  })
}
