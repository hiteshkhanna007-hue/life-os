export interface QuickCapture {
  id: string;
  userId: string;
  inputType: "voice" | "text" | "photo" | "share_extension";
  rawInput: string;
  audioUrl: string | null;
  photoUrl: string | null;
  classification: {
    modelUsed: string;
    processedAt: string;
    confidence: number;
    extractedItems: ExtractedItem[];
    needsConfirmation: boolean;
    clarificationPrompt: string | null;
    autoRouted: boolean;
  };
  userConfirmedAt: string | null;
  userModified: boolean;
  createdTaskIds: string[];
  createdJournalEntryIds: string[];
  createdReminderIds: string[];
  createdProjectIds: string[];
  capturedAt: string;
  processedAt: string | null;
  deviceId: string;
  createdAt: string;
}

export interface ExtractedItem {
  id: string;
  itemType: "task" | "journal" | "reminder" | "project_idea";
  title: string;
  description: string | null;
  inferredDate: string | null;
  inferredTime: string | null;
  inferredPriority: "critical" | "high" | "medium" | "low" | null;
  inferredProjectId: string | null;
  inferredTags: string[];
  inferredMoodScore: number | null;
  inferredEnergyLevel: number | null;
  fieldConfidence: {
    title: number;
    date: number;
    time: number;
    priority: number;
    type: number;
  };
  userOverrides: Partial<Record<string, unknown>>;
}
