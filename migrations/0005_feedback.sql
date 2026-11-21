-- Player feedback ("Góp ý"). Plain text only. client_key is a hash of the client address, never the
-- address itself; it also drives the per-client rate limit (counted over this table).
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  contact TEXT,
  user_id TEXT,
  room_code TEXT,
  path TEXT,
  viewport TEXT,
  user_agent TEXT,
  client_key TEXT NOT NULL
);

CREATE INDEX feedback_client_time ON feedback (client_key, created_at);
