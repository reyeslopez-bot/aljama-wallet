ALTER TABLE "WalletSigningIntent"
  ALTER COLUMN "txPayload" DROP NOT NULL,
  ADD COLUMN "txPayloadRef" TEXT,
  ADD COLUMN "txPayloadSizeBytes" INTEGER;

UPDATE "WalletSigningIntent"
SET "txPayloadSizeBytes" = OCTET_LENGTH("txPayload"::text)
WHERE "txPayload" IS NOT NULL;
