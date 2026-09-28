import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {migrate} from '../migrate.mjs';
import {createApp} from '../app.mjs';

test('historical summaries backfill and stay exact through updates and deletions',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
    const state={id:'old',player:'a',day:'2026-09-28',mode:'daily',prompts:['p'],status:'complete',answers:[{points:50}],completedAt:100};
    db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?)').run('old','a',state.day,'daily',JSON.stringify(state),50,100);
    migrate(db);migrate(db);
    assert.equal(db.prepare('SELECT players FROM daily_totals WHERE mb=512').get().players,1);
    state.sharedAt=200;
    db.prepare('UPDATE runs SET state=? WHERE id=?').run(JSON.stringify(state),'old');
    assert.equal(db.prepare('SELECT sum(players) AS n FROM daily_totals').get().n,1);
    const defence={...state,id:'defence',player:'b',mode:'challenge',challenge:'old',answers:[{points:25,attack:25}]};
    db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?)').run('defence','b',state.day,'challenge',JSON.stringify(defence),25,200);
    assert.equal(db.prepare("SELECT win FROM rivalries WHERE player='a'").get().win,1);
    assert.equal(db.prepare("SELECT loss FROM rivalries WHERE player='b'").get().loss,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM attack_members').get().n,2);
    db.prepare("DELETE FROM runs WHERE id='defence'").run();
    assert.equal(db.prepare('SELECT count(*) AS n FROM rivalries').get().n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM attack_members').get().n,0);
    state.answers=[{points:100}];
    db.prepare('UPDATE runs SET state=?,score=100 WHERE id=?').run(JSON.stringify(state),'old');
    assert.equal(db.prepare('SELECT mb FROM daily_totals').get().mb,1024);
    db.prepare("DELETE FROM runs WHERE id='old'").run();
    assert.equal(db.prepare('SELECT count(*) AS n FROM daily_totals').get().n,0);
  } finally {db.close();}
});

test('browser retries busy idempotent answers once, but does not duplicate new practice games',async()=>{
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').split('async function api(')[1].split('\nfunction setRun(')[0];
  let calls=0,delays=[];
  const api=runInNewContext('(async function api('+source+')',{
    AbortSignal,Math,offset:0,pause:async ms=>delays.push(ms),
    fetch:async()=>{calls++;return new Response(JSON.stringify({error:'busy'}),{status:503,headers:{'Retry-After':'2'}});}
  });
  await assert.rejects(api('/api/run/id/answer',{round:0,answer:'Koala'}),/busy/);
  assert.equal(calls,2);assert.equal(delays.length,1);assert(delays[0]>=2000);
  calls=0;delays=[];
  await assert.rejects(api('/api/run',{mode:'practice'}),/busy/);
  assert.equal(calls,1);assert.equal(delays.length,0);
});

test('concurrent creation quotas are atomic and overload responses allow backoff',async()=>{
  const sqlite=new DatabaseSync(':memory:');migrate(sqlite);
  const db=Object.fromEntries(['get','all','run'].map(method=>[method,async(sql,...args)=>sqlite.prepare(sql)[method](...args)]));
  const app=createApp(db);
  const request=(path,body)=>new Request('https://test.invalid'+path,{method:'POST',headers:{cookie:`germillion=${'q'.repeat(24)}`,'content-type':'application/json'},body:JSON.stringify(body)});
  try {
    const runs=await Promise.all(Array.from({length:50},()=>app(request('/api/run',{mode:'practice'}))));
    assert.equal(runs.filter(r=>r.status===201).length,30);
    assert.equal(runs.filter(r=>r.status===429).length,20);
    assert.equal(runs.find(r=>r.status===429).headers.get('retry-after'),'60');
    const feedback=await Promise.all(Array.from({length:40},()=>app(request('/api/feedback',{kind:'bug',message:'test'}))));
    assert.equal(feedback.filter(r=>r.status===201).length,20);
    assert.equal(feedback.filter(r=>r.status===429).length,20);
    const busy=createApp({get:async()=>{throw new Error('D1_ERROR: database overloaded');}});
    const response=await busy(new Request('https://test.invalid/api/today'));
    assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'2');
  } finally {sqlite.close();}
});
