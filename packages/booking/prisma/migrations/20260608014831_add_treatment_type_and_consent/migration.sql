-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "dataConsentGiven" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "treatmentType" TEXT;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "treatmentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
