-- Student-facing setup preferences. Company-specific delivery timing remains
-- encoded in alert criteria so the existing alert engine stays authoritative.

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_completed IN (0, 1)),
  opportunity_focus TEXT NOT NULL DEFAULT 'both'
    CHECK (opportunity_focus IN ('internship', 'new_grad', 'both')),
  technical_interests_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(technical_interests_json) AND json_type(technical_interests_json) = 'array'),
  preferred_locations_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(preferred_locations_json) AND json_type(preferred_locations_json) = 'array'),
  remote_preferred INTEGER NOT NULL DEFAULT 0 CHECK (remote_preferred IN (0, 1)),
  default_notification_frequency TEXT NOT NULL DEFAULT 'immediate'
    CHECK (default_notification_frequency IN ('immediate', 'daily', 'off')),
  last_visit_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
