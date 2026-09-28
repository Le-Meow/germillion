import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { data, today, dailyPrompts, publicPrompt, grade, suggestions, topFive, totalScore, totalMB, MAX_MB, distribution, attackPoints, ROUND_MS, ROUNDS, streakSummary } from './game.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || resolve(root, 'var/germillion.sqlite');
await mkdir(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, player TEXT NOT NULL, day TEXT NOT NULL,
    mode TEXT NOT NULL, state TEXT NOT NULL, score REAL, created INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS daily_player ON runs(player,day) WHERE mode='daily';
  CREATE INDEX IF NOT EXISTS completed_day ON runs(day,mode,score);
  CREATE INDEX IF NOT EXISTS player_runs ON runs(player,created);
  CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', skin INTEGER, recovery TEXT UNIQUE, seen INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, player TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, player TEXT NOT NULL, created INTEGER NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, run TEXT, round INTEGER, answer TEXT);`);
const token = () => randomBytes(18).toString('base64url');
const getRun = id => {
  const row = db.prepare('SELECT state FROM runs WHERE id=?').get(id);
  return row ? JSON.parse(row.state) : null;
};
function save(run) {
  db.prepare('UPDATE runs SET state=?,score=? WHERE id=?').run(JSON.stringify(run), run.status === 'complete' ? totalScore(run.answers) : null, run.id);
}
function finishAnswer(run, answer, expired) {
  if (run.status !== 'question') return;
  const result = grade(run.prompts[run.answers.length], answer, expired);
  if (!result.valid && !expired) return false;
  if (run.challenge) {
    const target = getRun(run.challenge);
    result.opponent = target.answers[run.answers.length];
    result.attack = attackPoints(result, result.opponent);
  }
  run.answers.push(result);
  run.deadline = null;
  run.status = run.answers.length === ROUNDS ? 'complete' : 'reveal';
  if (run.status === 'complete') { run.completedAt = Date.now(); if (run.counterOf) run.sharedAt = Date.now(); }
  save(run);
  return true;
}
function stats(run) {
  const scores = db.prepare("SELECT score,state FROM runs WHERE day=? AND mode='daily' AND score IS NOT NULL").all(run.day)
    .map(r => JSON.parse(r.state)).filter(r => JSON.stringify(r.prompts) === JSON.stringify(run.prompts)).map(r => totalMB(r.answers));
  return distribution(scores, totalMB(run.answers), MAX_MB);
}
function streak(player) {
  return streakSummary(db.prepare("SELECT day FROM runs WHERE player=? AND mode='daily' AND score IS NOT NULL").all(player).map(r => r.day), today()).streak;
}
function profile(player) {
  const rows = db.prepare("SELECT day,state FROM runs WHERE player=? AND mode='daily' AND score IS NOT NULL ORDER BY day").all(player);
  const yesterday = new Date(`${today()}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const scores = rows.map(r => totalMB(JSON.parse(r.state).answers));
  const identity = db.prepare('SELECT name,skin,recovery,seen FROM players WHERE id=?').get(player);
  const old = rows.find(r => r.day === yesterday.toISOString().slice(0, 10));
  return { best: scores.length ? Math.max(...scores) : null, played: scores.length, average: scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null,
    yesterday: old ? totalMB(JSON.parse(old.state).answers) : null, ...streakSummary(rows.map(r=>r.day), today()),
    name: identity?.name || '', skin: identity?.skin ?? null, recoverable: Boolean(identity?.recovery), unseen: attackLog(player).unseen };
}
const displayName = player => db.prepare('SELECT name FROM players WHERE id=?').get(player)?.name || 'Someone';
function matchRecord(run, player) {
  const target = getRun(run.challenge), complete = run.status === 'complete';
  const sent = target.player === player;
  const infection = complete ? Math.round(run.answers.reduce((s,a)=>s+attackPoints(a.opponent,a),0)*10)/10 : null;
  const won = infection === 50 ? 'draw' : (sent ? infection > 50 : infection < 50) ? 'win' : 'loss';
  return { id: run.id, link: target.id, sent, day: run.day, name: displayName(sent ? run.player : target.player), rival: createHash('sha256').update(sent ? run.player : target.player).digest('hex').slice(0,16),
    status: complete ? 'complete' : 'playing', infection, result: complete ? won : null, updated: run.completedAt || 0,
    sectors: complete ? run.answers.map((a,i)=>({ question: publicPrompt(run.prompts[i]).title, axis: publicPrompt(run.prompts[i]).axis, attacker: a.opponent.name || 'Timed out', defender: a.name || 'Timed out', outcome: a.attack > 14 ? 'blocked' : a.attack > 0 ? 'split' : 'infected' })) : [] };
}
function attackLog(player) {
  // ponytail: JSON-backed match records suit this local build; index a dedicated match table at scale.
  const all = db.prepare("SELECT r.state FROM runs r JOIN runs t ON json_extract(r.state,'$.challenge')=t.id WHERE r.mode='challenge' AND (r.player=? OR t.player=?) ORDER BY r.created DESC").all(player,player).map(r=>matchRecord(JSON.parse(r.state),player));
  const matches=all.slice(0,200), totals={win:0,loss:0,draw:0}, rivals=new Map();
  for(const m of all)if(m.status==='complete'){totals[m.result]++;const rival=rivals.get(m.rival)||{name:m.name,win:0,loss:0,draw:0};rival[m.result]++;rivals.set(m.rival,rival);}
  const seen = db.prepare('SELECT seen FROM players WHERE id=?').get(player)?.seen || 0;
  const links = db.prepare("SELECT id,state FROM runs WHERE player=? AND score IS NOT NULL AND (json_extract(state,'$.sharedAt') IS NOT NULL OR json_extract(state,'$.name') IS NOT NULL) ORDER BY created DESC LIMIT 100").all(player).map(r=>({id:r.id,day:JSON.parse(r.state).day, megabytes:totalMB(JSON.parse(r.state).answers)}));
  const incoming = db.prepare("SELECT state FROM runs WHERE json_extract(state,'$.recipient')=? AND score IS NOT NULL ORDER BY created DESC LIMIT 100").all(player).map(r=>JSON.parse(r.state)).filter(r=>!all.some(m=>m.link===r.id&&!m.sent)).map(r=>({id:r.id, name:displayName(r.player), day:r.day, updated:r.completedAt||0}));
  return { matches, totals, rivals:[...rivals.values()], links, incoming, through:Date.now(), unseen: all.filter(m=>m.status==='complete'&&m.updated>seen).length + incoming.filter(r=>r.updated>seen).length };
}
function snapshot(run) {
  if (run.status === 'question' && Date.now() >= run.deadline) finishAnswer(run, '', true);
  const complete = run.status === 'complete';
  // Carry rounding through the journey, so displayed gains sum to the final MB.
  const answers = run.answers.map((a, i) => ({ ...a, megabytes: totalMB(run.answers.slice(0, i + 1)) - totalMB(run.answers.slice(0, i)) }));
  return {
    id: run.id, day: run.day, mode: run.mode, status: run.status, round: run.answers.length,
    deadline: run.deadline, readyAt: run.readyAt || 0, serverTime: Date.now(), score: totalScore(run.answers), megabytes: totalMB(run.answers),
    trace: answers.map((a, i) => ({ name: a.name || 'Timed out', valid: a.valid, fraction: a.fraction, megabytes: a.megabytes, position: totalMB(run.answers.slice(0, i + 1)) })),
    prompt: run.status === 'question' ? publicPrompt(run.prompts[run.answers.length]) : null,
    last: answers.length ? { ...answers.at(-1), prompt: publicPrompt(run.prompts[answers.length - 1]) } : null,
    challenge: run.challenge ? { source: run.challenge, name: displayName(getRun(run.challenge).player), infection: Math.round(run.answers.reduce((s, a) => s + attackPoints(a.opponent,a), 0) * 10) / 10 } : null,
    counterOf: run.counterOf || null, reused: Boolean(run.reused),
    ...(complete ? {
      answers: answers.map((a, i) => ({ ...a, prompt: publicPrompt(run.prompts[i]), top: topFive(run.prompts[i]) })),
      stats: stats(run), streak: streak(run.player), name: run.name || '',
    } : {}),
  };
}
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/world.js', ['world.js', 'text/javascript; charset=utf-8']],
  ['/chart.js', ['chart.js', 'text/javascript; charset=utf-8']],
  ['/assets/486.png', ['assets/486.png', 'image/png']],
  ['/assets/sprites.png', ['assets/sprites.png', 'image/png']],
  ['/assets/skins.png', ['assets/skins.png', 'image/png']],
  ['/assets/tiers.png', ['assets/tiers.png', 'image/png']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/font.ttf', ['font.ttf', 'font/ttf']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
for (const path of ['/archive','/virus','/attacks','/settings','/help','/feedback','/privacy']) files.set(path, files.get('/'));
const recoveryHash = code => createHash('sha256').update(code).digest('hex');
const recoverAttempts = new Map();
function cookie(res, req, id) {
  res.setHeader('Set-Cookie', `germillion=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.PUBLIC_ORIGIN?.startsWith('https:') || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
}
function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function problem(status, message) { return Object.assign(new Error(message), { status }); }
async function body(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw problem(413, 'That request is too large.');
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed;
  }
  catch { throw problem(400, 'Invalid request.'); }
}
// ponytail: anonymous cookie identity is suitable for a prototype, not a cheat-proof leaderboard.
// Add account identity and edge rate limits when opening ranked competition to a large audience.
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      const file = files.get(url.pathname);
      if (req.method !== 'GET' || !file) { res.writeHead(404); res.end('Not found'); return; }
      const content = await readFile(resolve(root, 'public', file[0]));
      res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
      res.end(content); return;
    }
    if (req.method === 'POST') {
      const expectedOrigin = process.env.PUBLIC_ORIGIN || `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
      if ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') throw problem(403, 'Open Germillion directly to play.');
      if (!req.headers['content-type']?.startsWith('application/json')) throw problem(415, 'Send JSON.');
    }
    let player = (req.headers.cookie || '').match(/(?:^|;\s*)germillion=([A-Za-z0-9_-]{24})(?:;|$)/)?.[1];
    if (!player) {
      player = token();
      cookie(res,req,player);
    }
    player = db.prepare('SELECT player FROM sessions WHERE id=?').get(player)?.player || player;
    db.prepare('INSERT OR IGNORE INTO players(id) VALUES(?)').run(player);
    if (url.pathname === '/api/profile') {
      if (req.method === 'POST') {
        const input = await body(req);
        if (input.name !== undefined) {
          if (typeof input.name !== 'string' || input.name.trim().length > 24) throw problem(400,'Use a name of up to 24 characters.');
          db.prepare('UPDATE players SET name=? WHERE id=?').run(input.name.replace(/[\x00-\x1f\x7f]/g,'').trim(),player);
        }
        if (input.skin !== undefined) {
          if (!Number.isInteger(input.skin) || input.skin<0 || input.skin>4 || [0,3,7,14,30][input.skin]>profile(player).longest) throw problem(400,'That skin is still locked.');
          db.prepare('UPDATE players SET skin=? WHERE id=?').run(input.skin,player);
        }
      } else if(req.method!=='GET') throw problem(405,'Method not allowed.');
      const history = db.prepare('SELECT id,day,mode,state FROM runs WHERE player=? ORDER BY created DESC LIMIT 100').all(player).map(r=>({id:r.id,day:r.day,mode:r.mode,status:JSON.parse(r.state).status,megabytes:totalMB(JSON.parse(r.state).answers)}));
      const archive=db.prepare("SELECT id,day,state FROM runs WHERE player=? AND mode IN ('daily','archive') ORDER BY (score IS NOT NULL) DESC,created DESC").all(player).map(r=>({id:r.id,day:r.day,status:JSON.parse(r.state).status,megabytes:totalMB(JSON.parse(r.state).answers)}));
      return send(res,200,{...profile(player), history,archive});
    }
    if (url.pathname === '/api/recovery' && req.method === 'POST') {
      const code = randomBytes(24).toString('base64url');
      db.prepare('UPDATE players SET recovery=? WHERE id=?').run(recoveryHash(code),player);
      return send(res,200,{code});
    }
    if (url.pathname === '/api/recover' && req.method === 'POST') {
      const key=req.socket.remoteAddress, now=Date.now();
      for(const [k,v] of recoverAttempts) if(now-v.at>600000) recoverAttempts.delete(k);
      const attempt=recoverAttempts.get(key)||{at:now,count:0}; attempt.count++; recoverAttempts.set(key,attempt);
      if(attempt.count>20) throw problem(429,'Too many recovery attempts. Try again in ten minutes.');
      const input=await body(req), code=typeof input.code==='string'?input.code.trim():'';
      const identity=/^[\w-]{32}$/.test(code)?db.prepare('SELECT id FROM players WHERE recovery=?').get(recoveryHash(code)):null;
      if(!identity) throw problem(400,'Recovery code not recognised.');
      const session=token(); db.prepare('INSERT INTO sessions(id,player) VALUES(?,?)').run(session,identity.id); cookie(res,req,session);
      return send(res,200,{restored:true});
    }
    if (url.pathname === '/api/attacks' && req.method === 'GET') return send(res,200,attackLog(player));
    if (url.pathname === '/api/attacks/seen' && req.method === 'POST') {
      const input=await body(req);if(!Number.isFinite(input.through))throw problem(400,'Missing log timestamp.');
      db.prepare('UPDATE players SET seen=max(seen,?) WHERE id=?').run(Math.min(Date.now(),input.through),player); return send(res,200,{ok:true});
    }
    if (url.pathname === '/api/feedback' && req.method === 'POST') {
      const input=await body(req);
      if(!['answer','bug','question','other'].includes(input.kind)||typeof input.message!=='string'||!input.message.trim()||input.message.length>2000) throw problem(400,'Choose a feedback type and write up to 2,000 characters.');
      if(db.prepare('SELECT count(*) AS n FROM feedback WHERE player=? AND created>?').get(player,Date.now()-86400000).n>=20) throw problem(429,'Feedback saved for today. Please try again tomorrow.');
      if(input.run){if(typeof input.run!=='string')throw problem(400,'Question not found.');const owned=getRun(input.run); if(!owned||owned.player!==player||!Number.isInteger(input.round)||input.round<0||input.round>=7||input.round>owned.answers.length) throw problem(400,'Question not found.');}
      if(input.answer!==undefined&&(typeof input.answer!=='string'||input.answer.length>160))throw problem(400,'Answer is too long.');
      const id=token();db.prepare('INSERT INTO feedback VALUES(?,?,?,?,?,?,?,?)').run(id,player,Date.now(),input.kind,input.message.trim(),input.run||null,input.run?input.round:null,input.answer||null);
      return send(res,201,{id});
    }
    if (url.pathname === '/api/today' && req.method === 'GET') {
      const row = db.prepare("SELECT id FROM runs WHERE player=? AND day=? AND mode='daily'").get(player, today());
      return send(res, 200, { day: today(), serverTime:Date.now(), resetAt:Date.parse(`${today()}T00:00:00Z`)+86400000, version: data.version, run: row ? snapshot(getRun(row.id)) : null, ...profile(player) });
    }
    const challengeMatch = url.pathname.match(/^\/api\/challenge\/([A-Za-z0-9_-]{24})$/);
    if (challengeMatch && req.method === 'GET') {
      const target = getRun(challengeMatch[1]);
      if (!target || target.status !== 'complete') throw problem(404, 'This virus link was not found.');
      return send(res, 200, { name: displayName(target.player), day: target.day });
    }
    if (url.pathname === '/api/run' && req.method === 'POST') {
      const input = await body(req);
      const mode = input.mode || 'daily';
      if (!['daily', 'practice', 'archive', 'challenge'].includes(mode)) throw problem(400, 'Unknown game mode.');
      let day = today(), target;
      if (mode === 'archive') {
        if (typeof input.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw problem(400, 'Choose a valid date.');
        const parsed = new Date(`${input.day}T00:00:00Z`);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input.day || input.day < '2026-09-27' || input.day >= today()) throw problem(400, 'Choose a past day since September 27, 2026.');
        day = input.day;
      }
      if (mode === 'challenge') {
        if (typeof input.challenge !== 'string') throw problem(400, 'Missing virus link.');
        target = getRun(input.challenge);
        if (!target || target.status !== 'complete') throw problem(404, 'This virus link was not found.');
        if(target.player===player) throw problem(400,'That is your own virus. Send the link to a friend.');
        day = target.day;
      }
      if (mode === 'daily') {
        const existing = db.prepare("SELECT id FROM runs WHERE player=? AND day=? AND mode='daily'").get(player, day);
        if (existing) return send(res, 200, snapshot(getRun(existing.id)));
      }
      if (mode === 'challenge') {
        const previous = db.prepare("SELECT state FROM runs WHERE player=? AND mode='challenge'").all(player).map(r => JSON.parse(r.state)).find(r => r.challenge === target.id);
        if (previous) return send(res, 200, snapshot(previous));
        const daily=db.prepare("SELECT state FROM runs WHERE player=? AND day=? AND mode='daily'").get(player,day);
        if(daily){const current=getRun(JSON.parse(daily.state).id);if(current.status!=='complete'&&JSON.stringify(current.prompts)===JSON.stringify(target.prompts))throw problem(409,'Finish your daily first. We will use those answers to defend this attack.');}
      }
      const recent = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE player=? AND created>?').get(player, Date.now() - 3_600_000).n;
      if (recent >= 30) throw problem(429, 'Too many new runs. Come back in a little while.');
      const id = token();
      const run = { id, player, day, mode, status: 'ready', prompts: target?.prompts || dailyPrompts(mode === 'practice' ? id : day), answers: [], deadline: null, challenge: target?.id || null };
      if(input.counterOf){
        const previous=getRun(input.counterOf);
        if(mode!=='practice'||!previous||previous.player!==player||!previous.challenge||previous.status!=='complete') throw problem(400,'Finish defending before launching a counterattack.');
        run.counterOf=previous.id;run.recipient=getRun(previous.challenge).player;
        run.prompts=dailyPrompts(id,previous.prompts);
      }
      if(target){
        const first=db.prepare("SELECT state FROM runs WHERE player=? AND mode='daily' AND score IS NOT NULL ORDER BY created").all(player).map(r=>JSON.parse(r.state)).find(r=>JSON.stringify(r.prompts)===JSON.stringify(target.prompts)&&r.day===target.day);
        if(first){run.answers=first.answers.map((a,i)=>({...a,opponent:target.answers[i],attack:attackPoints(a,target.answers[i])}));run.status='complete';run.completedAt=Date.now();run.reused=true;}
      }
      db.prepare('INSERT INTO runs(id,player,day,mode,state,created) VALUES(?,?,?,?,?,?)').run(id, player, day, mode, JSON.stringify(run), Date.now());
      if(run.status==='complete')save(run);
      return send(res, 201, snapshot(run));
    }
    const match = url.pathname.match(/^\/api\/run\/([A-Za-z0-9_-]{24})(?:\/(start|answer|share))?$/);
    if (match) {
      const input = req.method === 'POST' ? await body(req) : {};
      const run = getRun(match[1]);
      if (!run || run.player !== player) throw problem(404, 'Run not found on this browser.');
      if (req.method === 'GET' && !match[2]) return send(res, 200, snapshot(run));
      if (req.method !== 'POST') throw problem(405, 'Method not allowed.');
      if (match[2] === 'start') {
        if (!Number.isInteger(input.round) || input.round < 0 || input.round > ROUNDS - 1) throw problem(400, 'Invalid question.');
        if (input.round > run.answers.length) throw problem(409, 'Finish the current question first.');
        if (input.round === run.answers.length && (run.status === 'ready' || run.status === 'reveal')) {
          run.status = 'question'; run.readyAt = Date.now() + 3000; run.deadline = run.readyAt + ROUND_MS; save(run);
        }
      } else if (match[2] === 'answer') {
        if (!Number.isInteger(input.round) || input.round < 0 || input.round > ROUNDS - 1) throw problem(400, 'Invalid question.');
        if (input.round === run.answers.length) {
          if (run.status !== 'question') throw problem(409, 'Start this question first.');
          if (typeof input.answer !== 'string' || input.answer.length > 160) throw problem(400, 'Keep your answer under 160 characters.');
          const answer = input.answer.trim();
          if (!finishAnswer(run, answer, Date.now() >= run.deadline)) {
            const choices = suggestions(run.prompts[run.answers.length], answer);
            const state = snapshot(run);
            return send(res, 200, state.status === 'question' ? {
              ...state, feedback: { message: 'DATA ENTRY NOT FOUND — TRY AGAIN', suggestions: choices },
            } : state);
          }
        } else if (input.round > run.answers.length) throw problem(409, 'Answer the current question first.');
      } else if (match[2] === 'share') {
        if (run.status !== 'complete') throw problem(409, 'Finish your run first.');
        if (typeof input.name !== 'string' || input.name.length > 24) throw problem(400, 'Use a name of up to 24 characters.');
        run.name = input.name.replace(/[\x00-\x1f\x7f]/g, '').trim(); run.sharedAt=Date.now(); save(run);
        db.prepare('UPDATE players SET name=? WHERE id=?').run(run.name,player);
      } else throw problem(404, 'Not found.');
      return send(res, 200, snapshot(run));
    }
    throw problem(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'Connection interrupted. Please try again.' });
    else res.end();
  }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Germillion listening on http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
