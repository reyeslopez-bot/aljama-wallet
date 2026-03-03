ALTER TABLE "Wallet"
  ADD COLUMN "accountRef" TEXT,
  ADD COLUMN "chain" TEXT NOT NULL DEFAULT 'EVM',
  ADD COLUMN "pubKey" TEXT,
  ADD COLUMN "keyType" TEXT NOT NULL DEFAULT 'secp256k1',
  ADD COLUMN "signerBackend" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "vaultId" TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN "derivationPath" TEXT,
  ADD COLUMN "policy" JSONB,
  ADD COLUMN "pqcBinding" JSONB;

ALTER TABLE "Wallet"
  ALTER COLUMN "encryptedPrivateKey" DROP NOT NULL,
  ALTER COLUMN "encryptionIv" DROP NOT NULL,
  ALTER COLUMN "keyVersion" DROP NOT NULL,
  ALTER COLUMN "keyVersion" DROP DEFAULT;

UPDATE "Wallet"
SET "accountRef" = lower(concat("chain", ':', "keyType", ':', "address"))
WHERE "accountRef" IS NULL;

ALTER TABLE "Wallet"
  ALTER COLUMN "accountRef" SET NOT NULL;

CREATE UNIQUE INDEX "Wallet_accountRef_key" ON "Wallet"("accountRef");
