ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;

-- One row per guest creation, keyed by a hash of the client address, to enforce the hourly limit.
CREATE TABLE guest_creations (
  addr_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX guest_creations_addr_time ON guest_creations (addr_hash, created_at);

-- Guest cleanup looks up guests by age without scanning registered users.
CREATE INDEX users_guests_by_age ON users (created_at) WHERE is_guest = 1;
