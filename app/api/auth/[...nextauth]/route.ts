import NextAuth from 'next-auth'

type AuthRouteHandler = ReturnType<typeof NextAuth>

async function handler(...args: Parameters<AuthRouteHandler>) {
  const { authOptions } = await import('@/lib/auth')
  return NextAuth(authOptions)(...args)
}

export { handler as GET, handler as POST }
