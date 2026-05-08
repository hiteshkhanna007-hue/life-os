CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    locale TEXT NOT NULL DEFAULT 'en-US',
    preferences JSONB NOT NULL DEFAULT '{}',
    ai_settings JSONB NOT NULL DEFAULT '{}',
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (LENGTH(name) BETWEEN 1 AND 100),
    description TEXT,
    color TEXT NOT NULL DEFAULT '#7C5CFC',
    icon TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    start_date TIMESTAMPTZ,
    target_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    life_area TEXT NOT NULL DEFAULT 'other' CHECK (life_area IN ('health', 'career', 'relationships', 'creativity', 'finances', 'learning', 'other')),
    ai_health_score INT CHECK (ai_health_score BETWEEN 0 AND 100),
    ai_risk_flags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_project_dates CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date)
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (LENGTH(title) BETWEEN 1 AND 500),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled', 'archived')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
    is_important BOOLEAN NOT NULL DEFAULT FALSE,
    due_date TIMESTAMPTZ,
    due_time TIME,
    start_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    estimated_pomodoros INT CHECK (estimated_pomodoros BETWEEN 1 AND 50),
    actual_pomodoros INT NOT NULL DEFAULT 0,
    estimated_duration INT,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    energy_required TEXT CHECK (energy_required IN ('low', 'medium', 'high')),
    scheduled_block_id UUID,
    calendar_event_id TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'voice_capture', 'ai_suggested', 'calendar_import', 'recurring')),
    capture_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT valid_dates CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
    CONSTRAINT completed_has_date CHECK (status != 'done' OR completed_at IS NOT NULL)
);

CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_user_due ON tasks(user_id, due_date);
CREATE INDEX idx_tasks_user_priority ON tasks(user_id, priority);

CREATE TABLE calendar_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    block_type TEXT NOT NULL DEFAULT 'task' CHECK (block_type IN ('task', 'meeting', 'focus', 'break', 'personal', 'travel')),
    is_external BOOLEAN NOT NULL DEFAULT FALSE,
    external_event_id TEXT,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    recurrence_rule TEXT,
    recurring_event_id UUID,
    ai_optimized BOOLEAN NOT NULL DEFAULT FALSE,
    ai_rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_times CHECK (end_time > start_time),
    CONSTRAINT no_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
);

ALTER TABLE tasks
  ADD CONSTRAINT tasks_scheduled_block_fk FOREIGN KEY (scheduled_block_id) REFERENCES calendar_blocks(id) ON DELETE SET NULL;

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('quick_mood', 'structured', 'freeform', 'event_linked', 'voice_transcribed')),
    title TEXT,
    content TEXT NOT NULL CHECK (LENGTH(content) BETWEEN 1 AND 50000),
    mood_score INT CHECK (mood_score BETWEEN -5 AND 5),
    mood_emoji TEXT,
    energy_level INT CHECK (energy_level BETWEEN 1 AND 10),
    context JSONB NOT NULL DEFAULT '{}',
    ai_analysis JSONB,
    linked_task_ids UUID[] NOT NULL DEFAULT '{}',
    linked_calendar_block_ids UUID[] NOT NULL DEFAULT '{}',
    linked_project_ids UUID[] NOT NULL DEFAULT '{}',
    attachments JSONB NOT NULL DEFAULT '[]',
    capture_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_user_date ON journal_entries(user_id, created_at DESC);

CREATE TABLE mood_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mood_score INT NOT NULL CHECK (mood_score BETWEEN -5 AND 5),
    mood_emoji TEXT NOT NULL,
    energy_level INT NOT NULL CHECK (energy_level BETWEEN 1 AND 10),
    note TEXT,
    expanded_to_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE focus_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    planned_duration INT NOT NULL CHECK (planned_duration BETWEEN 5 AND 180),
    actual_duration INT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    self_rated_focus INT CHECK (self_rated_focus BETWEEN 1 AND 5),
    interruption_count INT NOT NULL DEFAULT 0,
    interruption_reasons TEXT[] NOT NULL DEFAULT '{}',
    environment JSONB NOT NULL DEFAULT '{}',
    ai_insight TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT one_active_per_user EXCLUDE USING gist (user_id WITH =) WHERE (status = 'active'),
    CONSTRAINT valid_duration CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('time', 'context', 'smart')),
    scheduled_time TIMESTAMPTZ,
    recurrence_rule TEXT,
    smart_trigger JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'triggered', 'dismissed', 'completed', 'snoozed')),
    triggered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    snoozed_until TIMESTAMPTZ,
    action_type TEXT NOT NULL DEFAULT 'notification' CHECK (action_type IN ('notification', 'open_app', 'start_focus', 'create_task')),
    action_payload JSONB NOT NULL DEFAULT '{}',
    capture_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT has_trigger CHECK (scheduled_time IS NOT NULL OR recurrence_rule IS NOT NULL OR smart_trigger IS NOT NULL)
);

CREATE TABLE quick_captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    input_type TEXT NOT NULL CHECK (input_type IN ('voice', 'text', 'photo', 'share_extension')),
    raw_input TEXT NOT NULL,
    audio_url TEXT,
    photo_url TEXT,
    classification JSONB NOT NULL,
    user_confirmed_at TIMESTAMPTZ,
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    created_task_ids UUID[] NOT NULL DEFAULT '{}',
    created_journal_entry_ids UUID[] NOT NULL DEFAULT '{}',
    created_reminder_ids UUID[] NOT NULL DEFAULT '{}',
    created_project_ids UUID[] NOT NULL DEFAULT '{}',
    captured_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ,
    device_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE weekly_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    stats JSONB NOT NULL,
    ai_narrative JSONB NOT NULL,
    user_reflection TEXT,
    user_rating INT CHECK (user_rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, week_start_date)
);

CREATE TABLE sync_states (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMPTZ,
    client_last_sync_at TIMESTAMPTZ,
    sync_version INT NOT NULL DEFAULT 0,
    pending_changes JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('command', 'query', 'event', 'response', 'error')),
    payload JSONB NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    requires_ack BOOLEAN NOT NULL DEFAULT FALSE,
    correlation_id UUID,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_messages_correlation ON agent_messages(correlation_id);
CREATE INDEX idx_agent_messages_timestamp ON agent_messages(timestamp DESC);
