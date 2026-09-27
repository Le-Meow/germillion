import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { dailyPrompts, topFive, today } from '../game.mjs';

test('HTTP game lifecycle, timing, persistence, isolation and challenge distribution', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'germillion-test-')), path = join(dir, 'test.sqlite');
  let child, origin;
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DB_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'] });
    origin = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start')), 10000);
      child.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
      child.once('error', reject);
      child.stderr.on('data', data => { if (!String(data).includes('ExperimentalWarning')) process.stderr.write(data); });
    });
  }
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
  t.after(async () => { await stop(); await rm(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }); });
  await start();
  function client() {
    let cookie;
    return async (route, body, headers = {}) => {
      const response = await fetch(origin + route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, body: await response.json() };
    };
  }
  const a = client(), b = client();
  let r = (await a('/api/run', {})).body;
  assert.equal(r.prompt, null, 'next question stays hidden before the clock starts');
  assert.equal((await a('/api/run', {})).body.id, r.id, 'one daily per browser');
  assert.equal((await b(`/api/run/${r.id}`)).status, 404, 'run ownership');
  assert.equal((await a(`/api/run/${r.id}/answer`, { round: 0, answer: 'Russia' })).status, 409);
  assert.equal((await a('/api/run', { mode: 'practice' }, { origin: 'https://elsewhere.example' })).status, 403);
  const first = (await a(`/api/run/${r.id}/start`, { round: 0 })).body;
  assert(first.deadline - first.serverTime <= 20000);
  assert.equal((await a(`/api/run/${r.id}/start`, { round: 0 })).body.deadline, first.deadline, 'start retries do not reset time');
  const choices = dailyPrompts(today()).map(id => topFive(id)[0].name);
  for (let i = 0; i < 7; i++) {
    if (i) await a(`/api/run/${r.id}/start`, { round: i });
    r = (await a(`/api/run/${r.id}/answer`, { round: i, answer: choices[i] })).body;
    const retry = (await a(`/api/run/${r.id}/answer`, { round: i, answer: choices[i] })).body;
    assert.equal(retry.round, i + 1, 'retry cannot add a second answer');
    if (i < 6) {
      assert.equal(r.status, 'reveal'); assert.equal(r.prompt, null); assert.equal(r.answers, undefined);
      assert.equal((await a(`/api/run/${r.id}/start`, { round: i })).body.status, 'reveal', 'stale start cannot consume the next question');
    }
  }
  assert.equal(r.status, 'complete'); assert.equal(r.score, 100);
  assert.equal(r.answers.length, 7); assert.equal(r.answers[0].top.length, 5);
  assert.equal(r.stats.count, 1); assert.equal(r.streak, 1);
  assert.equal((await a(`/api/run/${r.id}/share`, { name: 'rion' })).status, 200);
  assert.deepEqual((await b(`/api/challenge/${r.id}`)).body, { name: 'rion', day: today() });
  let c = (await b('/api/run', { mode: 'challenge', challenge: r.id })).body;
  for (let i = 0; i < 7; i++) {
    await b(`/api/run/${c.id}/start`, { round: i });
    c = (await b(`/api/run/${c.id}/answer`, { round: i, answer: choices[i] })).body;
  }
  assert.equal(c.challenge.infection, 50, 'seven ties split the computer');
  assert.equal(c.stats.count, 1, 'challenge runs do not contaminate daily stats');
  assert.equal((await b('/api/run', { mode: 'challenge', challenge: r.id })).body.id, c.id);
  let practice = (await a('/api/run', { mode: 'practice' })).body;
  await a(`/api/run/${practice.id}/start`, { round: 0 });
  const direct = new DatabaseSync(path);
  const stored = JSON.parse(direct.prepare('SELECT state FROM runs WHERE id=?').get(practice.id).state);
  stored.deadline = Date.now() - 1000;
  direct.prepare('UPDATE runs SET state=? WHERE id=?').run(JSON.stringify(stored), practice.id); direct.close();
  practice = (await a(`/api/run/${practice.id}/answer`, { round: 0, answer: 'Russia' })).body;
  assert.equal(practice.last.expired, true); assert.equal(practice.score, 0);
  await stop(); await start();
  assert.equal((await a(`/api/run/${r.id}`)).body.score, 100, 'score survives server restart');
  const raw = await fetch(origin + '/data/prompts.json'); assert.equal(raw.status, 404, 'catalogue not served to clients');
  const traversal = await fetch(origin + '/%2e%2e/server.mjs'); assert.equal(traversal.status, 404);
});
