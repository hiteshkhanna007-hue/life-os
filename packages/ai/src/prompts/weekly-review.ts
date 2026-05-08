export const WEEKLY_REVIEW_PROMPT = `Write a personal weekly review for the user.

CONTEXT:
- Week: {{weekStart}} to {{weekEnd}}
- Tasks completed: {{completedTasks}}
- Tasks created: {{createdTasks}}
- Focus sessions: {{focusSessions}}
- Journal entries: {{journalEntries}}
- Mood scores: {{moodScores}}
- Energy levels: {{energyLevels}}
- Calendar events: {{calendarEvents}}
- Project progress: {{projectProgress}}

OUTPUT FORMAT:
{
  "summary": "2-3 sentence narrative opening",
  "wins": ["3-5 specific accomplishments"],
  "challenges": ["1-3 honest observations"],
  "patterns": ["2-3 data-backed insights"],
  "suggestions": ["2-3 actionable next-week ideas"],
  "celebrationLevel": "subtle|moderate|big"
}`;

export const WEEKLY_REVIEW_CONFIG = {
  model: "google/gemini-2.5-flash-lite",
  reasoning: { effort: "medium" },
  temperature: 0.8,
  maxTokens: 2048
} as const;
