ALTER TABLE "WalletTransferLog"
  ADD COLUMN "txHash" TEXT,
  ADD COLUMN "nonce" TEXT,
  ADD COLUMN "txType" TEXT,
  ADD COLUMN "data" TEXT,
  ADD COLUMN "gasLimit" TEXT,
  ADD COLUMN "gasPrice" TEXT,
  ADD COLUMN "maxFeePerGas" TEXT,
  ADD COLUMN "maxPriorityFeePerGas" TEXT,
  ADD COLUMN "gasUsed" TEXT,
  ADD COLUMN "blockHeight" BIGINT,
  ADD COLUMN "blockHash" TEXT,
  ADD COLUMN "replacedByTxHash" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "WalletTransferLog_walletId_chainId_nonce_idx"
  ON "WalletTransferLog"("walletId", "chainId", "nonce");

CREATE INDEX "WalletTransferLog_txHash_idx"
  ON "WalletTransferLog"("txHash");

CREATE INDEX "WalletTransferLog_status_createdAt_idx"
  ON "WalletTransferLog"("status", "createdAt");
