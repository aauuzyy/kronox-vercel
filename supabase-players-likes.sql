-- ── Players table (global leaderboard) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id            text PRIMARY KEY,
  display_name  text    DEFAULT '',
  total_score   bigint  DEFAULT 0,
  games_played  integer DEFAULT 0,
  best_accuracy integer DEFAULT 0,
  best_grade    text    DEFAULT 'C',
  total_perfect bigint  DEFAULT 0,
  total_good    bigint  DEFAULT 0,
  total_bad     bigint  DEFAULT 0,
  total_miss    bigint  DEFAULT 0,
  updated_at    timestamptz DEFAULT now()
);

-- Add display_name to existing tables
ALTER TABLE players ADD COLUMN IF NOT EXISTS display_name text DEFAULT '';

-- Allow anon to read + upsert (via RPC)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "players_read"   ON players;
DROP POLICY IF EXISTS "players_upsert" ON players;
CREATE POLICY "players_read"   ON players FOR SELECT USING (true);
CREATE POLICY "players_upsert" ON players FOR ALL    USING (true) WITH CHECK (true);

-- RPC: atomically add one game result to a player row
CREATE OR REPLACE FUNCTION add_player_result(
  p_id           text,
  p_display_name text DEFAULT '',
  p_score        bigint  DEFAULT 0,
  p_accuracy     integer DEFAULT 0,
  p_grade        text    DEFAULT 'C',
  p_perfect      bigint  DEFAULT 0,
  p_good         bigint  DEFAULT 0,
  p_bad          bigint  DEFAULT 0,
  p_miss         bigint  DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  grade_rank jsonb := '{"S+":5,"S":4,"A":3,"B":2,"C":1}';
BEGIN
  INSERT INTO players (id, display_name, total_score, games_played, best_accuracy, best_grade,
                       total_perfect, total_good, total_bad, total_miss)
  VALUES (p_id, p_display_name, p_score, 1, p_accuracy, p_grade,
          p_perfect, p_good, p_bad, p_miss)
  ON CONFLICT (id) DO UPDATE SET
    display_name  = p_display_name,
    total_score   = players.total_score   + p_score,
    games_played  = players.games_played  + 1,
    best_accuracy = GREATEST(players.best_accuracy, p_accuracy),
    best_grade    = CASE
      WHEN (grade_rank->>p_grade)::int > (grade_rank->>players.best_grade)::int
      THEN p_grade ELSE players.best_grade END,
    total_perfect = players.total_perfect + p_perfect,
    total_good    = players.total_good    + p_good,
    total_bad     = players.total_bad     + p_bad,
    total_miss    = players.total_miss    + p_miss,
    updated_at    = now();
END;
$$;


-- ── Likes table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS likes (
  chart_id uuid REFERENCES charts(id) ON DELETE CASCADE,
  guest_id text,
  PRIMARY KEY (chart_id, guest_id)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "likes_read"  ON likes;
DROP POLICY IF EXISTS "likes_write" ON likes;
CREATE POLICY "likes_read"   ON likes FOR SELECT USING (true);
CREATE POLICY "likes_write"  ON likes FOR ALL    USING (true) WITH CHECK (true);

-- Add likes column to charts if missing
ALTER TABLE charts ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0;

-- RPC: toggle like and update counter atomically
CREATE OR REPLACE FUNCTION toggle_like(p_chart_id uuid, p_guest_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE already boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM likes WHERE chart_id = p_chart_id AND guest_id = p_guest_id
  ) INTO already;

  IF already THEN
    DELETE FROM likes WHERE chart_id = p_chart_id AND guest_id = p_guest_id;
    UPDATE charts SET likes = GREATEST(0, likes - 1) WHERE id = p_chart_id;
    RETURN false;
  ELSE
    INSERT INTO likes (chart_id, guest_id) VALUES (p_chart_id, p_guest_id);
    UPDATE charts SET likes = likes + 1 WHERE id = p_chart_id;
    RETURN true;
  END IF;
END;
$$;
