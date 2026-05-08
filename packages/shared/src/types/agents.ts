import type { CalendarBlock, Task } from "./planner.js";

export type AgentType = "orchestrator" | "planner" | "journal" | "focus" | "life_lens" | "ai_brain";

export interface AgentMessage {
  id: string;
  timestamp: string;
  from: AgentType;
  to: AgentType | "orchestrator" | "user";
  messageType: "command" | "query" | "event" | "response" | "error";
  payload: CommandPayload | QueryPayload | EventPayload | ResponsePayload | ErrorPayload;
  priority: "critical" | "high" | "normal" | "low";
  requiresAck: boolean;
  correlationId: string | null;
  expiresAt: string | null;
}

export type CommandPayload = Record<string, unknown>;
export type QueryPayload = Record<string, unknown>;
export type ResponsePayload = Record<string, unknown>;

export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type EventPayload =
  | TaskCreatedEvent
  | TaskCompletedEvent
  | TaskOverdueEvent
  | ScheduleChangedEvent
  | MoodLoggedEvent
  | JournalEntryCreatedEvent
  | StreakBrokenEvent
  | FocusSessionStartedEvent
  | FocusSessionCompletedEvent
  | FocusSessionAbandonedEvent
  | ProjectMilestoneEvent
  | ReminderTriggeredEvent
  | WeeklyReviewReadyEvent
  | InsightGeneratedEvent
  | SuggestionOfferedEvent;

export interface TaskCreatedEvent { eventType: "task_created"; taskId: string; task: Task; }
export interface TaskCompletedEvent { eventType: "task_completed"; taskId: string; completedAt: string; }
export interface TaskOverdueEvent { eventType: "task_overdue"; taskId: string; hoursOverdue: number; }
export interface ScheduleChangedEvent { eventType: "schedule_changed"; date: string; changes: CalendarBlock[]; }
export interface MoodLoggedEvent { eventType: "mood_logged"; entryId: string; moodScore: number; timestamp: string; }
export interface JournalEntryCreatedEvent { eventType: "journal_entry_created"; entryId: string; entryType: string; }
export interface StreakBrokenEvent { eventType: "streak_broken"; previousStreak: number; }
export interface FocusSessionStartedEvent { eventType: "focus_session_started"; sessionId: string; taskId: string | null; }
export interface FocusSessionCompletedEvent { eventType: "focus_session_completed"; sessionId: string; duration: number; quality: number; }
export interface FocusSessionAbandonedEvent { eventType: "focus_session_abandoned"; sessionId: string; reason: string | null; }
export interface ProjectMilestoneEvent { eventType: "project_milestone"; projectId: string; milestone: string; }
export interface ReminderTriggeredEvent { eventType: "reminder_triggered"; reminderId: string; triggerContext: Record<string, unknown>; }
export interface WeeklyReviewReadyEvent { eventType: "weekly_review_ready"; reviewId: string; weekStartDate: string; }
export interface InsightGeneratedEvent { eventType: "insight_generated"; insightType: string; text: string; confidence: number; }
export interface SuggestionOfferedEvent { eventType: "suggestion_offered"; suggestionId: string; action: string; context: Record<string, unknown>; }
