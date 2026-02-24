import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { prismaPg } from '@/lib/prisma-pg'
import { logWarn } from '@/lib/security/logging'

const globalForForensicRetention = globalThis as unknown as {
  forensicRetentionLastRunAt?: number
  forensicRetentionRunPromise?: Promise<void>
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function canUsePg() {
  return Boolean(process.env.PG_DATABASE_URL ?? process.env.POSTGRES_URL)
}

function cleanupIntervalMs(): number {
  return envInt('SECURITY_FORENSIC_CLEANUP_INTERVAL_MS', 60 * 60 * 1000)
}

function archiveBatchSize(): number {
  return Math.max(1, envInt('SECURITY_FORENSIC_ARCHIVE_BATCH_SIZE', 500))
}

function archiveDirectory(): string {
  return process.env.SECURITY_FORENSIC_ARCHIVE_DIR?.trim() ?? ''
}

function retentionCutoff(days: number): Date {
  const now = Date.now()
  return new Date(now - days * 24 * 60 * 60 * 1000)
}

async function archiveRows(table: string, rows: unknown[]) {
  const dir = archiveDirectory()
  if (!dir || rows.length === 0) return

  const stamp = new Date().toISOString().slice(0, 10)
  const file = path.join(dir, `${table}-${stamp}.ndjson`)
  const archivedAt = new Date().toISOString()
  const payload = rows
    .map((row) =>
      JSON.stringify({
        archivedAt,
        table,
        record: row,
      }),
    )
    .join('\n')
  if (!payload) return

  await mkdir(dir, { recursive: true })
  await appendFile(file, `${payload}\n`, 'utf8')
}

async function pruneSecuritySignals() {
  const retentionDays = envInt('SECURITY_FORENSIC_SIGNAL_RETENTION_DAYS', 90)
  if (retentionDays <= 0) return

  const rows = await prismaPg.securitySignalEvent.findMany({
    where: {
      detectedAt: {
        lt: retentionCutoff(retentionDays),
      },
    },
    orderBy: {
      detectedAt: 'asc',
    },
    take: archiveBatchSize(),
  })
  if (rows.length === 0) return

  await archiveRows('security_signal_events', rows)
  await prismaPg.securitySignalEvent.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  })
}

async function pruneSecurityAnomalies() {
  const retentionDays = envInt('SECURITY_FORENSIC_ANOMALY_RETENTION_DAYS', 180)
  if (retentionDays <= 0) return

  const rows = await prismaPg.securityAnomalyEvent.findMany({
    where: {
      detectedAt: {
        lt: retentionCutoff(retentionDays),
      },
    },
    orderBy: {
      detectedAt: 'asc',
    },
    take: archiveBatchSize(),
  })
  if (rows.length === 0) return

  await archiveRows('security_anomaly_events', rows)
  await prismaPg.securityAnomalyEvent.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  })
}

async function pruneXrplActionEvents() {
  const retentionDays = envInt('SECURITY_FORENSIC_XRPL_EVENT_RETENTION_DAYS', 365)
  if (retentionDays <= 0) return

  const rows = await prismaPg.xrplActionEvent.findMany({
    where: {
      occurredAt: {
        lt: retentionCutoff(retentionDays),
      },
    },
    orderBy: {
      occurredAt: 'asc',
    },
    take: archiveBatchSize(),
  })
  if (rows.length === 0) return

  await archiveRows('xrpl_action_events', rows)
  await prismaPg.xrplActionEvent.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  })
}

async function pruneXrplActions() {
  const retentionDays = envInt('SECURITY_FORENSIC_XRPL_ACTION_RETENTION_DAYS', 365)
  if (retentionDays <= 0) return

  const rows = await prismaPg.xrplAction.findMany({
    where: {
      updatedAt: {
        lt: retentionCutoff(retentionDays),
      },
    },
    orderBy: {
      updatedAt: 'asc',
    },
    take: archiveBatchSize(),
  })
  if (rows.length === 0) return

  await archiveRows('xrpl_actions', rows)
  await prismaPg.xrplAction.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  })
}

async function pruneSecurityAlerts() {
  const retentionDays = envInt('SECURITY_FORENSIC_ALERT_RETENTION_DAYS', 365)
  if (retentionDays <= 0) return

  const rows = await prismaPg.securityAlertEvent.findMany({
    where: {
      createdAt: {
        lt: retentionCutoff(retentionDays),
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: archiveBatchSize(),
  })
  if (rows.length === 0) return

  await archiveRows('security_alert_events', rows)
  await prismaPg.securityAlertEvent.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  })
}

async function runCleanup() {
  await pruneSecuritySignals()
  await pruneSecurityAnomalies()
  await pruneSecurityAlerts()
  await pruneXrplActionEvents()
  await pruneXrplActions()
}

export async function runForensicRetentionMaintenance(options?: { force?: boolean }) {
  if (!canUsePg()) return

  const now = Date.now()
  const lastRun = globalForForensicRetention.forensicRetentionLastRunAt ?? 0
  if (!options?.force && now - lastRun < cleanupIntervalMs()) {
    return
  }

  if (!globalForForensicRetention.forensicRetentionRunPromise) {
    globalForForensicRetention.forensicRetentionRunPromise = runCleanup()
      .catch((error) => {
        logWarn('forensic-retention:cleanup', error)
      })
      .finally(() => {
        globalForForensicRetention.forensicRetentionLastRunAt = Date.now()
        globalForForensicRetention.forensicRetentionRunPromise = undefined
      })
  }

  await globalForForensicRetention.forensicRetentionRunPromise
}

export function clearForensicRetentionStateForTests() {
  globalForForensicRetention.forensicRetentionLastRunAt = undefined
  globalForForensicRetention.forensicRetentionRunPromise = undefined
}
