export const DAILY_INSIGHT_PROMPT = `Generate a single, actionable insight for the user's day.

CONTEXT:
- Today's tasks: {{tasks}}
- Calendar: {{calendar}}
- Yesterday's journal: {{yesterdayJournal}}
- This week's mood trend: {{moodTrend}}
- Focus patterns: {{focusPatterns}}
- Active projects: {{projects}}

RULES:
1. Be specific, not generic. Reference actual tasks/events.
2. Offer ONE clear suggested action, not a list.
3. Match tone to user's recent mood.
4. Keep under 25 words.
5. Include confidence score.

OUTPUT:
{
  "insight": "string",
  "suggestedAction": "string",
  "actionType": "schedule_task|reschedule_task|start_focus|log_mood|take_break|none",
  "targetId": "string|null",
  "confidence": "0.0-1.0"
}`;

export const DAILY_INSIGHT_CONFIG = {
  model: "google/gemini-2.5-flash-lite",
  temperature: 0.7,
  maxTokens: 512
} as const;
