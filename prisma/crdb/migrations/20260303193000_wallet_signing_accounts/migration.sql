ALTER TABLE "Wallet"
  ADD COLUMN "accountRef" STRING,
  ADD COLUMN "chain" STRING NOT NULL DEFAULT 'EVM',
  ADD COLUMN "pubKey" STRING,
  ADD COLUMN "keyType" STRING NOT NULL DEFAULT 'secp256k1',
  ADD COLUMN "signerBackend" STRING NOT NULL DEFAULT 'local',
  ADD COLUMN "vaultId" STRING NOT NULL DEFAULT 'public',
  ADD COLUMN "derivationPath" STRING,
  ADD COLUMN "policy" JSONB,
  ADD COLUMN "pqcBinding" JSONB;

ALTER TABLE "Wallet"
  ALTER COLUMN "encryptedPrivateKey" DROP NOT NULL;

ALTER TABLE "Wallet"
  ALTER COLUMN "encryptionIv" DROP NOT NULL;

ALTER TABLE "Wallet"
  ALTER COLUMN "keyVersion" DROP NOT NULL;

ALTER TABLE "Wallet"
  ALTER COLUMN "keyVersion" DROP DEFAULT;

UPDATE "Wallet"
SET "accountRef" = lower(concat("chain", ':', "keyType", ':', "address"))
WHERE "accountRef" IS NULL;

ALTER TABLE "Wallet"
  ALTER COLUMN "accountRef" SET NOT NULL;

CREATE UNIQUE INDEX "Wallet_accountRef_key" ON "Wallet"("accountRef");
