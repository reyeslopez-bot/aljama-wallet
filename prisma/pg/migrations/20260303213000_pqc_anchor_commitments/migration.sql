ALTER TABLE "Wallet"
  ADD COLUMN "pqcBindingHash" TEXT;

CREATE UNIQUE INDEX "Wallet_pqcBindingHash_key" ON "Wallet"("pqcBindingHash");
