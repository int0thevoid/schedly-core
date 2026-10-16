-- US-083: crear la ficha de cada paciente que tiene alguna cita y aún no tiene ficha, para que
-- aparezca en el buscador del formulario de cita manual. Sin consentimiento de datos
-- (dataConsentGiven = false): el sitio público no autocompleta sus datos.
-- Nombre y teléfono: de su cita más reciente. RUT: de la nota "RUT: ..." más reciente, si hay.
-- El correo se compara sin distinguir mayúsculas ni espacios para no duplicar fichas.
INSERT INTO "Client" ("id", "email", "name", "phone", "rut", "isVerified", "dataConsentGiven", "createdAt", "updatedAt")
SELECT
    'bf' || replace(gen_random_uuid()::text, '-', ''),
    latest.email,
    latest.name,
    NULLIF(latest.phone, ''),
    (
        SELECT substring(b."notes" from 'RUT:\s*([0-9kK.\-]+)')
        FROM "Appointment" b
        WHERE lower(trim(b."clientEmail")) = lower(latest.email)
          AND b."notes" ~ 'RUT:\s*[0-9kK]'
        ORDER BY b."startDateTime" DESC
        LIMIT 1
    ),
    false,
    false,
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT ON (lower(trim(a."clientEmail")))
        trim(a."clientEmail") AS email,
        trim(a."clientName") AS name,
        trim(a."clientPhone") AS phone
    FROM "Appointment" a
    WHERE trim(coalesce(a."clientEmail", '')) <> ''
    ORDER BY lower(trim(a."clientEmail")), a."startDateTime" DESC
) latest
WHERE NOT EXISTS (
    SELECT 1 FROM "Client" c WHERE lower(trim(c."email")) = lower(latest.email)
);
