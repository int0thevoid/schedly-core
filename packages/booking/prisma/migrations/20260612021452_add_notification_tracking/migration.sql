-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "paymentReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder2hSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
