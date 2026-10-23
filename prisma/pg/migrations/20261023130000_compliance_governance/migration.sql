CREATE TABLE "GovernanceRecord" (
    "id" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "evidenceUrl" TEXT,
    "dueAt" TIMESTAMP(3),
    "reviewedSubjects" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GovernanceRecord_framework_kind_status_idx"
ON "GovernanceRecord"("framework", "kind", "status");
CREATE INDEX "GovernanceRecord_dueAt_status_idx"
ON "GovernanceRecord"("dueAt", "status");
CREATE INDEX "GovernanceRecord_createdAt_idx"
ON "GovernanceRecord"("createdAt");

CREATE TABLE "GovernanceRecordEvent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernanceRecordEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GovernanceRecordEvent_recordId_createdAt_idx"
ON "GovernanceRecordEvent"("recordId", "createdAt");
CREATE INDEX "GovernanceRecordEvent_changedByUserId_createdAt_idx"
ON "GovernanceRecordEvent"("changedByUserId", "createdAt");

ALTER TABLE "GovernanceRecordEvent"
ADD CONSTRAINT "GovernanceRecordEvent_recordId_fkey"
FOREIGN KEY ("recordId") REFERENCES "GovernanceRecord"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
