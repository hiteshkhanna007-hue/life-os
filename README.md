# Life OS

Life OS is a multi-agent personal operating system with planner, journal, focus, life-lens, quick-capture, sync, and AI-brain primitives.

## Workspace

- `packages/shared`: shared TypeScript interfaces, defaults, and validation helpers.
- `packages/ai`: prompt templates and model configs.
- `packages/sync-engine`: offline-first sync contracts and future merge logic.
- `apps/mobile`: Expo app placeholder with the planned screen structure.
- `services/api`: API service placeholder plus the initial PostgreSQL schema migration.
- `docs`: product, API, and architecture notes.

## First Milestones

1. Wire `services/api` to Fastify and PostgreSQL.
2. Convert `docs/openapi.yaml` references into concrete component schemas.
3. Add persistence repositories for tasks, calendar blocks, journal entries, focus sessions, projects, reminders, and quick captures.
4. Implement quick-capture classification against OpenRouter.
5. Add offline sync conflict resolution in `packages/sync-engine`.

## Local AI

The API uses local heuristic routing until an OpenRouter key is configured. To enable Gemini 2.5 Flash for capture classification:

```bash
OPENROUTER_API_KEY=sk-or-v1-... OPENROUTER_MODEL=google/gemini-2.5-flash npm run dev
```

Quick capture text is sent to OpenRouter only when `OPENROUTER_API_KEY` is present.
