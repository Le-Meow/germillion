  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, player TEXT NOT NULL, day TEXT NOT NULL,
    mode TEXT NOT NULL, state TEXT NOT NULL, score REAL, created INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS daily_player ON runs(player,day) WHERE mode='daily';
  CREATE INDEX IF NOT EXISTS completed_day ON runs(day,mode,score);
  CREATE INDEX IF NOT EXISTS player_runs ON runs(player,created);
  CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', skin INTEGER, recovery TEXT UNIQUE, seen INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, player TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, player TEXT NOT NULL, created INTEGER NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, run TEXT, round INTEGER, answer TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS defence_player ON runs(player,json_extract(state,'$.challenge')) WHERE mode='challenge';
