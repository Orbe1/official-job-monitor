-- Durable source scheduling for local/private workers.
--
-- A NULL next_poll_at means an enabled source has never been scheduled and is
-- immediately due. Leases are recoverable: another worker may claim a source
-- after lease_expires_at, even if the original worker stopped unexpectedly.

ALTER TABLE sources ADD COLUMN next_poll_at TEXT;
ALTER TABLE sources ADD COLUMN lease_owner TEXT;
ALTER TABLE sources ADD COLUMN lease_expires_at TEXT;

CREATE INDEX sources_schedule_due_idx
  ON sources(enabled, next_poll_at, lease_expires_at);

CREATE INDEX sources_schedule_lease_idx
  ON sources(lease_owner, lease_expires_at)
  WHERE lease_owner IS NOT NULL;
