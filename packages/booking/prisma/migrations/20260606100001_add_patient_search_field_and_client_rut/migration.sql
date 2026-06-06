-- AlterTable
ALTER TABLE "Professional" ADD COLUMN "patientSearchField" TEXT NOT NULL DEFAULT 'name';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "rut" TEXT;
