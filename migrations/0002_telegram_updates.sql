CREATE TABLE IF NOT EXISTS racely_telegram_updates (
  update_id bigint PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS racely_telegram_updates_received_idx ON racely_telegram_updates(received_at);
