ALTER TABLE "DailyTransactionSummary"
  ADD COLUMN "count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "DailyTransactionSummary_day_key";
CREATE UNIQUE INDEX "DailyTransactionSummary_day_key" ON "DailyTransactionSummary"("day");

ALTER TABLE "DailyTransactionSummary"
  DROP COLUMN "totalValue",
  DROP COLUMN "chain",
  DROP COLUMN "asset";
