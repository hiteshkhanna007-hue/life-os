import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  BookOpen,
  Check,
  Circle,
  Crosshair,
  Layers3,
  ListTodo,
  Mic,
  MicOff,
  Plus,
  Sparkle,
  SunMedium,
  Timer,
  X
} from "lucide-react";
import "./styles.css";

type View = "today" | "planner" | "focus" | "journal" | "life";
type Sheet = "capture" | "task" | "journal" | "project" | "reminder" | null;

type Task = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: "critical" | "high" | "medium" | "low";
  dueTime: string | null;
  estimatedPomodoros: number;
  actualPomodoros: number;
  projectId: string | null;
  tags: string[];
  energyRequired: "low" | "medium" | "high";
};

type CalendarBlock = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  blockType: string;
};

type Project = {
  id: string;
  name: string;
  lifeArea: string;
  color: string;
  intention: string;
  progress: {
    totalTasks: number;
    completedTasks: number;
    percentComplete: number;
  };
  aiHealthScore: number;
  riskFlags: string[];
};

type Reminder = {
  id: string;
  title: string;
  scheduledTime: string | null;
  status: string;
};

type AgentEvent = {
  id: string;
  agent: string;
  text: string;
  createdAt: string;
};

type Snapshot = {
  user: { displayName: string; timezone: string };
  date: string;
  tasks: {
    total: number;
    completed: number;
    overdue: number;
    upcoming: Task[];
    byPriority: Record<string, number>;
  };
  calendar: {
    blocks: CalendarBlock[];
    freeTimeMinutes: number;
    busiestHour: number | null;
  };
  focus: {
    pomodorosCompleted: number;
    pomodorosGoal: number;
    totalFocusMinutes: number;
    currentSession: null | {
      id: string;
      taskId: string | null;
      status: string;
      startedAt: string;
      plannedDuration: number;
      interruptionCount: number;
    };
  };
  journal: {
    moodTrend: number[];
    todayMood: number;
    energyLevel: number;
    entryCount: number;
    streakDays: number;
    latestEntry: string;
  };
  projects: Project[];
  reminders: Reminder[];
  commandCenter: {
    insight: string;
    nextAction: string | null;
    agentEvents: AgentEvent[];
  };
  ai: {
    enabled: boolean;
    provider: string;
    model: string;
  };
};

const navItems: Array<{ view: View; label: string; icon: React.ElementType }> = [
  { view: "today", label: "Today", icon: SunMedium },
  { view: "planner", label: "Plan", icon: ListTodo },
  { view: "focus", label: "Focus", icon: Crosshair },
  { view: "journal", label: "Journal", icon: BookOpen },
  { view: "life", label: "Life", icon: Layers3 }
];

function App() {
  const [view, setView] = useState<View>("today");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSnapshot() {
    try {
      setError(null);
      const response = await fetch("/v1/today");
      if (!response.ok) throw new Error("Could not reach the API.");
      setSnapshot(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Life OS could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSnapshot(); }, []);

  async function mutate(path: string, body?: unknown) {
    setBusy(true);
    try {
      await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      await loadSnapshot();
      setSheet(null);
    } finally {
      setBusy(false);
    }
  }

  const activeTask = useMemo(
    () => snapshot?.tasks.upcoming.find((t) => t.id === snapshot.focus.currentSession?.taskId),
    [snapshot]
  );

  if (loading) return <CenterScreen text="Opening Life OS" />;
  if (error || !snapshot) return <CenterScreen text={error ?? "No snapshot"} actionLabel="Retry" onAction={loadSnapshot} />;

  return (
    <div className="phone-app">
      <main className="phone-frame">
        <Header snapshot={snapshot} onCapture={() => setSheet("capture")} />
        <CommandCenter snapshot={snapshot} onCapture={() => setSheet("capture")} compact={view === "focus"} />

        {view === "today" && (
          <TodayView
            snapshot={snapshot}
            onCompleteTask={(id) => mutate(`/v1/tasks/${id}/complete`)}
            onStartFocus={() => mutate("/v1/focus/sessions", { plannedDuration: 25 }).then(() => setView("focus"))}
            onAddReminder={() => setSheet("reminder")}
          />
        )}
        {view === "planner" && (
          <PlannerView
            snapshot={snapshot}
            onAddTask={() => setSheet("task")}
            onCompleteTask={(id) => mutate(`/v1/tasks/${id}/complete`)}
          />
        )}
        {view === "focus" && (
          <FocusView
            snapshot={snapshot}
            task={activeTask}
            onStart={(plannedDuration) => mutate("/v1/focus/sessions", { plannedDuration })}
            onComplete={() => {
              const id = snapshot.focus.currentSession?.id;
              if (id) void mutate(`/v1/focus/sessions/${id}/complete`);
            }}
          />
        )}
        {view === "journal" && <JournalView snapshot={snapshot} onAddJournal={() => setSheet("journal")} />}
        {view === "life" && <LifeView snapshot={snapshot} onAddProject={() => setSheet("project")} onAddTask={() => setSheet("task")} />}
      </main>

      <BottomNav view={view} onViewChange={setView} />

      {sheet === "capture" && (
        <CaptureSheet busy={busy} onClose={() => setSheet(null)} onSubmit={(rawInput) => mutate("/v1/capture", { rawInput })} />
      )}
      {sheet === "task" && (
        <TaskSheet busy={busy} projects={snapshot.projects} onClose={() => setSheet(null)} onSubmit={(task) => mutate("/v1/tasks", task)} />
      )}
      {sheet === "journal" && (
        <JournalSheet busy={busy} onClose={() => setSheet(null)} onSubmit={(entry) => mutate("/v1/journal/entries", entry)} />
      )}
      {sheet === "project" && (
        <ProjectSheet busy={busy} onClose={() => setSheet(null)} onSubmit={(project) => mutate("/v1/projects", project)} />
      )}
      {sheet === "reminder" && (
        <ReminderSheet busy={busy} onClose={() => setSheet(null)} onSubmit={(r) => mutate("/v1/reminders", r)} />
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ snapshot, onCapture }: { snapshot: Snapshot; onCapture: () => void }) {
  return (
    <header className="top">
      <div>
        <p className="kicker">{formatDate(snapshot.date)}</p>
        <h1>Today</h1>
      </div>
      <button className="round-button" type="button" onClick={onCapture} aria-label="Capture" title="Capture">
        <Mic size={20} />
      </button>
    </header>
  );
}

// ── CommandCenter (cleaned up) ────────────────────────────────────────────────

function CommandCenter({ snapshot, onCapture, compact }: { snapshot: Snapshot; onCapture: () => void; compact?: boolean }) {
  return (
    <section className={compact ? "command-card compact" : "command-card"}>
      <p>{snapshot.commandCenter.insight}</p>
      {!compact && (
        <button className="text-button" type="button" onClick={onCapture}>
          <Sparkle size={15} />
          Capture &amp; route
        </button>
      )}
    </section>
  );
}

// ── Views ─────────────────────────────────────────────────────────────────────

function TodayView({
  snapshot,
  onCompleteTask,
  onStartFocus,
  onAddReminder,
}: {
  snapshot: Snapshot;
  onCompleteTask: (id: string) => void;
  onStartFocus: () => void;
  onAddReminder: () => void;
}) {
  return (
    <section className="view-stack">
      <div className="daily-strip">
        <Stat label="done" value={`${snapshot.tasks.completed}/${snapshot.tasks.total}`} />
        <Stat label="focus" value={`${snapshot.focus.totalFocusMinutes}m`} />
        <Stat label="mood" value={signed(snapshot.journal.todayMood)} />
      </div>

      <div className="section-head">
        <h2>Timeline</h2>
        <button className="small-action" type="button" onClick={onStartFocus}>
          <Timer size={16} />
          Focus
        </button>
      </div>
      <div className="timeline-list">
        {snapshot.calendar.blocks.map((block) => (
          <TimelineBlock block={block} key={block.id} />
        ))}
      </div>

      {snapshot.reminders.length > 0 && (
        <>
          <div className="section-head">
            <h2>Reminders</h2>
            <button className="small-action" type="button" onClick={onAddReminder}>
              <Plus size={16} />
              Add
            </button>
          </div>
          <div className="reminder-list">
            {snapshot.reminders.map((r) => (
              <article className="reminder-item" key={r.id}>
                <Bell size={16} />
                <div>
                  <strong>{r.title}</strong>
                  {r.scheduledTime && <p>{formatTime(r.scheduledTime)}</p>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {snapshot.reminders.length === 0 && (
        <div className="section-head">
          <h2>Reminders</h2>
          <button className="small-action" type="button" onClick={onAddReminder}>
            <Plus size={16} />
            Add
          </button>
        </div>
      )}

      <div className="section-head">
        <h2>Next tasks</h2>
      </div>
      <TaskList tasks={snapshot.tasks.upcoming} projects={snapshot.projects} onCompleteTask={onCompleteTask} />
    </section>
  );
}

function PlannerView({
  snapshot,
  onAddTask,
  onCompleteTask,
}: {
  snapshot: Snapshot;
  onAddTask: () => void;
  onCompleteTask: (id: string) => void;
}) {
  return (
    <section className="view-stack">
      <div className="section-head">
        <h2>Plan</h2>
        <button className="small-action" type="button" onClick={onAddTask}>
          <Plus size={16} />
          Task
        </button>
      </div>
      <TaskList tasks={snapshot.tasks.upcoming} projects={snapshot.projects} onCompleteTask={onCompleteTask} />
    </section>
  );
}

function FocusView({
  snapshot,
  task,
  onStart,
  onComplete,
}: {
  snapshot: Snapshot;
  task?: Task;
  onStart: (plannedDuration: number) => void;
  onComplete: () => void;
}) {
  const active = Boolean(snapshot.focus.currentSession);
  const activeDuration = snapshot.focus.currentSession?.plannedDuration ?? 25;
  const [selectedMinutes, setSelectedMinutes] = useState(activeDuration);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!active) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => { if (active) setSelectedMinutes(activeDuration); }, [active, activeDuration]);

  const elapsedSeconds = snapshot.focus.currentSession
    ? Math.max(0, Math.floor((nowMs - Date.parse(snapshot.focus.currentSession.startedAt)) / 1000))
    : 0;
  const totalSeconds = activeDuration * 60;
  const remainingSeconds = active ? Math.max(0, totalSeconds - elapsedSeconds) : selectedMinutes * 60;
  const progress = active ? 1 - remainingSeconds / totalSeconds : selectedMinutes / 120;

  return (
    <section className="view-stack">
      <div className="focus-stage">
        <p className="kicker">Focus</p>
        <h2>{task?.title ?? "Choose one clean block"}</h2>
        <div className="focus-actions">
          <button className="main-button" type="button" onClick={active ? onComplete : () => onStart(selectedMinutes)}>
            {active ? <Check size={18} /> : <Crosshair size={18} />}
            {active ? "Complete session" : "Start focus"}
          </button>
        </div>
        <TimerGauge
          active={active}
          minutes={selectedMinutes}
          progress={progress}
          remainingSeconds={remainingSeconds}
          onMinutesChange={setSelectedMinutes}
        />
      </div>
      <div className="daily-strip">
        <Stat label="pomos" value={`${snapshot.focus.pomodorosCompleted}/${snapshot.focus.pomodorosGoal}`} />
        <Stat label="energy" value={`${snapshot.journal.energyLevel}/10`} />
        <Stat label="interrupt" value={String(snapshot.focus.currentSession?.interruptionCount ?? 0)} />
      </div>
    </section>
  );
}

function TimerGauge({
  active, minutes, progress, remainingSeconds, onMinutesChange,
}: {
  active: boolean; minutes: number; progress: number; remainingSeconds: number; onMinutesChange: (m: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const radius = 118;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const angle = active ? clampedProgress * 360 : (minutes / 120) * 360;
  const marker = polarToCartesian(140, 140, radius, angle);

  function updateFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (active) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const degrees = (Math.atan2(y, x) * 180) / Math.PI + 90;
    const normalized = (degrees + 360) % 360;
    onMinutesChange(Math.max(5, Math.min(120, Math.round((normalized / 360) * 120))));
  }

  return (
    <div className={active ? "watch active" : "watch"}>
      <svg ref={svgRef} viewBox="0 0 280 280" role="slider" aria-label="Focus minutes"
        aria-valuemin={5} aria-valuemax={120} aria-valuenow={minutes}
        onPointerDown={(e) => { setDragging(true); updateFromPointer(e); }}
        onPointerMove={(e) => { if (dragging) updateFromPointer(e); }}
        onPointerUp={() => setDragging(false)} onPointerLeave={() => setDragging(false)}>
        <circle className="watch-track" cx="140" cy="140" r={radius} />
        <circle className="watch-progress" cx="140" cy="140" r={radius}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clampedProgress)} />
        {Array.from({ length: 12 }, (_, i) => {
          const outer = polarToCartesian(140, 140, 128, i * 30);
          const inner = polarToCartesian(140, 140, i % 3 === 0 ? 112 : 118, i * 30);
          return <line className="watch-tick" x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} key={i} />;
        })}
        {!active && <circle className="watch-knob" cx={marker.x} cy={marker.y} r="10" />}
      </svg>
      <div className="watch-readout">
        <strong>{active ? formatDuration(remainingSeconds) : String(minutes)}</strong>
        <span>{active ? "remaining" : "minutes"}</span>
      </div>
    </div>
  );
}

function JournalView({ snapshot, onAddJournal }: { snapshot: Snapshot; onAddJournal: () => void }) {
  return (
    <section className="view-stack">
      <div className="section-head">
        <h2>Journal</h2>
        <button className="small-action" type="button" onClick={onAddJournal}>
          <Plus size={16} />
          Entry
        </button>
      </div>
      <div className="mood-card">
        <div className="mood-bars">
          {snapshot.journal.moodTrend.map((mood, i) => (
            <span key={`${mood}-${i}`} style={{ height: `${Math.max(18, (mood + 5) * 9)}%` }} />
          ))}
        </div>
        <p>{snapshot.journal.latestEntry}</p>
      </div>
    </section>
  );
}

function LifeView({ snapshot, onAddProject, onAddTask }: { snapshot: Snapshot; onAddProject: () => void; onAddTask: () => void }) {
  return (
    <section className="view-stack">
      <div className="section-head">
        <h2>Life</h2>
        <button className="small-action" type="button" onClick={onAddProject}>
          <Plus size={16} />
          Project
        </button>
      </div>
      <div className="project-list">
        {snapshot.projects.map((project) => (
          <article className="project-card" key={project.id}>
            <div>
              <div className="project-row">
                <strong>{project.name}</strong>
                <span>{project.aiHealthScore}</span>
              </div>
              <p>{project.intention}</p>
            </div>
            <div className="progress">
              <span style={{ width: `${project.progress.percentComplete}%`, background: project.color }} />
            </div>
            <div className="project-row subtle">
              <small>{project.progress.completedTasks}/{project.progress.totalTasks} tasks</small>
              <button type="button" onClick={onAddTask}>Add task</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function TaskList({ tasks, projects, onCompleteTask }: { tasks: Task[]; projects: Project[]; onCompleteTask: (id: string) => void }) {
  return (
    <div className="task-list">
      {tasks.map((task) => {
        const project = projects.find((p) => p.id === task.projectId);
        return (
          <article className={task.status === "done" ? "task done" : "task"} key={task.id}>
            <button type="button" className="check-button" onClick={() => onCompleteTask(task.id)} aria-label={`Complete ${task.title}`}>
              {task.status === "done" ? <Check size={15} /> : <Circle size={15} />}
            </button>
            <div>
              <strong>{task.title}</strong>
              <p>{task.dueTime ?? "anytime"} · {project?.name ?? "Inbox"} · {task.energyRequired}</p>
            </div>
            <span className={`priority ${task.priority}`}>{task.priority}</span>
          </article>
        );
      })}
    </div>
  );
}

function TimelineBlock({ block }: { block: CalendarBlock }) {
  return (
    <article className="timeline-block">
      <time>{formatTime(block.startTime)}</time>
      <div>
        <strong>{block.title}</strong>
        <p>{block.blockType}</p>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function BottomNav({ view, onViewChange }: { view: View; onViewChange: (v: View) => void }) {
  return (
    <nav className="liquid-nav" aria-label="Primary">
      {navItems.map((item) => (
        <button type="button" className={view === item.view ? "glass-tab selected" : "glass-tab"}
          data-testid={`bottom-nav-${item.view}`} key={item.view}
          onClick={() => onViewChange(item.view)} aria-label={item.label} title={item.label}>
          <item.icon size={19} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── Sheets ────────────────────────────────────────────────────────────────────

function CaptureSheet({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: string) => void }) {
  const [rawInput, setRawInput] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR: typeof SpeechRecognition | null = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

  function startRec() {
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-AU";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      setRawInput(transcript);
    };
    rec.onend = () => {
      // Auto-restart if the user hasn't tapped stop — browser cuts off after silence
      if (shouldListenRef.current) startRec();
      else setListening(false);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Mic permission denied — allow microphone access in your browser settings.");
      } else if (e.error === "no-speech") {
        // not-speech is benign; onend will restart
      } else {
        setMicError(`Mic error: ${e.error}`);
      }
      shouldListenRef.current = false;
      setListening(false);
    };
    rec.start();
    recRef.current = rec;
  }

  function toggleDictation() {
    if (listening) {
      shouldListenRef.current = false;
      recRef.current?.stop();
      setListening(false);
      return;
    }
    if (!SR) { alert("Dictation not supported in this browser. Try Chrome or Safari."); return; }
    setMicError(null);
    shouldListenRef.current = true;
    startRec();
    setListening(true);
  }

  function handleClose() {
    shouldListenRef.current = false;
    recRef.current?.stop();
    onClose();
  }

  return (
    <SheetFrame title="Capture" onClose={handleClose}>
      <p className="sheet-note">
        {micError ? micError : listening ? "Listening — speak freely, tap mic to stop." : "Type or tap the mic to dictate. AI routes it to the right place."}
      </p>
      <div className="capture-wrap">
        <textarea
          autoFocus={!listening}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="Call Dr Patel at 3pm · I feel overwhelmed · Start a fitness project"
        />
        <button type="button" className={listening ? "mic-fab active" : "mic-fab"} onClick={toggleDictation} aria-label="Toggle dictation">
          {listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
      </div>
      <button className="main-button" type="button" disabled={busy || !rawInput.trim()} onClick={() => onSubmit(rawInput)}>
        <Sparkle size={18} />
        Route
      </button>
    </SheetFrame>
  );
}

function TaskSheet({ busy, projects, onClose, onSubmit }: {
  busy: boolean; projects: Project[]; onClose: () => void;
  onSubmit: (task: { title: string; projectId: string | null; dueTime: string | null }) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [dueTime, setDueTime] = useState("");
  return (
    <SheetFrame title="Add task" onClose={onClose}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task name" />
      <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value || null)}>
        <option value="">Inbox</option>
        {projects.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
      </select>
      <input value={dueTime} onChange={(e) => setDueTime(e.target.value)} placeholder="Time, e.g. 15:30" />
      <button className="main-button" type="button" disabled={busy || !title.trim()} onClick={() => onSubmit({ title, projectId, dueTime: dueTime || null })}>
        Add task
      </button>
    </SheetFrame>
  );
}

function JournalSheet({ busy, onClose, onSubmit }: {
  busy: boolean; onClose: () => void;
  onSubmit: (entry: { content: string; moodScore: number; energyLevel: number }) => void;
}) {
  const [content, setContent] = useState("");
  const [moodScore, setMoodScore] = useState(0);
  const [energyLevel, setEnergyLevel] = useState(5);
  return (
    <SheetFrame title="Journal entry" onClose={onClose}>
      <textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} placeholder="What changed today?" />
      <label>Mood <input type="range" min="-5" max="5" value={moodScore} onChange={(e) => setMoodScore(Number(e.target.value))} /></label>
      <label>Energy <input type="range" min="1" max="10" value={energyLevel} onChange={(e) => setEnergyLevel(Number(e.target.value))} /></label>
      <button className="main-button" type="button" disabled={busy || !content.trim()} onClick={() => onSubmit({ content, moodScore, energyLevel })}>
        Save entry
      </button>
    </SheetFrame>
  );
}

function ProjectSheet({ busy, onClose, onSubmit }: {
  busy: boolean; onClose: () => void;
  onSubmit: (p: { name: string; lifeArea: string; intention: string }) => void;
}) {
  const [name, setName] = useState("");
  const [lifeArea, setLifeArea] = useState("career");
  const [intention, setIntention] = useState("");
  return (
    <SheetFrame title="Add project" onClose={onClose}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
      <select value={lifeArea} onChange={(e) => setLifeArea(e.target.value)}>
        {["career", "health", "relationships", "creativity", "finances", "learning", "other"].map((a) => (
          <option value={a} key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
        ))}
      </select>
      <textarea value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="What should this protect or move forward?" />
      <button className="main-button" type="button" disabled={busy || !name.trim()} onClick={() => onSubmit({ name, lifeArea, intention })}>
        Add project
      </button>
    </SheetFrame>
  );
}

function ReminderSheet({ busy, onClose, onSubmit }: {
  busy: boolean; onClose: () => void;
  onSubmit: (r: { title: string; scheduledTime: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR: typeof SpeechRecognition | null = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

  function startRec() {
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-AU";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      setTitle(e.results[0]?.[0]?.transcript ?? "");
      // Stop after first result for single-shot title dictation
      shouldListenRef.current = false;
      setListening(false);
    };
    rec.onend = () => {
      if (shouldListenRef.current) startRec();
      else setListening(false);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Mic permission denied.");
      } else if (e.error !== "no-speech") {
        setMicError(`Mic error: ${e.error}`);
      }
      shouldListenRef.current = false;
      setListening(false);
    };
    rec.start();
    recRef.current = rec;
  }

  function toggleDictation() {
    if (listening) { shouldListenRef.current = false; recRef.current?.stop(); setListening(false); return; }
    if (!SR) return;
    setMicError(null);
    shouldListenRef.current = true;
    startRec();
    setListening(true);
  }

  function handleSubmit() {
    if (!title.trim() || !time) return;
    const today = new Date().toISOString().slice(0, 10);
    onSubmit({ title: title.trim(), scheduledTime: `${today}T${time}:00` });
  }

  return (
    <SheetFrame title="Set reminder" onClose={onClose}>
      {micError && <p className="sheet-note" style={{ color: "var(--error, #f87171)" }}>{micError}</p>}
      <div className="capture-wrap">
        <input
          autoFocus={!listening}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Reminder title"
        />
        <button type="button" className={listening ? "mic-fab small active" : "mic-fab small"} onClick={toggleDictation} aria-label="Dictate">
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
      </div>
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      <button className="main-button" type="button" disabled={busy || !title.trim() || !time} onClick={handleSubmit}>
        <Bell size={18} />
        Set reminder
      </button>
    </SheetFrame>
  );
}

function SheetFrame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-backdrop">
      <section className="bottom-sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="round-button small" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function CenterScreen({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="center-screen">
      <p>{text}</p>
      {actionLabel && <button className="main-button" type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(date));
}

function signed(value: number) { return value > 0 ? `+${value}` : String(value); }

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
