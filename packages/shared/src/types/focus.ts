export interface FocusSession {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  plannedDuration: number;
  actualDuration: number | null;
  status: "active" | "paused" | "completed" | "abandoned";
  taskId: string | null;
  projectId: string | null;
  selfRatedFocus: number | null;
  interruptionCount: number;
  interruptionReasons: string[];
  environment: {
    startMoodScore: number | null;
    startEnergyLevel: number | null;
    timeOfDay: string;
    dayOfWeek: number;
  };
  aiInsight: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FocusStats {
  userId: string;
  date: string;
  totalSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  totalFocusMinutes: number;
  avgSelfRatedFocus: number | null;
  totalInterruptions: number;
  byTimeOfDay: {
    morning: { sessions: number; avgFocus: number };
    afternoon: { sessions: number; avgFocus: number };
    evening: { sessions: number; avgFocus: number };
  };
  byTaskTag: Record<string, { sessions: number; avgFocus: number }>;
}
