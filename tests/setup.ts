import type { ReactNode } from 'react'
import { vi } from 'vitest'
import messages from '../messages/en.json'

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
