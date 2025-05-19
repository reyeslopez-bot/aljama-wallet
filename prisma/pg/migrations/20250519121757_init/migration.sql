-- CreateTable
CREATE TABLE "DailyTransactionSummary" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "chain" TEXT NOT NULL,
    "asset" TEXT NOT NULL,

    CONSTRAINT "DailyTransactionSummary_pkey" PRIMARY KEY ("id")
);
