import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createApp } from '../app.mjs';
import { topFive,grade } from '../game.mjs';

test('async database requests preserve one daily, one defence and one accepted answer', async t => {
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  const db=Object.fromEntries(['get','all','run'].map(method=>[method,async(sql,...args)=>sqlite.prepare(sql)[method](...args)]));
  const app=createApp(db),player='A'.repeat(24);
  async function request(route,body,cookie=player){
    const response=await app(new Request('https://germillion.test'+route,{method:body===undefined?'GET':'POST',headers:{cookie:`germillion=${cookie}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
    return {status:response.status,data:await response.json()};
  }
  const daily=await Promise.all(Array.from({length:6},()=>request('/api/run',{})));
  assert(daily.every(r=>[200,201].includes(r.status)));
  assert.equal(new Set(daily.map(r=>r.data.id)).size,1);
  const id=daily[0].data.id;
  const starts=await Promise.all([request(`/api/run/${id}/start`,{round:0}),request(`/api/run/${id}/start`,{round:0})]);
  assert(starts.some(r=>r.status===200));assert(starts.every(r=>[200,409].includes(r.status)));
  let state=JSON.parse(sqlite.prepare('SELECT state FROM runs WHERE id=?').get(id).state);
  const choices=topFive(state.prompts[0]);
  const answers=await Promise.all(choices.slice(0,2).map(a=>request(`/api/run/${id}/answer`,{round:0,answer:a.name})));
  assert(answers.some(r=>r.status===200));assert(answers.every(r=>[200,409].includes(r.status)));
  state=JSON.parse(sqlite.prepare('SELECT state FROM runs WHERE id=?').get(id).state);
  assert.equal(state.answers.length,1);
  assert.equal((await request(`/api/run/${id}/answer`,{round:0,answer:choices[1].name})).data.last.name,state.answers[0].name);
  state.answers=state.prompts.map(p=>grade(p,topFive(p)[0].name));state.status='complete';
  sqlite.prepare('UPDATE runs SET state=?,score=100 WHERE id=?').run(JSON.stringify(state),id);
  const defences=await Promise.all(Array.from({length:4},()=>request('/api/run',{mode:'challenge',challenge:id},'B'.repeat(24))));
  assert(defences.every(r=>[200,201].includes(r.status)));
  assert.equal(new Set(defences.map(r=>r.data.id)).size,1);
  const limited=createApp(db,{rateLimit:{limit:async()=>({success:false})}});
  assert.equal((await limited(new Request('https://germillion.test/api/today'))).status,429);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM players').get().n,2,'rejected traffic cannot create new players');
});
