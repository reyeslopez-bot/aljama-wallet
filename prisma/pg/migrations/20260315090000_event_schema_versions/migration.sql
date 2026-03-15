ALTER TABLE "TelemetryEvent"
ADD COLUMN "schemaVersion" TEXT NOT NULL DEFAULT '1',
ADD COLUMN "traceId" TEXT;

UPDATE "TelemetryEvent"
SET "traceId" = COALESCE(
  "context"->'server'->>'eventTraceId',
  "context"->'server'->>'traceId',
  CONCAT('legacy-telemetry-', "id")
)
WHERE "traceId" IS NULL;

ALTER TABLE "TelemetryEvent"
ALTER COLUMN "traceId" SET NOT NULL;

CREATE INDEX "TelemetryEvent_schemaVersion_idx" ON "TelemetryEvent"("schemaVersion");
CREATE INDEX "TelemetryEvent_traceId_idx" ON "TelemetryEvent"("traceId");

ALTER TABLE "SecuritySignalEvent"
ADD COLUMN "schemaVersion" TEXT NOT NULL DEFAULT '1';

CREATE INDEX "SecuritySignalEvent_schemaVersion_idx" ON "SecuritySignalEvent"("schemaVersion");
