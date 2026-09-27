import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const legacy = JSON.parse(readFileSync(new URL('./data/prompts.json', import.meta.url), 'utf8'));
export const data = JSON.parse(readFileSync(new URL('./data/curated.json', import.meta.url), 'utf8'));
export const ROUND_MS = 20_000;
export const ROUNDS = 7;
export const CHUNK = 100 / ROUNDS;
export const today = () => new Date().toISOString().slice(0, 10);
export const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const hash = text => createHash('sha256').update(text).digest().readUInt32BE(0);
export const prompts = new Map([...legacy.prompts, ...data.prompts].map(p => [p.id, {
  ...p,
  entries: p.entries.map(e => ({ ...e, keys: [...new Set([e.name, ...e.aliases].map(normalize))] })),
}]));
export function dailyPrompts(seed) {
  // ponytail: one reviewed set for playtesting; add dated sets when editorially ready.
  return data.prompts.map(p => p.id).sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
}
function payloadFraction(value, anchors) {
  if (value <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [high, highScore] = anchors[i], [low, lowScore] = anchors[i - 1];
    if (value <= high) return lowScore + (value - low) / (high - low) * (highScore - lowScore);
  }
  return anchors.at(-1)[1];
}
const potency = fraction => fraction === 1 ? 'TOTAL TAKEOVER' : fraction >= .85 ? 'CRITICAL' : fraction >= .65 ? 'VIRULENT' : fraction >= .4 ? 'SPREADING' : fraction >= .2 ? 'ACTIVE' : 'TRACE';
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
export function matchAnswer(prompt, answer) {
  const key = normalize(answer);
  if (!key) return null;
  const exact = prompt.entries.filter(e => e.keys.includes(key));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 || key.length < 5) return null;
  const tolerance = key.length >= 10 ? 2 : 1;
  let best = tolerance + 1, candidates = [];
  for (const entry of prompt.entries) {
    const d = Math.min(...entry.keys.filter(k => k.length >= 5 && Math.abs(k.length - key.length) <= tolerance).map(k => distance(key, k)));
    if (d < best) { best = d; candidates = [entry]; }
    else if (d === best) candidates.push(entry);
  }
  return best <= tolerance && candidates.length === 1 ? candidates[0] : null;
}
export function grade(id, answer, expired = false) {
  const prompt = prompts.get(id), entry = expired ? null : matchAnswer(prompt, answer);
  if (!entry) return { input: answer, valid: false, expired, points: 0, fraction: 0 };
  const lower = prompt.entries.filter(e => e.value < entry.value).length;
  const higher = prompt.entries.filter(e => e.value > entry.value).length;
  const max = Math.max(...prompt.entries.map(e => e.value));
  const fraction = prompt.anchors ? payloadFraction(entry.value, prompt.anchors) : entry.value === max ? 1 : lower / (prompt.entries.length - 1);
  return { input: answer, valid: true, name: entry.name, value: entry.value, rank: higher + 1, total: prompt.entries.length, fraction, points: fraction * CHUNK, potency: potency(fraction) };
}
export function publicPrompt(id) {
  const { title, axis, unit, scope, source, entries, anchors } = prompts.get(id);
  return { title, axis, unit, scope, source, anchors, count: entries.length };
}
export function topFive(id) {
  const entries = prompts.get(id).entries;
  return [...entries].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 5).map(({ name, value }) => ({ name, value, rank: entries.filter(e => e.value > value).length + 1 }));
}
export function attackPoints(yours, theirs) {
  if (yours.valid === true && theirs.valid === false) return CHUNK;
  if (yours.valid === false && theirs.valid === true) return 0;
  if (yours.fraction === theirs.fraction) return CHUNK / 2;
  return yours.fraction > theirs.fraction ? CHUNK : 0;
}
export const totalScore = answers => Math.round(answers.reduce((sum, a) => sum + a.points, 0) * 10) / 10;
export function distribution(scores, score) {
  const bins = Array(20).fill(0);
  for (const s of scores) bins[Math.min(19, Math.floor(s / 5))]++;
  return { count: scores.length, bins, below: scores.filter(s => s < score).length, equal: scores.filter(s => s === score).length };
}
