-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "appointmentToken" TEXT,
ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_appointmentToken_key" ON "Appointment"("appointmentToken");
