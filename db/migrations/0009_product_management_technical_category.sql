-- Keep the constrained legacy jobs.technical_category value as `software`
-- while allowing precise persisted classification through
-- effective_technical_category.

INSERT INTO technical_category_codes (code) VALUES ('product_management');
