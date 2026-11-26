-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "eventConfig" JSONB;

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "answers" JSONB NOT NULL,
    "sensitiveAnswers" JSONB,
    "formSnapshot" JSONB NOT NULL,
    "paymentOptionId" TEXT NOT NULL,
    "paymentSnapshot" JSONB NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "acceptedTerms" JSONB NOT NULL,
    "holdExpiresAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "cancelledAt" TIMESTAMP(3),
    "sensitivePurgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPayment" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_token_key" ON "EventRegistration"("token");

-- CreateIndex
CREATE INDEX "EventRegistration_productId_status_idx" ON "EventRegistration"("productId", "status");

-- CreateIndex
CREATE INDEX "EventRegistration_professionalId_createdAt_idx" ON "EventRegistration"("professionalId", "createdAt");

-- CreateIndex
CREATE INDEX "EventPayment_registrationId_idx" ON "EventPayment"("registrationId");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

