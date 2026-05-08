export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  preferences: UserPreferences;
  aiSettings: AISettings;
  onboardingCompleted: boolean;
}

export interface UserPreferences {
  defaultWorkHours: [number, number];
  workDays: number[];
  pomodoroDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  pomodorosBeforeLongBreak: number;
  focusModeDND: boolean;
  focusModeAutoReply: string;
  dailyReminderTime: string;
  weeklyReviewDay: number;
  weeklyReviewTime: string;
  notificationQuietHours: [string, string];
  colorTheme: "dark" | "light" | "system";
  reduceMotion: boolean;
}

export interface AISettings {
  model: string;
  reasoningEnabled: boolean;
  maxTokensPerRequest: number;
  temperature: number;
  enablePatternDetection: boolean;
  enableSmartSuggestions: boolean;
  enableWeeklyAutoReview: boolean;
}

export interface SyncState {
  userId: string;
  lastSyncAt: string;
  clientLastSyncAt: string;
  syncVersion: number;
  pendingChanges: PendingChange[];
}

export interface PendingChange {
  id: string;
  entityType: "task" | "journal_entry" | "focus_session" | "reminder" | "project";
  entityId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}
