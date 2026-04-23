export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertEnvOrExit } = await import('@/lib/env')
  assertEnvOrExit()
}
