# Life OS Schema

The canonical TypeScript interfaces live in `packages/shared/src/types`.

The initial PostgreSQL implementation lives in `services/api/src/db/migrations/001_initial_schema.sql`.

Key implementation notes:

- PostgreSQL overlap constraints require `btree_gist`.
- Calendar blocks use `tstzrange(start_time, end_time, '[)')` because timestamps are timezone-aware.
- `tasks.scheduled_block_id` is added after `calendar_blocks` to avoid a circular table creation dependency.
- Soft-deleted tasks keep `deleted_at` for analytics and sync reconciliation.
- Computed objects like `DailySnapshot`, `FocusStats`, and `LifeAreaBalance` are represented in TypeScript and should be cached or materialized later if needed.
