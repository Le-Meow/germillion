import { readFile, writeFile } from 'node:fs/promises';

// Frozen factual extracts. Refresh deliberately: changing a pool changes its ranks.
const sources = {
  countries: 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
  elements: 'https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/PeriodicTableJSON.json',
  pokemon: 'https://raw.githubusercontent.com/veekun/pokedex/master/pokedex/data/csv/pokemon.csv',
  mammals: 'https://raw.githubusercontent.com/vincentarelbundock/Rdatasets/master/csv/ggplot2/msleep.csv',
  films: 'https://raw.githubusercontent.com/sundeepblue/movie_rating_prediction/master/movie_metadata.csv',
  states: 'https://raw.githubusercontent.com/jakevdp/data-USstates/master/state-areas.csv',
};
function csv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (c === '\n') { rows.push(row); row = []; }
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const headers = rows.shift();
  return rows.filter(r => r.length === headers.length).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
const raw = {};
for (const [name, url] of Object.entries(sources)) {
  try { raw[name] = await readFile(new URL(`../data/${name}.raw`, import.meta.url), 'utf8'); }
  catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    raw[name] = await response.text();
  }
}
const entry = (name, value, aliases = []) => ({ name: name.trim(), value: Number(value), aliases });
const countryAliases = {
  USA: ['USA', 'US', 'America', 'United States of America'], GBR: ['UK', 'Britain', 'Great Britain'],
  COD: ['DRC', 'DR Congo', 'Democratic Republic of the Congo'], COG: ['Republic of the Congo', 'Congo Brazzaville'],
  CIV: ['Ivory Coast'], CZE: ['Czech Republic'], SWZ: ['Swaziland'], TLS: ['East Timor'],
  TUR: ['Turkey', 'Turkiye'], VAT: ['Vatican', 'Holy See'], KOR: ['South Korea'], PRK: ['North Korea'],
};
const countries = JSON.parse(raw.countries).filter(c => c.independent === true || ['PSE', 'TWN', 'XKX'].includes(c.cca3));
const countryCodes = new Set(countries.map(c => c.cca3));
const countryEntries = fn => countries.map(c => entry(c.name.common, fn(c), [c.name.official, c.cca3, ...(countryAliases[c.cca3] || [])]));
const elements = JSON.parse(raw.elements).elements.filter(e => e.number <= 118);
const pokemon = csv(raw.pokemon).filter(p => Number(p.id) <= 151);
const mammals = csv(raw.mammals);
const aliases = {
  'Domestic cat': ['Cat', 'House cat'], 'Dog': ['Domestic dog'], 'Three-toed sloth': ['Sloth'],
  'North American Opossum': ['Opossum', 'Virginia opossum'], 'Thick-tailed opposum': ['Thick-tailed opossum'],
  'European hedgehog': ['Hedgehog'], 'House mouse': ['Mouse'], 'Laboratory rat': ['Rat'],
  'Golden hamster': ['Hamster'], 'Mongolian gerbil': ['Gerbil'], 'Chimpanzee': ['Chimp'],
  'Short-nosed echidna': ['Echidna', 'Short-beaked echidna'], 'Bottle-nosed dolphin': ['Dolphin', 'Bottlenose dolphin'],
  'Brazilian tapir': ['Tapir'], 'Roe deer': ['Deer'], 'Human': ['Person', 'Homo sapiens'],
};
const filmMap = new Map();
for (const f of csv(raw.films)) {
  const name = f.movie_title.trim(), year = Number(f.title_year), duration = Number(f.duration);
  if (!name || year < 1900 || year > 2016 || duration < 40 || duration > 300) continue;
  const old = filmMap.get(name.toLowerCase());
  // Keep the most-voted version for ambiguous remake titles; document this in scope.
  if (!old || Number(f.num_voted_users) > old.votes) filmMap.set(name.toLowerCase(), { name, year, duration, votes: Number(f.num_voted_users) });
}
const filmAliases = {
  'The Lord of the Rings: The Fellowship of the Ring': ['Fellowship of the Ring', 'LOTR 1'],
  'The Lord of the Rings: The Two Towers': ['The Two Towers', 'LOTR 2'],
  'The Lord of the Rings: The Return of the King': ['Return of the King', 'LOTR 3'],
  'Star Wars: Episode IV - A New Hope': ['Star Wars', 'A New Hope', 'Star Wars 4'],
  'Star Wars: Episode V - The Empire Strikes Back': ['Empire Strikes Back', 'Star Wars 5'],
  'Star Wars: Episode VI - Return of the Jedi': ['Return of the Jedi', 'Star Wars 6'],
  'Terminator 2: Judgment Day': ['Terminator 2', 'T2'],
  'Harry Potter and the Sorcerer\'s Stone': ["Harry Potter and the Philosopher's Stone", 'Harry Potter 1'],
};
const stateCodes = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const states = csv(raw.states).filter(s => !['District of Columbia', 'Puerto Rico'].includes(s.state));
const prompts = [];
function add(id, family, title, axis, unit, scope, source, entries) {
  if (!entries.length || entries.some(e => !Number.isFinite(e.value))) throw new Error(`Invalid data: ${id}`);
  prompts.push({ id, family, title, axis, unit, scope, source, entries });
}
const geoScope = `${countries.length} countries in the frozen catalogue. Areas include inland water; border counts follow the source's country definitions.`;
add('country-area', 'country', 'Name a country.', 'Largest area', 'km²', geoScope, 'https://github.com/mledoze/countries', countryEntries(c => c.area));
add('country-borders', 'borders', 'Name a country.', 'Most neighbouring countries', 'neighbours', geoScope, 'https://github.com/mledoze/countries', countryEntries(c => c.borders.filter(code => countryCodes.has(code)).length));
add('element-number', 'element', 'Name an element.', 'Highest atomic number', 'protons', 'All 118 named elements. Chemical symbols are accepted.', 'https://github.com/Bowserinator/Periodic-Table-JSON', elements.map(e => entry(e.name, e.number, [e.symbol, ...(e.name === 'Aluminium' ? ['Aluminum'] : []), ...(e.name === 'Caesium' ? ['Cesium'] : [])])));
add('element-mass', 'element', 'Name an element.', 'Greatest atomic mass', 'u', 'All 118 named elements. Frozen standard atomic weights or representative isotope masses.', 'https://github.com/Bowserinator/Periodic-Table-JSON', elements.map(e => entry(e.name, e.atomic_mass, [e.symbol, ...(e.name === 'Aluminium' ? ['Aluminum'] : []), ...(e.name === 'Caesium' ? ['Cesium'] : [])])));
for (const metric of ['weight', 'height']) add(`pokemon-${metric}`, 'pokemon', 'Name a Pokémon.', metric === 'weight' ? 'Heaviest · original 151' : 'Tallest · original 151', metric === 'weight' ? 'kg' : 'm', 'Original 151 only, using their standard Pokédex forms.', 'https://github.com/veekun/pokedex', pokemon.map(p => entry(p.identifier.replace(/(^|-)([a-z])/g, (_, sep, c) => `${sep ? ' ' : ''}${c.toUpperCase()}`), Number(p[metric]) / 10, [p.identifier, ...(p.identifier === 'nidoran-f' ? ['Nidoran female', 'Nidoran♀'] : []), ...(p.identifier === 'nidoran-m' ? ['Nidoran male', 'Nidoran♂'] : [])])));
add('mammal-sleep', 'mammal', 'Name a mammal.', 'Most hours asleep per day', 'hours/day', '83 mammals from the msleep study dataset. Study averages, not universal biological constants. Use a species name when possible (e.g. African elephant).', 'https://ggplot2.tidyverse.org/reference/msleep.html', mammals.map(m => entry(m.name, m.sleep_total, aliases[m.name] || [])));
add('mammal-weight', 'mammal', 'Name a mammal.', 'Greatest body weight', 'kg', '83 mammals from the msleep study dataset. Study averages. Use a species name when possible.', 'https://ggplot2.tidyverse.org/reference/msleep.html', mammals.map(m => entry(m.name, m.bodywt, aliases[m.name] || [])));
add('film-runtime', 'film', 'Name a film.', 'Longest runtime · pre-2017', 'minutes', `${filmMap.size} titles in the IMDb 5000 snapshot, released 1900–2016, with recorded runtimes of 40–300 minutes. Remakes use the most-voted version; runtimes follow this snapshot.`, 'https://github.com/sundeepblue/movie_rating_prediction', [...filmMap.values()].map(f => entry(f.name, f.duration, [...(filmAliases[f.name] || []), `${f.name} ${f.year}`])));
add('state-area', 'state', 'Name a US state.', 'Largest total area', 'sq mi', 'The 50 US states, total area including water, as recorded in the source snapshot. Two-letter abbreviations accepted.', 'https://github.com/jakevdp/data-USstates', states.map((s, i) => entry(s.state, s['area (sq. mi)'], [stateCodes[i]])));
await writeFile(new URL('../data/prompts.json', import.meta.url), JSON.stringify({ version: '2026-09-27.1', importedAt: '2026-09-27', prompts }));
console.log(prompts.map(p => `${p.id}: ${p.entries.length} answers`).join('\n'));
