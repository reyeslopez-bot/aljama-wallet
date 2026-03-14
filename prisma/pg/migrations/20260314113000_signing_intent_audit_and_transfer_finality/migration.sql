ALTER TABLE "WalletTransferLog"
  ADD COLUMN "confirmationCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "WalletTransferLog"
SET
  "status" = CASE
    WHEN "status" IN ('broadcasted', 'pending') THEN 'submitted'
    WHEN "status" = 'confirmed' THEN 'confirmed_soft'
    ELSE "status"
  END,
  "confirmationCount" = CASE
    WHEN "status" = 'confirmed' THEN 1
    ELSE 0
  END;

ALTER TABLE "WalletSigningIntent"
  ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'EVM',
  ADD COLUMN "actionType" TEXT,
  ADD COLUMN "traceId" TEXT,
  ADD COLUMN "txPayload" JSONB;

UPDATE "WalletSigningIntent"
SET
  "status" = CASE
    WHEN "status" = 'signing' THEN 'approved'
    WHEN "status" = 'broadcasted' THEN 'submitted'
    ELSE "status"
  END,
  "actionType" = COALESCE(NULLIF("payload"->>'txType', ''), NULLIF("intentType", ''), 'transfer'),
  "traceId" = "correlationId",
  "txPayload" = "payload";

ALTER TABLE "WalletSigningIntent"
  ALTER COLUMN "actionType" SET NOT NULL,
  ALTER COLUMN "traceId" SET NOT NULL,
  ALTER COLUMN "txPayload" SET NOT NULL;

DROP INDEX IF EXISTS "WalletSigningIntent_walletId_idempotencyKey_intentType_key";
DROP INDEX IF EXISTS "WalletSigningIntent_correlationId_idx";

ALTER TABLE "WalletSigningIntent"
  DROP COLUMN "intentType",
  DROP COLUMN "correlationId",
  DROP COLUMN "payload";

CREATE UNIQUE INDEX "WalletSigningIntent_walletId_idempotencyKey_actionType_key"
  ON "WalletSigningIntent"("walletId", "idempotencyKey", "actionType");

CREATE INDEX "WalletSigningIntent_traceId_idx"
  ON "WalletSigningIntent"("traceId");
