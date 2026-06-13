-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "attendanceConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attendanceConfirmedAt" TIMESTAMP(3);
