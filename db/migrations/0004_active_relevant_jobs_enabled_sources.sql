-- Public discovery must only expose roles from sources that are actively enabled.
-- Tracker remains a separate user-state query so saved and application history can
-- stay visible after a source is disabled.

DROP VIEW active_relevant_jobs;

CREATE VIEW active_relevant_jobs AS
SELECT j.*
FROM jobs AS j
JOIN sources AS s ON s.id = j.source_id
WHERE j.availability = 'active'
  AND j.is_relevant = 1
  AND s.enabled = 1;
