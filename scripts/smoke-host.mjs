// Creates isolated practice profiles and matches; never submits a ranked daily.
import assert from 'node:assert/strict';
import {data,rotation,grade} from '../game.mjs';
const origin=new URL(process.argv[2]||'http://127.0.0.1:8787').origin;
for(const path of ['/','/help','/virus','/assets/skins.png','/healthz']){
  const res=await fetch(origin+path);assert.equal(res.status,200,path);await res.arrayBuffer();
}
assert.equal((await fetch(origin+'/data/curated.json')).status,404);
function client(){
  let cookie;
  return async(path,body)=>{
    const res=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json',origin})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
    const result=await res.json();assert(res.ok,`${path}: ${res.status} ${result.error||''}`);return result;
  };
}
const a=client(),b=client(),restored=client();
await a('/api/profile',{name:'Deployment QA'});await b('/api/profile',{name:'Deployment QA defender'});
async function finish(client,run,strong){
  for(let round=run.round;round<7;round++){
    run=await client(`/api/run/${run.id}/start`,{round});
    const p=[...data.prompts,...rotation.prompts].find(p=>p.title===run.prompt.title&&p.axis===run.prompt.axis&&p.scope===run.prompt.scope);
    assert(p,'known prompt');
    if(round===0){
      const rejected=await client(`/api/run/${run.id}/answer`,{round,answer:'zzzzzz-invalid-answer'});
      assert.equal(rejected.status,'question');assert.equal(rejected.deadline,run.deadline);
    }
    const entries=p.entries.toSorted((a,b)=>strong?b.value-a.value:a.value-b.value);
    const choice=entries[0];
    run=await client(`/api/run/${run.id}/answer`,{round,answer:choice.name});
    assert.equal(run.last.fraction,grade(p.id,choice.name).fraction);
  }
  assert.equal(run.status,'complete');return run;
}
const attack=await finish(a,await a('/api/run',{mode:'practice'}),true);
assert.equal(attack.megabytes,1024);
await a(`/api/run/${attack.id}/share`,{name:'Deployment QA'});
const defence=await finish(b,await b('/api/run',{mode:'challenge',challenge:attack.id}),false);
assert.equal(defence.challenge.infection,100);
assert.equal((await a('/api/attacks')).matches[0].result,'win');
assert.equal((await b('/api/attacks')).matches[0].result,'loss');
assert.equal((await b('/api/run',{mode:'challenge',challenge:attack.id})).id,defence.id);
const counter=await finish(b,await b('/api/run',{mode:'practice',counterOf:defence.id}),true);
assert((await a('/api/attacks')).incoming.some(r=>r.id===counter.id));
const {code}=await b('/api/recovery',{});await restored('/api/recover',{code});
assert.equal((await restored('/api/profile')).name,'Deployment QA defender');
assert.equal((await restored('/api/attacks')).matches[0].id,defence.id);
console.log('PASS: assets, routes, D1 persistence, invalid-answer retry, 7-round scoring, attacks, counterattack and cross-device recovery. No daily scores created.');
