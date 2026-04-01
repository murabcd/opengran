# Repository Guidelines

## Project Structure & Module Organization
`opengran` is a Bun workspace managed with Turbo. App code lives in `apps/web` (Vite + React frontend) and `apps/desktop` (Electron shell and desktop scripts). Shared UI primitives live in `packages/ui/src`. Backend logic and schema live in `convex/`; read `convex/_generated/ai/guidelines.md` before changing Convex functions, schema, auth, or HTTP routes. Tests currently live under `apps/web/tests`, and static assets live in each app’s `src/assets` or `public/` directory.

## Core Priorities
1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability
Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Build, Test, and Development Commands
Run `bun install` once at the repo root. Use `bun dev` to start the desktop app plus `bunx convex dev` together, or `bun run dev:web` for the web app only on port `3000`. Use `bun run build` for all workspace builds, `bun run test` (runs Vitest) for all package tests, `bun run typecheck` for TypeScript checks, and `bun run check` for non-mutating Biome validation. Use `bun run check:fix` or `bun run lint:fix` when you intentionally want Biome to rewrite files. Package-scoped commands mirror the root flow, for example `cd apps/web && bun run test`.

## Coding Style & Naming Conventions
Biome is the formatter and linter (`biome.json`). Use tabs for indentation, double quotes for JavaScript/TypeScript, and let Biome organize imports. `lint` and `check` should be treated as validation commands; `format`, `lint:fix`, and `check:fix` are the mutating commands. React components use PascalCase file names such as `ChatPage`; hooks stay in camel case like `use-mobile.ts`; Convex modules use descriptive lower camel or kebab-free file names such as `notes.ts`. Prefer small shared UI additions in `packages/ui` rather than duplicating components in apps.

## Testing Guidelines
Web tests use Vitest with Testing Library and `jsdom`. Name tests `*.test.tsx` and keep them near feature-level behavior, as in `apps/web/tests/chat-page.test.tsx`. Run `bun run test` before opening a PR; for frontend changes, also run `bun run typecheck` and `bun run check`. Desktop and UI packages currently use placeholder test scripts, so new behavior there should include either web-level coverage or a clear manual verification note.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits: `feat: ...`, `fix: ...`, `docs: ...`. Keep commit subjects imperative and scoped to one change. PRs should include a short summary, linked issue if applicable, verification steps, and screenshots or recordings for visible UI changes. Call out any Convex schema or auth changes explicitly so reviewers can check deployment and environment impact.

## Security & Configuration Tips
Keep secrets in `.env.local`; do not commit local env files. Review `.env.example` when adding config. For Convex auth, derive identity server-side and avoid passing user identifiers as trusted client arguments.
