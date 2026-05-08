import type { AISettings, UserPreferences } from "../types/core.js";

export const DEFAULT_AI_MODEL = "google/gemini-2.5-flash-lite";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultWorkHours: [9, 17],
  workDays: [1, 2, 3, 4, 5],
  pomodoroDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  pomodorosBeforeLongBreak: 4,
  focusModeDND: true,
  focusModeAutoReply: "I'm in deep focus. Back at {time}.",
  dailyReminderTime: "20:00",
  weeklyReviewDay: 0,
  weeklyReviewTime: "20:00",
  notificationQuietHours: ["22:00", "07:00"],
  colorTheme: "dark",
  reduceMotion: false
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  model: DEFAULT_AI_MODEL,
  reasoningEnabled: false,
  maxTokensPerRequest: 2048,
  temperature: 0.7,
  enablePatternDetection: true,
  enableSmartSuggestions: true,
  enableWeeklyAutoReview: true
};
