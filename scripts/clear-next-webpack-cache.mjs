import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const webpackCache = new URL('../.next/cache/webpack', import.meta.url)

await rm(fileURLToPath(webpackCache), { force: true, recursive: true })
