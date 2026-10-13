import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const standaloneRoot = join(projectRoot, '.next', 'standalone')

await mkdir(join(standaloneRoot, '.next'), { recursive: true })
await cp(join(projectRoot, '.next', 'static'), join(standaloneRoot, '.next', 'static'), {
  recursive: true,
  force: true,
})
await cp(join(projectRoot, 'public'), join(standaloneRoot, 'public'), {
  recursive: true,
  force: true,
})
