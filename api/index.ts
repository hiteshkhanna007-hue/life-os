import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000001";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket
    }
  }
);

async function getUserId(req: VercelRequest): Promise<string> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return FALLBACK_USER_ID;
  const token = auth.slice(7);
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id ?? FALLBACK_USER_ID;
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";

// ── helpers ───────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

type Priority = "critical" | "high" | "medium" | "low";
type Energy = "low" | "medium" | "high";

function rowToTask(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? "",
    status: r.status as string,
    priority: r.priority as Priority,
    dueTime: (r.due_time as string) ?? null,
    estimatedPomodoros: (r.estimated_pomodoros as number) ?? 1,
    actualPomodoros: (r.actual_pomodoros as number) ?? 0,
    projectId: (r.project_id as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    energyRequired: (r.energy_required as Energy) ?? "medium",
  };
}

function rowToProject(r: Record<string, unknown>, taskRows: Record<string, unknown>[]) {
  const projectTasks = taskRows.filter((t) => t.project_id === r.id);
  const completed = projectTasks.filter((t) => t.status === "done").length;
  const total = projectTasks.length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const estHoursTotal = projectTasks.reduce((s, t) => s + ((t.estimated_pomodoros as number) ?? 1) * 0.42, 0);
  const estHoursRemaining = projectTasks
    .filter((t) => t.status !== "done")
    .reduce((s, t) => s + ((t.estimated_pomodoros as number) ?? 1) * 0.42, 0);
  const healthScore = total === 0 ? 62 : Math.min(96, Math.max(34, 54 + pct + completed * 4));
  const riskFlags = total === 0 ? ["No tasks yet"] : pct < 35 ? ["Needs one visible next step"] : [];

  return {
    id: r.id,
    name: r.name,
    lifeArea: r.life_area,
    color: r.color,
    intention: r.description ?? "",
    createdAt: r.created_at,
    progress: { totalTasks: total, completedTasks: completed, percentComplete: pct, estimatedHoursTotal: estHoursTotal, estimatedHoursRemaining: estHoursRemaining },
    aiHealthScore: healthScore,
    riskFlags,
  };
}

function rowToJournal(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    content: r.content as string,
    moodScore: (r.mood_score as number) ?? 0,
    energyLevel: (r.energy_level as number) ?? 5,
    createdAt: r.created_at as string,
  };
}

function rowToCalendarBlock(r: Record<string, unknown>) {
  return {
    id: r.id,
    title: r.title,
    startTime: r.start_time,
    endTime: r.end_time,
    blockType: r.block_type,
  };
}

function rowToAgentEvent(r: Record<string, unknown>) {
  const payload = r.payload as Record<string, unknown>;
  return {
    id: r.id,
    agent: r.from_agent,
    text: payload?.text ?? "",
    createdAt: r.timestamp,
  };
}

function rowToFocusSession(r: Record<string, unknown>) {
  return {
    id: r.id,
    taskId: r.task_id ?? null,
    status: r.status,
    startedAt: r.started_at,
    plannedDuration: r.planned_duration,
    completedAt: r.ended_at ?? null,
    interruptionCount: r.interruption_count ?? 0,
  };
}

function commandInsight(tasks: ReturnType<typeof rowToTask>[], journals: ReturnType<typeof rowToJournal>[]) {
  const task = tasks.find((t) => t.status === "in_progress") ?? tasks.find((t) => t.status === "todo") ?? null;
  const latestEnergy = journals[0]?.energyLevel ?? 5;
  const latestMood = journals[0]?.moodScore ?? 0;
  if (!task) return "Your queue is clear. Capture one thing worth protecting before adding more.";
  if (latestEnergy <= 4) return `Keep ${task.title} small. One gentle pass is enough before recovery.`;
  if (latestMood < 0) return `Start with ${task.title}, then log what changed. The system will lighten the next block.`;
  return `${task.title} is the cleanest next move. Focus can update the project when you finish.`;
}

async function pushEvent(agent: string, text: string) {
  await supabase.from("agent_messages").insert({
    from_agent: agent,
    to_agent: "ui",
    message_type: "event",
    payload: { text },
  });
  // keep only 8 most recent
  const { data } = await supabase
    .from("agent_messages")
    .select("id")
    .order("timestamp", { ascending: false })
    .range(8, 1000);
  if (data && data.length > 0) {
    await supabase.from("agent_messages").delete().in("id", data.map((r) => r.id));
  }
}

function rowToReminder(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    title: r.title as string,
    scheduledTime: (r.scheduled_time as string) ?? null,
    status: r.status as string,
  };
}

async function buildSnapshot(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [tasksRes, projectsRes, journalRes, calRes, focusRes, eventsRes, remindersRes] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null).neq("status", "archived").order("created_at"),
    supabase.from("projects").select("*").eq("user_id", userId).eq("status", "active"),
    supabase.from("journal_entries").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(7),
    supabase.from("calendar_blocks").select("*").eq("user_id", userId).order("start_time"),
    supabase.from("focus_sessions").select("*").eq("user_id", userId).eq("status", "active").order("started_at", { ascending: false }).limit(1),
    supabase.from("agent_messages").select("*").order("timestamp", { ascending: false }).limit(8),
    supabase.from("reminders").select("*").eq("user_id", userId).eq("status", "pending").gte("scheduled_time", today).order("scheduled_time").limit(10),
  ]);

  const taskRows = (tasksRes.data ?? []) as Record<string, unknown>[];
  const projectRows = (projectsRes.data ?? []) as Record<string, unknown>[];
  const journalRows = (journalRes.data ?? []) as Record<string, unknown>[];
  const calRows = (calRes.data ?? []) as Record<string, unknown>[];
  const focusRows = (focusRes.data ?? []) as Record<string, unknown>[];
  const eventRows = (eventsRes.data ?? []) as Record<string, unknown>[];
  const reminderRows = (remindersRes.data ?? []) as Record<string, unknown>[];

  const tasks = taskRows.map(rowToTask);
  const projects = projectRows.map((p) => rowToProject(p, taskRows));
  const journals = journalRows.map(rowToJournal);
  const calBlocks = calRows.map(rowToCalendarBlock);
  const activeFocus = focusRows.length > 0 ? rowToFocusSession(focusRows[0]) : null;
  const agentEvents = eventRows.map(rowToAgentEvent);
  const reminders = reminderRows.map(rowToReminder);

  const completed = tasks.filter((t) => t.status === "done").length;
  const pomosCompleted = tasks.reduce((s, t) => s + t.actualPomodoros, 0);
  const moodTrend = journals.map((j) => j.moodScore).reverse();

  return {
    user: { displayName: "Hitesh", timezone: "Australia/Sydney" },
    date: new Date().toISOString().slice(0, 10),
    generatedAt: now(),
    tasks: {
      total: tasks.length,
      completed,
      overdue: tasks.filter((t) => t.priority === "critical" && t.status !== "done").length,
      upcoming: tasks,
      byPriority: tasks.reduce<Record<string, number>>((acc, t) => { acc[t.priority] = (acc[t.priority] ?? 0) + 1; return acc; }, {}),
    },
    calendar: {
      blocks: calBlocks,
      freeTimeMinutes: 190,
      busiestHour: calBlocks.length > 0 ? 10 : null,
    },
    focus: {
      pomodorosCompleted: pomosCompleted,
      pomodorosGoal: 6,
      totalFocusMinutes: pomosCompleted * 25,
      currentSession: activeFocus,
    },
    journal: {
      moodTrend: moodTrend.length ? moodTrend : [0],
      todayMood: journals[0]?.moodScore ?? 0,
      energyLevel: journals[0]?.energyLevel ?? 5,
      entryCount: journals.length,
      streakDays: Math.min(12, journals.length + 4),
      latestEntry: journals[0]?.content ?? "",
    },
    projects,
    reminders,
    commandCenter: {
      insight: commandInsight(tasks, journals),
      nextAction: (tasks.find((t) => t.status === "in_progress") ?? tasks.find((t) => t.status === "todo"))?.id ?? null,
      agentEvents,
    },
    ai: {
      enabled: Boolean(OPENROUTER_KEY),
      provider: OPENROUTER_KEY ? "OpenRouter" : "Local rules",
      model: OPENROUTER_KEY ? OPENROUTER_MODEL : "heuristic-router",
    },
  };
}

function inferPriority(text: string): Priority {
  const l = text.toLowerCase();
  if (l.includes("urgent") || l.includes("asap") || l.includes("critical")) return "critical";
  if (l.includes("important") || l.includes("today")) return "high";
  return "medium";
}

function inferMood(text: string) {
  const l = text.toLowerCase();
  if (l.includes("overwhelmed") || l.includes("bad") || l.includes("stressed")) return -2;
  if (l.includes("great") || l.includes("good") || l.includes("calm")) return 2;
  return 0;
}

function sentenceCase(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed;
}

function cleanSpeech(text: string) {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b(um|uh|like|you know|sort of|kind of|basically|actually|maybe)\b/gi, " ")
    .replace(/\b(alright|okay|ok)\s+(?:let'?s\s+check\s+)?/gi, " ")
    .replace(/\bcan\s+we\s+maybe\b/gi, " ")
    .replace(/\blet'?s\s+check\b/gi, " ")
    .replace(/\bo\s+clock\b|\bo'?clock\b/gi, " ")
    .replace(/\bclean\s+th\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDueTime(text: string): { dueTime: string | null; needsClarification: boolean; question: string | null } {
  const lower = text.toLowerCase();
  const explicit = lower.match(/\b(?:at|by|around|before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  const bare = lower.match(/\b(?:at|by|around|before)\s+(\d{1,2})(?::(\d{2}))?\b/i);

  const match = explicit ?? bare;
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? "0");
    const suffix = match[3]?.toLowerCase();

    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    if (!suffix) {
      if (hour >= 1 && hour <= 6) hour += 12;
      else if (hour >= 7 && hour <= 11) {
        return { dueTime: null, needsClarification: true, question: `Did you mean ${hour}:00 AM or ${hour}:00 PM?` };
      }
    }

    return {
      dueTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      needsClarification: false,
      question: null
    };
  }

  if (lower.includes("tonight")) return { dueTime: "20:00", needsClarification: false, question: null };
  if (lower.includes("this morning")) return { dueTime: "09:00", needsClarification: false, question: null };
  if (lower.includes("noon") || lower.includes("lunch")) return { dueTime: "12:30", needsClarification: false, question: null };
  if (lower.includes("afternoon")) return { dueTime: "14:00", needsClarification: false, question: null };
  if (lower.includes("evening")) return { dueTime: "18:30", needsClarification: false, question: null };

  return { dueTime: null, needsClarification: false, question: null };
}

function cleanTitle(text: string, itemType: CaptureItem["itemType"] = "task") {
  const originalLower = cleanSpeech(text).toLowerCase();
  let title = cleanSpeech(text)
    .replace(/\b(today|tomorrow|tonight|this morning|this afternoon|this evening)\b/gi, " ")
    .replace(/\b(?:at|by|around|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, " ")
    .replace(/^(please\s+)?(can you\s+)?/i, "")
    .replace(/^(i|we)\s+(need|should|have|want|gotta|must|plan)\s+(to\s+)?/i, "")
    .replace(/^(need|should|have|want|gotta|must|plan)\s+(to\s+)?/i, "")
    .replace(/^remind me\s+(to\s+)?/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/^to\s+/i, "")
    .replace(/^do\s+the\s+/i, "do ")
    .replace(/[.?!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) title = text.trim();

  const lower = title.toLowerCase();
  if (itemType === "task") {
    if (originalLower.includes("laundry")) title = "Do laundry";
    else if (originalLower.includes("meditation") || originalLower.includes("meditate")) title = "Meditate";
    else if (originalLower.includes("call bhaiya")) title = "Call bhaiya";
    else if (originalLower.includes("chase") && originalLower.includes("project")) {
      const topic = originalLower.match(/\b(?:regarding|about|for)\s+(.+)$/i)?.[1]
        ?.replace(/\bproject\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      title = topic ? `Follow up on ${topic} project` : "Follow up on project";
    } else if (lower === "laundry" || lower === "the laundry") title = "Do laundry";
    else if (lower.startsWith("laundry ")) title = `Do ${title}`;
    else if (lower === "dishes" || lower === "the dishes") title = "Do dishes";
    else if (lower === "groceries") title = "Buy groceries";
  } else if (itemType === "journal") {
    if (originalLower.includes("positive")) title = "Feeling positive";
    title = title.replace(/^(i am|i'm|im|i feel)\s+/i, "Feeling ");
    title = title.replace(/^Feeling\s+feeling\s+/i, "Feeling ");
    if (!/^feeling\b/i.test(title)) title = `Feeling ${title}`;
  }

  return sentenceCase(title).slice(0, 72);
}

function isJunkTitle(text: string) {
  const normalized = cleanSpeech(text)
    .replace(/[.?!]+$/g, "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 3) return true;
  return [
    "i",
    "i should",
    "i need",
    "i need to",
    "i want",
    "i want to",
    "i have to",
    "should",
    "need to",
    "want to",
    "lets see",
    "let's see",
    "this goes"
  ].includes(normalized);
}

function hasRawDictationSmell(text: string) {
  const lower = text.toLowerCase();
  return /\b(alright|can we maybe|let'?s check|o'?clock|i should$|clean th)\b/i.test(lower)
    || lower.split(/\s+/).length > 12;
}

function normalizeCaptureItem(item: CaptureItem): CaptureItem | null {
  const source = cleanSpeech(item.title ?? "");
  const context = `${source} ${item.description ?? ""}`.trim();
  if (isJunkTitle(source)) return null;

  let itemType = item.itemType;
  if (/\b(feel|feeling|mood|stressed|overwhelmed|burned out|positive|grateful|sad|anxious)\b/i.test(context)
    && !/\b(call|email|buy|clean|do|send|book|schedule|chase|follow up)\b/i.test(source)) {
    itemType = "journal";
  } else if (/\b(start|create|build|launch|make|begin)\b/i.test(context) && /\b(project|goal|habit|routine)\b/i.test(context)) {
    itemType = "project";
  } else if (/\bremind me\b/i.test(context)) {
    itemType = "reminder";
  } else if (itemType === "journal" && /\b(laundry|call|chase|meditat|groceries|dishes)\b/i.test(source)) {
    itemType = "task";
  }

  const time = extractDueTime(context);
  const cleanedTitle = cleanTitle(source, itemType);
  if (isJunkTitle(cleanedTitle)) return null;

  return {
    ...item,
    itemType,
    title: cleanedTitle,
    description: item.description ? cleanSpeech(item.description) : null,
    dueTime: item.dueTime ?? time.dueTime,
    needsClarification: item.needsClarification || time.needsClarification,
    clarificationQuestion: item.clarificationQuestion ?? time.question
  };
}

function dedupeCaptureItems(items: CaptureItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.itemType}:${cleanTitle(item.title, item.itemType).toLowerCase()}:${item.dueTime ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function captureQuality(items: CaptureItem[]) {
  return items.reduce((score, item) => {
    const title = item.title ?? "";
    let itemScore = 4;
    if (isJunkTitle(title)) itemScore -= 8;
    if (hasRawDictationSmell(title)) itemScore -= 4;
    if (title.length > 72) itemScore -= 3;
    if (item.itemType === "journal") itemScore += 1;
    if (item.dueTime) itemScore += 1;
    return score + itemScore;
  }, 0);
}

type CaptureItem = {
  itemType: "task" | "journal" | "project" | "reminder";
  title: string;
  description?: string | null;
  priority?: Priority;
  dueTime?: string | null;  // "HH:MM"
  moodScore?: number | null;
  energyLevel?: number | null;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
};

const CLASSIFY_SYSTEM = `You are Life OS's capture processor. The input is raw speech-to-text dictation — messy, run-on, with filler words. Your job is to understand intent, not copy words.

STEP 1 — CLEAN: Remove filler phrases ("I need to", "I should", "about now", "you know", "so"), fix run-on words, and identify distinct intents.

STEP 2 — ORGANIZE: For each distinct intent, produce one JSON object that creates the correct Life OS item.

RETURN ONLY a raw JSON array — no markdown, no explanation, nothing else.

Each object must have exactly these fields:
  itemType: "task" | "journal" | "project" | "reminder"
  title: string  (clean, concise app title — 2-6 words — NEVER raw dictation verbatim)
  description: string | null  (optional extra detail, also cleaned up)
  priority: "critical" | "high" | "medium" | "low" | null  (tasks only; null for all others)
  dueTime: "HH:MM" | null  (24h format; extract from speech; null if no time mentioned)
  moodScore: number | null  (-5 to +5; journal only; null for all others)
  energyLevel: number | null  (1 to 10; journal only; null for all others)
  needsClarification: boolean
  clarificationQuestion: string | null

SPLITTING:
• Each distinct action, feeling, or intention = one separate item
• Split on: topic changes, "and", "also", "I should", "I need to", "I want to", time shifts
• NEVER merge two different actions into one item

CLASSIFYING:
• Action / to-do → task
• Feeling / reflection / mood / stress / how I feel → journal
• "start/build/create a project/goal/habit/routine" → project
• "remind me at [time]" → reminder
• "I need to do X at 4" is a task, not a reminder, unless the user says "remind me"

TIME EXTRACTION:
• "at 8pm" → "20:00"   "at 3pm" → "15:00"   "at 10am" → "10:00"
• "at 4" with no am/pm usually means "16:00" unless context clearly says morning
• "tonight" → "20:00"  "this morning" → "09:00"  "noon/lunch" → "12:30"
• "afternoon" → "14:00"  "evening" → "18:30"  "now/soon" → null

CLARIFICATION:
• If a person/place/project reference is ambiguous ("Sarah", "doctor", "office") and there is not enough context, set needsClarification true and ask one short question.
• If the time is genuinely ambiguous ("at 8" with no context), ask "Morning or evening?"
• Do not ask follow-up for simple household tasks like laundry, dishes, cleaning, groceries.

PRIORITY (tasks only):
• urgent / asap / critical → "critical"
• important / today / need to → "high"
• should / plan to → "medium"
• someday / eventually / maybe → "low"
• default → "medium"

TITLE RULES — titles must be clean and short:
• BAD: "I need to laundry at 4"
• GOOD: {"itemType":"task","title":"Do laundry","dueTime":"16:00"}
• BAD: "Alright let's check can we maybe do laundry o'clock clean th"
• GOOD: {"itemType":"task","title":"Do laundry","dueTime":null}
• BAD: "I should"
• GOOD: omit this item completely
• BAD: "Positive let's see how this goes"
• GOOD: {"itemType":"journal","title":"Feeling positive","description":"Feeling positive"}
• BAD: "This works quite goodSo I should do meditation at 8 pm today I should"
• GOOD: {"itemType":"task","title":"Meditate","dueTime":"20:00"}
• BAD: "do someLamp lighting about nowAndI should check on the kids before I sle"
• GOOD: {"itemType":"task","title":"Adjust lamp lighting"} + {"itemType":"task","title":"Check on kids"}

EXAMPLE INPUT:  "grab groceries and call dentist at 2pm I'm feeling really burned out also I want to start learning piano"
EXAMPLE OUTPUT: [{"itemType":"task","title":"Grab groceries","description":null,"priority":"medium","dueTime":null,"moodScore":null,"energyLevel":null,"needsClarification":false,"clarificationQuestion":null},{"itemType":"task","title":"Call dentist","description":null,"priority":"high","dueTime":"14:00","moodScore":null,"energyLevel":null,"needsClarification":false,"clarificationQuestion":null},{"itemType":"journal","title":"Feeling burned out","description":"Feeling burned out","priority":null,"dueTime":null,"moodScore":-3,"energyLevel":3,"needsClarification":false,"clarificationQuestion":null},{"itemType":"project","title":"Learn piano","description":"Start learning piano","priority":null,"dueTime":null,"moodScore":null,"energyLevel":null,"needsClarification":false,"clarificationQuestion":null}]`;

async function classifyWithOpenRouter(rawInput: string): Promise<CaptureItem[] | null> {
  if (!OPENROUTER_KEY) return null;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL ?? "https://life-os.vercel.app",
      "X-Title": "Life OS",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      max_tokens: 1000,
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM },
        { role: "user", content: rawInput },
      ],
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  const jsonText = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(jsonText) as unknown;
  const items = Array.isArray(parsed) ? parsed as CaptureItem[] : [parsed as CaptureItem];
  return items.filter(i => ["task", "journal", "project", "reminder"].includes(i.itemType));
}

// ── route handlers ────────────────────────────────────────────────────────────

async function handleGetToday(userId: string, res: VercelResponse) {
  const snap = await buildSnapshot(userId);
  res.json(snap);
}

async function handleGetTasks(userId: string, res: VercelResponse) {
  const { data } = await supabase.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at");
  res.json((data ?? []).map(rowToTask));
}

async function handleGetProjects(userId: string, res: VercelResponse) {
  const snap = await buildSnapshot(userId);
  res.json(snap.projects);
}

async function handleGetJournalEntries(userId: string, res: VercelResponse) {
  const { data } = await supabase.from("journal_entries").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  res.json((data ?? []).map(rowToJournal));
}

async function handlePostTask(userId: string, req: VercelRequest, res: VercelResponse) {
  const body = req.body as { title: string; projectId?: string | null; dueTime?: string | null };
  const title = body.title?.trim();
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const { data, error } = await supabase.from("tasks").insert({
    user_id: userId,
    title,
    description: "Created from planner.",
    status: "todo",
    priority: inferPriority(title),
    due_time: body.dueTime ?? null,
    estimated_pomodoros: 1,
    actual_pomodoros: 0,
    project_id: body.projectId ?? null,
    tags: ["manual"],
    energy_required: "medium",
  }).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  await pushEvent("planner", `Added task: ${title}`);
  res.json(rowToTask(data as Record<string, unknown>));
}

async function handleCompleteTask(userId: string, taskId: string, res: VercelResponse) {
  const { data: task, error } = await supabase
    .from("tasks").select("*").eq("id", taskId).eq("user_id", userId).single();
  if (error || !task) { res.status(404).json({ error: "Task not found" }); return; }
  const t = task as Record<string, unknown>;
  const actualPomos = Math.max((t.actual_pomodoros as number) ?? 0, (t.estimated_pomodoros as number) ?? 1);
  const { data: updated } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: now(), actual_pomodoros: actualPomos })
    .eq("id", taskId)
    .select().single();
  await pushEvent("planner", `Completed task: ${t.title}`);
  res.json(rowToTask(updated as Record<string, unknown>));
}

async function handleStartFocus(userId: string, req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { plannedDuration?: number };
  const plannedDuration = Math.min(120, Math.max(5, Math.round(body.plannedDuration ?? 25)));
  await supabase
    .from("focus_sessions")
    .update({ status: "abandoned", ended_at: now() })
    .eq("user_id", userId)
    .eq("status", "active");
  const { data: tasks } = await supabase
    .from("tasks").select("*").eq("user_id", userId).in("status", ["todo", "in_progress"])
    .order("created_at").limit(1);
  const nextTask = tasks?.[0] as Record<string, unknown> | undefined;
  if (nextTask) {
    await supabase.from("tasks").update({ status: "in_progress" }).eq("id", nextTask.id);
  }
  const { data: session } = await supabase.from("focus_sessions").insert({
    user_id: userId,
    started_at: now(),
    planned_duration: plannedDuration,
    status: "active",
    task_id: nextTask?.id ?? null,
    interruption_count: 0,
  }).select().single();
  await pushEvent("focus", nextTask ? `Started ${plannedDuration}m focus on ${nextTask.title}` : `Started ${plannedDuration}m open focus session`);
  res.json(rowToFocusSession(session as Record<string, unknown>));
}

async function handleCompleteFocus(userId: string, sessionId: string, res: VercelResponse) {
  const { data: session } = await supabase.from("focus_sessions").select("*").eq("id", sessionId).eq("user_id", userId).single();
  if (session) {
    const s = session as Record<string, unknown>;
    await supabase.from("focus_sessions").update({ status: "completed", ended_at: now() }).eq("id", sessionId);
    if (s.task_id) {
      const { data: task } = await supabase.from("tasks").select("*").eq("id", s.task_id).single();
      if (task) {
        const t = task as Record<string, unknown>;
        const newActual = ((t.actual_pomodoros as number) ?? 0) + 1;
        const newStatus = newActual >= ((t.estimated_pomodoros as number) ?? 1) ? "done" : t.status;
        const updates: Record<string, unknown> = { actual_pomodoros: newActual, status: newStatus };
        if (newStatus === "done") updates.completed_at = now();
        await supabase.from("tasks").update(updates).eq("id", s.task_id);
        await pushEvent("focus", `Finished a focus block for ${t.title}`);
      }
    } else {
      await pushEvent("focus", "Finished an open focus block");
    }
  }
  const snap = await buildSnapshot(userId);
  res.json(snap);
}

async function handlePostJournal(userId: string, req: VercelRequest, res: VercelResponse) {
  const body = req.body as { content: string; moodScore: number; energyLevel: number };
  const { data } = await supabase.from("journal_entries").insert({
    user_id: userId,
    entry_type: "freeform",
    content: body.content.trim(),
    mood_score: body.moodScore,
    energy_level: body.energyLevel,
  }).select().single();
  await pushEvent("journal", `Logged mood ${body.moodScore > 0 ? "+" : ""}${body.moodScore} with energy ${body.energyLevel}/10`);
  res.json(rowToJournal(data as Record<string, unknown>));
}

async function handlePostProject(userId: string, req: VercelRequest, res: VercelResponse) {
  const body = req.body as { name: string; lifeArea: string; intention?: string };
  const colors = ["#7f8f7a", "#b08b63", "#a37c74", "#6f8795"];
  const { data: existing } = await supabase.from("projects").select("id").eq("user_id", userId);
  const color = colors[(existing?.length ?? 0) % 4];
  const { data } = await supabase.from("projects").insert({
    user_id: userId,
    name: body.name.trim(),
    life_area: body.lifeArea,
    color,
    description: body.intention?.trim() || "Keep this area visible and easy to act on.",
    status: "active",
  }).select().single();
  const { data: taskRows } = await supabase.from("tasks").select("*").eq("user_id", userId);
  await pushEvent("life", `Created project: ${body.name}`);
  res.json(rowToProject(data as Record<string, unknown>, (taskRows ?? []) as Record<string, unknown>[]));
}

async function routeItem(userId: string, item: CaptureItem, rawInput: string): Promise<{ routedTo: string; dueTime: string | null; title: string }> {
  const lower = rawInput.toLowerCase();
  const dueTime = item.dueTime ?? null;
  const title = cleanTitle(item.title, item.itemType);

  if (item.itemType === "journal") {
    await supabase.from("journal_entries").insert({ user_id: userId, entry_type: "freeform", content: title, mood_score: item.moodScore ?? inferMood(rawInput), energy_level: item.energyLevel ?? 6 });
    await pushEvent("capture", `Journal: ${title}`);
    return { routedTo: "journal", dueTime: null, title };
  }
  if (item.itemType === "project") {
    const { data: existing } = await supabase.from("projects").select("id").eq("user_id", userId);
    const color = ["#7f8f7a", "#b08b63", "#a37c74", "#6f8795"][(existing?.length ?? 0) % 4];
    await supabase.from("projects").insert({ user_id: userId, name: title.slice(0, 42) || "New Project", life_area: "other", color, description: item.description?.trim() || title, status: "active" });
    await pushEvent("capture", `Project: ${title}`);
    return { routedTo: "project", dueTime: null, title };
  }
  if (item.itemType === "reminder") {
    const today = new Date().toISOString().slice(0, 10);
    const scheduledTime = dueTime ? `${today}T${dueTime}:00` : null;
    if (scheduledTime) {
      await supabase.from("reminders").insert({ user_id: userId, title: title.slice(0, 72), trigger_type: "time", scheduled_time: scheduledTime, action_type: "notification", action_payload: {}, status: "pending" });
      await pushEvent("capture", `Reminder: ${title}`);
    }
    return { routedTo: "reminder", dueTime, title };
  }
  // task (default)
  const { data: proj } = await supabase.from("projects").select("id").eq("user_id", userId).limit(1);
  await supabase.from("tasks").insert({ user_id: userId, title: title.slice(0, 72) || cleanTitle(rawInput, "task"), description: item.description?.trim() || "Created through capture.", status: "todo", priority: item.priority ?? inferPriority(rawInput), due_time: dueTime, estimated_pomodoros: lower.includes("deep") ? 2 : 1, actual_pomodoros: 0, project_id: proj?.[0]?.id ?? null, tags: ["capture", "ai"], energy_required: lower.includes("deep") ? "high" : "medium" });
  await pushEvent("capture", `Task: ${title}`);
  return { routedTo: "task", dueTime, title };
}

function heuristicItems(rawInput: string): CaptureItem[] {
  const lower = rawInput.toLowerCase();
  const items: CaptureItem[] = [];
  const organized = cleanSpeech(rawInput)
    .replace(/\s+\b(i am feeling|i'm feeling|im feeling|i feel)\b/gi, "; $1")
    .replace(/\s+\b(i want to start|i want to create|start a project|start project|create a project|build a project)\b/gi, "; $1")
    .replace(/\s+\b(i should|i need to|i have to|i want to)\b/gi, "; $1")
    .replace(/\s+\b(call|chase)\b/gi, "; $1")
    .replace(/\s+\bpositive\b/gi, "; positive");
  const sentences = organized
    .split(/[,;]|\band\b|\balso\b|\bthen\b|\bplus\b/i)
    .map(s => s.trim())
    .filter(Boolean);
  for (const s of sentences) {
    const l = s.toLowerCase();
    const time = extractDueTime(s);
    const baseTitle = cleanTitle(s, "task");

    if (isJunkTitle(s) || isJunkTitle(baseTitle)) continue;

    if (time.needsClarification) {
      items.push({
        itemType: "task",
        title: baseTitle,
        priority: inferPriority(s),
        dueTime: null,
        needsClarification: true,
        clarificationQuestion: time.question
      });
      continue;
    }

    if (l.includes("feel") || l.includes("mood") || l.includes("stressed") || l.includes("overwhelmed") || l.includes("tired") || l.includes("journal") || l.includes("positive")) {
      items.push({
        itemType: "journal",
        title: cleanTitle(s, "journal"),
        description: cleanSpeech(s),
        moodScore: inferMood(s),
        energyLevel: l.includes("tired") ? 3 : 6
      });
    } else if (/\b(project|goal|habit|routine)\b/i.test(s) && /\b(start|create|build|launch|make|begin)\b/i.test(s)) {
      const projectName = s.match(/\b(?:project|goal|habit|routine)\s+(?:to|for|about)\s+(.+)$/i)?.[1] ?? s;
      items.push({
        itemType: "project",
        title: cleanTitle(projectName.replace(/\b(start|create|build|launch|make|begin|project|goal|habit|routine)\b/gi, " "), "project"),
        description: cleanSpeech(s)
      });
    } else if (l.includes("remind") && (time.dueTime || /\d/.test(s))) {
      items.push({ itemType: "reminder", title: cleanTitle(s, "reminder"), dueTime: time.dueTime });
    } else {
      items.push({ itemType: "task", title: baseTitle, priority: inferPriority(s), dueTime: time.dueTime });
    }
  }
  if (items.length) return items;
  const time = extractDueTime(rawInput);
  const title = cleanTitle(rawInput, "task");
  if (isJunkTitle(title)) return [];
  return [{
    itemType: "task",
    title,
    priority: inferPriority(rawInput),
    dueTime: time.dueTime ?? (lower.includes("tonight") ? "20:00" : null),
    needsClarification: time.needsClarification,
    clarificationQuestion: time.question
  }];
}

function organizeCaptureItems(rawInput: string, aiItems: CaptureItem[] | null) {
  const heuristic = dedupeCaptureItems(heuristicItems(rawInput).map(normalizeCaptureItem).filter(Boolean) as CaptureItem[]);
  const ai = dedupeCaptureItems((aiItems ?? []).map(normalizeCaptureItem).filter(Boolean) as CaptureItem[]);

  if (!ai.length) return heuristic;
  if (!heuristic.length) return ai;

  const aiHasRawSmell = ai.some(item => hasRawDictationSmell(item.title));
  if (aiHasRawSmell || captureQuality(heuristic) > captureQuality(ai)) return heuristic;
  return ai;
}

async function handleCapture(userId: string, req: VercelRequest, res: VercelResponse) {
  const body = req.body as { rawInput: string };
  const rawInput = body.rawInput?.trim();
  if (!rawInput) { res.status(400).json({ error: "rawInput required" }); return; }

  let aiItems: CaptureItem[] | null = null;
  try { aiItems = await classifyWithOpenRouter(rawInput); } catch { /* fallback */ }

  const items = organizeCaptureItems(rawInput, aiItems);
  if (!items.length) {
    res.json({
      needsClarification: true,
      clarificationQuestion: "What would you like me to add from that?",
      items: [],
      snapshot: await buildSnapshot(userId)
    });
    return;
  }
  const clarification = items.find(item => item.needsClarification);
  if (clarification) {
    res.json({
      needsClarification: true,
      clarificationQuestion: clarification.clarificationQuestion ?? `Can you clarify "${cleanTitle(clarification.title, clarification.itemType)}"?`,
      items: [],
      snapshot: await buildSnapshot(userId)
    });
    return;
  }
  const results = await Promise.all(items.map(item => routeItem(userId, item, rawInput)));

  res.json({ items: results, snapshot: await buildSnapshot(userId) });
}

async function handleDeleteTask(userId: string, taskId: string, res: VercelResponse) {
  await supabase.from("tasks").update({ deleted_at: now() }).eq("id", taskId).eq("user_id", userId);
  res.json({ ok: true });
}

async function handlePostReminder(userId: string, req: VercelRequest, res: VercelResponse) {
  const body = req.body as { title: string; scheduledTime: string };
  const title = body.title?.trim();
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const { data, error } = await supabase.from("reminders").insert({
    user_id: userId,
    title,
    trigger_type: "time",
    scheduled_time: body.scheduledTime,
    action_type: "notification",
    action_payload: {},
    status: "pending",
  }).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  await pushEvent("command", `Reminder set: ${title}`);
  res.json(rowToReminder(data as Record<string, unknown>));
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const path = (req.url ?? "/").split("?")[0];
  const method = req.method ?? "GET";

  try {
    if (method === "GET" && path === "/health") return res.json({ ok: true });

    const userId = await getUserId(req);

    if (method === "GET" && path === "/v1/today") return handleGetToday(userId, res);
    if (method === "GET" && path === "/v1/tasks") return handleGetTasks(userId, res);
    if (method === "GET" && path === "/v1/projects") return handleGetProjects(userId, res);
    if (method === "GET" && path === "/v1/journal/entries") return handleGetJournalEntries(userId, res);
    if (method === "POST" && path === "/v1/tasks") return handlePostTask(userId, req, res);
    if (method === "POST" && path === "/v1/journal/entries") return handlePostJournal(userId, req, res);
    if (method === "POST" && path === "/v1/projects") return handlePostProject(userId, req, res);
    if (method === "POST" && path === "/v1/reminders") return handlePostReminder(userId, req, res);
    if (method === "POST" && path === "/v1/focus/sessions") return handleStartFocus(userId, req, res);
    if (method === "POST" && path === "/v1/capture") return handleCapture(userId, req, res);

    // /v1/tasks/:id and /v1/tasks/:id/complete
    const taskIdMatch = path.match(/^\/v1\/tasks\/([^/]+)$/);
    if (method === "DELETE" && taskIdMatch) return handleDeleteTask(userId, taskIdMatch[1], res);
    const taskCompleteMatch = path.match(/^\/v1\/tasks\/([^/]+)\/complete$/);
    if (method === "POST" && taskCompleteMatch) return handleCompleteTask(userId, taskCompleteMatch[1], res);

    // /v1/focus/sessions/:id/complete
    const focusCompleteMatch = path.match(/^\/v1\/focus\/sessions\/([^/]+)\/complete$/);
    if (method === "POST" && focusCompleteMatch) return handleCompleteFocus(userId, focusCompleteMatch[1], res);

    res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}
