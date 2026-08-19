# Arquitectura de Schedly Core

## Visión general

Schedly Core es un monorepo que provee componentes y módulos
reutilizables para plataformas de agendamiento profesional.

## Principio de theming

Los componentes de `@schedly/ui` usan variables CSS con fallback:

```css
background-color: var(--schedly-color-primary, #5a8450);
```

Cada proyecto consumidor puede sobreescribir las variables `--schedly-*`
en su CSS para aplicar su propio tema, sin necesidad de modificar los componentes.

## Paquetes

### @schedly/ui (activo)

Componentes React base listos para usar:
- **Button** — Botón con variantes (primary, secondary, outline, ghost) y tamaños
- **Card** — Tarjeta con imagen, título, descripción, footer y sombra opcional
- **Badge** — Etiqueta de estado con variantes semánticas (primary, accent, neutral, success, warning)
- **Tag** — Etiqueta con icono opcional para categorías/ubicaciones
- **Modal** — Diálogo accesible con focus trap, cierre por Escape/backdrop y animación

### @schedly/booking (planificado)

Módulo de agenda:
- Configuración de disponibilidad horaria
- Bloqueo de horarios con recurrencia
- Flujo de agendamiento paso a paso

### @schedly/notifications (planificado)

Notificaciones multi-canal:
- Email via Resend
- WhatsApp via Evolution API
- Templates con tags dinámicos

### @schedly/payments (planificado)

Gestión de pagos:
- Registro de transferencias bancarias
- Estados de cita
- Boletas SII
- Futura integración Webpay + Fintoc

### @schedly/admin (planificado)

Panel de administración base con métricas,
gestión de servicios y configuración.

## Proyectos consumidores

| Proyecto | Estado | Ruta local |
|---|---|---|
| stefany-osorio-web | Activo | `file:/opt/projects/schedly-core/packages/ui` |
