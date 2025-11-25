// components/CreateWalletModal.tsx
'use client'

import { useState, type FormEvent } from 'react'

type CreateWalletModalProps = {
  onClose: () => void
  /**
   * Optional callback – hook this into your real wallet-creation logic.
   * If you don't pass it, the modal will just validate + close.
   */
  onCreate?: (password: string) => Promise<void> | void
}

export default function CreateWalletModal({ onClose, onCreate }: CreateWalletModalProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) {
      setError('Password and confirmation are required.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (!acceptedTerms) {
      setError('You must accept the Terms of Service.')
      return
    }

    try {
      setIsSubmitting(true)
      if (onCreate) {
        await onCreate(password)
      }
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create wallet.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-dune bg-sand p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-bold text-dune">Create Wallet</h2>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-800">
              Create password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dune"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800">
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dune"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>
              I agree to the{' '}
              <a href="/terms" className="underline text-dune">
                Terms of Service
              </a>
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-dune py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Creating…' : 'Create Wallet'}
          </button>
        </form>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm text-gray-500 underline"
        >
          Cancel
        </button>
        </div>
    </div>
    )
    }