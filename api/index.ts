import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const USER_ID = "00000000-0000-0000-0000-000000000001";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

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

async function buildSnapshot() {
  const [tasksRes, projectsRes, journalRes, calRes, focusRes, eventsRes] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", USER_ID).is("deleted_at", null).neq("status", "archived").order("created_at"),
    supabase.from("projects").select("*").eq("user_id", USER_ID).eq("status", "active"),
    supabase.from("journal_entries").select("*").eq("user_id", USER_ID).order("created_at", { ascending: false }).limit(7),
    supabase.from("calendar_blocks").select("*").eq("user_id", USER_ID).order("start_time"),
    supabase.from("focus_sessions").select("*").eq("user_id", USER_ID).eq("status", "active").order("started_at", { ascending: false }).limit(1),
    supabase.from("agent_messages").select("*").order("timestamp", { ascending: false }).limit(8),
  ]);

  const taskRows = (tasksRes.data ?? []) as Record<string, unknown>[];
  const projectRows = (projectsRes.data ?? []) as Record<string, unknown>[];
  const journalRows = (journalRes.data ?? []) as Record<string, unknown>[];
  const calRows = (calRes.data ?? []) as Record<string, unknown>[];
  const focusRows = (focusRes.data ?? []) as Record<string, unknown>[];
  const eventRows = (eventsRes.data ?? []) as Record<string, unknown>[];

  const tasks = taskRows.map(rowToTask);
  const projects = projectRows.map((p) => rowToProject(p, taskRows));
  const journals = journalRows.map(rowToJournal);
  const calBlocks = calRows.map(rowToCalendarBlock);
  const activeFocus = focusRows.length > 0 ? rowToFocusSession(focusRows[0]) : null;
  const agentEvents = eventRows.map(rowToAgentEvent);

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

type CaptureClassification = {
  itemType: "task" | "journal" | "project";
  title: string;
  description?: string | null;
  priority?: Priority;
  moodScore?: number | null;
  energyLevel?: number | null;
};

async function classifyWithOpenRouter(rawInput: string): Promise<CaptureClassification | null> {
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
      temperature: 0.25,
      max_tokens: 500,
      messages: [
        { role: "system", content: "Classify a Life OS quick capture. Return only JSON with itemType task|journal|project, title, description, priority critical|high|medium|low, moodScore -5..5, energyLevel 1..10." },
        { role: "user", content: rawInput },
      ],
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  const jsonText = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(jsonText) as CaptureClassification;
  if (!["task", "journal", "project"].includes(parsed.itemType)) return null;
  return parsed;
}

// ── route handlers ────────────────────────────────────────────────────────────

async function handleGetToday(res: VercelResponse) {
  const snap = await buildSnapshot();
  res.json(snap);
}

async function handleGetTasks(res: VercelResponse) {
  const { data } = await supabase.from("tasks").select("*").eq("user_id", USER_ID).is("deleted_at", null).order("created_at");
  res.json((data ?? []).map(rowToTask));
}

async function handleGetProjects(res: VercelResponse) {
  const snap = await buildSnapshot();
  res.json(snap.projects);
}

async function handleGetJournalEntries(res: VercelResponse) {
  const { data } = await supabase.from("journal_entries").select("*").eq("user_id", USER_ID).order("created_at", { ascending: false });
  res.json((data ?? []).map(rowToJournal));
}

async function handlePostTask(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { title: string; projectId?: string | null; dueTime?: string | null };
  const title = body.title?.trim();
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const { data, error } = await supabase.from("tasks").insert({
    user_id: USER_ID,
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

async function handleCompleteTask(taskId: string, res: VercelResponse) {
  const { data: task, error } = await supabase
    .from("tasks").select("*").eq("id", taskId).eq("user_id", USER_ID).single();
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

async function handleStartFocus(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { plannedDuration?: number };
  const plannedDuration = Math.min(120, Math.max(5, Math.round(body.plannedDuration ?? 25)));
  // find next task
  const { data: tasks } = await supabase
    .from("tasks").select("*").eq("user_id", USER_ID).in("status", ["todo", "in_progress"])
    .order("created_at").limit(1);
  const nextTask = tasks?.[0] as Record<string, unknown> | undefined;
  if (nextTask) {
    await supabase.from("tasks").update({ status: "in_progress" }).eq("id", nextTask.id);
  }
  const { data: session } = await supabase.from("focus_sessions").insert({
    user_id: USER_ID,
    started_at: now(),
    planned_duration: plannedDuration,
    status: "active",
    task_id: nextTask?.id ?? null,
    interruption_count: 0,
  }).select().single();
  await pushEvent("focus", nextTask ? `Started ${plannedDuration}m focus on ${nextTask.title}` : `Started ${plannedDuration}m open focus session`);
  res.json(rowToFocusSession(session as Record<string, unknown>));
}

async function handleCompleteFocus(sessionId: string, res: VercelResponse) {
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
  const snap = await buildSnapshot();
  res.json(snap);
}

async function handlePostJournal(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { content: string; moodScore: number; energyLevel: number };
  const { data } = await supabase.from("journal_entries").insert({
    user_id: USER_ID,
    entry_type: "freeform",
    content: body.content.trim(),
    mood_score: body.moodScore,
    energy_level: body.energyLevel,
  }).select().single();
  await pushEvent("journal", `Logged mood ${body.moodScore > 0 ? "+" : ""}${body.moodScore} with energy ${body.energyLevel}/10`);
  res.json(rowToJournal(data as Record<string, unknown>));
}

async function handlePostProject(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { name: string; lifeArea: string; intention?: string };
  const colors = ["#7f8f7a", "#b08b63", "#a37c74", "#6f8795"];
  const { data: existing } = await supabase.from("projects").select("id").eq("user_id", USER_ID);
  const color = colors[(existing?.length ?? 0) % 4];
  const { data } = await supabase.from("projects").insert({
    user_id: USER_ID,
    name: body.name.trim(),
    life_area: body.lifeArea,
    color,
    description: body.intention?.trim() || "Keep this area visible and easy to act on.",
    status: "active",
  }).select().single();
  const { data: taskRows } = await supabase.from("tasks").select("*").eq("user_id", USER_ID);
  await pushEvent("life", `Created project: ${body.name}`);
  res.json(rowToProject(data as Record<string, unknown>, (taskRows ?? []) as Record<string, unknown>[]));
}

async function handleCapture(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { rawInput: string };
  const rawInput = body.rawInput?.trim();
  if (!rawInput) { res.status(400).json({ error: "rawInput required" }); return; }

  let ai: CaptureClassification | null = null;
  try { ai = await classifyWithOpenRouter(rawInput); } catch { /* fallback to heuristics */ }

  if (ai?.itemType === "journal") {
    const { data } = await supabase.from("journal_entries").insert({ user_id: USER_ID, entry_type: "freeform", content: ai.description?.trim() || rawInput, mood_score: ai.moodScore ?? inferMood(rawInput), energy_level: ai.energyLevel ?? 6 }).select().single();
    await pushEvent("capture", `Routed capture to Journal: ${ai.title}`);
    return res.json({ routedTo: "journal", created: rowToJournal(data as Record<string, unknown>), snapshot: await buildSnapshot() });
  }
  if (ai?.itemType === "project") {
    const { data: existing } = await supabase.from("projects").select("id").eq("user_id", USER_ID);
    const color = ["#7f8f7a", "#b08b63", "#a37c74", "#6f8795"][(existing?.length ?? 0) % 4];
    const { data } = await supabase.from("projects").insert({ user_id: USER_ID, name: ai.title.trim().slice(0, 42) || "New Project", life_area: "other", color, description: ai.description?.trim() || rawInput, status: "active" }).select().single();
    const { data: taskRows } = await supabase.from("tasks").select("*").eq("user_id", USER_ID);
    await pushEvent("capture", `Routed capture to Life Lens: ${ai.title}`);
    return res.json({ routedTo: "project", created: rowToProject(data as Record<string, unknown>, (taskRows ?? []) as Record<string, unknown>[]), snapshot: await buildSnapshot() });
  }
  if (ai?.itemType === "task") {
    const { data: proj } = await supabase.from("projects").select("id").eq("user_id", USER_ID).limit(1);
    const { data } = await supabase.from("tasks").insert({ user_id: USER_ID, title: ai.title.trim().slice(0, 72) || rawInput.slice(0, 72), description: ai.description?.trim() || "Created through AI capture.", status: "todo", priority: ai.priority ?? inferPriority(rawInput), estimated_pomodoros: rawInput.toLowerCase().includes("deep") ? 2 : 1, actual_pomodoros: 0, project_id: proj?.[0]?.id ?? null, tags: ["capture", "ai"], energy_required: rawInput.toLowerCase().includes("deep") ? "high" : "medium" }).select().single();
    await pushEvent("capture", `Routed capture to Planner: ${ai.title}`);
    return res.json({ routedTo: "task", created: rowToTask(data as Record<string, unknown>), snapshot: await buildSnapshot() });
  }

  // heuristic fallback
  const lower = rawInput.toLowerCase();
  if (lower.includes("feel") || lower.includes("mood") || lower.includes("journal")) {
    const { data } = await supabase.from("journal_entries").insert({ user_id: USER_ID, entry_type: "freeform", content: rawInput, mood_score: inferMood(rawInput), energy_level: lower.includes("tired") ? 3 : 6 }).select().single();
    await pushEvent("capture", "Routed capture to Journal.");
    return res.json({ routedTo: "journal", created: rowToJournal(data as Record<string, unknown>), snapshot: await buildSnapshot() });
  }
  if (lower.includes("project") || lower.includes("goal")) {
    const { data: existing } = await supabase.from("projects").select("id").eq("user_id", USER_ID);
    const color = ["#7f8f7a", "#b08b63", "#a37c74", "#6f8795"][(existing?.length ?? 0) % 4];
    const name = rawInput.replace(/project|goal/gi, "").trim().slice(0, 42) || "New Project";
    const { data } = await supabase.from("projects").insert({ user_id: USER_ID, name, life_area: "other", color, description: rawInput, status: "active" }).select().single();
    const { data: taskRows } = await supabase.from("tasks").select("*").eq("user_id", USER_ID);
    await pushEvent("capture", `Routed capture to Life Lens: ${name}`);
    return res.json({ routedTo: "project", created: rowToProject(data as Record<string, unknown>, (taskRows ?? []) as Record<string, unknown>[]), snapshot: await buildSnapshot() });
  }

  const { data: proj } = await supabase.from("projects").select("id").eq("user_id", USER_ID).limit(1);
  const { data } = await supabase.from("tasks").insert({ user_id: USER_ID, title: rawInput.slice(0, 72), description: "Created through capture.", status: "todo", priority: inferPriority(rawInput), due_time: lower.includes("tonight") ? "20:00" : null, estimated_pomodoros: lower.includes("deep") ? 2 : 1, actual_pomodoros: 0, project_id: proj?.[0]?.id ?? null, tags: ["capture"], energy_required: lower.includes("deep") ? "high" : "medium" }).select().single();
  await pushEvent("capture", `Routed capture to Planner: ${rawInput.slice(0, 40)}`);
  res.json({ routedTo: "task", created: rowToTask(data as Record<string, unknown>), snapshot: await buildSnapshot() });
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const path = (req.url ?? "/").split("?")[0];
  const method = req.method ?? "GET";

  try {
    if (method === "GET" && path === "/health") return res.json({ ok: true });
    if (method === "GET" && path === "/v1/today") return handleGetToday(res);
    if (method === "GET" && path === "/v1/tasks") return handleGetTasks(res);
    if (method === "GET" && path === "/v1/projects") return handleGetProjects(res);
    if (method === "GET" && path === "/v1/journal/entries") return handleGetJournalEntries(res);
    if (method === "POST" && path === "/v1/tasks") return handlePostTask(req, res);
    if (method === "POST" && path === "/v1/journal/entries") return handlePostJournal(req, res);
    if (method === "POST" && path === "/v1/projects") return handlePostProject(req, res);
    if (method === "POST" && path === "/v1/focus/sessions") return handleStartFocus(req, res);
    if (method === "POST" && path === "/v1/capture") return handleCapture(req, res);

    // /v1/tasks/:id/complete
    const taskCompleteMatch = path.match(/^\/v1\/tasks\/([^/]+)\/complete$/);
    if (method === "POST" && taskCompleteMatch) return handleCompleteTask(taskCompleteMatch[1], res);

    // /v1/focus/sessions/:id/complete
    const focusCompleteMatch = path.match(/^\/v1\/focus\/sessions\/([^/]+)\/complete$/);
    if (method === "POST" && focusCompleteMatch) return handleCompleteFocus(focusCompleteMatch[1], res);

    res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
}
