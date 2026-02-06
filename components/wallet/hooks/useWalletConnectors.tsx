'use client'

import { useConnect, useConnectors } from 'wagmi'
import type { Connector } from 'wagmi'

export function useWalletConnectors() {
  const connectors = useConnectors()

  const {
    mutate,
    status, // 'idle' | 'pending' | 'success' | 'error'
    error,
    variables, // { connector?: Connector } while pending
  } = useConnect()

  const isLoading = status === 'pending'
  const pendingConnector = variables?.connector as Connector | undefined

  return {
    connectors,
    connect: mutate,
    isLoading,
    pendingConnector, // now well-typed, optional
    error,
    status,
  }
}
