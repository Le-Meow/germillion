-- Compact completed results; triggers keep summaries atomic with the accepted answer.
CREATE TABLE results (
  id TEXT PRIMARY KEY, player TEXT NOT NULL, day TEXT NOT NULL, mode TEXT NOT NULL,
  prompt_key TEXT NOT NULL, mb INTEGER NOT NULL CHECK(mb BETWEEN 0 AND 1024),
  challenge TEXT, attacker TEXT, infection REAL NOT NULL, recipient TEXT, completed INTEGER NOT NULL
);
CREATE INDEX result_player ON results(player,mode,day);
CREATE INDEX result_defender ON results(player,completed) WHERE mode='challenge';
CREATE INDEX result_attacker ON results(attacker,completed) WHERE mode='challenge';
CREATE INDEX result_recipient ON results(recipient,completed) WHERE recipient IS NOT NULL;
CREATE INDEX challenge_run ON runs(json_extract(state,'$.challenge'),created DESC) WHERE mode='challenge';
CREATE INDEX feedback_player ON feedback(player,created);
CREATE TABLE attack_members (
  run TEXT NOT NULL, player TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(run,player)
);
CREATE INDEX attack_member_recent ON attack_members(player,created DESC);
CREATE TRIGGER attack_member_insert AFTER INSERT ON runs WHEN NEW.mode='challenge' BEGIN
  INSERT OR IGNORE INTO attack_members VALUES(NEW.id,NEW.player,NEW.created);
  INSERT OR IGNORE INTO attack_members SELECT NEW.id,player,NEW.created FROM runs WHERE id=json_extract(NEW.state,'$.challenge');
END;
CREATE TRIGGER attack_member_delete AFTER DELETE ON runs BEGIN DELETE FROM attack_members WHERE run=OLD.id; END;
INSERT OR IGNORE INTO attack_members SELECT id,player,created FROM runs WHERE mode='challenge';
INSERT OR IGNORE INTO attack_members SELECT r.id,t.player,r.created FROM runs r JOIN runs t ON t.id=json_extract(r.state,'$.challenge') WHERE r.mode='challenge';
CREATE TABLE daily_totals (
  day TEXT NOT NULL, prompt_key TEXT NOT NULL, mb INTEGER NOT NULL,
  players INTEGER NOT NULL CHECK(players>=0), PRIMARY KEY(day,prompt_key,mb)
);
CREATE TABLE rivalries (
  player TEXT NOT NULL, rival TEXT NOT NULL, win INTEGER NOT NULL DEFAULT 0,
  loss INTEGER NOT NULL DEFAULT 0, draw INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(player,rival)
);
CREATE TRIGGER daily_insert AFTER INSERT ON results WHEN NEW.mode='daily' BEGIN
  INSERT INTO daily_totals VALUES(NEW.day,NEW.prompt_key,NEW.mb,1) ON CONFLICT(day,prompt_key,mb) DO UPDATE SET players=players+1;
END;
CREATE TRIGGER rivalry_insert AFTER INSERT ON results WHEN NEW.mode='challenge' AND NEW.attacker IS NOT NULL BEGIN
  INSERT INTO rivalries VALUES(NEW.player,NEW.attacker,NEW.infection<50,NEW.infection>50,NEW.infection=50) ON CONFLICT(player,rival) DO UPDATE SET win=win+excluded.win,loss=loss+excluded.loss,draw=draw+excluded.draw;
  INSERT INTO rivalries VALUES(NEW.attacker,NEW.player,NEW.infection>50,NEW.infection<50,NEW.infection=50) ON CONFLICT(player,rival) DO UPDATE SET win=win+excluded.win,loss=loss+excluded.loss,draw=draw+excluded.draw;
END;
CREATE TRIGGER daily_delete AFTER DELETE ON results WHEN OLD.mode='daily' BEGIN
  UPDATE daily_totals SET players=players-1 WHERE day=OLD.day AND prompt_key=OLD.prompt_key AND mb=OLD.mb;
  DELETE FROM daily_totals WHERE day=OLD.day AND prompt_key=OLD.prompt_key AND mb=OLD.mb AND players=0;
END;
CREATE TRIGGER rivalry_delete AFTER DELETE ON results WHEN OLD.mode='challenge' AND OLD.attacker IS NOT NULL BEGIN
  UPDATE rivalries SET win=win-(OLD.infection<50),loss=loss-(OLD.infection>50),draw=draw-(OLD.infection=50) WHERE player=OLD.player AND rival=OLD.attacker;
  DELETE FROM rivalries WHERE player=OLD.player AND rival=OLD.attacker AND win+loss+draw=0;
  UPDATE rivalries SET win=win-(OLD.infection>50),loss=loss-(OLD.infection<50),draw=draw-(OLD.infection=50) WHERE player=OLD.attacker AND rival=OLD.player;
  DELETE FROM rivalries WHERE player=OLD.attacker AND rival=OLD.player AND win+loss+draw=0;
END;
CREATE TRIGGER result_insert AFTER INSERT ON runs WHEN NEW.score IS NOT NULL AND json_extract(NEW.state,'$.status')='complete' BEGIN
  INSERT INTO results SELECT NEW.id,NEW.player,NEW.day,NEW.mode,json_extract(NEW.state,'$.prompts'),CAST(round(COALESCE((SELECT sum(json_extract(value,'$.points')) FROM json_each(NEW.state,'$.answers')),0)*1024/100.0) AS INTEGER),json_extract(NEW.state,'$.challenge'),(SELECT player FROM runs WHERE id=json_extract(NEW.state,'$.challenge')),round(100-COALESCE((SELECT sum(json_extract(value,'$.attack')) FROM json_each(NEW.state,'$.answers')),0),1),json_extract(NEW.state,'$.recipient'),COALESCE(json_extract(NEW.state,'$.completedAt'),NEW.created);
END;
CREATE TRIGGER result_update AFTER UPDATE OF state,score ON runs
WHEN OLD.score IS NOT NEW.score OR (NEW.score IS NOT NULL AND OLD.state IS NOT NEW.state) BEGIN
  DELETE FROM results WHERE id=OLD.id;
  INSERT INTO results SELECT NEW.id,NEW.player,NEW.day,NEW.mode,json_extract(NEW.state,'$.prompts'),CAST(round(COALESCE((SELECT sum(json_extract(value,'$.points')) FROM json_each(NEW.state,'$.answers')),0)*1024/100.0) AS INTEGER),json_extract(NEW.state,'$.challenge'),(SELECT player FROM runs WHERE id=json_extract(NEW.state,'$.challenge')),round(100-COALESCE((SELECT sum(json_extract(value,'$.attack')) FROM json_each(NEW.state,'$.answers')),0),1),json_extract(NEW.state,'$.recipient'),COALESCE(json_extract(NEW.state,'$.completedAt'),NEW.created) WHERE NEW.score IS NOT NULL AND json_extract(NEW.state,'$.status')='complete';
END;
CREATE TRIGGER result_delete AFTER DELETE ON runs BEGIN DELETE FROM results WHERE id=OLD.id; END;
-- Backfill historical runs once. The aggregate triggers also run during backfill.
INSERT INTO results SELECT r.id,r.player,r.day,r.mode,json_extract(r.state,'$.prompts'),CAST(round(COALESCE((SELECT sum(json_extract(value,'$.points')) FROM json_each(r.state,'$.answers')),0)*1024/100.0) AS INTEGER),json_extract(r.state,'$.challenge'),(SELECT player FROM runs WHERE id=json_extract(r.state,'$.challenge')),round(100-COALESCE((SELECT sum(json_extract(value,'$.attack')) FROM json_each(r.state,'$.answers')),0),1),json_extract(r.state,'$.recipient'),COALESCE(json_extract(r.state,'$.completedAt'),r.created) FROM runs r WHERE r.score IS NOT NULL AND json_extract(r.state,'$.status')='complete';
