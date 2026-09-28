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
  const health = await fetch(origin + '/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(health.headers.get('set-cookie'), null, 'host health checks do not create player sessions');
  const healthDb = new DatabaseSync(path);
  assert.equal(healthDb.prepare('SELECT count(*) AS n FROM players').get().n, 0);
  healthDb.close();
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
  assert(first.readyAt - first.serverTime > 2500, 'the question preview lasts about three seconds');
  assert(first.deadline - first.serverTime <= 23000);
  assert.equal(first.deadline - first.readyAt, 20000, 'the entrance does not consume answer time');
  assert.equal((await a(`/api/run/${r.id}/start`, { round: 0 })).body.deadline, first.deadline, 'start retries do not reset time');
  for (const answer of ['definitelynotananswer', '???', '']) {
    const miss = (await a(`/api/run/${r.id}/answer`, { round: 0, answer })).body;
    assert.equal(miss.status, 'question'); assert.equal(miss.round, 0);
    assert.equal(miss.deadline, first.deadline); assert.equal(miss.score, 0);
    assert.equal(miss.last, null);
    assert.equal(miss.feedback.message, 'DATA ENTRY NOT FOUND — TRY AGAIN');
    assert.equal(miss.answers, undefined);
  }
  assert.equal((await a(`/api/run/${r.id}`)).body.deadline, first.deadline, 'reload cannot reset retries');
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
  assert.equal(r.megabytes, 1024);
  assert.equal(r.answers.reduce((sum, answer) => sum + answer.megabytes, 0), r.megabytes, 'displayed gains add up without rounding drift');
  assert.equal(r.answers.length, 7); assert.equal(r.answers[0].top.length, 5);
  assert.equal(r.stats.count, 1); assert.equal(r.streak, 1);
  const playerProfile = (await a('/api/today')).body;
  assert.equal(playerProfile.best, 1024); assert.equal(playerProfile.longest, 1);
  assert.equal(r.trace.length, 7); assert.equal(r.trace.at(-1).position, 1024);
  for (let i = 1; i < r.trace.length; i++) assert(r.trace[i].position >= r.trace[i-1].position);
  for (const asset of ['/world.js', '/chart.js', '/assets/486.png', '/assets/sprites.png', '/assets/skins.png', '/assets/tiers.png']) {
    const response = await fetch(origin + asset); assert.equal(response.status, 200, `new game asset ${asset}`);
    await response.arrayBuffer();
  }
  const compatibilityDb = new DatabaseSync(path);
  const legacyState = JSON.parse(compatibilityDb.prepare('SELECT state FROM runs WHERE id=?').get(r.id).state);
  legacyState.prompts[0] = 'country-area';
  compatibilityDb.prepare('INSERT INTO runs(id,player,day,mode,state,score,created) VALUES(?,?,?,?,?,?,?)')
    .run('legacy-test', 'legacy-player', r.day, 'daily', JSON.stringify(legacyState), 99, Date.now());
  compatibilityDb.close();
  assert.equal((await a(`/api/run/${r.id}`)).body.stats.count, 1, 'old scoring pools stay out of the new distribution');
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
  assert.equal(practice.round, 1);
  assert.equal((await a(`/api/run/${practice.id}/answer`, { round: 0, answer: 'Koala' })).body.round, 1, 'expired round cannot be rescued');
  let partial = (await a('/api/run', { mode: 'practice' })).body;
  const fixtureDb = new DatabaseSync(path);
  const partialState = JSON.parse(fixtureDb.prepare('SELECT state FROM runs WHERE id=?').get(partial.id).state);
  partialState.prompts[0] = 'sleep-v2';
  fixtureDb.prepare('UPDATE runs SET state=? WHERE id=?').run(JSON.stringify(partialState), partial.id);
  fixtureDb.close();
  partial = (await a(`/api/run/${partial.id}/start`, { round: 0 })).body;
  const hint = (await a(`/api/run/${partial.id}/answer`, { round: 0, answer: 'koal' })).body;
  assert.equal(hint.status, 'question'); assert.equal(hint.deadline, partial.deadline);
  assert.deepEqual(hint.feedback.suggestions, ['Koala']);
  assert.equal(hint.last, null); assert.equal(hint.megabytes, 0);
  const confirmed = (await a(`/api/run/${partial.id}/answer`, { round: 0, answer: 'Koala' })).body;
  assert.equal(confirmed.status, 'reveal'); assert.equal(confirmed.last.name, 'Koala');
  assert(confirmed.megabytes > 130); assert.match(confirmed.last.note, /midpoint/);
  // Exercise persistence and ownership of the new home/profile/friend features.
  assert.equal((await a('/api/run',{mode:'challenge',challenge:r.id})).status,400,'cannot attack yourself');
  const logA=(await a('/api/attacks')).body;
  assert.equal(logA.matches[0].result,'draw');assert.equal(logA.matches[0].sent,true);
  assert.equal(logA.matches[0].sectors.length,7);assert(logA.unseen>0);
  await a('/api/attacks/seen',{through:logA.through});assert.equal((await a('/api/attacks')).body.unseen,0);
  const stranger=client();assert.equal((await stranger('/api/attacks')).body.matches.length,0);
  assert.equal((await stranger(`/api/run/${c.id}`)).status,404);
  assert.equal((await a('/api/profile',{skin:4})).status,400,'server enforces locked skins');
  assert.equal((await b('/api/profile')).body.streak,0,'challenges do not earn streaks');
  assert.equal((await a('/api/feedback',{kind:'answer',message:'Should this count?',run:r.id,round:0,answer:'example'})).status,201);
  assert.equal((await b('/api/feedback',{kind:'answer',message:'foreign run',run:r.id,round:0})).status,400);
  assert.equal((await a('/api/feedback',{kind:'bug',message:''})).status,400);
  // Seed only this test's isolated database to verify asymmetric outcomes and unlock boundaries.
  const fixture=new DatabaseSync(path), storedA=JSON.parse(fixture.prepare('SELECT state FROM runs WHERE id=?').get(r.id).state);
  const storedB=JSON.parse(fixture.prepare('SELECT state FROM runs WHERE id=?').get(c.id).state);
  const low={input:'',valid:false,expired:true,fraction:0,points:0};
  storedB.answers=storedB.answers.map((answer,i)=>i<5?{...low,opponent:answer.opponent,attack:0}:answer);
  fixture.prepare('UPDATE runs SET state=? WHERE id=?').run(JSON.stringify(storedB),c.id);
  const lost=(await b(`/api/run/${c.id}`)).body;
  assert.equal(lost.challenge.infection,85.7,'infection belongs to the attacker');
  assert.equal((await b('/api/attacks')).body.matches[0].result,'loss');
  assert.equal((await a('/api/attacks')).body.matches[0].result,'win');
  for(let days=1;days<30;days++){
    const date=new Date(Date.parse(r.day)-days*86400000).toISOString().slice(0,10), id=`streak-${days}`;
    const seeded={...storedA,id,day:date};fixture.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?)').run(id,storedA.player,date,'daily',JSON.stringify(seeded),100,Date.now()-days*86400000);
  }
  assert.equal((await a('/api/profile')).body.streak,30);
  assert.equal((await a('/api/profile',{skin:4,name:'Rion'})).body.skin,4);
  const recovery=(await a('/api/recovery',{})).body.code;
  assert.equal(fixture.prepare('SELECT recovery FROM players WHERE id=?').get(storedA.player).recovery.includes(recovery),false,'only the hash is stored');
  const otherDevice=client();assert.equal((await otherDevice('/api/recover',{code:'wrong'})).status,400);
  assert.equal((await otherDevice('/api/recover',{code:recovery})).status,200);
  assert.equal((await otherDevice('/api/profile')).body.skin,4);assert.equal((await otherDevice('/api/profile')).body.streak,30);
  assert.equal((await otherDevice('/api/attacks')).body.matches[0].result,'win');
  const replacement=(await a('/api/recovery',{})).body.code;
  assert.equal((await stranger('/api/recover',{code:recovery})).status,400,'rotated code is revoked');
  assert.equal((await stranger('/api/recover',{code:replacement})).status,200);
  // A completed first daily is reused when defending, not played again with advance knowledge.
  const savedDaily={...storedB,id:'defender-daily',mode:'daily',challenge:null,answers:storedA.answers,status:'complete'};
  fixture.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?)').run(savedDaily.id,storedB.player,r.day,'daily',JSON.stringify(savedDaily),100,Date.now());
  const secondVirus={...storedA,id:'abcdefghijklmnopqrstuvwx'};
  fixture.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?)').run(secondVirus.id,storedA.player,r.day,'practice',JSON.stringify(secondVirus),100,Date.now());
  const reused=(await b('/api/run',{mode:'challenge',challenge:secondVirus.id})).body;
  assert.equal(reused.reused,true);assert.equal(reused.status,'complete');assert.equal(reused.challenge.infection,50);
  let counter=(await b('/api/run',{mode:'practice',counterOf:c.id})).body;
  let counterState=JSON.parse(fixture.prepare('SELECT state FROM runs WHERE id=?').get(counter.id).state);
  assert.notDeepEqual(counterState.prompts,storedA.prompts,'counterattacks use a fresh question selection');
  for(let i=0;i<7;i++){await b(`/api/run/${counter.id}/start`,{round:i});counter=(await b(`/api/run/${counter.id}/answer`,{round:i,answer:topFive(counterState.prompts[i])[0].name})).body;}
  assert((await a('/api/attacks')).body.incoming.some(r=>r.id===counter.id));
  const counterDefence=(await a('/api/run',{mode:'challenge',challenge:counter.id})).body;
  assert.equal(counterDefence.status,'ready');
  assert(!(await a('/api/attacks')).body.incoming.some(r=>r.id===counter.id),'accepted counter moves into match history');
  fixture.close();
  await stop(); await start();
  assert.equal((await a(`/api/run/${r.id}`)).body.score, 100, 'score survives server restart');
  const raw = await fetch(origin + '/data/prompts.json'); assert.equal(raw.status, 404, 'catalogue not served to clients');
  const traversal = await fetch(origin + '/%2e%2e/server.mjs'); assert.equal(traversal.status, 404);
});
