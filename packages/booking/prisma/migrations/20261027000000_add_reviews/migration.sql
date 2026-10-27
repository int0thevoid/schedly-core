-- US-072/073/097: reseñas de pacientes y enlace de reseña por sesión.
ALTER TABLE "Appointment" ADD COLUMN "reviewToken" TEXT;
CREATE UNIQUE INDEX "Appointment_reviewToken_key" ON "Appointment"("reviewToken");

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "externalId" TEXT,
    "appointmentId" TEXT,
    "clientId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "nameMismatch" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderatedAt" TIMESTAMP(3),
    "publicReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "serviceName" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Review_appointmentId_key" ON "Review"("appointmentId");
CREATE UNIQUE INDEX "Review_source_externalId_key" ON "Review"("source", "externalId");
CREATE INDEX "Review_professionalId_status_reviewedAt_idx" ON "Review"("professionalId", "status", "reviewedAt");
