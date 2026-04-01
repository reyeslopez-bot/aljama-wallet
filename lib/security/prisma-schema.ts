import { getErrorCode, getErrorMessage } from './errors'

export type PrismaSchemaIssue = {
  code: 'P2021' | 'P2022'
  kind: 'missing_table' | 'missing_column'
  target: string | null
  summary: string
}

const MISSING_TABLE_PATTERN = /The table `([^`]+)` does not exist/i
const MISSING_COLUMN_PATTERN = /The column `([^`]+)` does not exist/i

function summarizeTarget(kind: PrismaSchemaIssue['kind'], target: string | null) {
  if (kind === 'missing_table') {
    return target ? `missing table ${target}` : 'missing table'
  }
  return target ? `missing column ${target}` : 'missing column'
}

export function getPrismaSchemaIssue(error: unknown): PrismaSchemaIssue | null {
  const code = getErrorCode(error)
  const message = getErrorMessage(error, '')

  if (code === 'P2021') {
    const target = message.match(MISSING_TABLE_PATTERN)?.[1] ?? null
    return {
      code,
      kind: 'missing_table',
      target,
      summary: summarizeTarget('missing_table', target),
    }
  }

  if (code === 'P2022') {
    const target = message.match(MISSING_COLUMN_PATTERN)?.[1] ?? null
    return {
      code,
      kind: 'missing_column',
      target,
      summary: summarizeTarget('missing_column', target),
    }
  }

  return null
}
