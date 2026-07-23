-- Keep the constrained legacy jobs.technical_category value as `data` while
-- allowing precise persisted classification through effective_technical_category.

INSERT INTO technical_category_codes (code) VALUES ('data_science');
