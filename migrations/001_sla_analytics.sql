-- =============================================================================
-- Migration 001: SLA Engine + Analytics Materialized Views
-- Run with: psql $DATABASE_URL -f migrations/001_sla_analytics.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Prerequisites: enable PostGIS for heatmap clustering
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ---------------------------------------------------------------------------
-- 1. Issues table (canonical schema — matches in-memory store shape)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  description    TEXT        NOT NULL,
  category       TEXT        NOT NULL CHECK (category IN ('roads','sanitation','water','electricity','parks','safety','other')),
  status         TEXT        NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','in_progress','resolved','closed','rejected')),
  priority       TEXT        NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high','critical')),
  location_address TEXT,
  location_lat   DOUBLE PRECISION,
  location_lng   DOUBLE PRECISION,
  geom           GEOMETRY(Point, 4326),   -- PostGIS point, populated via trigger
  attachments    TEXT[]      DEFAULT '{}',
  reported_by    UUID        NOT NULL,
  assigned_to    UUID,
  first_response_at TIMESTAMPTZ,          -- set when status first leaves 'open'
  resolved_at    TIMESTAMPTZ,             -- set when status = 'resolved'
  closed_at      TIMESTAMPTZ,             -- set when status = 'closed'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issues_category   ON issues (category);
CREATE INDEX IF NOT EXISTS idx_issues_status     ON issues (status);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues (created_at);
CREATE INDEX IF NOT EXISTS idx_issues_geom       ON issues USING GIST (geom);

-- Auto-populate geom from lat/lng
CREATE OR REPLACE FUNCTION issues_set_geom()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.location_lat IS NOT NULL AND NEW.location_lng IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.location_lng, NEW.location_lat), 4326);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issues_geom ON issues;
CREATE TRIGGER trg_issues_geom
  BEFORE INSERT OR UPDATE OF location_lat, location_lng ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_set_geom();

-- Auto-set timestamp fields when status changes
CREATE OR REPLACE FUNCTION issues_set_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    -- First time the issue moves off 'open'
    IF OLD.status = 'open' AND NEW.first_response_at IS NULL THEN
      NEW.first_response_at := now();
    END IF;
    IF NEW.status = 'resolved' AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
    IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issues_timestamps ON issues;
CREATE TRIGGER trg_issues_timestamps
  BEFORE UPDATE OF status ON issues
  FOR EACH ROW EXECUTE FUNCTION issues_set_timestamps();

-- ---------------------------------------------------------------------------
-- 2. Issue history table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id          UUID        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  action            TEXT        NOT NULL,
  field             TEXT,
  old_value         TEXT,
  new_value         TEXT,
  performed_by      UUID        NOT NULL,
  performed_by_name TEXT        NOT NULL,
  performed_by_role TEXT        NOT NULL,
  note              TEXT,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_issue_id ON issue_history (issue_id);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON issue_history (timestamp);

-- ---------------------------------------------------------------------------
-- 3. SLA Configuration table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sla_config (
  id             SERIAL PRIMARY KEY,
  category       TEXT        NOT NULL UNIQUE
                   CHECK (category IN ('roads','sanitation','water','electricity','parks','safety','other')),
  sla_hours      NUMERIC(6,2) NOT NULL CHECK (sla_hours > 0),
  updated_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default SLA hours per category
INSERT INTO sla_config (category, sla_hours) VALUES
  ('roads',       48),
  ('sanitation',  24),
  ('water',       12),
  ('electricity', 12),
  ('parks',       72),
  ('safety',       6),
  ('other',       48)
ON CONFLICT (category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. SLA Escalation Events log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sla_escalation_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    UUID        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL,
  sla_hours   NUMERIC(6,2) NOT NULL,
  elapsed_hours NUMERIC(8,2) NOT NULL,
  breach_at   TIMESTAMPTZ NOT NULL,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reassigned_to UUID,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalation_issue_id ON sla_escalation_events (issue_id);
CREATE INDEX IF NOT EXISTS idx_escalation_at ON sla_escalation_events (escalated_at);

-- ---------------------------------------------------------------------------
-- 5. Users table (for FK completeness; mirrors in-memory UserStore)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'citizen'
                  CHECK (role IN ('citizen','official','supervisor')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. Materialized Views (refreshed hourly)
-- ---------------------------------------------------------------------------

-- 6a. Summary view: totals, resolved %, avg resolution time overall + per category
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_analytics_summary AS
SELECT
  COUNT(*)                                              AS total_issues,
  COUNT(*) FILTER (WHERE status IN ('resolved','closed')) AS resolved_count,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 2
  )                                                     AS resolved_pct,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0
  ) FILTER (WHERE resolved_at IS NOT NULL), 2)          AS avg_resolution_hours_overall
FROM issues
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_analytics_summary
  ON mv_analytics_summary ((1));   -- single-row view needs a unique index to refresh concurrently

-- 6b. Per-category breakdown
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_analytics_by_category AS
SELECT
  category,
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE status IN ('resolved','closed')) AS resolved_count,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::NUMERIC
    / NULLIF(COUNT(*), 0) * 100, 2
  )                                                     AS resolved_pct,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0
  ) FILTER (WHERE resolved_at IS NOT NULL), 2)          AS avg_resolution_hours,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600.0
  ) FILTER (WHERE first_response_at IS NOT NULL), 2)    AS avg_first_response_hours
FROM issues
GROUP BY category
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_by_category
  ON mv_analytics_by_category (category);

-- 6c. Status funnel breakdown
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_analytics_by_status AS
SELECT
  status,
  COUNT(*) AS total
FROM issues
GROUP BY status
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_by_status
  ON mv_analytics_by_status (status);

-- 6d. Daily time-series of avg first-response and resolution times
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_analytics_response_time AS
SELECT
  date_trunc('day', created_at)::DATE           AS day,
  COUNT(*)                                       AS issues_created,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600.0
  ) FILTER (WHERE first_response_at IS NOT NULL), 2) AS avg_first_response_hours,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0
  ) FILTER (WHERE resolved_at IS NOT NULL), 2)   AS avg_resolution_hours
FROM issues
GROUP BY date_trunc('day', created_at)::DATE
ORDER BY day
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_response_time
  ON mv_analytics_response_time (day);

-- 6e. Heatmap: KMeans cluster centres (k=20) with issue counts
--     ST_ClusterKMeans returns cluster IDs per row; we aggregate centroids here.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_analytics_heatmap AS
WITH clustered AS (
  SELECT
    id,
    geom,
    category,
    ST_ClusterKMeans(geom, 20) OVER () AS cluster_id
  FROM issues
  WHERE geom IS NOT NULL
)
SELECT
  cluster_id,
  ST_AsGeoJSON(ST_Centroid(ST_Collect(geom)))::json AS centroid_geojson,
  COUNT(*)                                           AS issue_count,
  array_agg(DISTINCT category)                       AS categories
FROM clustered
GROUP BY cluster_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_heatmap
  ON mv_analytics_heatmap (cluster_id);

-- ---------------------------------------------------------------------------
-- 7. Refresh helper function (called by the Node cron each hour)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analytics_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analytics_by_category;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analytics_by_status;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analytics_response_time;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_analytics_heatmap;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grant read access on views to the API read-only role (optional)
-- ---------------------------------------------------------------------------
-- GRANT SELECT ON mv_analytics_summary      TO civic_api_ro;
-- GRANT SELECT ON mv_analytics_by_category  TO civic_api_ro;
-- GRANT SELECT ON mv_analytics_by_status    TO civic_api_ro;
-- GRANT SELECT ON mv_analytics_response_time TO civic_api_ro;
-- GRANT SELECT ON mv_analytics_heatmap      TO civic_api_ro;
