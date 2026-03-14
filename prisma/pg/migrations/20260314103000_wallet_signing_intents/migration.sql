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

CREATE TABLE "WalletNonceState" (
    "walletId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "nextNonce" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletNonceState_pkey" PRIMARY KEY ("walletId", "chainId")
);

CREATE INDEX "WalletNonceState_updatedAt_idx"
  ON "WalletNonceState"("updatedAt");

CREATE TABLE "NonceReservation" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "nonce" INTEGER NOT NULL,
    "actionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NonceReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NonceReservation_walletId_chainId_nonce_key"
  ON "NonceReservation"("walletId", "chainId", "nonce");

CREATE UNIQUE INDEX "NonceReservation_walletId_chainId_actionId_key"
  ON "NonceReservation"("walletId", "chainId", "actionId");

CREATE INDEX "NonceReservation_walletId_createdAt_idx"
  ON "NonceReservation"("walletId", "createdAt");

CREATE INDEX "NonceReservation_status_createdAt_idx"
  ON "NonceReservation"("status", "createdAt");

CREATE INDEX "NonceReservation_txHash_idx"
  ON "NonceReservation"("txHash");
