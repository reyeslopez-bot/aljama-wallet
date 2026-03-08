CREATE TABLE "ChainTransaction" (
  "id" STRING NOT NULL,
  "chainType" STRING NOT NULL DEFAULT 'EVM',
  "networkId" STRING NOT NULL,
  "txHash" STRING NOT NULL,
  "status" STRING NOT NULL,
  "asset" STRING NOT NULL DEFAULT 'native',
  "valueBaseUnits" INT8 NOT NULL,
  "blockHeight" INT8,
  "fromAddress" STRING NOT NULL,
  "toAddress" STRING NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "fromWalletId" STRING NOT NULL,
  "toWalletId" STRING,
  CONSTRAINT "ChainTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChainTransaction"
  ADD CONSTRAINT "ChainTransaction_fromWalletId_fkey"
  FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id");

ALTER TABLE "ChainTransaction"
  ADD CONSTRAINT "ChainTransaction_toWalletId_fkey"
  FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id");

CREATE UNIQUE INDEX "ChainTransaction_chainType_networkId_txHash_key"
  ON "ChainTransaction"("chainType", "networkId", "txHash");

CREATE INDEX "ChainTransaction_fromWalletId_chainType_networkId_createdAt_idx"
  ON "ChainTransaction"("fromWalletId", "chainType", "networkId", "createdAt");

CREATE INDEX "ChainTransaction_toWalletId_chainType_networkId_createdAt_idx"
  ON "ChainTransaction"("toWalletId", "chainType", "networkId", "createdAt");

CREATE INDEX "ChainTransaction_toAddress_chainType_networkId_createdAt_idx"
  ON "ChainTransaction"("toAddress", "chainType", "networkId", "createdAt");

CREATE INDEX "ChainTransaction_status_createdAt_idx"
  ON "ChainTransaction"("status", "createdAt");
