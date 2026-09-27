import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { data, today, dailyPrompts, publicPrompt, grade, topFive, totalScore, distribution, attackPoints, ROUND_MS, ROUNDS } from './game.mjs';

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
  CREATE INDEX IF NOT EXISTS completed_day ON runs(day,mode,score);`);
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
  if (run.challenge) {
    const target = getRun(run.challenge);
    result.opponent = target.answers[run.answers.length];
    result.attack = attackPoints(result, result.opponent);
  }
  run.answers.push(result);
  run.deadline = null;
  run.status = run.answers.length === ROUNDS ? 'complete' : 'reveal';
  save(run);
}
function stats(run) {
  const scores = db.prepare("SELECT score FROM runs WHERE day=? AND mode='daily' AND score IS NOT NULL").all(run.day).map(r => r.score);
  return distribution(scores, totalScore(run.answers));
}
function streak(player) {
  const days = new Set(db.prepare("SELECT day FROM runs WHERE player=? AND mode='daily' AND score IS NOT NULL ORDER BY day DESC").all(player).map(r => r.day));
  let d = new Date(`${today()}T00:00:00Z`), count = 0;
  if (!days.has(today())) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { count++; d.setUTCDate(d.getUTCDate() - 1); }
  return count;
}
function snapshot(run) {
  if (run.status === 'question' && Date.now() >= run.deadline) finishAnswer(run, '', true);
  const complete = run.status === 'complete';
  return {
    id: run.id, day: run.day, mode: run.mode, status: run.status, round: run.answers.length,
    deadline: run.deadline, serverTime: Date.now(), score: totalScore(run.answers),
    prompt: run.status === 'question' ? publicPrompt(run.prompts[run.answers.length]) : null,
    last: run.answers.length ? { ...run.answers.at(-1), prompt: publicPrompt(run.prompts[run.answers.length - 1]) } : null,
    challenge: run.challenge ? { name: getRun(run.challenge).name || 'Someone', infection: Math.round(run.answers.reduce((s, a) => s + a.attack, 0) * 10) / 10 } : null,
    ...(complete ? {
      answers: run.answers.map((a, i) => ({ ...a, prompt: publicPrompt(run.prompts[i]), top: topFive(run.prompts[i]) })),
      stats: stats(run), streak: streak(run.player), name: run.name || '',
    } : {}),
  };
}
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/font.ttf', ['font.ttf', 'font/ttf']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
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
      res.setHeader('Set-Cookie', `germillion=${player}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.PUBLIC_ORIGIN?.startsWith('https:') || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
    }
    if (url.pathname === '/api/today' && req.method === 'GET') {
      const row = db.prepare("SELECT id FROM runs WHERE player=? AND day=? AND mode='daily'").get(player, today());
      return send(res, 200, { day: today(), version: data.version, run: row ? snapshot(getRun(row.id)) : null, streak: streak(player) });
    }
    const challengeMatch = url.pathname.match(/^\/api\/challenge\/([A-Za-z0-9_-]{24})$/);
    if (challengeMatch && req.method === 'GET') {
      const target = getRun(challengeMatch[1]);
      if (!target || target.status !== 'complete') throw problem(404, 'This virus link was not found.');
      return send(res, 200, { name: target.name || 'Someone', day: target.day });
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
        day = target.day;
      }
      if (mode === 'daily') {
        const existing = db.prepare("SELECT id FROM runs WHERE player=? AND day=? AND mode='daily'").get(player, day);
        if (existing) return send(res, 200, snapshot(getRun(existing.id)));
      }
      if (mode === 'challenge') {
        const previous = db.prepare("SELECT state FROM runs WHERE player=? AND mode='challenge'").all(player).map(r => JSON.parse(r.state)).find(r => r.challenge === target.id);
        if (previous) return send(res, 200, snapshot(previous));
      }
      const recent = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE player=? AND created>?').get(player, Date.now() - 3_600_000).n;
      if (recent >= 30) throw problem(429, 'Too many new runs. Come back in a little while.');
      const id = token();
      const run = { id, player, day, mode, status: 'ready', prompts: target?.prompts || dailyPrompts(mode === 'practice' ? id : day), answers: [], deadline: null, challenge: target?.id || null };
      db.prepare('INSERT INTO runs(id,player,day,mode,state,created) VALUES(?,?,?,?,?,?)').run(id, player, day, mode, JSON.stringify(run), Date.now());
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
          run.status = 'question'; run.deadline = Date.now() + ROUND_MS; save(run);
        }
      } else if (match[2] === 'answer') {
        if (!Number.isInteger(input.round) || input.round < 0 || input.round > ROUNDS - 1) throw problem(400, 'Invalid question.');
        if (input.round === run.answers.length) {
          if (run.status !== 'question') throw problem(409, 'Start this question first.');
          if (typeof input.answer !== 'string' || input.answer.length > 160) throw problem(400, 'Keep your answer under 160 characters.');
          finishAnswer(run, input.answer.trim(), Date.now() > run.deadline);
        } else if (input.round > run.answers.length) throw problem(409, 'Answer the current question first.');
      } else if (match[2] === 'share') {
        if (run.status !== 'complete') throw problem(409, 'Finish your run first.');
        if (typeof input.name !== 'string' || input.name.length > 24) throw problem(400, 'Use a name of up to 24 characters.');
        run.name = input.name.replace(/[\x00-\x1f\x7f]/g, '').trim(); save(run);
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
