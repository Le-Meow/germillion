import { createHash } from 'node:crypto';

import legacy from './data/prompts.json' with { type: 'json' };
import data from './data/curated.json' with { type: 'json' };
export { data };
import rotation from './data/rotation.json' with { type: 'json' };
export { rotation };
export const ROUND_MS = 20_000;
export const ROUNDS = 7;
export const CHUNK = 100 / ROUNDS;
export const MAX_MB = 1024;
export const today = () => new Date().toISOString().slice(0, 10);
export function streakSummary(dates, day = today()) {
  const days = [...new Set(dates.filter(d=>d<=day))].sort();
  let longest=0, chain=0, previous=0;
  for(const d of days){const date=Date.parse(d);chain=date-previous===86400000?chain+1:1;longest=Math.max(longest,chain);previous=date;}
  const completed=new Set(days);let cursor=Date.parse(day),streak=0;
  if(!completed.has(day))cursor-=86400000;
  while(completed.has(new Date(cursor).toISOString().slice(0,10))){streak++;cursor-=86400000;}
  return {streak,longest};
}
export const normalize = value => value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const hash = text => createHash('sha256').update(text).digest().readUInt32BE(0);
export const prompts = new Map([...legacy.prompts, ...(data.retired || []), ...data.prompts, ...rotation.prompts].map(p => [p.id, {
  ...p,
  entries: p.entries.map(e => ({ ...e, keys: [...new Set([e.name, ...e.aliases].map(normalize))] })),
}]));
export function dailyPrompts(seed, exclude = []) {
  const dated=/^\d{4}-\d{2}-\d{2}$/.test(seed);
  if(!dated || seed>=rotation.starts){
    const pool=[...data.prompts,...rotation.prompts], groups=new Map();
    for(const p of pool) {if(!groups.has(p.family))groups.set(p.family,[]);groups.get(p.family).push(p);}
    const families=[...groups.keys()].sort((a,b)=>{
      const priority=f=>!exclude.length&&['minecraft','pokemon'].includes(f)?0:1;
      return priority(a)-priority(b)||Number(groups.get(a).every(p=>exclude.includes(p.id)))-Number(groups.get(b).every(p=>exclude.includes(p.id)))||hash(`${seed}:${a}`)-hash(`${seed}:${b}`);
    }).slice(0,7);
    return families.map(f=>groups.get(f).sort((a,b)=>Number(exclude.includes(a.id))-Number(exclude.includes(b.id))||hash(`${seed}:${a.id}`)-hash(`${seed}:${b.id}`))[0].id).sort((a,b)=>hash(`${seed}:order:${a}`)-hash(`${seed}:order:${b}`));
  }
  const ids = seed < '2026-09-28'
    ? data.prompts.map(p => p.id === 'sleep-v2' ? 'sleep-v1' : p.id)
    : data.prompts.map(p => p.id);
  return ids.sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
}
function payloadFraction(value, anchors) {
  if (value <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [high, highScore] = anchors[i], [low, lowScore] = anchors[i - 1];
    if (value <= high) return lowScore + (value - low) / (high - low) * (highScore - lowScore);
  }
  return anchors.at(-1)[1];
}
const potency = fraction => fraction >= .9 ? 'BEYOND REPAIR' : fraction >= .7 ? 'FATAL ERROR' : fraction >= .45 ? 'SYSTEM FAILURE' : fraction >= .2 ? 'NOT RESPONDING' : 'MINOR GLITCH';
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), before;
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) next[j] = Math.min(next[j], before[j - 2] + 1);
    }
    before = prev; prev = next;
  }
  return prev[b.length];
}
// Published catalogues are immutable. Compile once per isolate, not per answer.
const compiled=new WeakMap();
function prepare(prompt){
  if(compiled.has(prompt))return compiled.get(prompt);
  const literal=new Map(),shortened=new Map(),aliases=new Map(),values=new Map(),suggestionKeys=new Map();
  const add=(map,key,entry)=>map.set(key,map.has(key)&&map.get(key)!==entry?null:entry);
  for(const e of prompt.entries){
    const full=normalize('x '+e.name);if(!literal.has(full))literal.set(full,e);
    add(shortened,normalize(e.name),e);
    for(const key of e.keys)add(aliases,key,e);
    values.set(e.value,(values.get(e.value)||0)+1);
    suggestionKeys.set(e,[...new Set([...e.keys,...[e.name,...(e.aliases||[])].flatMap(k=>k.split(/[\s-]+/).map(normalize))])]);
  }
  const ordered=[...values.keys()].sort((a,b)=>a-b),max=ordered.at(-1),strengths=new Map();let lower=0;
  for(const value of ordered){const count=values.get(value),fraction=prompt.anchors?payloadFraction(value,prompt.anchors):value===max?1:lower/(prompt.entries.length-1);strengths.set(value,{fraction,rank:prompt.entries.length-lower-count+1});lower+=count;}
  const top=[...prompt.entries].sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).slice(0,5).map(({name,value,note,source})=>({name,value,note,source,rank:strengths.get(value).rank}));
  const result={literal,shortened,aliases,strengths,top,suggestionKeys};compiled.set(prompt,result);return result;
}
export function matchAnswer(prompt, answer) {
  const key = normalize(answer);
  if (!key) return null;
  const index=prepare(prompt),literal=index.literal.get(normalize('x '+answer));
  if(literal)return literal;
  if(index.shortened.has(key))return index.shortened.get(key);
  return index.aliases.get(key)||null;
}
export function suggestions(id, answer) {
  const key = normalize(answer);
  if (key.length < 3) return [];
  const candidates = prompts.get(id).entries.map(e => {
    const keys = prepare(prompts.get(id)).suggestionKeys.get(e);
    const rank = keys.includes(key) ? 0 : keys.some(k => k.startsWith(key)) ? 1
      : key.length >= 5 && keys.some(k => Math.abs(k.length - key.length) <= 2 && distance(key, k) <= (key.length >= 10 ? 2 : 1)) ? 2 : 3;
    return { name: e.name, rank };
  }).filter(e => e.rank < 3);
  // Only spelling/text relevance, never strength. Names only: no score hints.
  return candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'en')).slice(0, 3).map(e => e.name);
}
export function grade(id, answer, expired = false) {
  const prompt = prompts.get(id), entry = expired ? null : matchAnswer(prompt, answer);
  if (!entry) return { input: answer, valid: false, expired, points: 0, fraction: 0 };
  const {fraction,rank}=prepare(prompt).strengths.get(entry.value);
  return { input: answer, valid: true, name: entry.name, value: entry.value, note: entry.note, source: entry.source, rank, total: prompt.entries.length, fraction, points: fraction * CHUNK, potency: potency(fraction) };
}
export function publicPrompt(id) {
  const { title, axis, unit, scope, source, entries, anchors } = prompts.get(id);
  return { title, axis, unit, scope, source, anchors, count: entries.length };
}
export function topFive(id) {
  return prepare(prompts.get(id)).top;
}
export function attackPoints(yours, theirs) {
  if (yours.valid === true && theirs.valid === false) return CHUNK;
  if (yours.valid === false && theirs.valid === true) return 0;
  if (yours.fraction === theirs.fraction) return CHUNK / 2;
  return yours.fraction > theirs.fraction ? CHUNK : 0;
}
export const totalScore = answers => Math.round(answers.reduce((sum, a) => sum + a.points, 0) * 10) / 10;
export const totalMB = answers => Math.round(answers.reduce((sum, a) => sum + a.points, 0) * MAX_MB / 100);
export function distribution(scores, score, maximum = 100) {
  const bins = Array(32).fill(0);
  for (const s of scores) bins[Math.min(bins.length - 1, Math.floor(s / maximum * bins.length))]++;
  return { count: scores.length, bins, below: scores.filter(s => s < score).length, equal: scores.filter(s => s === score).length };
}
