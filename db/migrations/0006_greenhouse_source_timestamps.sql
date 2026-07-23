-- Keep official source timestamps separate from InternJobs observation time.
-- posted_at remains as a compatibility alias while source_published_at is the
-- canonical first-party publication timestamp.

ALTER TABLE jobs ADD COLUMN source_published_at TEXT;
ALTER TABLE jobs ADD COLUMN source_updated_at TEXT;
ALTER TABLE jobs ADD COLUMN source_publication_checked_at TEXT;

UPDATE jobs
SET source_published_at = posted_at,
    source_publication_checked_at = CASE
      WHEN posted_at IS NOT NULL THEN updated_at
      ELSE NULL
    END;

CREATE INDEX jobs_source_published_idx
  ON jobs(source_published_at DESC)
  WHERE source_published_at IS NOT NULL;
