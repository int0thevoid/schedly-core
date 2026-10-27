-- US-099/100: encuesta post-sesión. Las citas existentes quedan sin encuesta (nadie la aceptó).
ALTER TABLE "Appointment" ADD COLUMN "surveyOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "surveySentAt" TIMESTAMP(3);

CREATE TABLE "SurveyOptOut" (
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyOptOut_pkey" PRIMARY KEY ("email")
);
