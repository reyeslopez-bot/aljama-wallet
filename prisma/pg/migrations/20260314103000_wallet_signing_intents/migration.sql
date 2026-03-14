CREATE TABLE "WalletSigningIntent" (
    "id" TEXT NOT NULL,
    "intentType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT,
    "chainId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "transferLogId" TEXT,
    "payload" JSONB NOT NULL,
    "signedPayload" TEXT,
    "txHash" TEXT,
    "errorCode" TEXT,
    "errorDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletSigningIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletSigningIntent_walletId_idempotencyKey_intentType_key"
  ON "WalletSigningIntent"("walletId", "idempotencyKey", "intentType");

CREATE INDEX "WalletSigningIntent_walletId_createdAt_idx"
  ON "WalletSigningIntent"("walletId", "createdAt");

CREATE INDEX "WalletSigningIntent_status_createdAt_idx"
  ON "WalletSigningIntent"("status", "createdAt");

CREATE INDEX "WalletSigningIntent_correlationId_idx"
  ON "WalletSigningIntent"("correlationId");

CREATE INDEX "WalletSigningIntent_txHash_idx"
  ON "WalletSigningIntent"("txHash");

CREATE INDEX "WalletSigningIntent_transferLogId_idx"
  ON "WalletSigningIntent"("transferLogId");
