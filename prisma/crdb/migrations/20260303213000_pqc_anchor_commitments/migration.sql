ALTER TABLE "Wallet"
  ADD COLUMN "pqcBindingHash" STRING;

CREATE UNIQUE INDEX "Wallet_pqcBindingHash_key" ON "Wallet"("pqcBindingHash");

CREATE TABLE "WalletPqcAnchor" (
  "id" STRING NOT NULL,
  "walletId" STRING NOT NULL,
  "chainType" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "registryAddress" STRING,
  "bindingHash" STRING NOT NULL,
  "statementHash" STRING NOT NULL,
  "signatureHash" STRING NOT NULL,
  "publicKeyHash" STRING NOT NULL,
  "uri" STRING NOT NULL,
  "uriHash" STRING NOT NULL,
  "txHash" STRING NOT NULL,
  "status" STRING NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "WalletPqcAnchor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WalletPqcAnchor"
  ADD CONSTRAINT "WalletPqcAnchor_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id");

CREATE UNIQUE INDEX "WalletPqcAnchor_chainType_networkId_txHash_key"
  ON "WalletPqcAnchor"("chainType", "networkId", "txHash");

CREATE INDEX "WalletPqcAnchor_walletId_createdAt_idx"
  ON "WalletPqcAnchor"("walletId", "createdAt");
