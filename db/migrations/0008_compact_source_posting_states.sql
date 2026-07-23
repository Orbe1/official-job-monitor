ALTER TABLE jobs ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0
  CHECK (review_required IN (0, 1));

UPDATE jobs
SET review_required = COALESCE((
  SELECT CASE
    WHEN json_extract(js.normalized_payload_json, '$.classification.reviewRequired') = 1 THEN 1
    ELSE 0
  END
  FROM job_snapshots js
  WHERE js.job_id = jobs.id
    AND json_extract(js.normalized_payload_json, '$.classification.reviewRequired') IS NOT NULL
  ORDER BY js.observed_at DESC
  LIMIT 1
), 0);

CREATE TABLE source_posting_states (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  external_job_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  classification_state TEXT NOT NULL
    CHECK (classification_state IN ('included', 'review_required', 'excluded')),
  source_published_at TEXT,
  source_updated_at TEXT,
  source_publication_checked_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'active'
    CHECK (availability IN ('active', 'closure_pending', 'closed')),
  missing_successful_runs INTEGER NOT NULL DEFAULT 0
    CHECK (missing_successful_runs >= 0),
  closure_candidate_since TEXT,
  last_closure_confirmation_at TEXT,
  closed_at TEXT,
  reopened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_id, external_job_id),
  CHECK (availability <> 'closed' OR closed_at IS NOT NULL),
  CHECK (availability <> 'closure_pending' OR closure_candidate_since IS NOT NULL)
) WITHOUT ROWID;

CREATE INDEX source_posting_states_lifecycle_idx
  ON source_posting_states(source_id, availability, last_seen_at DESC);

INSERT INTO source_posting_states (
  id, source_id, external_job_id, content_hash, classification_state,
  source_published_at, source_updated_at, source_publication_checked_at,
  first_seen_at, last_seen_at, availability, missing_successful_runs,
  closure_candidate_since, last_closure_confirmation_at, closed_at,
  reopened_at, created_at, updated_at
)
SELECT
  id,
  source_id,
  external_job_id,
  COALESCE(snapshot_hash, 'legacy:' || id),
  CASE
    WHEN is_relevant = 1 THEN 'included'
    WHEN review_required = 1 THEN 'review_required'
    ELSE 'excluded'
  END,
  source_published_at,
  source_updated_at,
  source_publication_checked_at,
  first_seen_at,
  last_seen_at,
  availability,
  missing_successful_runs,
  closure_candidate_since,
  (SELECT MAX(js.observed_at)
     FROM job_snapshots js
    WHERE js.job_id = jobs.id
      AND js.change_kind = 'closure_candidate'),
  closed_at,
  reopened_at,
  created_at,
  updated_at
FROM jobs;

ALTER TABLE jobs ADD COLUMN source_posting_state_id TEXT
  REFERENCES source_posting_states(id) ON DELETE RESTRICT;

UPDATE jobs
SET source_posting_state_id = id;

CREATE UNIQUE INDEX jobs_source_posting_state_idx
  ON jobs(source_posting_state_id)
  WHERE source_posting_state_id IS NOT NULL;

CREATE TEMP TABLE compact_excluded_job_ids (
  id TEXT PRIMARY KEY
) WITHOUT ROWID;

INSERT INTO compact_excluded_job_ids (id)
SELECT j.id
FROM jobs j
WHERE j.is_sample = 0
  AND j.is_relevant = 0
  AND j.review_required = 0
  AND NOT EXISTS (
    SELECT 1 FROM user_job_states ujs WHERE ujs.job_id = j.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM emerging_candidate_jobs ecj WHERE ecj.job_id = j.id
  );

DELETE FROM job_locations
WHERE job_id IN (SELECT id FROM compact_excluded_job_ids);

DELETE FROM job_snapshots
WHERE job_id IN (SELECT id FROM compact_excluded_job_ids);

DELETE FROM job_history_events
WHERE job_id IN (SELECT id FROM compact_excluded_job_ids);

DELETE FROM jobs
WHERE id IN (SELECT id FROM compact_excluded_job_ids);

DROP TABLE compact_excluded_job_ids;
