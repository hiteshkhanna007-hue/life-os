import cors from "@fastify/cors";
import Fastify from "fastify";
const today = "2026-05-05";
const tasks = [
    {
        id: "task-report-draft",
        title: "Deep work: report draft",
        description: "Draft the narrative spine and first two sections for the rebrand report.",
        status: "in_progress",
        priority: "critical",
        dueTime: "12:00",
        estimatedPomodoros: 2,
        actualPomodoros: 1,
        projectId: "project-rebrand",
        tags: ["work", "deep-focus"],
        energyRequired: "high"
    },
    {
        id: "task-sarah-launch",
        title: "Reply to Sarah about launch dates",
        description: "Confirm realistic launch windows and flag the dependency on creative review.",
        status: "todo",
        priority: "high",
        dueTime: "16:00",
        estimatedPomodoros: 1,
        actualPomodoros: 0,
        projectId: "project-rebrand",
        tags: ["work", "communication"],
        energyRequired: "medium"
    },
    {
        id: "task-capture-flow",
        title: "Sketch onboarding capture flow",
        description: "Map the first-run path from quick capture to confirmation sheet.",
        status: "todo",
        priority: "medium",
        dueTime: null,
        estimatedPomodoros: 1,
        actualPomodoros: 0,
        projectId: "project-life-os",
        tags: ["product", "design"],
        energyRequired: "medium"
    }
];
const calendarBlocks = [
    {
        id: "block-standup",
        title: "Standup",
        startTime: `${today}T09:00:00-07:00`,
        endTime: `${today}T09:30:00-07:00`,
        blockType: "meeting",
        aiOptimized: false,
        aiRationale: null
    },
    {
        id: "block-focus",
        title: "AI-optimized focus block",
        startTime: `${today}T10:30:00-07:00`,
        endTime: `${today}T11:20:00-07:00`,
        blockType: "focus",
        aiOptimized: true,
        aiRationale: "Report draft placed during your cleanest meeting gap."
    },
    {
        id: "block-capture-review",
        title: "Review quick captures",
        startTime: `${today}T14:00:00-07:00`,
        endTime: `${today}T14:25:00-07:00`,
        blockType: "task",
        aiOptimized: false,
        aiRationale: null
    }
];
const journal = {
    moodTrend: [-1, 2, 1, 3, 2],
    todayMood: 2,
    energyLevel: 7,
    entryCount: 8,
    streakDays: 8,
    latestEntry: "Good momentum once meetings settled. The morning focus block felt noticeably easier than late afternoon work."
};
const projects = [
    {
        id: "project-rebrand",
        name: "Work Rebrand",
        lifeArea: "career",
        color: "#a994ff",
        percentComplete: 68,
        aiHealthScore: 74,
        riskFlags: ["Launch dependency needs confirmation"]
    },
    {
        id: "project-health",
        name: "Health Reset",
        lifeArea: "health",
        color: "#72d39d",
        percentComplete: 42,
        aiHealthScore: 63,
        riskFlags: ["No recent evening walk logged"]
    },
    {
        id: "project-learning",
        name: "Systems Design",
        lifeArea: "learning",
        color: "#77b7ff",
        percentComplete: 29,
        aiHealthScore: 58,
        riskFlags: []
    }
];
let activeFocusSession = {
    id: "focus-current",
    taskId: "task-report-draft",
    status: "active",
    startedAt: new Date().toISOString(),
    plannedDuration: 25,
    interruptionCount: 0
};
function snapshot() {
    const completed = tasks.filter((task) => task.status === "done").length;
    const pomodorosCompleted = tasks.reduce((total, task) => total + task.actualPomodoros, 0);
    return {
        user: {
            displayName: "Alex",
            timezone: "America/New_York"
        },
        date: today,
        generatedAt: new Date().toISOString(),
        tasks: {
            total: tasks.length,
            completed,
            overdue: 2,
            upcoming: tasks,
            byPriority: tasks.reduce((counts, task) => {
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
            totalFocusMinutes: 105,
            currentSession: activeFocusSession
        },
        journal,
        projects,
        aiInsight: {
            text: "Move the report draft to 10:30. You have the cleanest block there and fewer meeting interruptions.",
            confidence: 0.86,
            suggestedAction: "schedule_report_draft"
        }
    };
}
const app = Fastify({ logger: true });
await app.register(cors, {
    origin: true
});
app.get("/health", async () => ({ ok: true }));
app.get("/v1/today", async () => snapshot());
app.get("/v1/tasks", async () => tasks);
app.post("/v1/tasks/:id/complete", async (request, reply) => {
    const task = tasks.find((item) => item.id === request.params.id);
    if (!task)
        return reply.code(404).send({ error: "Task not found" });
    task.status = "done";
    task.actualPomodoros = Math.max(task.actualPomodoros, task.estimatedPomodoros);
    return task;
});
app.post("/v1/focus/sessions", async () => {
    activeFocusSession = {
        id: `focus-${Date.now()}`,
        taskId: tasks.find((task) => task.status !== "done")?.id ?? null,
        status: "active",
        startedAt: new Date().toISOString(),
        plannedDuration: 25,
        interruptionCount: 0
    };
    return activeFocusSession;
});
app.post("/v1/focus/sessions/:id/complete", async () => {
    if (activeFocusSession) {
        activeFocusSession.status = "completed";
        const linkedTask = tasks.find((task) => task.id === activeFocusSession?.taskId);
        if (linkedTask)
            linkedTask.actualPomodoros += 1;
    }
    activeFocusSession = null;
    return snapshot().focus;
});
app.get("/v1/projects", async () => projects);
const port = Number(process.env.APP_PORT ?? 3000);
const host = process.env.APP_HOST ?? "0.0.0.0";
try {
    await app.listen({ port, host });
}
catch (error) {
    app.log.error(error);
    process.exit(1);
}
//# sourceMappingURL=index.js.map