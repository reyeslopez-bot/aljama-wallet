ALTER TABLE "ChainTransaction"
  ADD COLUMN "nonce" STRING,
  ADD COLUMN "txType" STRING NOT NULL DEFAULT 'transfer',
  ADD COLUMN "gasLimit" STRING,
  ADD COLUMN "gasPrice" STRING,
  ADD COLUMN "maxFeePerGas" STRING,
  ADD COLUMN "maxPriorityFeePerGas" STRING,
  ADD COLUMN "gasUsed" STRING,
  ADD COLUMN "blockHash" STRING,
  ADD COLUMN "data" STRING,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "replacedByTxHash" STRING;

CREATE INDEX "ChainTransaction_fromWalletId_chainType_networkId_nonce_idx"
  ON "ChainTransaction"("fromWalletId", "chainType", "networkId", "nonce");

CREATE INDEX "ChainTransaction_confirmedAt_idx"
  ON "ChainTransaction"("confirmedAt");

CREATE TABLE "TokenTransfer" (
  "id" STRING NOT NULL,
  "chainType" STRING NOT NULL DEFAULT 'EVM',
  "networkId" STRING NOT NULL,
  "txHash" STRING NOT NULL,
  "logIndex" INT4 NOT NULL,
  "contractAddress" STRING NOT NULL,
  "tokenStandard" STRING,
  "assetSymbol" STRING,
  "amountBaseUnits" STRING,
  "tokenId" STRING,
  "fromAddress" STRING NOT NULL,
  "toAddress" STRING NOT NULL,
  "blockHeight" INT8,
  "blockHash" STRING,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "fromWalletId" STRING,
  "toWalletId" STRING,
  CONSTRAINT "TokenTransfer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TokenTransfer"
  ADD CONSTRAINT "TokenTransfer_fromWalletId_fkey"
  FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id");

ALTER TABLE "TokenTransfer"
  ADD CONSTRAINT "TokenTransfer_toWalletId_fkey"
  FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id");

CREATE UNIQUE INDEX "TokenTransfer_chainType_networkId_txHash_logIndex_key"
  ON "TokenTransfer"("chainType", "networkId", "txHash", "logIndex");

CREATE INDEX "TokenTransfer_fromWalletId_createdAt_idx"
  ON "TokenTransfer"("fromWalletId", "createdAt");

CREATE INDEX "TokenTransfer_toWalletId_createdAt_idx"
  ON "TokenTransfer"("toWalletId", "createdAt");

CREATE INDEX "TokenTransfer_contractAddress_createdAt_idx"
  ON "TokenTransfer"("contractAddress", "createdAt");

CREATE INDEX "TokenTransfer_txHash_idx"
  ON "TokenTransfer"("txHash");
