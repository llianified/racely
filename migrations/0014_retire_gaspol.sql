-- Run manually after deploying the matching application. Existing balances,
-- laps and claimed rewards are preserved; no player or bot accounts are created.
UPDATE racely_players
SET boost_ends_at = NULL, cooldown_ends_at = NULL
WHERE boost_ends_at IS NOT NULL OR cooldown_ends_at IS NOT NULL;

-- Preserve the remaining daily tasks exactly, including claimed flags and rewards.
-- The next daily reset creates two tasks: laps and racing income.
UPDATE racely_players
SET daily_missions = jsonb_set(daily_missions, '{items}', (
  SELECT COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
  FROM jsonb_array_elements(daily_missions->'items') WITH ORDINALITY AS tasks(item, ordinal)
  WHERE item->>'kind' IN ('laps', 'earn')
))
WHERE daily_missions IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(daily_missions->'items') AS item
    WHERE item->>'kind' IN ('boosts', 'clean')
  );
