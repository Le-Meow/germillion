import test from 'node:test';
import assert from 'node:assert/strict';
import {streakSummary,rotation,dailyPrompts,prompts,grade} from '../game.mjs';
import {technicianLine,SKINS} from '../public/world.js';

test('streak milestones survive a missed day, exclude future dates and handle UTC boundaries',()=>{
  const day='2026-10-01', dates=n=>Array.from({length:n},(_,i)=>new Date(Date.parse(day)-i*86400000).toISOString().slice(0,10));
  for(const skin of SKINS){const s=streakSummary(dates(skin.days),day);assert.equal(s.streak,skin.days);assert.equal(s.longest,skin.days);}
  assert.deepEqual(streakSummary(dates(30),'2026-10-02'),{streak:30,longest:30});
  assert.deepEqual(streakSummary(dates(30),'2026-10-03'),{streak:0,longest:30});
  assert.deepEqual(streakSummary(['2026-09-30','2026-10-01','2026-10-01','2026-10-02'],day),{streak:2,longest:2});
});
test('expanded rotations vary actual questions and preserve original daily IDs',()=>{
  assert.equal(dailyPrompts('2026-09-28').length,7);
  const seen=new Set();
  for(let d=29;d<=40;d++){
    const day=new Date(Date.UTC(2026,8,d)).toISOString().slice(0,10), ids=dailyPrompts(day);
    assert.deepEqual(ids,dailyPrompts(day));assert.equal(ids.length,7);assert.equal(new Set(ids.map(id=>prompts.get(id).family)).size,7);
    assert(ids.some(id=>id.startsWith('minecraft')));assert(ids.some(id=>id.startsWith('pokemon')));
    ids.forEach(id=>seen.add(id));
  }
  assert(seen.size>10);
  for(const p of rotation.prompts){let previous;for(const e of [...p.entries].sort((a,b)=>a.value-b.value)){
    const hit=grade(p.id,e.name);assert(hit.valid,`${p.id}: ${e.name}`);assert(hit.fraction>=0&&hit.fraction<=1);
    if(previous)assert(hit.fraction>=previous.fraction);previous=hit;
  }}
  assert.equal(grade('pokemon-hp-v1','Chansey').value,250);
  assert.equal(grade('pokemon-attack-v1','Dragonite').value,134);
  assert.equal(grade('minecraft-height-java-1.21.4-v1','Enderman').value,2.9);
  assert.equal(grade('minecraft-height-java-1.21.4-v1','Giant').valid,false);
  assert.equal(grade('film-runtime-rotation-v1','The Open Road').value,91);
  assert.equal(grade('film-runtime-rotation-v1','Open Road').value,85);
});
test('technician responds to damage and discoveries, never to misses or repeated lines',()=>{
  const result={from:0,to:20,fraction:.1,valid:true,round:1};
  assert.equal(technicianLine({...result,valid:false}),'');
  assert.equal(technicianLine({...result,to:0}),'');
  assert.equal(technicianLine({...result,to:104}),'I specifically told you not to do that.');
  assert.equal(technicianLine({...result,from:600,to:610}),'You said you backed it up.');
  const previous=[{round:1,text:technicianLine(result)}];
  assert.equal(technicianLine({...result,round:2},previous),'');
  const next=technicianLine({...result,round:3},previous);assert(next);assert.notEqual(next,previous[0].text);
  assert.equal(technicianLine({...result,round:7},[{round:1,text:'a'},{round:3,text:'b'},{round:5,text:'c'}]),'');
});
