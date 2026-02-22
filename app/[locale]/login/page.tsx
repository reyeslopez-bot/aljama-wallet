import LoginGate from '@/components/home/LoginGate'

type LoginPageProps = {
  searchParams: Promise<{ mode?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams
  const initialMode = query.mode === 'login' ? 'login' : 'register'

  return <LoginGate showBackLink={false} initialMode={initialMode} />
}
