-- InternJobs relational foundation.
--
-- This migration is intentionally append-only. Future schema changes belong in a
-- new numbered migration; never edit an applied migration in a deployed database.
-- Timestamps are stored as ISO-8601 UTC text. SQLite booleans are constrained
-- INTEGER values. JSON columns are named with a `_json` suffix.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'development'
    CHECK (mode IN ('development', 'authenticated')),
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL COLLATE NOCASE UNIQUE,
  career_url TEXT NOT NULL,
  logo_url TEXT,
  initials TEXT NOT NULL,
  category_tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(category_tags_json) AND json_type(category_tags_json) = 'array'),
  supported_role_types_json TEXT NOT NULL DEFAULT '["internship","new_grad"]'
    CHECK (json_valid(supported_role_types_json) AND json_type(supported_role_types_json) = 'array'),
  compensation_signal TEXT,
  compensation_disclaimer TEXT,
  priority_tier INTEGER NOT NULL DEFAULT 3 CHECK (priority_tier BETWEEN 1 AND 5),
  monitoring_state TEXT NOT NULL DEFAULT 'stale'
    CHECK (monitoring_state IN ('healthy', 'degraded', 'failing', 'stale', 'unsupported')),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE watchlist_groups (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  group_type TEXT NOT NULL DEFAULT 'curated'
    CHECK (group_type IN ('curated', 'personal')),
  compensation_signal INTEGER NOT NULL DEFAULT 0 CHECK (compensation_signal IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (group_type = 'curated' AND owner_user_id IS NULL) OR
    (group_type = 'personal' AND owner_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX watchlist_groups_curated_slug_unique
  ON watchlist_groups(slug)
  WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX watchlist_groups_personal_slug_unique
  ON watchlist_groups(owner_user_id, slug)
  WHERE owner_user_id IS NOT NULL;

CREATE TABLE watchlist_group_companies (
  group_id TEXT NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, company_id)
) WITHOUT ROWID;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  adapter_kind TEXT NOT NULL
    CHECK (adapter_kind IN ('greenhouse', 'ashby', 'lever', 'workday', 'smartrecruiters', 'icims', 'custom')),
  official_url TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(config_json) AND json_type(config_json) = 'object'),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  health TEXT NOT NULL DEFAULT 'stale'
    CHECK (health IN ('healthy', 'degraded', 'failing', 'stale', 'unsupported')),
  expected_interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (expected_interval_minutes > 0),
  minimum_request_interval_ms INTEGER NOT NULL DEFAULT 1000 CHECK (minimum_request_interval_ms >= 0),
  request_timeout_ms INTEGER NOT NULL DEFAULT 15000 CHECK (request_timeout_ms > 0),
  closure_confirmation_runs INTEGER NOT NULL DEFAULT 2 CHECK (closure_confirmation_runs >= 2),
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  http_status INTEGER,
  parser_status TEXT NOT NULL DEFAULT 'not_run'
    CHECK (parser_status IN ('ok', 'warning', 'error', 'not_run')),
  parser_version TEXT NOT NULL DEFAULT 'unversioned',
  pages_retrieved INTEGER NOT NULL DEFAULT 0 CHECK (pages_retrieved >= 0),
  total_jobs INTEGER NOT NULL DEFAULT 0 CHECK (total_jobs >= 0),
  previous_total_jobs INTEGER NOT NULL DEFAULT 0 CHECK (previous_total_jobs >= 0),
  relevant_jobs INTEGER NOT NULL DEFAULT 0 CHECK (relevant_jobs >= 0),
  last_new_role_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  suspicious_flags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(suspicious_flags_json) AND json_type(suspicious_flags_json) = 'array'),
  error_details TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, official_url)
);

CREATE INDEX sources_company_idx ON sources(company_id);
CREATE INDEX sources_health_idx ON sources(health, enabled);
CREATE INDEX sources_due_idx ON sources(enabled, last_attempt_at);

CREATE TABLE source_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('running', 'success', 'degraded', 'failed', 'unsupported')),
  completeness TEXT NOT NULL DEFAULT 'unknown'
    CHECK (completeness IN ('complete', 'partial', 'unknown')),
  closure_eligible INTEGER NOT NULL DEFAULT 0 CHECK (closure_eligible IN (0, 1)),
  http_status INTEGER,
  transport_status TEXT,
  parser_status TEXT NOT NULL DEFAULT 'not_run'
    CHECK (parser_status IN ('ok', 'warning', 'error', 'not_run')),
  parser_version TEXT NOT NULL DEFAULT 'unversioned',
  pages_retrieved INTEGER NOT NULL DEFAULT 0 CHECK (pages_retrieved >= 0),
  total_jobs INTEGER NOT NULL DEFAULT 0 CHECK (total_jobs >= 0),
  previous_total_jobs INTEGER NOT NULL DEFAULT 0 CHECK (previous_total_jobs >= 0),
  relevant_jobs INTEGER NOT NULL DEFAULT 0 CHECK (relevant_jobs >= 0),
  new_jobs INTEGER NOT NULL DEFAULT 0 CHECK (new_jobs >= 0),
  changed_jobs INTEGER NOT NULL DEFAULT 0 CHECK (changed_jobs >= 0),
  missing_jobs INTEGER NOT NULL DEFAULT 0 CHECK (missing_jobs >= 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  response_hash TEXT,
  diagnostics_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(diagnostics_json) AND json_type(diagnostics_json) = 'array'),
  suspicious_flags_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(suspicious_flags_json) AND json_type(suspicious_flags_json) = 'array'),
  error_details TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (closure_eligible = 0 OR (status = 'success' AND completeness = 'complete'))
);

CREATE INDEX source_runs_source_started_idx ON source_runs(source_id, started_at DESC);
CREATE INDEX source_runs_status_started_idx ON source_runs(status, started_at DESC);

CREATE TABLE source_incidents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  source_run_id TEXT REFERENCES source_runs(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT,
  resolution_notes TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status <> 'resolved' OR resolved_at IS NOT NULL)
);

CREATE INDEX source_incidents_open_idx ON source_incidents(status, severity, opened_at DESC);
CREATE INDEX source_incidents_source_idx ON source_incidents(source_id, opened_at DESC);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  external_job_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  application_url TEXT NOT NULL,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('internship', 'new_grad', 'ambiguous')),
  technical_category TEXT NOT NULL
    CHECK (technical_category IN ('software', 'backend', 'frontend', 'full_stack', 'infrastructure', 'security', 'machine_learning', 'data', 'quant', 'embedded', 'robotics')),
  employment_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  responsibilities_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(responsibilities_json) AND json_type(responsibilities_json) = 'array'),
  requirements_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(requirements_json) AND json_type(requirements_json) = 'array'),
  preferred_qualifications_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(preferred_qualifications_json) AND json_type(preferred_qualifications_json) = 'array'),
  eligibility TEXT,
  graduation_requirements TEXT,
  work_authorization TEXT,
  location_text TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'US',
  work_arrangement TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (work_arrangement IN ('remote', 'hybrid', 'onsite', 'unspecified')),
  compensation_minimum REAL,
  compensation_maximum REAL,
  compensation_currency TEXT NOT NULL DEFAULT 'USD',
  compensation_period TEXT NOT NULL DEFAULT 'unknown'
    CHECK (compensation_period IN ('hour', 'year', 'month', 'unknown')),
  compensation_display_text TEXT NOT NULL DEFAULT 'Not disclosed',
  compensation_is_estimate INTEGER NOT NULL DEFAULT 0 CHECK (compensation_is_estimate IN (0, 1)),
  compensation_source TEXT NOT NULL DEFAULT 'unknown'
    CHECK (compensation_source IN ('company', 'historical', 'unknown')),
  posted_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  closed_at TEXT,
  reopened_at TEXT,
  last_source_check_at TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'active'
    CHECK (availability IN ('active', 'closure_pending', 'closed')),
  is_relevant INTEGER NOT NULL DEFAULT 1 CHECK (is_relevant IN (0, 1)),
  classification_confidence REAL NOT NULL
    CHECK (classification_confidence BETWEEN 0 AND 1),
  source_confidence REAL NOT NULL CHECK (source_confidence BETWEEN 0 AND 1),
  snapshot_hash TEXT,
  identity_fingerprint TEXT,
  missing_successful_runs INTEGER NOT NULL DEFAULT 0 CHECK (missing_successful_runs >= 0),
  closure_candidate_since TEXT,
  historical_context TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_id, external_job_id),
  CHECK (compensation_minimum IS NULL OR compensation_maximum IS NULL OR compensation_minimum <= compensation_maximum),
  CHECK (availability <> 'closed' OR closed_at IS NOT NULL),
  CHECK (availability <> 'closure_pending' OR closure_candidate_since IS NOT NULL)
);

CREATE INDEX jobs_active_scan_idx
  ON jobs(availability, is_relevant, first_seen_at DESC);
CREATE INDEX jobs_company_availability_idx
  ON jobs(company_id, availability, first_seen_at DESC);
CREATE INDEX jobs_source_availability_idx
  ON jobs(source_id, availability, last_seen_at DESC);
CREATE INDEX jobs_audience_category_idx
  ON jobs(audience, technical_category, availability);
CREATE INDEX jobs_posted_idx ON jobs(posted_at DESC) WHERE posted_at IS NOT NULL;

CREATE TABLE job_locations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  display_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (job_id, display_text)
);

CREATE INDEX job_locations_job_idx ON job_locations(job_id, sort_order);
CREATE INDEX job_locations_region_idx ON job_locations(country, region, city);

CREATE TABLE job_snapshots (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_run_id TEXT REFERENCES source_runs(id) ON DELETE SET NULL,
  observed_at TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  change_kind TEXT NOT NULL
    CHECK (change_kind IN ('first_seen', 'unchanged', 'changed', 'closure_candidate', 'closed', 'reopened')),
  normalized_payload_json TEXT NOT NULL
    CHECK (json_valid(normalized_payload_json) AND json_type(normalized_payload_json) = 'object'),
  raw_payload_json TEXT
    CHECK (raw_payload_json IS NULL OR json_valid(raw_payload_json)),
  parser_version TEXT NOT NULL,
  evidence_type TEXT NOT NULL DEFAULT 'first_party'
    CHECK (evidence_type IN ('first_party', 'secondary_archive')),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (job_id, observed_at, snapshot_hash)
);

CREATE INDEX job_snapshots_job_observed_idx ON job_snapshots(job_id, observed_at DESC);
CREATE INDEX job_snapshots_run_idx ON job_snapshots(source_run_id);

CREATE TABLE job_history_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  source_run_id TEXT REFERENCES source_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('first_seen', 'changed', 'closure_pending', 'closed', 'reopened', 'historical_cycle')),
  title TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('internship', 'new_grad', 'ambiguous')),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  observed_days_open INTEGER CHECK (observed_days_open IS NULL OR observed_days_open >= 0),
  observed_at TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  evidence_type TEXT NOT NULL DEFAULT 'first_party'
    CHECK (evidence_type IN ('first_party', 'secondary_archive')),
  source_label TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX job_history_job_opened_idx ON job_history_events(job_id, opened_at DESC);
CREATE INDEX job_history_company_cycles_idx ON job_history_events(evidence_type, opened_at DESC);

CREATE TABLE company_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  followed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, company_id)
) WITHOUT ROWID;

CREATE INDEX company_follows_company_idx ON company_follows(company_id, user_id);

CREATE TABLE user_job_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
  stage TEXT CHECK (stage IS NULL OR stage IN ('saved', 'applied', 'online_assessment', 'interview', 'offer', 'rejected', 'withdrawn')),
  notes TEXT NOT NULL DEFAULT '',
  applied_at TEXT,
  next_action_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id),
  CHECK (saved = 1 OR stage IS NOT NULL OR notes <> '' OR applied_at IS NOT NULL OR next_action_at IS NOT NULL)
) WITHOUT ROWID;

CREATE INDEX user_job_states_tracker_idx ON user_job_states(user_id, stage, updated_at DESC);

CREATE TABLE application_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('saved', 'stage_changed', 'note_updated', 'next_action_set', 'application_date_set')),
  from_stage TEXT CHECK (from_stage IS NULL OR from_stage IN ('saved', 'applied', 'online_assessment', 'interview', 'offer', 'rejected', 'withdrawn')),
  to_stage TEXT CHECK (to_stage IS NULL OR to_stage IN ('saved', 'applied', 'online_assessment', 'interview', 'offer', 'rejected', 'withdrawn')),
  notes TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id, job_id) REFERENCES user_job_states(user_id, job_id) ON DELETE CASCADE
);

CREATE INDEX application_events_state_idx ON application_events(user_id, job_id, occurred_at DESC);

CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  criteria_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(criteria_json) AND json_type(criteria_json) = 'object'),
  channels_json TEXT NOT NULL DEFAULT '["in_app"]'
    CHECK (json_valid(channels_json) AND json_type(channels_json) = 'array'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_matched_at TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1))
);

CREATE INDEX alert_rules_user_enabled_idx ON alert_rules(user_id, enabled, updated_at DESC);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_rule_id TEXT REFERENCES alert_rules(id) ON DELETE SET NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('new_job', 'reopened_job', 'source_health', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'in_app'
    CHECK (delivery_status IN ('in_app', 'development_email', 'delivered', 'failed')),
  data_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(data_json) AND json_type(data_json) = 'object'),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1))
);

CREATE INDEX notifications_user_unread_idx ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX notifications_job_idx ON notifications(job_id, created_at DESC);

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
  provider TEXT NOT NULL,
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'development_only', 'delivered', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TEXT,
  delivered_at TEXT,
  provider_message_id TEXT,
  error_details TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (notification_id, channel, provider)
);

CREATE INDEX notification_deliveries_status_idx
  ON notification_deliveries(status, created_at);

CREATE TABLE emerging_candidates (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  company_domain TEXT NOT NULL COLLATE NOCASE,
  logo_url TEXT,
  candidate_kind TEXT NOT NULL DEFAULT 'company'
    CHECK (candidate_kind IN ('company', 'posting')),
  reason TEXT NOT NULL,
  discovery_source TEXT NOT NULL,
  official_verification_source TEXT,
  discovered_at TEXT NOT NULL,
  verified_at TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'verified', 'rejected', 'promoted')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  review_notes TEXT,
  promoted_at TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (review_status NOT IN ('verified', 'promoted') OR (verified_at IS NOT NULL AND official_verification_source IS NOT NULL)),
  CHECK (review_status <> 'promoted' OR (promoted_at IS NOT NULL AND company_id IS NOT NULL))
);

CREATE INDEX emerging_candidates_review_idx
  ON emerging_candidates(review_status, confidence DESC, discovered_at DESC);
CREATE INDEX emerging_candidates_domain_idx ON emerging_candidates(company_domain);

CREATE TABLE emerging_evidence (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES emerging_candidates(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL
    CHECK (evidence_type IN ('user_submission', 'secondary_list', 'compensation', 'funding', 'official_source', 'ats_board', 'manual')),
  source_name TEXT NOT NULL,
  source_url TEXT,
  description TEXT NOT NULL,
  is_official INTEGER NOT NULL DEFAULT 0 CHECK (is_official IN (0, 1)),
  discovered_at TEXT NOT NULL,
  verified_at TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details_json) AND json_type(details_json) = 'object'),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX emerging_evidence_candidate_idx
  ON emerging_evidence(candidate_id, is_official DESC, discovered_at DESC);

CREATE TABLE emerging_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES emerging_candidates(id) ON DELETE CASCADE,
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('pending', 'verified', 'rejected', 'promoted')),
  notes TEXT NOT NULL DEFAULT '',
  official_verification_source TEXT,
  confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  reviewed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX emerging_reviews_candidate_idx
  ON emerging_reviews(candidate_id, reviewed_at DESC);

CREATE TABLE emerging_candidate_jobs (
  candidate_id TEXT NOT NULL REFERENCES emerging_candidates(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  linked_at TEXT NOT NULL,
  link_reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (candidate_id, job_id)
) WITHOUT ROWID;

CREATE INDEX emerging_candidate_jobs_job_idx ON emerging_candidate_jobs(job_id, candidate_id);

-- The view makes the primary Explore invariant explicit. It intentionally excludes
-- closure-pending records; Tracker queries must join user_job_states instead.
CREATE VIEW active_relevant_jobs AS
SELECT *
FROM jobs
WHERE availability = 'active' AND is_relevant = 1;
