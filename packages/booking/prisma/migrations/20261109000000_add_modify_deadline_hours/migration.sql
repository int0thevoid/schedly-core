-- US-092: plazo único para modificar/anular por enlace (antes: 23:00 del día anterior, o 3 h si era el mismo día).
ALTER TABLE "Professional" ADD COLUMN "modifyDeadlineHours" INTEGER NOT NULL DEFAULT 4;

-- Las citas futuras ya agendadas pasan al nuevo plazo (4 h antes).
UPDATE "Appointment"
SET "tokenExpiresAt" = "startDateTime" - INTERVAL '4 hours'
WHERE "appointmentToken" IS NOT NULL
  AND "status" <> 'cancelled'
  AND "startDateTime" > now();
