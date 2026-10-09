-- Up Migration

-- Baseline schema. IF NOT EXISTS adopts databases that earlier versions of
-- the application created themselves at startup.
CREATE TABLE IF NOT EXISTS todos (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE todos;
