'use client'

import { signIn } from 'next-auth/react'

type UnlockActionsLinkProps = {
  label: string
  className?: string
}

export default function UnlockActionsLink({ label, className = '' }: UnlockActionsLinkProps) {
  return (
    <button
      type="button"
      onClick={() => void signIn()}
      className={`${className} cursor-pointer transition hover:text-saffron focus:outline-none focus:ring-2 focus:ring-saffron/40`}
    >
      {label}
    </button>
  )
}
