CREATE TABLE IF NOT EXISTS fleetgraph_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  document_type TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  leased_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleetgraph_jobs_one_pending_per_document_idx
  ON fleetgraph_jobs(document_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS fleetgraph_jobs_one_running_per_document_idx
  ON fleetgraph_jobs(document_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS fleetgraph_jobs_pending_lookup_idx
  ON fleetgraph_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS fleetgraph_jobs_workspace_status_idx
  ON fleetgraph_jobs(workspace_id, status, created_at);

CREATE INDEX IF NOT EXISTS fleetgraph_jobs_document_history_idx
  ON fleetgraph_jobs(document_id, updated_at DESC);
