import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// One reviewed daily set. Frozen inputs make edits and scores reproducible.
const sources = {
  countries: 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
  elements: 'https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/PeriodicTableJSON.json',
  forest: 'https://api.worldbank.org/v2/country/all/indicator/AG.LND.FRST.ZS?date=2021&format=json&per_page=400',
  alcohol: 'https://api.worldbank.org/v2/country/all/indicator/SH.ALC.PCAP.LI?date=2019&format=json&per_page=400',
  oscars: 'https://raw.githubusercontent.com/DLu/oscar_data/main/oscars.csv',
  pokemonstats: 'https://raw.githubusercontent.com/veekun/pokedex/master/pokedex/data/csv/pokemon_stats.csv',
  statewater: 'https://www.census.gov/geographies/reference-files/2010/geo/state-area.html',
};
const raw = {}, provenance = [];
for (const [name, url] of Object.entries(sources)) {
  const path = new URL(`../data/${name}.raw`, import.meta.url);
  try { raw[name] = await readFile(path, 'utf8'); }
  catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    raw[name] = await response.text(); await writeFile(path, raw[name]);
  }
  provenance.push({ name, url, sha256: createHash('sha256').update(raw[name]).digest('hex') });
}
const legacy = JSON.parse(await readFile(new URL('../data/prompts.json', import.meta.url)));
const old = id => legacy.prompts.find(p => p.id === id);
const countries = JSON.parse(raw.countries);
const names = new Map(countries.map(c => [c.cca3, c.name.common]));
const countryEntries = new Map(old('country-area').entries.map(e => [e.name, e]));
const entry = (name, value, aliases = []) => ({ name, value, aliases });
const prompts = [];
function add(id, family, title, axis, unit, scope, source, entries, anchors) {
  const values = anchors.map(([v]) => v);
  if (entries.length < 40 || entries.some(e => !Number.isFinite(e.value)) || values.some((v, i) => i && v <= values[i - 1])) throw new Error(`Invalid set: ${id}`);
  prompts.push({ id, family, title, axis, unit, scope, source, entries, anchors });
}
function wbEntries(key) {
  const response = JSON.parse(raw[key]);
  if (response[0].pages !== 1) throw new Error('Incomplete World Bank response');
  return response[1].filter(r => r.value !== null && countryEntries.has(names.get(r.countryiso3code))).map(r => {
    const original = countryEntries.get(names.get(r.countryiso3code));
    return { ...original, value: Math.round(r.value * 100) / 100 };
  });
}
const forest = wbEntries('forest');
add('forest-2021-v1', 'forest', 'Name a country.', 'Highest % covered by forest · 2021', '% of land',
  'Countries with a 2021 FAO/World Bank observation. Forest as a share of land area, not total forest size. Values rounded to two decimals before ranking. Regional aggregates and dependent territories excluded.',
  'https://data.worldbank.org/indicator/AG.LND.FRST.ZS', forest,
  [[0, .05], [20, .15], [40, .3], [60, .5], [80, .75], [90, .9], [Math.max(...forest.map(e => e.value)), 1]]);

const sleep = old('mammal-sleep');
sleep.entries = sleep.entries.map(e => e.name === 'Thick-tailed opposum' ? { ...e, name: 'Thick-tailed opossum', aliases: [...e.aliases, e.name] } : e);
add('sleep-v1', 'sleep', 'Name a mammal.', 'Most hours asleep per day', sleep.unit, sleep.scope, sleep.source, sleep.entries,
  [[0, .05], [6, .15], [10, .3], [13, .5], [16, .7], [18, .85], [19.9, 1]]);
// Retain the published question intact for saved runs, attacks and archives.
const retired = [prompts.pop()];
const supplement = JSON.parse(await readFile(new URL('../data/sleep-supplement.json', import.meta.url), 'utf8'));
add('sleep-v2', 'sleep', 'Name a mammal.', 'Most hours asleep per day · estimates', sleep.unit,
  'Published daily sleep estimates, combining the msleep study with sourced supplements. Sleep varies by individual, setting and study. Where a supplement gives a range, its midpoint is used as the game estimate; the range and source appear in the result. Broad names may need a species: choose a suggestion. This is a finite reviewed pool, not an exhaustive list of mammals.',
  sleep.source, [...sleep.entries, ...supplement], retired[0].anchors);

const speeds = new Map(raw.pokemonstats.trim().split(/\r?\n/).slice(1).map(row => row.split(',')).filter(r => r[1] === '6' && Number(r[0]) <= 151).map(r => [Number(r[0]), Number(r[2])]));
const pokemon = old('pokemon-weight').entries.map((e, i) => ({ ...e, value: speeds.get(i + 1) }));
add('pokemon-speed-v1', 'pokemon', 'Name an original Pokémon.', 'Highest base Speed stat · original 151', 'base Speed',
  'Original 151, standard forms only. Modern base Speed from the frozen veekun game-data extract (Electrode is 150, following its Gen VII buff). No Mega Evolutions, regional forms, levels, moves or abilities.',
  'https://github.com/veekun/pokedex/blob/master/pokedex/data/csv/pokemon_stats.csv', pokemon,
  [[5, .05], [40, .15], [65, .3], [90, .5], [110, .7], [130, .85], [150, 1]]);

const headers = raw.oscars.split(/\r?\n/, 1)[0].split('\t');
const films = new Map();
for (const line of raw.oscars.trim().split(/\r?\n/).slice(1)) {
  const cells = line.split('\t'), r = Object.fromEntries(headers.map((h, i) => [h, cells[i] || '']));
  // 1980–2025 ceremonies; honorary/scientific awards are not nominations.
  if (+r.Ceremony < 52 || +r.Ceremony > 97 || ['Special', 'SciTech'].includes(r.Class) || !r.Film || r.Film.includes('|')) continue;
  const key = `${r.FilmId || r.Film}:${r.Year}`;
  if (!films.has(key)) films.set(key, { title: r.Film, year: r.Year, nominations: 0 });
  films.get(key).nominations++;
}
const titleKey = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
const counts = new Map();
for (const f of films.values()) counts.set(titleKey(f.title), (counts.get(titleKey(f.title)) || 0) + 1);
const oldAliases = new Map(old('film-runtime').entries.map(e => [e.name.toLowerCase(), e.aliases.filter(a => !/\d{4}$/.test(a))]));
const oscarEntries = [...films.values()].map(f => entry(counts.get(titleKey(f.title)) > 1 ? `${f.title} (${f.year})` : f.title, f.nominations,
  [`${f.title} ${f.year}`, ...(counts.get(titleKey(f.title)) === 1 ? oldAliases.get(f.title.toLowerCase()) || [] : [])]));
add('oscar-nominations-v1', 'film', 'Name an Oscar-nominated film.', 'Most nominations · 1980–2025 Oscars', 'nominations',
  'Competitive nominations at ceremonies held from 1980 through 2025, including acting and song nominations. Shorts and documentaries count. Honorary and technical awards excluded. For repeated titles, include the film year. Extracted from DLu/oscar_data, sourced from the Academy database.',
  'https://github.com/DLu/oscar_data', oscarEntries,
  [[1, .05], [2, .15], [4, .3], [7, .5], [10, .7], [12, .85], [14, 1]]);

const stateNames = new Map(old('state-area').entries.map(e => [e.name, e]));
const water = [];
for (const row of raw.statewater.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
  if (!stateNames.has(cells[0])) continue;
  const num = s => Number(s.replace(/,/g, ''));
  water.push({ ...stateNames.get(cells[0]), value: Math.round(num(cells[5]) / num(cells[1]) * 10000) / 100 });
}
if (water.length !== 50) throw new Error('Expected all 50 states');
add('state-water-v1', 'state', 'Name a US state.', 'Highest % of its area that is water', '% water',
  'All 50 states. US Census 2010 total water area divided by total area, including coastal waters and each state’s share of the Great Lakes. Calculated from the square-mile columns and rounded to two decimals. Two-letter abbreviations accepted.',
  sources.statewater, water,
  [[0, .05], [2, .15], [5, .3], [10, .5], [20, .7], [35, .85], [Math.max(...water.map(e => e.value)), 1]]);

const elements = JSON.parse(raw.elements).elements;
const metalCategories = new Set(['alkali metal', 'alkaline earth metal', 'transition metal', 'post-transition metal', 'lanthanide', 'actinide']);
// Prefer the primary RSC fact boxes where the secondary extract disagrees.
const rscMelts = { Tungsten: 3414, Rhenium: 3185, Osmium: 3033, Tantalum: 3017, Molybdenum: 2622 };
const metals = elements.filter(e => e.number <= 92 && metalCategories.has(e.category) && e.melt !== null).map(e => entry(e.name, rscMelts[e.name] ?? Math.round(e.melt - 273.15),
  [e.symbol, ...(e.name === 'Aluminium' ? ['Aluminum'] : []), ...(e.name === 'Caesium' ? ['Cesium'] : []), ...(e.name === 'Tungsten' ? ['Wolfram'] : [])]));
add('metal-melting-v1', 'metal', 'Name a metal element.', 'Highest melting point', '°C',
  'Metal elements up to uranium with recorded melting points in the frozen periodic-table dataset. Pure elements only: steel, bronze and other alloys do not count. Metalloids and nonmetals excluded. Symbols accepted. Source kelvin values converted to Celsius and rounded to whole degrees; the top five values use the Royal Society of Chemistry fact boxes.',
  'https://github.com/Bowserinator/Periodic-Table-JSON', metals,
  [[-38.83, .05], [327, .15], [1000, .3], [1500, .5], [2000, .7], [3000, .9], [Math.max(...metals.map(e => e.value)), 1]]);

const alcohol = wbEntries('alcohol');
add('alcohol-2019-v1', 'alcohol', 'Name a country.', 'Most alcohol per person aged 15+ · 2019', 'litres of pure alcohol/year',
  'WHO estimates via World Bank, 2019. Annual litres of pure alcohol per person aged 15+, including people who do not drink; not litres of beer or total national consumption. Countries with reported values only. Values rounded to two decimals. This measures consumption, not safety.',
  'https://data.worldbank.org/indicator/SH.ALC.PCAP.LI', alcohol,
  [[0, .05], [3, .15], [6, .3], [9, .5], [12, .7], [14, .85], [Math.max(...alcohol.map(e => e.value)), 1]]);

// A published ID is immutable: a correction gets a new ID and retains the old set.
const previous = JSON.parse(await readFile(new URL('../data/curated.json', import.meta.url), 'utf8'));
const all = new Map([...retired, ...prompts].map(p => [p.id, p]));
for (const p of [...(previous.retired || []), ...previous.prompts]) {
  if (JSON.stringify(all.get(p.id)) !== JSON.stringify(p)) throw new Error(`Published question changed or removed: ${p.id}. Retire it and use a new ID.`);
}
await writeFile(new URL('../data/curated.json', import.meta.url), JSON.stringify({ version: '2026-09-28.1', importedAt: '2026-09-28', provenance, retired, prompts }, null, 2) + '\n');
console.log(prompts.map(p => `${p.id}: ${p.entries.length} answers; leader ${[...p.entries].sort((a, b) => b.value - a.value)[0].name}`).join('\n'));
