-- CreateTable
CREATE TABLE "SecurityAlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "baseSeverity" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "repetitive" BOOLEAN NOT NULL,
    "deduped" BOOLEAN NOT NULL,
    "duplicateCount" INTEGER NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "dedupWindowMs" INTEGER NOT NULL,
    "dedupTtlMs" INTEGER NOT NULL,
    "dedupEscalated" BOOLEAN NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "runbookId" TEXT,
    "runbookUrl" TEXT,
    "context" JSONB,
    "containmentActions" JSONB,
    "delivered" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityAlertEvent_createdAt_idx" ON "SecurityAlertEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlertEvent_severity_createdAt_idx" ON "SecurityAlertEvent"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlertEvent_priority_createdAt_idx" ON "SecurityAlertEvent"("priority", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlertEvent_ruleId_createdAt_idx" ON "SecurityAlertEvent"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAlertEvent_source_createdAt_idx" ON "SecurityAlertEvent"("source", "createdAt");
