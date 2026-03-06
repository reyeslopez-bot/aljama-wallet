import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const EXEMPT_ROUTES = new Set(['app/api/auth/[...nextauth]/route.ts'])

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const API_DIR = path.join(ROOT_DIR, 'app', 'api')

function listRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  return entries.flatMap((entry) => {
    const resolved = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return listRouteFiles(resolved)
    }
    return entry.isFile() && entry.name === 'route.ts' ? [resolved] : []
  })
}

function toProjectPath(filePath: string): string {
  return path.relative(ROOT_DIR, filePath).replaceAll(path.sep, '/')
}

describe('API route guardrails', () => {
  it('keeps HTTP route handlers wrapped with withApiRoute', () => {
    const failures: string[] = []

    for (const routeFile of listRouteFiles(API_DIR)) {
      const projectPath = toProjectPath(routeFile)
      const source = fs.readFileSync(routeFile, 'utf8')
      const exportedMethods = HTTP_METHODS.filter((method) =>
        new RegExp(`export\\s+(?:const|async\\s+function)\\s+${method}\\b`).test(source),
      )

      if (exportedMethods.length === 0) {
        continue
      }

      if (EXEMPT_ROUTES.has(projectPath)) {
        if (!/export\s*\{\s*handler as GET,\s*handler as POST\s*\}/.test(source)) {
          failures.push(`${projectPath}: unexpected special-case handler export`)
        }
        continue
      }

      if (!source.includes('withApiRoute')) {
        failures.push(`${projectPath}: missing withApiRoute import/usage`)
      }

      if (!/timeoutMs:\s*\d[\d_]*/.test(source)) {
        failures.push(`${projectPath}: missing explicit timeoutMs budget`)
      }

      for (const method of exportedMethods) {
        if (new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(source)) {
          failures.push(`${projectPath}: ${method} still exported as direct async function`)
        }

        const wrappedExportPattern = new RegExp(
          `export\\s+const\\s+${method}\\s*=\\s*withApiRoute(?:\\s*\\(|\\s*<)`,
          'm',
        )
        if (!wrappedExportPattern.test(source)) {
          failures.push(`${projectPath}: ${method} is not exported via withApiRoute`)
        }
      }
    }

    expect(failures).toEqual([])
  })
})
