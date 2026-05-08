export interface JournalEntry {
  id: string;
  userId: string;
  entryType: "quick_mood" | "structured" | "freeform" | "event_linked" | "voice_transcribed";
  title: string | null;
  content: string;
  moodScore: number;
  moodEmoji: string;
  energyLevel: number;
  context: JournalContext;
  aiAnalysis: JournalAIAnalysis | null;
  linkedTaskIds: string[];
  linkedCalendarBlockIds: string[];
  linkedProjectIds: string[];
  attachments: Attachment[];
  captureId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalContext {
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  weather: string | null;
  location: string | null;
  recentEvents: string[];
  activeTasks: string[];
  screenTimeMinutes: number | null;
  sleepHours: number | null;
}

export interface JournalAIAnalysis {
  sentimentScore: number;
  keyThemes: string[];
  suggestedLinks: string[];
  summary: string | null;
  generatedAt: string;
}

export interface Attachment {
  id: string;
  type: "photo" | "audio" | "video" | "drawing";
  url: string;
  thumbnailUrl: string | null;
  duration: number | null;
  transcript: string | null;
}

export interface MoodLog {
  id: string;
  userId: string;
  moodScore: number;
  moodEmoji: string;
  energyLevel: number;
  note: string | null;
  createdAt: string;
  expandedToEntryId: string | null;
}

export interface WeeklyReview {
  id: string;
  userId: string;
  weekStartDate: string;
  stats: {
    tasksCompleted: number;
    tasksCreated: number;
    pomodorosCompleted: number;
    totalFocusMinutes: number;
    journalEntries: number;
    journalStreakDays: number;
    avgMoodScore: number;
    avgEnergyLevel: number;
  };
  aiNarrative: {
    summary: string;
    wins: string[];
    challenges: string[];
    patterns: string[];
    suggestions: string[];
    generatedAt: string;
    modelUsed: string;
  };
  userReflection: string | null;
  userRating: number | null;
  createdAt: string;
  updatedAt: string;
}
