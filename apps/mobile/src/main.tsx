import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type View = "today" | "tides" | "threads" | "reflect";
type DrawerType = "task" | "journal" | "project" | "reminder" | null;
type CapturePhase = "idle" | "listening" | "routed";

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
  progress: { totalTasks: number; completedTasks: number; percentComplete: number };
  aiHealthScore: number;
  riskFlags: string[];
};

type Reminder = {
  id: string;
  title: string;
  scheduledTime: string | null;
  status: string;
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
  calendar: { blocks: CalendarBlock[]; freeTimeMinutes: number; busiestHour: number | null };
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
  commandCenter: { insight: string; nextAction: string | null; agentEvents: unknown[] };
  ai: { enabled: boolean; provider: string; model: string };
};

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true })
    .format(new Date(date));
}

// Handle "HH:MM", "HH:MM:SS" (Postgres time columns), and full ISO strings
function parseTime(t: string): Date {
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
    const today = new Date().toISOString().slice(0, 10);
    const padded = t.length <= 5 ? `${t}:00` : t;
    return new Date(`${today}T${padded}`);
  }
  return new Date(t);
}

function formatShortTime(t: string): string {
  const d = parseTime(t);
  if (isNaN(d.getTime())) return t;
  return new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

function formatHour(h: number) {
  if (h === 0 || h === 24) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function moodColor(score: number): string {
  const hue = 30 + ((score + 5) / 10) * 120;
  const chroma = 0.10 + (Math.abs(score) / 5) * 0.06;
  return `oklch(0.75 ${chroma.toFixed(2)} ${Math.round(hue)})`;
}

function moodLabel(score: number): string {
  if (score >= 3) return "Great";
  if (score >= 1) return "Good";
  if (score === 0) return "OK";
  if (score >= -2) return "Low";
  return "Hard";
}

// ── SVG dock icons ─────────────────────────────────────────────────────────────

const S = { stroke: "currentColor", fill: "none", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.8" y2="6.8" />
      <line x1="17.2" y1="17.2" x2="19.1" y2="19.1" />
      <line x1="19.1" y1="4.9" x2="17.2" y2="6.8" />
      <line x1="6.8" y1="17.2" x2="4.9" y2="19.1" />
    </svg>
  );
}

function WavesIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M2 8 Q6 5 10 8 Q14 11 18 8 Q20.5 6.5 22 8" />
      <path d="M2 12 Q6 9 10 12 Q14 15 18 12 Q20.5 10.5 22 12" />
      <path d="M2 16 Q6 13 10 16 Q14 19 18 16 Q20.5 14.5 22 16" />
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <line x1="7"  y1="5"  x2="7"  y2="20" />
      <line x1="12" y1="3"  x2="12" y2="20" />
      <line x1="17" y1="8"  x2="17" y2="20" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

function App() {
  const [view, setView] = useState<View>("today");
  const [drawer, setDrawer] = useState<DrawerType>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSnapshot() {
    try {
      setError(null);
      const res = await fetch("/v1/today");
      if (!res.ok) throw new Error("Could not reach the API.");
      setSnapshot(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Life OS could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSnapshot(); }, []);

  async function mutate(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    try {
      await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      await loadSnapshot();
      setDrawer(null);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(id: string) {
    await fetch(`/v1/tasks/${id}`, { method: "DELETE" });
    await loadSnapshot();
  }

  async function capture(rawInput: string): Promise<{ items: Array<{ routedTo: string; dueTime: string | null }> } | null> {
    setBusy(true);
    try {
      const res = await fetch("/v1/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput }),
      });
      const data = res.ok ? (await res.json() as { items: Array<{ routedTo: string; dueTime: string | null }> }) : null;
      await loadSnapshot();
      return data;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="center-screen">
        <p>Opening Life OS</p>
      </div>
    );
  }
  if (error || !snapshot) {
    return (
      <div className="center-screen">
        <p>{error ?? "No snapshot"}</p>
        <button onClick={loadSnapshot}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="view-area">
        {view === "today"   && <TodayScreen snapshot={snapshot} onCompleteTask={(id) => mutate(`/v1/tasks/${id}/complete`)} onDeleteTask={deleteTask} />}
        {view === "tides"   && <TidesScreen snapshot={snapshot} onCompleteTask={(id) => mutate(`/v1/tasks/${id}/complete`)} onDeleteTask={deleteTask} onAddTask={() => setDrawer("task")} />}
        {view === "threads" && <ThreadsScreen snapshot={snapshot} onAddProject={() => setDrawer("project")} />}
        {view === "reflect" && <ReflectScreen snapshot={snapshot} onAddJournal={() => setDrawer("journal")} />}
      </div>

      <Dock view={view} onViewChange={setView} onCaptureOpen={() => setCaptureOpen(true)} />

      {captureOpen && (
        <CaptureOverlay
          busy={busy}
          onClose={() => setCaptureOpen(false)}
          onSubmit={capture}
        />
      )}

      {drawer === "task" && (
        <TaskDrawer busy={busy} projects={snapshot.projects} onClose={() => setDrawer(null)}
          onSubmit={(t) => mutate("/v1/tasks", t)} />
      )}
      {drawer === "journal" && (
        <JournalDrawer busy={busy} onClose={() => setDrawer(null)}
          onSubmit={(e) => mutate("/v1/journal/entries", e)} />
      )}
      {drawer === "project" && (
        <ProjectDrawer busy={busy} onClose={() => setDrawer(null)}
          onSubmit={(p) => mutate("/v1/projects", p)} />
      )}
      {drawer === "reminder" && (
        <ReminderDrawer busy={busy} onClose={() => setDrawer(null)}
          onSubmit={(r) => mutate("/v1/reminders", r)} />
      )}
    </div>
  );
}

// ── Today screen ──────────────────────────────────────────────────────────────

const RIBBON_START = 6;   // 6am
const RIBBON_END   = 22;  // 10pm
const HOUR_PX      = 64;
const RIBBON_H     = (RIBBON_END - RIBBON_START) * HOUR_PX;

function yFor(t: string) {
  const d = parseTime(t);
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.max(0, (h - RIBBON_START) * HOUR_PX);
}

function eventHeight(startIso: string, endIso: string) {
  const mins = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
  return Math.max(40, (mins / 60) * HOUR_PX);
}

const KIND_COLOR: Record<string, string> = {
  focus:    "var(--accent)",
  ritual:   "var(--amber)",
  rest:     "var(--sky)",
  body:     "var(--accent)",
  reflect:  "var(--lavender)",
  meeting:  "var(--sky)",
  personal: "var(--amber)",
};

// ── SwipeableTask ─────────────────────────────────────────────────────────────

function SwipeableTask({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const THRESHOLD = -72;

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
    setSwiping(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!swiping) return;
    const delta = Math.min(0, e.clientX - startX.current);
    setDx(delta);
  }

  function onPointerUp() {
    setSwiping(false);
    if (dx < THRESHOLD) {
      onDelete();
    } else {
      setDx(0);
    }
  }

  const deleteVisible = dx < THRESHOLD / 2;

  return (
    <div className="swipe-wrapper" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {deleteVisible && <div className="swipe-delete-bg">🗑</div>}
      <div className={`swipe-inner${swiping ? " swiping" : ""}`} style={{ transform: `translateX(${dx}px)` }}>
        {children}
      </div>
    </div>
  );
}

function TodayScreen({ snapshot, onCompleteTask, onDeleteTask }: { snapshot: Snapshot; onCompleteTask: (id: string) => void; onDeleteTask: (id: string) => void }) {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowIso = new Date(nowMs).toISOString();
  const nowY   = yFor(nowIso);
  const nowStr = formatTime(nowIso);

  const hours = Array.from({ length: RIBBON_END - RIBBON_START }, (_, i) => i + RIBBON_START);

  // If there's an active focus session, synthesise a calendar block for it
  const blocks: CalendarBlock[] = [...snapshot.calendar.blocks];
  if (snapshot.focus.currentSession) {
    const s = snapshot.focus.currentSession;
    const start = s.startedAt;
    const end = new Date(new Date(start).getTime() + s.plannedDuration * 60000).toISOString();
    if (!blocks.find(b => b.id === s.id)) {
      blocks.push({ id: s.id, title: "Focus session", startTime: start, endTime: end, blockType: "focus" });
    }
  }

  const today = snapshot.date;
  const displayName = snapshot.user.displayName || "there";
  const firstName = displayName.split(" ")[0];

  return (
    <div className="today-screen">
      <div className="screen-header">
        <div className="screen-eyebrow">{formatDate(today)}</div>
        <h1 className="screen-title">Good morning,<br /><em>{firstName}.</em></h1>
        <p className="screen-whisper">One thread at a time.</p>
      </div>

      <div className="day-stats">
        <div className="day-stat">
          <span className="day-stat-value">
            {snapshot.tasks.completed}
            <span className="day-stat-denom">/{snapshot.tasks.total}</span>
          </span>
          <span className="day-stat-label">done</span>
        </div>
        <div className="day-stat">
          <span className="day-stat-value">
            {snapshot.focus.totalFocusMinutes}
            <span className="day-stat-denom">m</span>
          </span>
          <span className="day-stat-label">focused</span>
        </div>
        <div className="day-stat">
          <span className="day-stat-value">{moodLabel(snapshot.journal.todayMood)}</span>
          <span className="day-stat-label">mood</span>
        </div>
      </div>

      <div className="time-ribbon-wrap">
        <div className="ribbon-bg-line" />
        <div className="ribbon-axis" style={{ height: RIBBON_H }}>
          {hours.map(h => (
            <div key={h} className="ribbon-hour" style={{ top: (h - RIBBON_START) * HOUR_PX }}>
              <span className="ribbon-hour-label">{formatHour(h)}</span>
              <div className="ribbon-hour-line" />
            </div>
          ))}

          {/* now marker — only show if within ribbon range */}
          {nowY >= 0 && nowY <= RIBBON_H && (
            <div className="now-marker" style={{ top: nowY }}>
              <div className="now-dot" />
              <div className="now-line" />
              <span className="now-time-label">now · {nowStr}</span>
            </div>
          )}

          {blocks.map(block => {
            const top = yFor(block.startTime);
            const height = eventHeight(block.startTime, block.endTime);
            if (top > RIBBON_H || top + height < 0) return null;
            const color = KIND_COLOR[block.blockType] ?? "var(--ink-30)";
            const isFocus = block.blockType === "focus";
            return (
              <div key={block.id} className="ribbon-event" style={{ top, height }}>
                <span className="ribbon-event-dot" style={{ background: color }} />
                <div className="ribbon-event-body">
                  <div className="ribbon-event-title">{block.title}</div>
                  <div className="ribbon-event-meta">
                    {formatShortTime(block.startTime)} · {block.blockType}
                  </div>
                </div>
                {isFocus && <div className="ribbon-event-action">▶</div>}
              </div>
            );
          })}

          {/* upcoming tasks as ghost pins */}
          {snapshot.tasks.upcoming.filter(t => t.dueTime && t.status !== "done").map(task => {
            const top = yFor(task.dueTime!);
            if (top < 0 || top > RIBBON_H) return null;
            return (
              <div key={task.id} style={{ position: "absolute", top, left: 0, right: 0, height: 40 }}>
                <SwipeableTask onDelete={() => onDeleteTask(task.id)}>
                  <div className="ribbon-event" style={{ position: "static", height: 40, opacity: 0.85 }}>
                    <span className="ribbon-event-dot" style={{ background: "var(--ink-30)" }} />
                    <div className="ribbon-event-body">
                      <div className="ribbon-event-title">{task.title}</div>
                      <div className="ribbon-event-meta">task · {task.priority}</div>
                    </div>
                    <button
                      className="ribbon-event-action"
                      onClick={() => onCompleteTask(task.id)}
                      aria-label={`Complete ${task.title}`}
                    >✓</button>
                  </div>
                </SwipeableTask>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tides screen ──────────────────────────────────────────────────────────────

function TidesScreen({ snapshot, onCompleteTask, onDeleteTask, onAddTask }: {
  snapshot: Snapshot;
  onCompleteTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: () => void;
}) {
  const active = snapshot.tasks.upcoming.filter(t => t.status !== "done");
  const high = active.filter(t => t.priority === "critical" || t.priority === "high");
  const mid  = active.filter(t => t.priority === "medium");
  const low  = active.filter(t => t.priority === "low");

  return (
    <div className="tides-screen">
      <div className="screen-header">
        <div className="screen-eyebrow">{active.length} currents · 3 tides</div>
        <h1 className="screen-title">What pulls<br /><em>today.</em></h1>
      </div>

      <div className="tides-list">
        <TideBand
          tier="high" label="High tide" sub="do today"
          color="var(--amber)" tasks={high}
          projects={snapshot.projects}
          onComplete={onCompleteTask} onDelete={onDeleteTask} onAdd={onAddTask}
        />
        <TideBand
          tier="mid" label="Mid tide" sub="this week"
          color="var(--accent)" tasks={mid}
          projects={snapshot.projects}
          onComplete={onCompleteTask} onDelete={onDeleteTask} onAdd={onAddTask}
        />
        <TideBand
          tier="low" label="Low tide" sub="someday"
          color="var(--sky)" tasks={low}
          projects={snapshot.projects}
          onComplete={onCompleteTask} onDelete={onDeleteTask} onAdd={onAddTask}
        />
      </div>
    </div>
  );
}

function TideBand({ tier, label, sub, color, tasks, projects, onComplete, onDelete, onAdd }: {
  tier: "high" | "mid" | "low";
  label: string;
  sub: string;
  color: string;
  tasks: Task[];
  projects: Project[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className={`tide-band tide-band-${tier}`}>
      <div className="tide-head">
        <span className="tide-color-dot" style={{ background: color }} />
        <span className="tide-name">{label}</span>
        <span className="tide-sub">{sub}</span>
        <span className="tide-count">{tasks.length}</span>
      </div>
      <div className="tide-tasks">
        {tasks.length === 0 && <p className="tide-empty">Clear water.</p>}
        {tasks.map(task => {
          const project = projects.find(p => p.id === task.projectId);
          return (
            <SwipeableTask key={task.id} onDelete={() => onDelete(task.id)}>
              <div className="tide-task-card">
                <button
                  className={`tide-task-check${task.status === "done" ? " done" : ""}`}
                  onClick={() => onComplete(task.id)}
                  aria-label={`Complete ${task.title}`}
                />
                <div className="tide-task-body">
                  <div className="tide-task-title">{task.title}</div>
                  <div className="tide-task-meta">
                    <span>{project?.name ?? "Inbox"}</span>
                    {task.dueTime && <><span className="tide-task-sep">·</span><span>{formatShortTime(task.dueTime)}</span></>}
                  </div>
                </div>
              </div>
            </SwipeableTask>
          );
        })}
        <button className="tide-add-btn" onClick={onAdd}>+ add</button>
      </div>
    </div>
  );
}

// ── Threads screen ────────────────────────────────────────────────────────────

function ThreadsScreen({ snapshot, onAddProject }: { snapshot: Snapshot; onAddProject: () => void }) {
  return (
    <div className="threads-screen">
      <div className="screen-header">
        <div className="screen-eyebrow">{snapshot.projects.length} threads holding the year</div>
        <h1 className="screen-title">What you're<br /><em>weaving.</em></h1>
      </div>

      <div className="ropes-row">
        {snapshot.projects.map(p => <Rope key={p.id} project={p} />)}
      </div>

      <div className="thread-list">
        {snapshot.projects.map(p => (
          <div key={p.id} className="thread-row">
            <span className="thread-color-bar" style={{ background: p.color }} />
            <div className="thread-info">
              <div className="thread-name">{p.name}</div>
              <div className="thread-desc">{p.intention}</div>
            </div>
            <div className="thread-meta">
              <div className="thread-progress">{p.progress.completedTasks}/{p.progress.totalTasks}</div>
              <div className="thread-area">{p.lifeArea}</div>
            </div>
          </div>
        ))}
        <button className="thread-add-btn" onClick={onAddProject}>+ start a new thread</button>
      </div>
    </div>
  );
}

function Rope({ project }: { project: Project }) {
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(project.progress.percentComplete));
    return () => cancelAnimationFrame(id);
  }, [project.progress.percentComplete]);

  return (
    <div className="rope-col">
      <div className="rope-track">
        <div className="rope-fill" style={{ height: `${fill}%`, background: project.color }} />
        <div className="rope-pct">{Math.round(fill)}%</div>
      </div>
      <div className="rope-name">{project.name}</div>
    </div>
  );
}

// ── Reflect screen ────────────────────────────────────────────────────────────

const WEEK_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

function ReflectScreen({ snapshot, onAddJournal }: { snapshot: Snapshot; onAddJournal: () => void }) {
  const mood = snapshot.journal.todayMood;
  const color = moodColor(mood);

  return (
    <div className="reflect-screen">
      <div className="screen-header">
        <div className="screen-eyebrow">{formatDate(snapshot.date)}</div>
        <h1 className="screen-title">How was the<br /><em>weather inside?</em></h1>
      </div>

      <div className="mood-sphere-wrap">
        <div className="mood-sphere-glow" style={{ background: color }} />
        <div
          className="mood-sphere"
          style={{
            background: `radial-gradient(circle at 35% 30%, oklch(0.90 0.05 ${30 + ((mood + 5) / 10) * 120}) 0%, ${color} 60%, oklch(0.55 0.12 ${30 + ((mood + 5) / 10) * 100}) 100%)`,
            boxShadow: `0 20px 60px ${color}55`,
          }}
          onClick={onAddJournal}
          role="button"
          aria-label="Log mood"
        />
        <div className="mood-prompt">tap to log · {moodLabel(mood)}</div>
      </div>

      <div className="mood-week">
        {snapshot.journal.moodTrend.map((score, i) => (
          <div key={i} className="mood-day">
            <div
              className="mood-orb"
              style={{
                background: moodColor(score),
                opacity: i === snapshot.journal.moodTrend.length - 1 ? 1 : 0.5 + (Math.abs(score) / 5) * 0.5,
                boxShadow: i === snapshot.journal.moodTrend.length - 1
                  ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${moodColor(score)}`
                  : "none",
              }}
            />
            <span className="mood-day-label">{WEEK_DAYS[i % 7]}</span>
          </div>
        ))}
      </div>

      <div className="journal-section">
        <div className="journal-section-head">
          <div className="screen-eyebrow" style={{ margin: 0 }}>Journal</div>
          <button className="journal-add-btn" onClick={onAddJournal}>+ entry</button>
        </div>
        {snapshot.journal.latestEntry ? (
          <div className="journal-card">
            <div className="journal-card-meta">
              <span className="journal-card-mood" style={{ background: color }} />
              <span className="journal-card-date">{formatDate(snapshot.date)}</span>
            </div>
            <p className="journal-card-preview">{snapshot.journal.latestEntry}</p>
          </div>
        ) : (
          <div className="journal-card">
            <p className="journal-card-preview">Nothing written yet. The day still has room.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Capture overlay ───────────────────────────────────────────────────────────

function routeCard(routedTo: string, dueTime: string | null): { icon: string; dest: string } {
  if (routedTo === "journal")  return { icon: "◑", dest: "Reflect" };
  if (routedTo === "project")  return { icon: "✦", dest: "Threads" };
  if (routedTo === "reminder") return { icon: "⏰", dest: "Reminders" };
  // task — if it has a time, it pins to Today; otherwise Tides
  return dueTime ? { icon: "◷", dest: "Today" } : { icon: "⤴", dest: "Tides" };
}

function CaptureOverlay({ busy, onClose, onSubmit }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: string) => Promise<{ items: Array<{ routedTo: string; dueTime: string | null }> } | null>;
}) {
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [routes, setRoutes] = useState<Array<{ dest: string; icon: string; label: string }>>([]);
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
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(t);
    };
    rec.onend = () => {
      if (shouldListenRef.current) startRec();
      else setListening(false);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Mic permission denied — allow in browser settings.");
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
    if (listening) {
      shouldListenRef.current = false;
      recRef.current?.stop();
      setListening(false);
      return;
    }
    if (!SR) { setMicError("Dictation not supported — try Chrome or Safari."); return; }
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

  async function handleRoute() {
    if (!transcript.trim()) return;
    shouldListenRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setPhase("routed");
    setRoutes([]); // show loading state while AI processes
    const result = await onSubmit(transcript);
    if (result?.items?.length) {
      // Split transcript into rough per-item labels by sentence count
      const parts = transcript.split(/[,;]|\band\b|\balso\b/i).map(s => s.trim()).filter(Boolean);
      setRoutes(result.items.map((item, i) => {
        const r = routeCard(item.routedTo, item.dueTime);
        return { dest: r.dest, icon: r.icon, label: (parts[i] ?? transcript).slice(0, 60) };
      }));
    } else {
      setRoutes([{ dest: "Tides", icon: "⤴", label: transcript.slice(0, 60) }]);
    }
  }

  function startListening() {
    setPhase("listening");
    if (SR) { toggleDictation(); }
  }

  return (
    <div className="capture-overlay">
      <div className="capture-mist" />
      <button className="capture-close-btn" onClick={handleClose} aria-label="Close">✕</button>

      <div className="capture-head">
        <div className="capture-eyebrow">Brain dump</div>
        <h1 className="capture-title">
          {phase === "idle"      && <>Tap to <em>begin.</em></>}
          {phase === "listening" && <>Listening<span className="listen-dots"><span /><span /><span /></span></>}
          {phase === "routed"    && <>I sorted it. <em>Look.</em></>}
        </h1>
      </div>

      {phase === "idle" && (
        <div className="capture-transcript" style={{ flex: 1 }} />
      )}

      {phase === "listening" && (
        <div className="capture-transcript">
          {transcript || (micError ?? "Speak freely…")}
          {listening && <span className="capture-caret" />}
          {micError && (
            <div className="capture-textarea-wrap" style={{ position: "static", flex: "none", padding: "12px 0 0" }}>
              <textarea
                className="capture-textarea"
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Or type here…"
              />
            </div>
          )}
        </div>
      )}

      {phase === "routed" && (
        <div className="capture-routed">
          {routes.length === 0 ? (
            <div className="route-thinking">Routing…</div>
          ) : routes.map((r, i) => (
            <div key={i} className="route-card" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="route-card-icon">{r.icon}</div>
              <div className="route-card-body">
                <div className="route-card-dest">{r.dest}</div>
                <div className="route-card-label">{r.label}</div>
              </div>
              <div className="route-card-tick">✓</div>
            </div>
          ))}
        </div>
      )}

      <div className="capture-foot">
        {phase === "idle" && (
          <button className="capture-mic-btn" onClick={startListening}>
            <span className="mic-glyph" />
            <span className="mic-label">Tap to speak · or type below</span>
          </button>
        )}
        {phase === "listening" && (
          <div className="wave-bars">
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="wave-bar" style={{ animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        )}
        {phase === "routed" && (
          <button className="capture-done-btn" disabled={routes.length === 0} onClick={handleClose}>
            {routes.length === 0 ? "Routing…" : "Done ✓"}
          </button>
        )}
      </div>

      {/* If phase is listening and we have a transcript, show route button */}
      {phase === "listening" && transcript.trim() && (
        <div style={{ position: "relative", zIndex: 2, padding: "0 24px 12px", display: "flex", justifyContent: "center" }}>
          <button className="capture-done-btn" onClick={handleRoute}>
            Sort it →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dock ──────────────────────────────────────────────────────────────────────

function Dock({ view, onViewChange, onCaptureOpen }: {
  view: View;
  onViewChange: (v: View) => void;
  onCaptureOpen: () => void;
}) {
  return (
    <nav className="dock" aria-label="Primary navigation">
      <button className={`dock-tab${view === "today" ? " active" : ""}`} onClick={() => onViewChange("today")}>
        <SunIcon /><span>Today</span>
      </button>
      <button className={`dock-tab${view === "tides" ? " active" : ""}`} onClick={() => onViewChange("tides")}>
        <WavesIcon /><span>Tides</span>
      </button>
      <div className="dock-orb-slot">
        <button className="dock-orb" onClick={onCaptureOpen} aria-label="Capture">
          <span className="orb-halo" />
          <span className="orb-core" />
          <div className="orb-eyes">
            <span className="orb-eye" />
            <span className="orb-eye" />
          </div>
        </button>
      </div>
      <button className={`dock-tab${view === "threads" ? " active" : ""}`} onClick={() => onViewChange("threads")}>
        <ThreadsIcon /><span>Threads</span>
      </button>
      <button className={`dock-tab${view === "reflect" ? " active" : ""}`} onClick={() => onViewChange("reflect")}>
        <MoonIcon /><span>Reflect</span>
      </button>
    </nav>
  );
}

// ── Drawers ───────────────────────────────────────────────────────────────────

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="drawer">
        <div className="drawer-handle" />
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function TaskDrawer({ busy, projects, onClose, onSubmit }: {
  busy: boolean;
  projects: Project[];
  onClose: () => void;
  onSubmit: (t: { title: string; projectId: string | null; dueTime: string | null }) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(projects[0]?.id ?? null);
  const [dueTime, setDueTime] = useState("");
  return (
    <Drawer title="Add task" onClose={onClose}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Task name" />
      <select value={projectId ?? ""} onChange={e => setProjectId(e.target.value || null)}>
        <option value="">Inbox</option>
        {projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
      </select>
      <input value={dueTime} onChange={e => setDueTime(e.target.value)} placeholder="Time, e.g. 15:30" />
      <button className="drawer-submit-btn" disabled={busy || !title.trim()} onClick={() => onSubmit({ title, projectId, dueTime: dueTime || null })}>
        Add task
      </button>
    </Drawer>
  );
}

function JournalDrawer({ busy, onClose, onSubmit }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (e: { content: string; moodScore: number; energyLevel: number }) => void;
}) {
  const [content, setContent] = useState("");
  const [moodScore, setMoodScore] = useState(0);
  const [energyLevel, setEnergyLevel] = useState(5);
  const [listening, setListening] = useState(false);
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
    rec.onresult = (e: SpeechRecognitionEvent) => setContent(Array.from(e.results).map(r => r[0].transcript).join(""));
    rec.onend = () => { if (shouldListenRef.current) startRec(); else setListening(false); };
    rec.onerror = () => { shouldListenRef.current = false; setListening(false); };
    rec.start();
    recRef.current = rec;
  }

  function toggleDictation() {
    if (listening) { shouldListenRef.current = false; recRef.current?.stop(); setListening(false); return; }
    if (!SR) return;
    shouldListenRef.current = true;
    startRec();
    setListening(true);
  }

  return (
    <Drawer title="Journal entry" onClose={onClose}>
      <div className="capture-in-drawer">
        <textarea autoFocus={!listening} value={content} onChange={e => setContent(e.target.value)} placeholder="What changed today?" />
        <button type="button" className={`mic-btn-small${listening ? " active" : ""}`} onClick={toggleDictation} aria-label="Toggle dictation">
          {listening ? "◼" : "🎙"}
        </button>
      </div>
      <label>Mood ({moodScore > 0 ? `+${moodScore}` : moodScore})
        <input type="range" min="-5" max="5" value={moodScore} onChange={e => setMoodScore(Number(e.target.value))} />
      </label>
      <label>Energy ({energyLevel}/10)
        <input type="range" min="1" max="10" value={energyLevel} onChange={e => setEnergyLevel(Number(e.target.value))} />
      </label>
      <button className="drawer-submit-btn" disabled={busy || !content.trim()} onClick={() => onSubmit({ content, moodScore, energyLevel })}>
        Save entry
      </button>
    </Drawer>
  );
}

function ProjectDrawer({ busy, onClose, onSubmit }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: { name: string; lifeArea: string; intention: string }) => void;
}) {
  const [name, setName] = useState("");
  const [lifeArea, setLifeArea] = useState("career");
  const [intention, setIntention] = useState("");
  return (
    <Drawer title="New thread" onClose={onClose}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Thread name" />
      <select value={lifeArea} onChange={e => setLifeArea(e.target.value)}>
        {["career", "health", "relationships", "creativity", "finances", "learning", "other"].map(a => (
          <option value={a} key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
        ))}
      </select>
      <textarea value={intention} onChange={e => setIntention(e.target.value)} placeholder="What should this protect or move forward?" />
      <button className="drawer-submit-btn" disabled={busy || !name.trim()} onClick={() => onSubmit({ name, lifeArea, intention })}>
        Start thread
      </button>
    </Drawer>
  );
}

function ReminderDrawer({ busy, onClose, onSubmit }: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (r: { title: string; scheduledTime: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  return (
    <Drawer title="Set reminder" onClose={onClose}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Reminder title" />
      <input type="time" value={time} onChange={e => setTime(e.target.value)} />
      <button className="drawer-submit-btn" disabled={busy || !title.trim() || !time} onClick={() => {
        const today = new Date().toISOString().slice(0, 10);
        onSubmit({ title: title.trim(), scheduledTime: `${today}T${time}:00` });
      }}>
        Set reminder
      </button>
    </Drawer>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

const container = document.getElementById("root")!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const root = (window as any).__lifeOsRoot ?? createRoot(container);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__lifeOsRoot = root;
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
