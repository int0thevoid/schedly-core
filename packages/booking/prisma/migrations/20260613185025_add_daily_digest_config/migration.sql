-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "dailyDigestTime" TEXT NOT NULL DEFAULT '16:00',
ADD COLUMN     "lastDailyDigestSentDate" TEXT;
