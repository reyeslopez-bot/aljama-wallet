-- CreateTable
CREATE TABLE "SecuritySignalEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "route" TEXT,
    "outcome" TEXT NOT NULL,
    "statusCode" INTEGER,
    "ipHash" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "deviceId" TEXT,
    "principal" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "userAgent" TEXT,
    "transport" TEXT NOT NULL,
    "details" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecuritySignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAnomalyEvent" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "repetitive" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAnomalyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XrplAction" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "userId" TEXT,
    "networkId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "txHash" TEXT,
    "engineResult" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XrplAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XrplActionEvent" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "engineResult" TEXT,
    "details" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XrplActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecuritySignalEvent_detectedAt_idx" ON "SecuritySignalEvent"("detectedAt");

-- CreateIndex
CREATE INDEX "SecuritySignalEvent_source_detectedAt_idx" ON "SecuritySignalEvent"("source", "detectedAt");

-- CreateIndex
CREATE INDEX "SecuritySignalEvent_outcome_detectedAt_idx" ON "SecuritySignalEvent"("outcome", "detectedAt");

-- CreateIndex
CREATE INDEX "SecuritySignalEvent_ipHash_detectedAt_idx" ON "SecuritySignalEvent"("ipHash", "detectedAt");

-- CreateIndex
CREATE INDEX "SecurityAnomalyEvent_detectedAt_idx" ON "SecurityAnomalyEvent"("detectedAt");

-- CreateIndex
CREATE INDEX "SecurityAnomalyEvent_ruleId_detectedAt_idx" ON "SecurityAnomalyEvent"("ruleId", "detectedAt");

-- CreateIndex
CREATE INDEX "SecurityAnomalyEvent_severity_detectedAt_idx" ON "SecurityAnomalyEvent"("severity", "detectedAt");

-- CreateIndex
CREATE INDEX "SecurityAnomalyEvent_signalId_idx" ON "SecurityAnomalyEvent"("signalId");

-- CreateIndex
CREATE INDEX "XrplAction_updatedAt_idx" ON "XrplAction"("updatedAt");

-- CreateIndex
CREATE INDEX "XrplAction_networkId_updatedAt_idx" ON "XrplAction"("networkId", "updatedAt");

-- CreateIndex
CREATE INDEX "XrplAction_idempotencyKey_idx" ON "XrplAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "XrplAction_userId_updatedAt_idx" ON "XrplAction"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "XrplActionEvent_actionId_occurredAt_idx" ON "XrplActionEvent"("actionId", "occurredAt");

-- CreateIndex
CREATE INDEX "XrplActionEvent_occurredAt_idx" ON "XrplActionEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "SecurityAnomalyEvent" ADD CONSTRAINT "SecurityAnomalyEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "SecuritySignalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XrplActionEvent" ADD CONSTRAINT "XrplActionEvent_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "XrplAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
