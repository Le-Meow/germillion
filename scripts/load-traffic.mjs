// Local-only, disposable DB. Accelerated synchronized rounds stress the real HTTP server.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {migrate} from '../migrate.mjs';
import {dailyPrompts,today,topFive,grade} from '../game.mjs';

const clients=Number(process.argv[2]||500),history=Number(process.argv[3]||10000);
const concurrency=Number(process.argv[4]||Math.min(clients,200));
assert(Number.isInteger(clients)&&clients>0&&clients<=5000);
assert(Number.isInteger(history)&&history>=0&&history<=100000);
assert(Number.isInteger(concurrency)&&concurrency>0&&concurrency<=clients);
async function each(items,fn){let next=0;await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length)await fn(items[next++]);}));}
const dir=await mkdtemp(join(tmpdir(),'germillion-load-')),path=join(dir,'test.sqlite');
const day=today(),prompts=dailyPrompts(day),answers=prompts.map(p=>grade(p,topFive(p)[0].name));
let child;
try {
  const db=new DatabaseSync(path);migrate(db);
  const insert=db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  const attacker='S'.repeat(24),source='T'.repeat(24);
  insert.run(source,attacker,day,'practice',JSON.stringify({id:source,player:attacker,day,mode:'practice',prompts,status:'complete',answers}),100,1);
  for(let i=0;i<history;i++){
    const player=randomBytes(18).toString('base64url'),id=randomBytes(18).toString('base64url');
    const fraction=(i%1025)/1024;
    const scaled=answers.map(a=>({...a,points:a.points*fraction}));
    insert.run(id,player,day,'daily',JSON.stringify({id,player,day,mode:'daily',prompts,status:'complete',answers:scaled}),fraction*100,i);
    const defence=randomBytes(18).toString('base64url');
    insert.run(defence,player,day,'challenge',JSON.stringify({id:defence,player,day,mode:'challenge',prompts,status:'complete',challenge:source,answers:scaled.map((a,j)=>({...a,opponent:answers[j],attack:0})),completedAt:i}),fraction*100,i);
  }
  db.exec('COMMIT');db.close();
  child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DB_PATH:path,PORT:'0'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',c=>stderr+=c);
  const origin=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Server start timed out: '+stderr)),15000);
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited '+code+stderr));});
    child.stdout.on('data',c=>{const url=String(c).match(/http:\/\/[^\s]+/);if(url){clearTimeout(timeout);resolve(url[0]);}});
  });
  const timings=[],errors=[];
  async function call(player,route,body){
    const start=performance.now();
    const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{cookie:`germillion=${player}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();timings.push(performance.now()-start);
    if(!response.ok)errors.push({route,status:response.status,error:result.error});
    assert(response.ok,JSON.stringify(errors.at(-1)));return result;
  }
  const players=Array.from({length:clients},()=>({player:randomBytes(18).toString('base64url')}));
  const start=performance.now();
  await each(players,async p=>{await call(p.player,'/api/today');p.run=await call(p.player,'/api/run',{});});
  for(let round=0;round<7;round++){
    await each(players,p=>call(p.player,`/api/run/${p.run.id}/start`,{round}));
    if(round===0)await each(players,async p=>{const invalid=await call(p.player,`/api/run/${p.run.id}/answer`,{round,answer:'zzzzzz-invalid-answer'});assert.equal(invalid.round,0);assert.equal(invalid.status,'question');});
    await each(players,async p=>{p.run=await call(p.player,`/api/run/${p.run.id}/answer`,{round,answer:answers[round].name});assert.equal(p.run.round,round+1);assert.equal(p.run.last.valid,true);});
  }
  await each(players,p=>call(p.player,'/api/today'));
  const elapsed=performance.now()-start;
  const logStart=performance.now(),log=await call(attacker,'/api/attacks');
  const logMs=performance.now()-logStart;
  assert.equal(log.matches.length,Math.min(history,200));assert.equal(log.totals.win,history);
  const verify=new DatabaseSync(path);
  const totals=verify.prepare('SELECT count(*) AS buckets,sum(players) AS players FROM daily_totals WHERE day=? AND prompt_key=?').get(day,JSON.stringify(prompts));
  assert.equal(totals.players,history+clients);assert(totals.buckets<=1025);
  assert.equal(verify.prepare('SELECT count(*) AS n FROM results WHERE mode=\'daily\'').get().n,history+clients);
  verify.close();
  timings.sort((a,b)=>a-b);
  console.log(JSON.stringify({clients,concurrentRequests:concurrency,seededDaily:history,seededDefences:history,requests:timings.length,errors:errors.length,seconds:+(elapsed/1000).toFixed(2),requestsPerSecond:Math.round((timings.length-1)*1000/elapsed),latencyMs:{p50:Math.round(timings[Math.floor(timings.length*.5)]),p95:Math.round(timings[Math.floor(timings.length*.95)]),p99:Math.round(timings[Math.floor(timings.length*.99)])},attackLogMs:Math.round(logMs),histogramRows:totals.buckets,completedDaily:totals.players},null,2));
} finally {
  if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
  await rm(dir,{recursive:true,force:true});
}
