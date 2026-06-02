# Schedly Core

Librería de componentes y módulos reutilizables para construir plataformas de agendamiento profesional.

## Paquetes

| Paquete | Descripción | Estado |
|---|---|---|
| `@schedly/ui` | Componentes React base (Button, Card, Badge, Tag, Modal) | ✅ Activo |
| `@schedly/booking` | Módulo de agenda y disponibilidad | 🚧 Planificado |
| `@schedly/notifications` | Email y WhatsApp con templates | 🚧 Planificado |
| `@schedly/payments` | Registro de pagos y boletas SII | 🚧 Planificado |
| `@schedly/admin` | Panel de administración base | 🚧 Planificado |

## Instalación en un proyecto consumidor

Dado que el paquete es privado y no está publicado en npm, se usa referencia local:

```json
// package.json del proyecto consumidor
{
  "dependencies": {
    "@schedly/ui": "file:../schedly-core/packages/ui"
  }
}
```

Luego importar los tokens CSS en el entry point del proyecto:

```css
/* index.css — sobrescribir variables para personalizar el tema */
:root {
  --schedly-color-primary: #tu-color-primario;
  --schedly-color-primary-dark: #tu-color-primario-oscuro;
  /* ver packages/ui/src/styles/tokens.css para todas las variables */
}
```

## Uso de componentes

```tsx
import { Button, Card, Badge, Tag, Modal } from '@schedly/ui'

function App() {
  return (
    <Card title="Mi servicio" shadow>
      <Badge variant="primary">Presencial</Badge>
      <Tag>Villa Alemana</Tag>
      <Button variant="primary">Agendar hora</Button>
    </Card>
  )
}
```

## Theming

Los componentes usan variables CSS con fallback a los valores por defecto.
Para personalizar el tema, sobreescribir las variables `--schedly-*` en el CSS del proyecto:

```css
:root {
  --schedly-color-primary: #2563eb;       /* azul */
  --schedly-color-primary-dark: #1d4ed8;
  --schedly-radius-button: 9999px;        /* botones pill */
  --schedly-radius-card: 0.5rem;          /* cards cuadradas */
}
```

Ver `packages/ui/src/styles/tokens.css` para la lista completa de variables.

## Desarrollo

```bash
# Instalar dependencias
pnpm install

# Correr tests de @schedly/ui
cd packages/ui && pnpm test

# Build de @schedly/ui
cd packages/ui && pnpm build
```

## Contribuir

1. Crear rama desde `develop`: `git checkout -b feature/ui-[nombre-componente]`
2. Implementar el cambio con tests
3. Abrir PR hacia `develop`
