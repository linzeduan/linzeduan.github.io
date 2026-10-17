-- Test markers only; never put private answers in this probe database.
CREATE TABLE IF NOT EXISTS network_probe (
  actor TEXT PRIMARY KEY CHECK (actor IN ('a', 'b')),
  marker TEXT NOT NULL CHECK (marker = 'between-answers-network-probe'),
  checked_at TEXT NOT NULL,
  checks INTEGER NOT NULL DEFAULT 1
);
