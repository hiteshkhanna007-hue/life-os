# Life OS Architecture

## Agents

- Orchestrator: owns unified daily snapshot, routing, and cross-agent coordination.
- Planner: owns tasks, calendar blocks, scheduling, and overdue workflows.
- Journal: owns mood logs, journal entries, context capture, and reflective summaries.
- Focus: owns active focus sessions, interruption tracking, and pomodoro updates.
- Life Lens: owns projects, reminders, life-area balance, and weekly review readiness.
- AI Brain: owns classification, insights, suggestions, and generated narratives.

## Data Flow

1. Quick Capture records raw user input.
2. AI Brain classifies extracted items.
3. Orchestrator routes confirmed items to Planner, Journal, Life Lens, or Focus.
4. Agents emit events through `agent_messages`.
5. Orchestrator refreshes cacheable snapshots and suggestions.

## Offline Sync

Clients queue `PendingChange` records, push them through `/v1/sync`, then pull server changes since `lastSyncAt`. Server-side `syncVersion` increments per accepted batch and becomes the stable conflict-resolution clock.
