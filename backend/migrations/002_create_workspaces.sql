-- Migration: Create workspaces table
-- Description: Stores workspace configurations and container metadata

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  container_id VARCHAR(100),
  container_status VARCHAR(20) DEFAULT 'stopped',
  api_key VARCHAR(64) UNIQUE NOT NULL,
  cpu_limit VARCHAR(10) DEFAULT '1.0',
  memory_limit VARCHAR(10) DEFAULT '512m',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_started_at TIMESTAMP,
  UNIQUE(user_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_api_key ON workspaces(api_key);
CREATE INDEX IF NOT EXISTS idx_workspaces_container_status ON workspaces(container_status);

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Check constraint for valid container status values
ALTER TABLE workspaces
  ADD CONSTRAINT check_container_status
  CHECK (container_status IN ('stopped', 'running', 'error', 'creating'));
