-- AlterTable: add payment flow fields to Appointment
ALTER TABLE "Appointment" ADD COLUMN "bookingFlow" TEXT NOT NULL DEFAULT 'advance',
ADD COLUMN "paymentDeadline" TIMESTAMP(3),
ADD COLUMN "autoCancelledAt" TIMESTAMP(3);

-- AlterTable: add cashPaymentEnabled to Professional
ALTER TABLE "Professional" ADD COLUMN "cashPaymentEnabled" BOOLEAN NOT NULL DEFAULT true;
