-- Preserve the original jobs.technical_category constraint for compatibility
-- while allowing a more precise, additive category vocabulary. Rebuilding the
-- jobs table would risk its tracker, snapshot, history, and notification FKs.

CREATE TABLE technical_category_codes (
  code TEXT PRIMARY KEY
) WITHOUT ROWID;

INSERT INTO technical_category_codes (code) VALUES
  ('software'),
  ('backend'),
  ('frontend'),
  ('full_stack'),
  ('infrastructure'),
  ('support'),
  ('networking'),
  ('security'),
  ('machine_learning'),
  ('data'),
  ('quant'),
  ('embedded'),
  ('robotics');

ALTER TABLE jobs
  ADD COLUMN effective_technical_category TEXT
  REFERENCES technical_category_codes(code);

UPDATE jobs
SET effective_technical_category = technical_category;

CREATE INDEX jobs_effective_category_idx
  ON jobs(audience, effective_technical_category, availability);
