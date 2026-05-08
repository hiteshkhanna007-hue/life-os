import type { FocusSession } from "./focus.js";

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "cancelled" | "archived";
  priority: "critical" | "high" | "medium" | "low";
  isUrgent: boolean;
  isImportant: boolean;
  dueDate: string | null;
  dueTime: string | null;
  startDate: string | null;
  completedAt: string | null;
  estimatedPomodoros: number;
  actualPomodoros: number;
  estimatedDuration: number;
  projectId: string | null;
  tags: string[];
  energyRequired: "low" | "medium" | "high";
  scheduledBlockId: string | null;
  calendarEventId: string | null;
  source: "manual" | "voice_capture" | "ai_suggested" | "calendar_import" | "recurring";
  captureId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CalendarBlock {
  id: string;
  userId: string;
  title: string;
  startTime: string;
  endTime: string;
  blockType: "task" | "meeting" | "focus" | "break" | "personal" | "travel";
  isExternal: boolean;
  externalEventId: string | null;
  taskId: string | null;
  projectId: string | null;
  recurrenceRule: string | null;
  recurringEventId: string | null;
  aiOptimized: boolean;
  aiRationale: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailySnapshot {
  userId: string;
  date: string;
  generatedAt: string;
  tasks: {
    total: number;
    completed: number;
    overdue: number;
    byPriority: Record<string, number>;
    upcoming: Task[];
  };
  calendar: {
    blocks: CalendarBlock[];
    freeTimeMinutes: number;
    busiestHour: number | null;
  };
  focus: {
    pomodorosCompleted: number;
    pomodorosGoal: number;
    currentSession: FocusSession | null;
  };
  journal: {
    todayMood: number | null;
    entryCount: number;
    streakDays: number;
  };
  aiInsight: {
    text: string;
    confidence: number;
    suggestedAction: string | null;
  } | null;
}
