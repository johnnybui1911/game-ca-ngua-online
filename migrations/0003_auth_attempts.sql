-- One row per sign-in or sign-up attempt, keyed by a hash of the limited subject (email or client
-- address) so no email or address is stored. Rows older than their window are pruned on each claim.
CREATE TABLE auth_attempts (
  kind TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX auth_attempts_key_time ON auth_attempts (kind, key_hash, created_at);

-- Pruning deletes by kind and age.
CREATE INDEX auth_attempts_kind_time ON auth_attempts (kind, created_at);
