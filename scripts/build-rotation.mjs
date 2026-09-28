import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async name=>readFile(new URL(`../data/${name}`,import.meta.url),'utf8');
const old=JSON.parse(await read('prompts.json')).prompts;
const prompts=[];
for(const [id,family,anchors] of [
  ['country-area','geography',[[0,.05],[10000,.15],[100000,.3],[500000,.5],[2000000,.7],[8000000,.9],[17098242,1]]],
  ['country-borders','geography',[[0,.05],[2,.2],[4,.4],[6,.6],[9,.8],[14,1]]],
  ['state-area','state',[[0,.05],[10000,.15],[50000,.35],[100000,.55],[200000,.8],[665384,1]]],
  ['element-number','metal',[[1,.05],[20,.2],[40,.4],[60,.6],[90,.8],[118,1]]],
  ['pokemon-height','pokemon',[[.1,.05],[.5,.2],[1,.4],[2,.6],[4,.8],[8.8,1]]],
  ['pokemon-weight','pokemon',[[.1,.05],[10,.2],[40,.4],[100,.6],[250,.8],[460,1]]],
  ['film-runtime','film',[[40,.05],[80,.2],[110,.4],[140,.6],[180,.8],[300,1]]],
]) {
  const source=structuredClone(old.find(p=>p.id===id));
  const max=Math.max(...source.entries.map(e=>e.value)); anchors[anchors.length-1][0]=max;
  prompts.push({...source,id:`${id}-rotation-v1`,family,anchors});
}
const stats=(await read('pokemonstats.raw')).trim().split(/\r?\n/).slice(1).map(line=>line.split(',').map(Number));
for(const [stat,label,max] of [[1,'HP',250],[2,'Attack',134]]){
  const values=new Map(stats.filter(r=>r[1]===stat&&r[0]<=151).map(r=>[r[0],r[2]]));
  const base=old.find(p=>p.id==='pokemon-weight');
  const entries=base.entries.map((e,i)=>({...e,value:values.get(i+1)}));
  prompts.push({id:`pokemon-${label.toLowerCase()}-v1`,family:'pokemon',title:'Name an original Pokémon.',axis:`Highest base ${label} · original 151`,unit:`base ${label}`,scope:'Original 151, standard forms. Frozen modern base stats from veekun. No Mega Evolutions, levels, moves or abilities.',source:'https://github.com/veekun/pokedex/blob/master/pokedex/data/csv/pokemon_stats.csv',entries,anchors:[[Math.min(...entries.map(e=>e.value)),.05],[40,.2],[65,.4],[90,.6],[120,.8],[max,1]]});
}
let raw;
try{raw=await read('minecraft-1.21.4.raw');}catch(e){
  if(e.code!=='ENOENT')throw e;
  const response=await fetch('https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/1.21.4/entities.json');
  if(!response.ok)throw Error(`Minecraft data: ${response.status}`);
  raw=await response.text();await writeFile(new URL('../data/minecraft-1.21.4.raw',import.meta.url),raw);
}
const entities=JSON.parse(raw).filter(e=>e.category.includes('mobs')&&!['giant','illusioner'].includes(e.name));
prompts.push({id:'minecraft-height-java-1.21.4-v1',family:'minecraft',title:'Name a Minecraft mob.',axis:'Tallest default hitbox · Java 1.21.4',unit:'blocks tall',scope:'Java Edition 1.21.4 mobs, including bosses. Default standing hitbox height in the frozen minecraft-data extract, not the artwork. Babies, special poses and command-only Giant/Illusioner excluded. Slime and Magma Cube use the default entity size in this extract.',source:'https://github.com/PrismarineJS/minecraft-data/blob/master/data/pc/1.21.4/entities.json',entries:entities.map(e=>({name:e.displayName,value:e.height,aliases:[e.name,...(e.name==='zombified_piglin'?['zombie pigman','pig zombie']:[]),...(e.name==='mooshroom'?['mushroom cow']:[])]})),anchors:[[.3,.05],[.7,.2],[1.4,.4],[1.95,.6],[2.9,.8],[8,1]]});
for(const p of prompts) if(p.entries.some(e=>!Number.isFinite(e.value))||p.anchors.some((a,i)=>i&&a[0]<=p.anchors[i-1][0]))throw Error(`Invalid question: ${p.id}`);
const result={version:'rotation-2026-09-29-v1',starts:'2026-09-29',minecraftSha256:createHash('sha256').update(raw).digest('hex'),prompts};
// Freeze released IDs just like the original curated set.
let previous;try{previous=JSON.parse(await read('rotation.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(previous)for(const p of previous.prompts)if(JSON.stringify(p)!==JSON.stringify(prompts.find(n=>n.id===p.id)))throw Error(`Published question changed: ${p.id}`);
await writeFile(new URL('../data/rotation.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(`${prompts.length} additional sourced prompts; ${entities.length} Minecraft mobs.`);
