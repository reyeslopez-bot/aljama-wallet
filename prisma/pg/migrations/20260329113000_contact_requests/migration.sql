-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "locale" TEXT,
    "source" TEXT,
    "pagePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "requestId" TEXT,
    "traceId" TEXT,
    "confirmationSentAt" TIMESTAMP(3),
    "internalNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequest_createdAt_idx" ON "ContactRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ContactRequest_category_createdAt_idx" ON "ContactRequest"("category", "createdAt");

-- CreateIndex
CREATE INDEX "ContactRequest_status_createdAt_idx" ON "ContactRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContactRequest_email_createdAt_idx" ON "ContactRequest"("email", "createdAt");

-- CreateIndex
CREATE INDEX "ContactRequest_userId_createdAt_idx" ON "ContactRequest"("userId", "createdAt");
