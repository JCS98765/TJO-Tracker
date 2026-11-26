-- One JSON document per collection (people, tasks, rules, decisions, events, seats, users, history).
CREATE TABLE IF NOT EXISTS kv (
  name       text PRIMARY KEY,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
