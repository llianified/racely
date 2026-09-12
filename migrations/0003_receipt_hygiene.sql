-- Action receipts exist to make a retried request idempotent: the (user_id,
-- request_id) primary key is the whole mechanism. The `response` column stored a
-- full GameState snapshot that nothing ever reads back -- performGameAction
-- recomputes the state on replay so the player never sees stale balances.
--
-- That snapshot embeds the player's withdrawal history, so once a player has
-- withdrawn once, every later action (a colour change, an upgrade, a boost)
-- copied their bank/e-wallet number and account holder name into this table
-- again. Make the column optional, purge what is already stored, and stop
-- writing it.
ALTER TABLE racely_action_receipts ALTER COLUMN response DROP NOT NULL;
--> statement-breakpoint
UPDATE racely_action_receipts SET response = NULL WHERE response IS NOT NULL;
--> statement-breakpoint
-- Receipts are pruned on a retention window, which needs an index on the age.
CREATE INDEX IF NOT EXISTS racely_action_receipts_created_idx
  ON racely_action_receipts (created_at);
--> statement-breakpoint
-- The withdrawal history query filters on user_id and sorts by created_at desc.
-- racely_withdrawals_user_idx (user_id) could not serve the sort, and it is a
-- prefix of the existing (user_id, request_id) unique index anyway.
CREATE INDEX IF NOT EXISTS racely_withdrawals_user_recent_idx
  ON racely_withdrawals (user_id, created_at DESC);
--> statement-breakpoint
DROP INDEX IF EXISTS racely_withdrawals_user_idx;
--> statement-breakpoint
-- Redundant: leading column of the (user_id, request_id) primary key.
DROP INDEX IF EXISTS racely_action_receipts_user_idx;
--> statement-breakpoint
-- Redundant: leading column of the racely_reward_claims_key_unique constraint.
DROP INDEX IF EXISTS racely_reward_claims_user_idx;
