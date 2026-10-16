-- US-088: registro de citas canceladas. Cuándo se canceló, quién (patient | admin | rescheduled)
-- y, si se reagendó, la cita nueva.
ALTER TABLE "Appointment" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "cancellationType" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "rescheduledToId" TEXT;

-- Citas canceladas antes de este cambio: se completan desde el historial de auditoría (US-089,
-- desde el 06-10-2026). Las anteriores quedan sin detalle.

-- 1) Reagendamientos: el evento 'rescheduled' trae la cita nueva.
UPDATE "Appointment" a
SET "cancellationType" = 'rescheduled',
    "rescheduledToId" = l."changes"->>'newAppointmentId',
    "cancelledAt" = l."createdAt"
FROM "AuditLog" l
WHERE l."entity" = 'Appointment'
  AND l."action" = 'rescheduled'
  AND l."entityId" = a."id"
  AND a."status" = 'cancelled';

-- 2) Anulaciones: el cambio de estado a 'cancelled' y quién lo hizo.
UPDATE "Appointment" a
SET "cancellationType" = CASE l."actorType" WHEN 'admin' THEN 'admin' WHEN 'patient' THEN 'patient' ELSE NULL END,
    "cancelledAt" = l."createdAt"
FROM (
    SELECT DISTINCT ON ("entityId") "entityId", "actorType", "createdAt"
    FROM "AuditLog"
    WHERE "entity" = 'Appointment'
      AND "action" = 'update'
      AND "changes"->'status'->>'to' = 'cancelled'
    ORDER BY "entityId", "createdAt" DESC
) l
WHERE l."entityId" = a."id"
  AND a."status" = 'cancelled'
  AND a."cancellationType" IS NULL;
