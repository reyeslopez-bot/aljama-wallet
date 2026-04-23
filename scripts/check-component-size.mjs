import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const HARD_CAP = 700

const ALLOWLIST = new Map([
  ['components/home/XrplTradeDesk.client.tsx', 2463],
  ['components/home/CreateWalletPanel.tsx', 1394],
  ['components/home/XrplMarketPanel.client.tsx', 1218],
  ['components/home/DynamicInfoCard.client.tsx', 912],
  ['components/home/LoginGate.tsx', 709],
  ['components/home/HomeMotionScene.client.tsx', 655],
])

function listFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '--', 'components/*.ts', 'components/*.tsx', 'components/**/*.ts', 'components/**/*.tsx'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr}`)
  }
  return result.stdout.split('\n').filter(Boolean)
}

async function countLines(absPath) {
  const content = await readFile(absPath, 'utf8')
  let count = 0
  for (const ch of content) if (ch === '\n') count += 1
  if (content.length > 0 && !content.endsWith('\n')) count += 1
  return count
}

async function main() {
  const files = listFiles()
  const violations = []
  const stale = new Set(ALLOWLIST.keys())

  for (const rel of files) {
    const abs = new URL(rel, `file://${REPO_ROOT}`).pathname
    const lines = await countLines(abs)
    const relPath = relative(REPO_ROOT, abs)
    const cap = ALLOWLIST.get(relPath)

    if (cap !== undefined) {
      stale.delete(relPath)
      if (lines > cap) {
        violations.push({
          path: relPath,
          lines,
          cap,
          kind: 'allowlisted-grew',
        })
      }
    } else if (lines > HARD_CAP) {
      violations.push({
        path: relPath,
        lines,
        cap: HARD_CAP,
        kind: 'hard-cap-exceeded',
      })
    }
  }

  const staleEntries = [...stale].filter((path) => {
    const abs = new URL(path, `file://${REPO_ROOT}`).pathname
    try {
      spawnSync('test', ['-f', abs])
      return true
    } catch {
      return false
    }
  })

  if (violations.length === 0 && staleEntries.length === 0) {
    console.log(`component-size: ok (${files.length} files scanned, ${ALLOWLIST.size} allowlisted)`)
    return
  }

  if (violations.length > 0) {
    console.error('component-size: violations')
    for (const v of violations) {
      if (v.kind === 'hard-cap-exceeded') {
        console.error(`  ${v.path}: ${v.lines} lines exceeds hard cap ${HARD_CAP}`)
      } else {
        console.error(`  ${v.path}: ${v.lines} lines grew past allowlist ceiling ${v.cap}`)
      }
    }
    console.error('')
    console.error('fix by shrinking the file, or — if the file has legitimately been split/renamed —')
    console.error('update the ALLOWLIST in scripts/check-component-size.mjs')
  }

  if (staleEntries.length > 0) {
    console.error('component-size: stale allowlist entries (file no longer exists, remove them):')
    for (const path of staleEntries) console.error(`  ${path}`)
  }

  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
