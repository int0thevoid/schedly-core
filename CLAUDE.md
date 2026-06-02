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

## Política de merges

En este proyecto el merge es automático después de que el CI esté verde.
No se requiere revisión manual.

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
