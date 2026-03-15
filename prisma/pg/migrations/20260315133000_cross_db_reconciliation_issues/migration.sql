CREATE TABLE "ReconciliationIssue" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "severity" TEXT NOT NULL DEFAULT 'high',
  "traceId" TEXT,
  "summary" TEXT,
  "details" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReconciliationIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReconciliationIssue_scope_kind_refId_key"
  ON "ReconciliationIssue"("scope", "kind", "refId");

CREATE INDEX "ReconciliationIssue_status_updatedAt_idx"
  ON "ReconciliationIssue"("status", "updatedAt");

CREATE INDEX "ReconciliationIssue_scope_status_updatedAt_idx"
  ON "ReconciliationIssue"("scope", "status", "updatedAt");

CREATE INDEX "ReconciliationIssue_refId_idx"
  ON "ReconciliationIssue"("refId");

CREATE INDEX "ReconciliationIssue_traceId_idx"
  ON "ReconciliationIssue"("traceId");
