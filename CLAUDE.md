# CLAUDE.md — Schedly Core

Librería de componentes y módulos reutilizables para plataformas
de agendamiento profesional.

## Arquitectura

Monorepo con pnpm workspaces:
- `@schedly/ui`            — Componentes React base
- `@schedly/booking`       — Módulo de agenda
- `@schedly/notifications` — Email + WhatsApp
- `@schedly/payments`      — Pagos + boletas SII
- `@schedly/admin`         — Panel de administración

## Principio fundamental

Los componentes de @schedly/ui NO tienen colores hardcodeados.
Usan variables CSS con fallback (`var(--schedly-color-primary, #5a8450)`).
Cada proyecto consumidor define sus propios valores sobreescribiendo
las variables `--schedly-*` en su CSS.

## Proyectos que consumen schedly-core

- `stefany-osorio-web` — Sitio psicóloga Stefany Osorio Alfaro
- (futuro) `peluqueria-web` — Peluquería

## Convenciones

- Código: inglés
- Documentación: español
- Commits: Conventional Commits
- Branches: `feature/[paquete]-[descripcion]`
- Tests: Vitest + Testing Library
- Estilo: TypeScript estricto, sin `any`

## Flujo de trabajo con Claude (optimizado para tokens)

1. **Definir antes de codificar.** Ante un requerimiento nuevo o ambiguo, Claude primero
   propone una definición breve (alcance, criterios de aceptación, decisiones abiertas) y
   espera confirmación. No se escribe código hasta cerrar la definición.
2. **Acumular cambios en una sola rama.** Los ajustes y correcciones que surjan durante la
   conversación se commitean en la misma rama de trabajo; no se abre un PR por cada uno.
3. **PR solo con confirmación.** El PR se abre únicamente cuando el usuario confirma que la
   solución completa está lista (ej. "abre el PR"). Hasta entonces, solo commit + push a la rama.
4. **Bugs reportados:** preferir capturas de pantalla + descripción breve (pantalla, pasos,
   dispositivo/navegador). Video solo si el bug depende de una secuencia o timing.

## Política de merges

Una vez **abierto** el PR (con confirmación del usuario, ver sección anterior), el merge es
automático después de que el CI esté verde. No se requiere revisión manual.

Después de abrir cada PR:
1. Esperar que el CI pase: `gh pr checks [número] --watch`
2. Si CI verde → hacer merge inmediatamente: `gh pr merge [número] --merge --delete-branch`
3. Actualizar local: `git pull origin develop`
4. Continuar con la siguiente tarea

Aplicar esta política a **todos** los PRs en este repositorio.

## Comandos

```bash
# Instalar todo
pnpm install

# Tests de ui
cd packages/ui && pnpm test

# Build de ui
cd packages/ui && pnpm build
```
