CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrivacyRequest_userId_createdAt_idx" ON "PrivacyRequest"("userId", "createdAt");
CREATE INDEX "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");
CREATE INDEX "PrivacyRequest_resolvedAt_idx" ON "PrivacyRequest"("resolvedAt");

CREATE TABLE "PrivacyRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrivacyRequestEvent_requestId_createdAt_idx"
ON "PrivacyRequestEvent"("requestId", "createdAt");

ALTER TABLE "PrivacyRequestEvent"
ADD CONSTRAINT "PrivacyRequestEvent_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "PrivacyRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsentReceipt" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "telemetryGranted" BOOLEAN NOT NULL,
    "locationGranted" BOOLEAN NOT NULL,
    "changeType" TEXT NOT NULL,
    "previousTelemetry" BOOLEAN,
    "previousLocation" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentReceipt_receiptId_createdAt_idx" ON "ConsentReceipt"("receiptId", "createdAt");
CREATE INDEX "ConsentReceipt_createdAt_idx" ON "ConsentReceipt"("createdAt");
