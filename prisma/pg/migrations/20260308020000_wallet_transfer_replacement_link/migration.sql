ALTER TABLE "WalletTransferLog"
  ADD COLUMN "replacesTxHash" TEXT;

CREATE INDEX "WalletTransferLog_replacesTxHash_idx"
  ON "WalletTransferLog"("replacesTxHash");
