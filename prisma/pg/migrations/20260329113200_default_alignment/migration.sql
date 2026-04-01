ALTER TABLE "DailyTransactionSummary"
  ALTER COLUMN "count" DROP DEFAULT;

ALTER TABLE "WalletTransferLog"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "WalletSigningIntent"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "WalletNonceState"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "NonceReservation"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ReconciliationIssue"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "XrplIssuerProgram"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "XrplIssuerAsset"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "XrplIssuerHolder"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "XrplIssuerDistribution"
  ALTER COLUMN "updatedAt" DROP DEFAULT;
