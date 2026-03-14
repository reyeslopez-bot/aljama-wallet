ALTER TABLE "SecuritySignalEvent"
ADD COLUMN "producerId" TEXT,
ADD COLUMN "producerType" TEXT,
ADD COLUMN "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ingestVersion" TEXT;

CREATE INDEX "SecuritySignalEvent_producerId_detectedAt_idx"
ON "SecuritySignalEvent"("producerId", "detectedAt");
