CREATE TABLE "XrplIssuerProgram" (
  "id" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "issuerAccount" TEXT NOT NULL,
  "distributorAccount" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "name" TEXT,
  "domain" TEXT,
  "transferFeeBps" INTEGER,
  "tickSize" INTEGER,
  "requiresAuthorizedTrustlines" BOOLEAN NOT NULL DEFAULT true,
  "allowDistributions" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "XrplIssuerProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "XrplIssuerAsset" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "displayName" TEXT,
  "precision" INTEGER,
  "trustlineLimit" TEXT,
  "distributionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "requireHolderApproval" BOOLEAN NOT NULL DEFAULT true,
  "maxDistributionValue" TEXT,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "XrplIssuerAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "XrplIssuerHolder" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "holderAddress" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastAuthorizedAt" TIMESTAMP(3),
  "lastDistributionAt" TIMESTAMP(3),
  "notes" TEXT,
  "reviewContext" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "XrplIssuerHolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "XrplIssuerDistribution" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "holderId" TEXT,
  "actionId" TEXT,
  "destinationAddress" TEXT NOT NULL,
  "amount" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT,
  "txHash" TEXT,
  "failureCode" TEXT,
  "requestedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "validatedAt" TIMESTAMP(3),
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "XrplIssuerDistribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XrplIssuerProgram_networkId_issuerAccount_key"
  ON "XrplIssuerProgram"("networkId", "issuerAccount");

CREATE INDEX "XrplIssuerProgram_status_updatedAt_idx"
  ON "XrplIssuerProgram"("status", "updatedAt");

CREATE INDEX "XrplIssuerProgram_networkId_status_updatedAt_idx"
  ON "XrplIssuerProgram"("networkId", "status", "updatedAt");

CREATE UNIQUE INDEX "XrplIssuerAsset_programId_currency_key"
  ON "XrplIssuerAsset"("programId", "currency");

CREATE INDEX "XrplIssuerAsset_status_updatedAt_idx"
  ON "XrplIssuerAsset"("status", "updatedAt");

CREATE UNIQUE INDEX "XrplIssuerHolder_assetId_holderAddress_key"
  ON "XrplIssuerHolder"("assetId", "holderAddress");

CREATE INDEX "XrplIssuerHolder_holderAddress_idx"
  ON "XrplIssuerHolder"("holderAddress");

CREATE INDEX "XrplIssuerHolder_status_updatedAt_idx"
  ON "XrplIssuerHolder"("status", "updatedAt");

CREATE UNIQUE INDEX "XrplIssuerDistribution_actionId_key"
  ON "XrplIssuerDistribution"("actionId");

CREATE INDEX "XrplIssuerDistribution_programId_createdAt_idx"
  ON "XrplIssuerDistribution"("programId", "createdAt");

CREATE INDEX "XrplIssuerDistribution_assetId_createdAt_idx"
  ON "XrplIssuerDistribution"("assetId", "createdAt");

CREATE INDEX "XrplIssuerDistribution_holderId_createdAt_idx"
  ON "XrplIssuerDistribution"("holderId", "createdAt");

CREATE INDEX "XrplIssuerDistribution_status_updatedAt_idx"
  ON "XrplIssuerDistribution"("status", "updatedAt");

CREATE INDEX "XrplIssuerDistribution_txHash_idx"
  ON "XrplIssuerDistribution"("txHash");

ALTER TABLE "XrplIssuerAsset"
  ADD CONSTRAINT "XrplIssuerAsset_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "XrplIssuerProgram"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "XrplIssuerHolder"
  ADD CONSTRAINT "XrplIssuerHolder_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "XrplIssuerAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "XrplIssuerDistribution"
  ADD CONSTRAINT "XrplIssuerDistribution_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "XrplIssuerProgram"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "XrplIssuerDistribution"
  ADD CONSTRAINT "XrplIssuerDistribution_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "XrplIssuerAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "XrplIssuerDistribution"
  ADD CONSTRAINT "XrplIssuerDistribution_holderId_fkey"
  FOREIGN KEY ("holderId") REFERENCES "XrplIssuerHolder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "XrplIssuerDistribution"
  ADD CONSTRAINT "XrplIssuerDistribution_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "XrplAction"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
