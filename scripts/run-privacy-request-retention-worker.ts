import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenvConfig } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envMode = process.env.NODE_ENV || 'development'

dotenvConfig({ path: path.resolve(root, '.env') })
dotenvConfig({ path: path.resolve(root, '.env.local'), override: true })
dotenvConfig({ path: path.resolve(root, `.env.${envMode}.local`), override: true })
dotenvConfig({ path: path.resolve(root, 'prisma/pg/.env'), override: true })

await import('@/services/privacy-request-retention.worker')
