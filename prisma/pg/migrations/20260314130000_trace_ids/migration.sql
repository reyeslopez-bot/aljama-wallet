ALTER TABLE "WalletTransferLog"
ADD COLUMN "traceId" TEXT;

UPDATE "WalletTransferLog"
SET "traceId" = CONCAT('legacy-wallet-transfer-', "id")
WHERE "traceId" IS NULL;

ALTER TABLE "WalletTransferLog"
ALTER COLUMN "traceId" SET NOT NULL;

CREATE INDEX "WalletTransferLog_traceId_idx" ON "WalletTransferLog"("traceId");

ALTER TABLE "SecuritySignalEvent"
ADD COLUMN "traceId" TEXT;

UPDATE "SecuritySignalEvent"
SET "traceId" = CONCAT('legacy-security-signal-', "id")
WHERE "traceId" IS NULL;

ALTER TABLE "SecuritySignalEvent"
ALTER COLUMN "traceId" SET NOT NULL;

CREATE INDEX "SecuritySignalEvent_traceId_idx" ON "SecuritySignalEvent"("traceId");

ALTER TABLE "XrplAction"
ADD COLUMN "traceId" TEXT;

UPDATE "XrplAction"
SET "traceId" = CONCAT('legacy-xrpl-action-', "id")
WHERE "traceId" IS NULL;

ALTER TABLE "XrplAction"
ALTER COLUMN "traceId" SET NOT NULL;

CREATE INDEX "XrplAction_traceId_idx" ON "XrplAction"("traceId");
