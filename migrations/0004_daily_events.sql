-- Launch funnel: one row per UTC day, event and acquisition source, holding a count.
-- No user id, address or name is stored.
CREATE TABLE daily_events (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  source TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, source)
) WITHOUT ROWID;
