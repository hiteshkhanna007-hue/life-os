export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  status: "active" | "paused" | "completed" | "archived";
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  progress: {
    totalTasks: number;
    completedTasks: number;
    percentComplete: number;
    estimatedHoursTotal: number;
    estimatedHoursRemaining: number;
  };
  lifeArea: "health" | "career" | "relationships" | "creativity" | "finances" | "learning" | "other";
  aiHealthScore: number;
  aiRiskFlags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  triggerType: "time" | "context" | "smart";
  scheduledTime: string | null;
  recurrenceRule: string | null;
  smartTrigger: SmartTrigger | null;
  status: "pending" | "triggered" | "dismissed" | "completed" | "snoozed";
  triggeredAt: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  actionType: "notification" | "open_app" | "start_focus" | "create_task";
  actionPayload: Record<string, unknown>;
  captureId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmartTrigger {
  requiredMoodMin: number | null;
  requiredMoodMax: number | null;
  requiredEnergyMin: number | null;
  requiredFreeTimeMinutes: number | null;
  requiredLocation: string | null;
  requiredTimeOfDay: string | null;
  linkedTaskId: string | null;
}

export interface LifeAreaBalance {
  userId: string;
  weekStartDate: string;
  scores: {
    health: number;
    career: number;
    relationships: number;
    creativity: number;
    finances: number;
    learning: number;
  };
  aiInsight: string | null;
  generatedAt: string;
}
