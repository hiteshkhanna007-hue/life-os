import cors from "@fastify/cors";
import Fastify from "fastify";

type Priority = "critical" | "high" | "medium" | "low";
type Energy = "low" | "medium" | "high";
type Agent = "capture" | "planner" | "focus" | "journal" | "life" | "command";

type Task = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: Priority;
  dueTime: string | null;
  estimatedPomodoros: number;
  actualPomodoros: number;
  projectId: string | null;
  tags: string[];
  energyRequired: Energy;
};

type FocusSession = {
  id: string;
  taskId: string | null;
  status: "active" | "completed" | "abandoned";
  startedAt: string;
  plannedDuration: number;
  completedAt: string | null;
  interruptionCount: number;
};

type JournalEntry = {
  id: string;
  content: string;
  moodScore: number;
  energyLevel: number;
  createdAt: string;
};

type Project = {
  id: string;
  name: string;
  lifeArea: "health" | "career" | "relationships" | "creativity" | "finances" | "learning" | "other";
  color: string;
  intention: string;
  createdAt: string;
};

type AgentEvent = {
  id: string;
  agent: Agent;
  text: string;
  createdAt: string;
};

type CaptureClassification = {
  itemType: "task" | "journal" | "project";
  title: string;
  description?: string | null;
  priority?: Priority;
  moodScore?: number | null;
  energyLevel?: number | null;
};

const today = "2026-05-05";
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
const openRouterModel = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";

const projects: Project[] = [
  {
    id: "project-rebrand",
    name: "Work Rebrand",
    lifeArea: "career",
    color: "#7f8f7a",
    intention: "Ship a calmer, clearer brand system without rushing the launch.",
    createdAt: now()
  },
  {
    id: "project-health",
    name: "Health Reset",
    lifeArea: "health",
    color: "#b08b63",
    intention: "Make recovery and movement easy enough to repeat.",
    createdAt: now()
  }
];

const tasks: Task[] = [
  {
    id: "task-report-draft",
    title: "Draft report opening",
    description: "Write the narrative spine and first two sections.",
    status: "in_progress",
    priority: "critical",
    dueTime: "10:30",
    estimatedPomodoros: 2,
    actualPomodoros: 1,
    projectId: "project-rebrand",
    tags: ["deep work"],
    energyRequired: "high"
  },
  {
    id: "task-launch-dates",
    title: "Confirm launch dates",
    description: "Send the realistic launch window and creative review dependency.",
    status: "todo",
    priority: "high",
    dueTime: "14:00",
    estimatedPomodoros: 1,
    actualPomodoros: 0,
    projectId: "project-rebrand",
    tags: ["admin"],
    energyRequired: "medium"
  },
  {
    id: "task-walk",
    title: "Take a short walk",
    description: "Reset before the late afternoon block.",
    status: "todo",
    priority: "medium",
    dueTime: "16:30",
    estimatedPomodoros: 1,
    actualPomodoros: 0,
    projectId: "project-health",
    tags: ["recovery"],
    energyRequired: "low"
  }
];

const journalEntries: JournalEntry[] = [
  {
    id: "journal-seed",
    content: "Morning felt easier once the day had a clear order. I want fewer context switches after lunch.",
    moodScore: 2,
    energyLevel: 7,
    createdAt: now()
  }
];

const calendarBlocks = [
  {
    id: "block-plan",
    title: "Plan the day",
    startTime: `${today}T08:45:00-07:00`,
    endTime: `${today}T09:00:00-07:00`,
    blockType: "personal"
  },
  {
    id: "block-focus",
    title: "Draft report opening",
    startTime: `${today}T10:30:00-07:00`,
    endTime: `${today}T11:20:00-07:00`,
    blockType: "focus"
  },
  {
    id: "block-recovery",
    title: "Short walk",
    startTime: `${today}T16:30:00-07:00`,
    endTime: `${today}T16:50:00-07:00`,
    blockType: "personal"
  }
];

const agentEvents: AgentEvent[] = [
  { id: "event-seed-1", agent: "command", text: "Built today around one high-energy focus block.", createdAt: now() },
  { id: "event-seed-2", agent: "journal", text: "Mood trend suggests fewer late-day admin tasks.", createdAt: now() }
];

let activeFocusSession: FocusSession | null = {
  id: "focus-current",
  taskId: "task-report-draft",
  status: "active",
  startedAt: now(),
  plannedDuration: 25,
  completedAt: null,
  interruptionCount: 0
};

function pushEvent(agent: Agent, text: string) {
  agentEvents.unshift({ id: id("event"), agent, text, createdAt: now() });
  agentEvents.splice(8);
}

function projectProgress(projectId: string) {
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  const completedTasks = projectTasks.filter((task) => task.status === "done").length;
  const totalTasks = projectTasks.length;
  const percentComplete = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const estimatedHoursTotal = projectTasks.reduce((sum, task) => sum + task.estimatedPomodoros * 0.42, 0);
  const estimatedHoursRemaining = projectTasks
    .filter((task) => task.status !== "done")
    .reduce((sum, task) => sum + task.estimatedPomodoros * 0.42, 0);

  return { totalTasks, completedTasks, percentComplete, estimatedHoursTotal, estimatedHoursRemaining };
}

function projectHealth(projectId: string) {
  const progress = projectProgress(projectId);
  if (progress.totalTasks === 0) return 62;
  return Math.min(96, Math.max(34, 54 + progress.percentComplete + progress.completedTasks * 4));
}

function nextTask() {
  return tasks.find((task) => task.status === "in_progress") ?? tasks.find((task) => task.status === "todo") ?? null;
}

function commandInsight() {
  const task = nextTask();
  const latestMood = journalEntries[0]?.moodScore ?? 0;
  const latestEnergy = journalEntries[0]?.energyLevel ?? 5;

  if (!task) return "Your queue is clear. Capture one thing worth protecting before adding more.";
  if (latestEnergy <= 4) return `Keep ${task.title} small. One gentle pass is enough before recovery.`;
  if (latestMood < 0) return `Start with ${task.title}, then log what changed. The system will lighten the next block.`;
  return `${task.title} is the cleanest next move. Focus can update the project when you finish.`;
}

async function classifyWithOpenRouter(rawInput: string): Promise<CaptureClassification | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:5173",
      "X-Title": "Life OS"
    },
    body: JSON.stringify({
      model: openRouterModel,
      temperature: 0.25,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "Classify a Life OS quick capture. Return only JSON with itemType task|journal|project, title, description, priority critical|high|medium|low, moodScore -5..5, energyLevel 1..10. Use journal for feelings/reflections, project for goals/projects, task for actions."
        },
        {
          role: "user",
          content: rawInput
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const jsonText = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(jsonText) as CaptureClassification;
  if (!["task", "journal", "project"].includes(parsed.itemType)) return null;
  return parsed;
}

function snapshot() {
  const completed = tasks.filter((task) => task.status === "done").length;
  const pomodorosCompleted = tasks.reduce((total, task) => total + task.actualPomodoros, 0);
  const moodTrend = journalEntries.slice(0, 7).map((entry) => entry.moodScore).reverse();

  return {
    user: { displayName: "Alex", timezone: "America/New_York" },
    date: today,
    generatedAt: now(),
    tasks: {
      total: tasks.length,
      completed,
      overdue: tasks.filter((task) => task.priority === "critical" && task.status !== "done").length,
      upcoming: tasks,
      byPriority: tasks.reduce<Record<string, number>>((counts, task) => {
        counts[task.priority] = (counts[task.priority] ?? 0) + 1;
        return counts;
      }, {})
    },
    calendar: {
      blocks: calendarBlocks,
      freeTimeMinutes: 190,
      busiestHour: 10
    },
    focus: {
      pomodorosCompleted,
      pomodorosGoal: 6,
      totalFocusMinutes: pomodorosCompleted * 25,
      currentSession: activeFocusSession
    },
    journal: {
      moodTrend: moodTrend.length ? moodTrend : [0],
      todayMood: journalEntries[0]?.moodScore ?? 0,
      energyLevel: journalEntries[0]?.energyLevel ?? 5,
      entryCount: journalEntries.length,
      streakDays: Math.min(12, journalEntries.length + 4),
      latestEntry: journalEntries[0]?.content ?? ""
    },
    projects: projects.map((project) => ({
      ...project,
      progress: projectProgress(project.id),
      aiHealthScore: projectHealth(project.id),
      riskFlags:
        projectProgress(project.id).totalTasks === 0
          ? ["No tasks yet"]
          : projectProgress(project.id).percentComplete < 35
            ? ["Needs one visible next step"]
            : []
    })),
    commandCenter: {
      insight: commandInsight(),
      nextAction: nextTask()?.id ?? null,
      agentEvents
    },
    ai: {
      enabled: Boolean(process.env.OPENROUTER_API_KEY),
      provider: process.env.OPENROUTER_API_KEY ? "OpenRouter" : "Local rules",
      model: process.env.OPENROUTER_API_KEY ? openRouterModel : "heuristic-router"
    }
  };
}

function inferPriority(text: string): Priority {
  const lower = text.toLowerCase();
  if (lower.includes("urgent") || lower.includes("asap") || lower.includes("critical")) return "critical";
  if (lower.includes("important") || lower.includes("today")) return "high";
  return "medium";
}

function inferMood(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("overwhelmed") || lower.includes("bad") || lower.includes("stressed")) return -2;
  if (lower.includes("great") || lower.includes("good") || lower.includes("calm")) return 2;
  return 0;
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));
app.get("/v1/today", async () => snapshot());
app.get("/v1/tasks", async () => tasks);
app.get("/v1/projects", async () => snapshot().projects);
app.get("/v1/journal/entries", async () => journalEntries);

app.post<{ Body: { title: string; projectId?: string | null; dueTime?: string | null } }>("/v1/tasks", async (request) => {
  const title = request.body.title.trim();
  const task: Task = {
    id: id("task"),
    title,
    description: "Created from planner.",
    status: "todo",
    priority: inferPriority(title),
    dueTime: request.body.dueTime ?? null,
    estimatedPomodoros: 1,
    actualPomodoros: 0,
    projectId: request.body.projectId ?? null,
    tags: ["manual"],
    energyRequired: "medium"
  };
  tasks.push(task);
  pushEvent("planner", `Added task: ${task.title}`);
  return task;
});

app.post<{ Params: { id: string } }>("/v1/tasks/:id/complete", async (request, reply) => {
  const task = tasks.find((item) => item.id === request.params.id);
  if (!task) return reply.code(404).send({ error: "Task not found" });
  task.status = "done";
  task.actualPomodoros = Math.max(task.actualPomodoros, task.estimatedPomodoros);
  pushEvent("planner", `Completed task: ${task.title}`);
  return task;
});

app.post<{ Body: { plannedDuration?: number } }>("/v1/focus/sessions", async (request) => {
  const task = nextTask();
  if (task) task.status = "in_progress";
  const plannedDuration = Math.min(120, Math.max(5, Math.round(request.body?.plannedDuration ?? 25)));
  activeFocusSession = {
    id: id("focus"),
    taskId: task?.id ?? null,
    status: "active",
    startedAt: now(),
    plannedDuration,
    completedAt: null,
    interruptionCount: 0
  };
  pushEvent("focus", task ? `Started ${plannedDuration}m focus on ${task.title}` : `Started ${plannedDuration}m open focus session`);
  return activeFocusSession;
});

app.post("/v1/focus/sessions/:id/complete", async () => {
  if (activeFocusSession) {
    activeFocusSession.status = "completed";
    activeFocusSession.completedAt = now();
    const linkedTask = tasks.find((task) => task.id === activeFocusSession?.taskId);
    if (linkedTask) {
      linkedTask.actualPomodoros += 1;
      if (linkedTask.actualPomodoros >= linkedTask.estimatedPomodoros) linkedTask.status = "done";
      pushEvent("focus", `Finished a focus block for ${linkedTask.title}`);
    } else {
      pushEvent("focus", "Finished an open focus block");
    }
  }
  activeFocusSession = null;
  return snapshot();
});

app.post<{ Body: { content: string; moodScore: number; energyLevel: number } }>("/v1/journal/entries", async (request) => {
  const entry: JournalEntry = {
    id: id("journal"),
    content: request.body.content.trim(),
    moodScore: request.body.moodScore,
    energyLevel: request.body.energyLevel,
    createdAt: now()
  };
  journalEntries.unshift(entry);
  pushEvent("journal", `Logged mood ${entry.moodScore > 0 ? "+" : ""}${entry.moodScore} with energy ${entry.energyLevel}/10`);
  return entry;
});

app.post<{ Body: { name: string; lifeArea: Project["lifeArea"]; intention?: string } }>("/v1/projects", async (request) => {
  const project: Project = {
    id: id("project"),
    name: request.body.name.trim(),
    lifeArea: request.body.lifeArea,
    color: ["#7f8f7a", "#b08b63", "#a37c74", "#6f8795"][projects.length % 4],
    intention: request.body.intention?.trim() || "Keep this area visible and easy to act on.",
    createdAt: now()
  };
  projects.push(project);
  pushEvent("life", `Created project: ${project.name}`);
  return project;
});

app.post<{ Body: { rawInput: string } }>("/v1/capture", async (request) => {
  const rawInput = request.body.rawInput.trim();
  let aiClassification: CaptureClassification | null = null;

  try {
    aiClassification = await classifyWithOpenRouter(rawInput);
  } catch (error) {
    pushEvent("command", error instanceof Error ? `Gemini fallback: ${error.message.slice(0, 90)}` : "Gemini fallback: classification failed");
  }

  if (aiClassification?.itemType === "journal") {
    const entry: JournalEntry = {
      id: id("journal"),
      content: aiClassification.description?.trim() || rawInput,
      moodScore: aiClassification.moodScore ?? inferMood(rawInput),
      energyLevel: aiClassification.energyLevel ?? 6,
      createdAt: now()
    };
    journalEntries.unshift(entry);
    pushEvent("capture", `Gemini routed capture to Journal: ${aiClassification.title}`);
    return { routedTo: "journal", created: entry, snapshot: snapshot() };
  }

  if (aiClassification?.itemType === "project") {
    const project: Project = {
      id: id("project"),
      name: aiClassification.title.trim().slice(0, 42) || "New Project",
      lifeArea: "other",
      color: "#7f8f7a",
      intention: aiClassification.description?.trim() || rawInput,
      createdAt: now()
    };
    projects.push(project);
    pushEvent("capture", `Gemini routed capture to Life Lens: ${project.name}`);
    return { routedTo: "project", created: project, snapshot: snapshot() };
  }

  if (aiClassification?.itemType === "task") {
    const task: Task = {
      id: id("task"),
      title: aiClassification.title.trim().slice(0, 72) || rawInput.slice(0, 72),
      description: aiClassification.description?.trim() || "Created through Gemini capture.",
      status: "todo",
      priority: aiClassification.priority ?? inferPriority(rawInput),
      dueTime: null,
      estimatedPomodoros: rawInput.toLowerCase().includes("deep") ? 2 : 1,
      actualPomodoros: 0,
      projectId: projects[0]?.id ?? null,
      tags: ["capture", "gemini"],
      energyRequired: rawInput.toLowerCase().includes("deep") ? "high" : "medium"
    };
    tasks.push(task);
    pushEvent("capture", `Gemini routed capture to Planner: ${task.title}`);
    return { routedTo: "task", created: task, snapshot: snapshot() };
  }

  const lower = rawInput.toLowerCase();

  if (lower.includes("feel") || lower.includes("mood") || lower.includes("journal")) {
    const entry: JournalEntry = {
      id: id("journal"),
      content: rawInput,
      moodScore: inferMood(rawInput),
      energyLevel: lower.includes("tired") ? 3 : 6,
      createdAt: now()
    };
    journalEntries.unshift(entry);
    pushEvent("capture", "Routed capture to Journal and refreshed the command insight.");
    return { routedTo: "journal", created: entry, snapshot: snapshot() };
  }

  if (lower.includes("project") || lower.includes("goal")) {
    const project: Project = {
      id: id("project"),
      name: rawInput.replace(/project|goal/gi, "").trim().slice(0, 42) || "New Project",
      lifeArea: "other",
      color: "#7f8f7a",
      intention: rawInput,
      createdAt: now()
    };
    projects.push(project);
    pushEvent("capture", `Routed capture to Life Lens: ${project.name}`);
    return { routedTo: "project", created: project, snapshot: snapshot() };
  }

  const task: Task = {
    id: id("task"),
    title: rawInput.slice(0, 72),
    description: "Created through command capture.",
    status: "todo",
    priority: inferPriority(rawInput),
    dueTime: lower.includes("tonight") ? "20:00" : null,
    estimatedPomodoros: lower.includes("deep") ? 2 : 1,
    actualPomodoros: 0,
    projectId: projects[0]?.id ?? null,
    tags: ["capture"],
    energyRequired: lower.includes("deep") ? "high" : "medium"
  };
  tasks.push(task);
  pushEvent("capture", `Routed capture to Planner: ${task.title}`);
  return { routedTo: "task", created: task, snapshot: snapshot() };
});

const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
