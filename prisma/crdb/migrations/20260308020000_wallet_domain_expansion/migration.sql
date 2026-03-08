ALTER TABLE "ChainTransaction"
  ADD COLUMN "replacesTxHash" STRING;

CREATE INDEX "ChainTransaction_replacesTxHash_idx"
  ON "ChainTransaction"("replacesTxHash");

CREATE INDEX "ChainTransaction_replacedByTxHash_idx"
  ON "ChainTransaction"("replacedByTxHash");

CREATE TABLE "WalletAddress" (
  "id" STRING NOT NULL,
  "walletId" STRING NOT NULL,
  "chainType" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "address" STRING NOT NULL,
  "publicKey" STRING,
  "derivationPath" STRING,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "WalletAddress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WalletAddress"
  ADD CONSTRAINT "WalletAddress_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "WalletAddress_chainType_networkId_address_key"
  ON "WalletAddress"("chainType", "networkId", "address");

CREATE INDEX "WalletAddress_walletId_createdAt_idx"
  ON "WalletAddress"("walletId", "createdAt");

CREATE INDEX "WalletAddress_address_idx"
  ON "WalletAddress"("address");

CREATE TABLE "Policy" (
  "id" STRING NOT NULL,
  "walletId" STRING NOT NULL,
  "policyType" STRING NOT NULL,
  "scopeChainType" STRING NOT NULL DEFAULT 'GLOBAL',
  "scopeNetworkId" STRING NOT NULL DEFAULT 'GLOBAL',
  "limitAmount" STRING,
  "timeWindow" STRING,
  "enabled" BOOL NOT NULL DEFAULT true,
  "decisionMode" STRING,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Policy"
  ADD CONSTRAINT "Policy_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "Policy_walletId_scopeChainType_scopeNetworkId_policyType_key"
  ON "Policy"("walletId", "scopeChainType", "scopeNetworkId", "policyType");

CREATE INDEX "Policy_walletId_enabled_policyType_idx"
  ON "Policy"("walletId", "enabled", "policyType");

CREATE INDEX "Policy_policyType_enabled_idx"
  ON "Policy"("policyType", "enabled");

CREATE TABLE "PolicyEvent" (
  "id" STRING NOT NULL,
  "policyId" STRING,
  "walletId" STRING NOT NULL,
  "scopeChainType" STRING,
  "scopeNetworkId" STRING,
  "policyType" STRING NOT NULL,
  "eventType" STRING NOT NULL,
  "decision" STRING NOT NULL,
  "txHash" STRING,
  "idempotencyKey" STRING,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "PolicyEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PolicyEvent"
  ADD CONSTRAINT "PolicyEvent_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE SET NULL;

ALTER TABLE "PolicyEvent"
  ADD CONSTRAINT "PolicyEvent_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE;

CREATE INDEX "PolicyEvent_walletId_createdAt_idx"
  ON "PolicyEvent"("walletId", "createdAt");

CREATE INDEX "PolicyEvent_policyType_createdAt_idx"
  ON "PolicyEvent"("policyType", "createdAt");

CREATE TABLE "ChainBlock" (
  "id" STRING NOT NULL,
  "chainType" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "blockHeight" INT8 NOT NULL,
  "blockHash" STRING NOT NULL,
  "parentHash" STRING,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "ChainBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChainBlock_chainType_networkId_blockHeight_key"
  ON "ChainBlock"("chainType", "networkId", "blockHeight");

CREATE UNIQUE INDEX "ChainBlock_chainType_networkId_blockHash_key"
  ON "ChainBlock"("chainType", "networkId", "blockHash");

CREATE INDEX "ChainBlock_chainType_networkId_timestamp_idx"
  ON "ChainBlock"("chainType", "networkId", "timestamp");

CREATE TABLE "ChainIndexTransaction" (
  "id" STRING NOT NULL,
  "chainType" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "txHash" STRING NOT NULL,
  "blockHeight" INT8,
  "blockHash" STRING,
  "transactionIndex" INT4,
  "status" STRING,
  "fromAddress" STRING,
  "toAddress" STRING,
  "nonce" STRING,
  "valueBaseUnits" STRING,
  "gasLimit" STRING,
  "gasPrice" STRING,
  "effectiveGasPrice" STRING,
  "gasUsed" STRING,
  "data" STRING,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "ChainIndexTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChainIndexTransaction_chainType_networkId_txHash_key"
  ON "ChainIndexTransaction"("chainType", "networkId", "txHash");

CREATE INDEX "ChainIndexTransaction_chainType_networkId_blockHeight_idx"
  ON "ChainIndexTransaction"("chainType", "networkId", "blockHeight");

CREATE INDEX "ChainIndexTransaction_fromAddress_createdAt_idx"
  ON "ChainIndexTransaction"("fromAddress", "createdAt");

CREATE INDEX "ChainIndexTransaction_toAddress_createdAt_idx"
  ON "ChainIndexTransaction"("toAddress", "createdAt");

CREATE TABLE "ChainLog" (
  "id" STRING NOT NULL,
  "chainType" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "txHash" STRING NOT NULL,
  "logIndex" INT4 NOT NULL,
  "blockHeight" INT8,
  "blockHash" STRING,
  "contractAddress" STRING NOT NULL,
  "topic0" STRING,
  "topic1" STRING,
  "topic2" STRING,
  "topic3" STRING,
  "data" STRING,
  "removed" BOOL NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "ChainLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChainLog_chainType_networkId_txHash_logIndex_key"
  ON "ChainLog"("chainType", "networkId", "txHash", "logIndex");

CREATE INDEX "ChainLog_chainType_networkId_blockHeight_idx"
  ON "ChainLog"("chainType", "networkId", "blockHeight");

CREATE INDEX "ChainLog_contractAddress_createdAt_idx"
  ON "ChainLog"("contractAddress", "createdAt");

CREATE TABLE "XrplTransaction" (
  "id" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "txHash" STRING NOT NULL,
  "txType" STRING NOT NULL,
  "status" STRING NOT NULL,
  "engineResult" STRING,
  "ledgerIndex" INT8,
  "ledgerHash" STRING,
  "sequence" INT4,
  "feeDrops" STRING,
  "account" STRING NOT NULL,
  "destination" STRING,
  "actionId" STRING,
  "memosJson" JSONB,
  "rawTransaction" JSONB,
  "rawResult" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "fromWalletId" STRING,
  "toWalletId" STRING,
  CONSTRAINT "XrplTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "XrplTransaction"
  ADD CONSTRAINT "XrplTransaction_fromWalletId_fkey"
  FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL;

ALTER TABLE "XrplTransaction"
  ADD CONSTRAINT "XrplTransaction_toWalletId_fkey"
  FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "XrplTransaction_networkId_txHash_key"
  ON "XrplTransaction"("networkId", "txHash");

CREATE INDEX "XrplTransaction_networkId_ledgerIndex_idx"
  ON "XrplTransaction"("networkId", "ledgerIndex");

CREATE INDEX "XrplTransaction_fromWalletId_createdAt_idx"
  ON "XrplTransaction"("fromWalletId", "createdAt");

CREATE INDEX "XrplTransaction_toWalletId_createdAt_idx"
  ON "XrplTransaction"("toWalletId", "createdAt");

CREATE INDEX "XrplTransaction_account_createdAt_idx"
  ON "XrplTransaction"("account", "createdAt");

CREATE INDEX "XrplTransaction_destination_createdAt_idx"
  ON "XrplTransaction"("destination", "createdAt");

CREATE INDEX "XrplTransaction_status_createdAt_idx"
  ON "XrplTransaction"("status", "createdAt");

CREATE TABLE "XrplLedgerEvent" (
  "id" STRING NOT NULL,
  "transactionId" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "txHash" STRING NOT NULL,
  "ledgerIndex" INT8,
  "eventType" STRING NOT NULL,
  "objectType" STRING,
  "objectId" STRING,
  "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "XrplLedgerEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "XrplLedgerEvent"
  ADD CONSTRAINT "XrplLedgerEvent_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "XrplTransaction"("id") ON DELETE CASCADE;

CREATE INDEX "XrplLedgerEvent_transactionId_createdAt_idx"
  ON "XrplLedgerEvent"("transactionId", "createdAt");

CREATE INDEX "XrplLedgerEvent_networkId_ledgerIndex_idx"
  ON "XrplLedgerEvent"("networkId", "ledgerIndex");

CREATE INDEX "XrplLedgerEvent_eventType_createdAt_idx"
  ON "XrplLedgerEvent"("eventType", "createdAt");

CREATE TABLE "XrplTrustLine" (
  "id" STRING NOT NULL,
  "walletId" STRING,
  "networkId" STRING NOT NULL,
  "account" STRING NOT NULL,
  "issuer" STRING NOT NULL,
  "currency" STRING NOT NULL,
  "balance" STRING,
  "limit" STRING,
  "limitPeer" STRING,
  "authorized" BOOL,
  "freezeState" STRING,
  "txHash" STRING,
  "ledgerIndex" INT8,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "XrplTrustLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "XrplTrustLine"
  ADD CONSTRAINT "XrplTrustLine_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "XrplTrustLine_networkId_account_issuer_currency_key"
  ON "XrplTrustLine"("networkId", "account", "issuer", "currency");

CREATE INDEX "XrplTrustLine_walletId_updatedAt_idx"
  ON "XrplTrustLine"("walletId", "updatedAt");

CREATE INDEX "XrplTrustLine_account_updatedAt_idx"
  ON "XrplTrustLine"("account", "updatedAt");

CREATE TABLE "XrplNftToken" (
  "id" STRING NOT NULL,
  "networkId" STRING NOT NULL,
  "tokenId" STRING NOT NULL,
  "issuer" STRING,
  "owner" STRING NOT NULL,
  "ownerWalletId" STRING,
  "uri" STRING,
  "flags" INT4,
  "taxon" INT4,
  "transferFee" INT4,
  "txHash" STRING,
  "ledgerIndex" INT8,
  "mintedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT "XrplNftToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "XrplNftToken"
  ADD CONSTRAINT "XrplNftToken_ownerWalletId_fkey"
  FOREIGN KEY ("ownerWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "XrplNftToken_networkId_tokenId_key"
  ON "XrplNftToken"("networkId", "tokenId");

CREATE INDEX "XrplNftToken_ownerWalletId_updatedAt_idx"
  ON "XrplNftToken"("ownerWalletId", "updatedAt");

CREATE INDEX "XrplNftToken_owner_updatedAt_idx"
  ON "XrplNftToken"("owner", "updatedAt");
