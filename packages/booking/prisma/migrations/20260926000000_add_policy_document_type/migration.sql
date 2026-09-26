-- Generalizamos ConsentDocument para guardar más de un tipo de documento por profesional
-- (hoy: "data_storage" y "cancellation"), en vez de crear una tabla nueva idéntica.

-- DropIndex
DROP INDEX "ConsentDocument_professionalId_key";

-- AlterTable
ALTER TABLE "ConsentDocument" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'data_storage';

-- CreateIndex
CREATE UNIQUE INDEX "ConsentDocument_professionalId_type_key" ON "ConsentDocument"("professionalId", "type");
