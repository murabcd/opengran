# Repository Guidelines

## Project Structure & Module Organization
`opengran` is a Bun workspace managed with Turbo. App code lives in `apps/web` (Vite + React frontend) and `apps/desktop` (Electron shell and desktop scripts). Shared UI primitives live in `packages/ui/src`. Backend logic and schema live in `convex/`; read `convex/_generated/ai/guidelines.md` before changing Convex functions, schema, auth, or HTTP routes. Tests currently live under `apps/web/tests`, and static assets live in each app’s `src/assets` or `public/` directory.

## Build, Test, and Development Commands
Run `bun install` once at the repo root. Use `bun dev` to start the desktop app plus `bunx convex dev` together, or `bun run dev:web` for the web app only on port `3000`. Use `bun run build` for all workspace builds, `bun run test` for all package tests, and `bun run typecheck` for TypeScript checks. Package-scoped commands mirror the root flow, for example `cd apps/web && bun test`.

## Coding Style & Naming Conventions
Biome is the formatter and linter (`biome.json`). Use tabs for indentation, double quotes for JavaScript/TypeScript, and let Biome organize imports. React components use PascalCase file names such as `ChatPage`; hooks stay in camel case like `use-mobile.ts`; Convex modules use descriptive lower camel or kebab-free file names such as `quickNotes.ts`. Prefer small shared UI additions in `packages/ui` rather than duplicating components in apps.

## Testing Guidelines
Web tests use Vitest with Testing Library and `jsdom`. Name tests `*.test.tsx` and keep them near feature-level behavior, as in `apps/web/tests/chat-page.test.tsx`. Run `bun run test` before opening a PR; for frontend changes, also run `bun run typecheck` and `bun run check`. Desktop and UI packages currently use placeholder test scripts, so new behavior there should include either web-level coverage or a clear manual verification note.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits: `feat: ...`, `fix: ...`, `docs: ...`. Keep commit subjects imperative and scoped to one change. PRs should include a short summary, linked issue if applicable, verification steps, and screenshots or recordings for visible UI changes. Call out any Convex schema or auth changes explicitly so reviewers can check deployment and environment impact.

## Security & Configuration Tips
Keep secrets in `.env.local`; do not commit local env files. Review `.env.example` when adding config. For Convex auth, derive identity server-side and avoid passing user identifiers as trusted client arguments.
