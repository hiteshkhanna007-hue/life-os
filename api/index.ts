import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000001";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
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

type CaptureItem = {
  itemType: "task" | "journal" | "project" | "reminder";
  title: string;
  description?: string | null;
  priority?: Priority;
  dueTime?: string | null;  // "HH:MM"
  moodScore?: number | null;
  energyLevel?: number | null;
};

const CLASSIFY_SYSTEM = `You are Life OS's voice capture processor. The input is raw speech-to-text dictation — messy, run-on, with filler words. Do two things in order:

STEP 1 — TRANSCRIBE: Clean the raw speech into clear, natural language. Remove filler words ("I should", "about now", "you know", "so"), fix run-on words (e.g. "goodSo" → separate thoughts), correct obvious speech-to-text errors. Identify each distinct intent.

STEP 2 — CLASSIFY: For each distinct intent, produce one JSON object.

RETURN ONLY a raw JSON array — no markdown, no explanation, nothing else.

Each object must have exactly these fields:
  itemType: "task" | "journal" | "project" | "reminder"
  title: string  (clean, concise imperative — 2-6 words — NO raw dictation verbatim)
  description: string | null  (optional extra detail, also cleaned up)
  priority: "critical" | "high" | "medium" | "low" | null  (tasks only; null for all others)
  dueTime: "HH:MM" | null  (24h format; extract from speech; null if no time mentioned)
  moodScore: number | null  (-5 to +5; journal only; null for all others)
  energyLevel: number | null  (1 to 10; journal only; null for all others)

SPLITTING:
• Each distinct action, feeling, or intention = one separate item
• Split on: topic changes, "and", "also", "I should", "I need to", "I want to", time shifts
• NEVER merge two different actions into one item

CLASSIFYING:
• Action / to-do → task
• Feeling / reflection / mood / stress / how I feel → journal
• "start a ...", "build/launch/create ..." → project
• "remind me at [time]" → reminder

TIME EXTRACTION:
• "at 8pm" → "20:00"   "at 3pm" → "15:00"   "at 10am" → "10:00"
• "tonight" → "20:00"  "this morning" → "09:00"  "noon/lunch" → "12:30"
• "afternoon" → "14:00"  "evening" → "18:30"  "now/soon" → null

PRIORITY (tasks only):
• urgent / asap / critical → "critical"
• important / today / need to → "high"
• should / plan to → "medium"
• someday / eventually / maybe → "low"
• default → "medium"

TITLE RULES — titles must be clean and short:
• BAD: "This works quite goodSo I should do meditation at 8 pm today I should"
• GOOD: "Meditate at 8pm"
• BAD: "do someLamp lighting about nowAndI should check on the kids before I sle"
• GOOD: "Adjust lamp lighting" + "Check on kids before sleep"

EXAMPLE INPUT:  "grab groceries and call dentist at 2pm I'm feeling really burned out also I want to start learning piano"
EXAMPLE OUTPUT: [{"itemType":"task","title":"Grab groceries","description":null,"priority":"medium","dueTime":null,"moodScore":null,"energyLevel":null},{"itemType":"task","title":"Call dentist","description":null,"priority":"high","dueTime":"14:00","moodScore":null,"energyLevel":null},{"itemType":"journal","title":"Feeling burned out","description":"Feeling really burned out","priority":null,"dueTime":null,"moodScore":-3,"energyLevel":3},{"itemType":"project","title":"Learn piano","description":"Start learning piano","priority":null,"dueTime":null,"moodScore":null,"energyLevel":null}]`;

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
  const { data: session } = await supabase.from("focus_sessions").select("*").eq("id", sessionId).single();
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

async function routeItem(userId: string, item: CaptureItem, rawInput: string): Promise<{ routedTo: string; dueTime: string | null }> {
  const lower = rawInput.toLowerCase();
  const dueTime = item.dueTime ?? null;

  if (item.itemType === "journal") {
    await supabase.from("journal_entries").insert({ user_id: userId, entry_type: "freeform", content: item.description?.trim() || item.title, mood_score: item.moodScore ?? inferMood(rawInput), energy_level: item.energyLevel ?? 6 });
    await pushEvent("capture", `Journal: ${item.title}`);
    return { routedTo: "journal", dueTime: null };
  }
  if (item.itemType === "project") {
    const { data: existing } = await supabase.from("projects").select("id").eq("user_id", userId);
    const color = ["#7f8f7a", "#b08b63", "#a37c74", "#6f8795"][(existing?.length ?? 0) % 4];
    await supabase.from("projects").insert({ user_id: userId, name: item.title.trim().slice(0, 42) || "New Project", life_area: "other", color, description: item.description?.trim() || item.title, status: "active" });
    await pushEvent("capture", `Project: ${item.title}`);
    return { routedTo: "project", dueTime: null };
  }
  if (item.itemType === "reminder") {
    const today = new Date().toISOString().slice(0, 10);
    const scheduledTime = dueTime ? `${today}T${dueTime}:00` : null;
    if (scheduledTime) {
      await supabase.from("reminders").insert({ user_id: userId, title: item.title.trim().slice(0, 72), trigger_type: "time", scheduled_time: scheduledTime, action_type: "notification", action_payload: {}, status: "pending" });
      await pushEvent("capture", `Reminder: ${item.title}`);
    }
    return { routedTo: "reminder", dueTime };
  }
  // task (default)
  const { data: proj } = await supabase.from("projects").select("id").eq("user_id", userId).limit(1);
  await supabase.from("tasks").insert({ user_id: userId, title: item.title.trim().slice(0, 72) || rawInput.slice(0, 72), description: item.description?.trim() || "Created through capture.", status: "todo", priority: item.priority ?? inferPriority(rawInput), due_time: dueTime, estimated_pomodoros: lower.includes("deep") ? 2 : 1, actual_pomodoros: 0, project_id: proj?.[0]?.id ?? null, tags: ["capture", "ai"], energy_required: lower.includes("deep") ? "high" : "medium" });
  await pushEvent("capture", `Task: ${item.title}`);
  return { routedTo: "task", dueTime };
}

function heuristicItems(rawInput: string): CaptureItem[] {
  const lower = rawInput.toLowerCase();
  const items: CaptureItem[] = [];
  const sentences = rawInput.split(/[,;]|\band\b|\balso\b/i).map(s => s.trim()).filter(Boolean);
  for (const s of sentences) {
    const l = s.toLowerCase();
    if (l.includes("feel") || l.includes("mood") || l.includes("stressed") || l.includes("overwhelmed") || l.includes("tired") || l.includes("journal")) {
      items.push({ itemType: "journal", title: s.slice(0, 72), moodScore: inferMood(s), energyLevel: l.includes("tired") ? 3 : 6 });
    } else if (l.includes("project") || l.includes("goal") || l.includes("start") || l.includes("launch") || l.includes("build")) {
      items.push({ itemType: "project", title: s.replace(/project|goal|start|launch|build/gi, "").trim().slice(0, 42) || s.slice(0, 42) });
    } else if (l.includes("remind") && /\d/.test(s)) {
      const timeMatch = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      let dueTime: string | null = null;
      if (timeMatch) {
        let h = parseInt(timeMatch[1]);
        const m = parseInt(timeMatch[2] ?? "0");
        if (timeMatch[3]?.toLowerCase() === "pm" && h < 12) h += 12;
        if (timeMatch[3]?.toLowerCase() === "am" && h === 12) h = 0;
        dueTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }
      items.push({ itemType: "reminder", title: s.slice(0, 72), dueTime });
    } else {
      const timeMatch = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      let dueTime: string | null = null;
      if (timeMatch) {
        let h = parseInt(timeMatch[1]);
        const m = parseInt(timeMatch[2] ?? "0");
        if (timeMatch[3]?.toLowerCase() === "pm" && h < 12) h += 12;
        if (timeMatch[3]?.toLowerCase() === "am" && h === 12) h = 0;
        dueTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      } else if (l.includes("tonight")) {
        dueTime = "20:00";
      }
      items.push({ itemType: "task", title: s.slice(0, 72), priority: inferPriority(s), dueTime });
    }
  }
  return items.length ? items : [{ itemType: "task", title: rawInput.slice(0, 72), priority: inferPriority(rawInput), dueTime: lower.includes("tonight") ? "20:00" : null }];
}

async function handleCapture(userId: string, req: VercelRequest, res: VercelResponse) {
  const body = req.body as { rawInput: string };
  const rawInput = body.rawInput?.trim();
  if (!rawInput) { res.status(400).json({ error: "rawInput required" }); return; }

  let aiItems: CaptureItem[] | null = null;
  try { aiItems = await classifyWithOpenRouter(rawInput); } catch { /* fallback */ }

  const items = (aiItems && aiItems.length > 0) ? aiItems : heuristicItems(rawInput);
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
