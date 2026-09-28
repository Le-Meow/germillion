import test from 'node:test';
import assert from 'node:assert/strict';
import { data, dailyPrompts, prompts, grade, matchAnswer, suggestions, topFive, totalScore, totalMB, distribution, attackPoints, CHUNK, normalize } from '../game.mjs';

test('daily selection is deterministic, has seven families and varies by day', () => {
  assert.deepEqual(dailyPrompts('2026-09-27'), dailyPrompts('2026-09-27'));
  assert.equal(new Set(dailyPrompts('2026-09-27').map(id => prompts.get(id).family)).size, 7);
  assert.notDeepEqual(dailyPrompts('2026-09-27'), dailyPrompts('2026-09-28'));
});
test('reviewed aliases and accents are accepted; uncertain spellings need confirmation', () => {
  assert.equal(normalize("The Côte d'Ivoire"), 'cotedivoire');
  for (const text of ['USA', 'America', 'United States of America']) assert.equal(grade('country-area', text).name, 'United States');
  assert.equal(grade('country-area', 'Austraila').valid, false);
  assert(suggestions('country-area', 'Austraila').includes('Australia'));
  assert.equal(grade('element-number', 'Aluminum').name, 'Aluminium');
  assert.equal(grade('element-number', 'Au').name, 'Gold');
  assert.equal(grade('mammal-sleep', 'cat').name, 'Domestic cat');
  assert.equal(grade('film-runtime', 'LOTR 3').name, 'The Lord of the Rings: The Return of the King');
});
test('a different real place is never silently accepted as a country', () => {
  for (const p of prompts.values()) if (p.entries.some(e => e.name === 'Liberia')) {
    assert.equal(grade(p.id, 'Siberia').valid, false, p.id);
    assert(suggestions(p.id, 'Siberia').includes('Liberia'), p.id);
    assert.equal(grade(p.id, 'Liberia').name, 'Liberia');
  }
  assert.equal(grade('sleep-v2', 'koalaa').valid, false);
  assert(suggestions('sleep-v2', 'koalaa').includes('Koala'));
});
test('empty, expired, short guesses and ambiguous names do not get free points', () => {
  for (const text of ['', '???', 'a', 'Atlantis']) assert.equal(grade('country-area', text).points, 0);
  assert.equal(grade('country-area', 'Russia', true).points, 0);
  assert.equal(grade('mammal-sleep', 'bat').valid, false);
});

test('suggestions disambiguate names without selecting a score for the player', () => {
  assert.equal(grade('sleep-v2', 'bat').valid, false);
  assert.deepEqual(suggestions('sleep-v2', 'bat'), ['Big brown bat', 'Little brown bat']);
  assert.deepEqual(suggestions('sleep-v2', 'elephant'), ['African elephant', 'Asian elephant']);
  assert.deepEqual(suggestions('oscar-nominations-v1', 'The Lion King'), ['The Lion King (1994)', 'The Lion King (2019)']);
  assert.equal(grade('oscar-nominations-v1', 'The Lion King').valid, false);
  assert.equal(grade('oscar-nominations-v1', 'The Lion King (2019)').value, 1);
  for (const text of ['', 'a', '??', 'Atlantis']) assert.deepEqual(suggestions('forest-2021-v1', text), []);
  const prompt = { entries: [
    { name: 'Other', keys: ['other', 'alpha'] }, { name: 'Alpha', keys: ['alpha'] },
  ] };
  assert.equal(matchAnswer(prompt, ' Alpha ').name, 'Alpha');
});

test('koala and aliases use a sourced estimate; old questions remain frozen', () => {
  for (const answer of ['koala', 'koalas', 'koala bear', 'Phascolarctos cinereus']) {
    const hit = grade('sleep-v2', answer);
    assert.equal(hit.name, 'Koala'); assert.equal(hit.value, 19);
    assert.match(hit.note, /18–20/); assert.match(hit.source, /zoo.org.au/);
    assert(hit.fraction > .9 && hit.fraction < 1);
  }
  assert(dailyPrompts('2026-09-27').includes('sleep-v1'));
  assert(dailyPrompts('2026-09-28').includes('sleep-v2'));
  assert.equal(grade('sleep-v1', 'Koala').valid, false, 'historical catalogue is not silently rewritten');
  assert.equal(grade('sleep-v1', 'Cat').points, grade('sleep-v2', 'Cat').points);
});

test('MB totals round once and displayed-score ties use real observations', () => {
  assert.equal(totalMB(Array(7).fill({ points: CHUNK })), 1024);
  assert.equal(totalMB(Array(7).fill({ points: CHUNK / 2 })), 512);
  assert.equal(totalMB(Array(7).fill({ points: 0 })), 0);
  const stats = distribution([0, 512, 512, 1024], 512, 1024);
  assert.equal(stats.below, 1); assert.equal(stats.equal, 2);
  assert.equal(stats.bins[31], 1);
});

test('every reviewed alias resolves or offers its ambiguous canonical choice', () => {
  for (const p of data.prompts) for (const e of p.entries) for (const alias of e.aliases) {
    const hit = grade(p.id, alias);
    if (hit.valid) assert.equal(hit.name, e.name, `${p.id}: alias ${alias} assigned to the wrong answer`);
    else assert(suggestions(p.id, alias).includes(e.name), `${p.id}: alias ${alias} is unreachable`);
  }
});
test('ranking is monotonic, ties score equally, and seven chunks sum to 100', () => {
  assert.equal(grade('country-area', 'Russia').points, CHUNK);
  assert(grade('country-area', 'Australia').points > grade('country-area', 'Belgium').points);
  assert.equal(grade('country-borders', 'Australia').points, grade('country-borders', 'Japan').points);
  assert.equal(grade('country-borders', 'China').value, 14, 'dependent territories are not counted as countries');
  assert.equal(totalScore(Array(7).fill({ points: CHUNK })), 100);
  assert.equal(topFive('element-number')[0].name, 'Oganesson');
  for (const p of prompts.values()) for (const e of p.entries) assert(Number.isFinite(e.value));
});
test('challenge ties split chunks; real score bins include 100%', () => {
  const high = { fraction: .9 }, low = { fraction: .1 };
  assert.equal(attackPoints(high, low), CHUNK);
  assert.equal(attackPoints(low, high), 0);
  assert.equal(attackPoints(low, low), CHUNK / 2);
  assert.equal(attackPoints({ valid: true, fraction: 0 }, { valid: false, fraction: 0 }), CHUNK);
  const s = distribution([0, 25, 50, 50, 100], 50);
  assert.equal(s.count, 5); assert.equal(s.below, 2); assert.equal(s.equal, 2);
  assert.equal(s.bins[31], 1); assert.equal(s.bins.reduce((a, b) => a + b, 0), 5);
});

test('reviewed set preserves factual order, ties, scope and useful score separation', () => {
  assert.equal(data.prompts.length, 7);
  for (const p of data.prompts) {
    const sorted = [...p.entries].sort((a, b) => a.value - b.value);
    assert(p.entries.length >= 50);
    let previous;
    for (const e of sorted) {
      const result = grade(p.id, e.name);
      assert(result.valid, `${p.id}: ${e.name} must resolve unambiguously`);
      assert(result.fraction > 0 && result.fraction <= 1);
      if (previous) {
        if (e.value === previous.value) assert.equal(result.fraction, previous.fraction);
        else assert(result.fraction > previous.fraction, `${p.id}: higher measurements must score more`);
      }
      previous = result;
    }
    assert.equal(previous.fraction, 1);
    assert(p.anchors.every(([v, f], i) => !i || v > p.anchors[i - 1][0] && f > p.anchors[i - 1][1]));
  }
  assert.equal(grade('pokemon-speed-v1', 'Electrode').value, 150);
  assert.equal(grade('pokemon-speed-v1', 'Jolteon').points, grade('pokemon-speed-v1', 'Mewtwo').points);
  assert.equal(topFive('pokemon-speed-v1')[2].rank, 2);
  assert.equal(grade('state-water-v1', 'MI').value, 41.54);
  assert.equal(grade('metal-melting-v1', 'W').value, 3414);
  assert.equal(grade('metal-melting-v1', 'steel').valid, false);
  assert.equal(grade('oscar-nominations-v1', 'Titanic').value, 14);
  assert.equal(grade('oscar-nominations-v1', 'Oppenheimer').value, 13);
  assert.equal(grade('oscar-nominations-v1', 'LOTR 3').value, 11);
  assert.equal(grade('forest-2021-v1', 'Atlantis').valid, false);
  assert(grade('forest-2021-v1', 'Japan').value > grade('forest-2021-v1', 'Brazil').value);
  const plausible = ['Brazil', 'Cat', 'Pikachu', 'The Matrix', 'Minnesota', 'Gold', 'Russia'];
  const informed = ['Finland', 'Sloth', 'Jolteon', 'Oppenheimer', 'Florida', 'Titanium', 'Germany'];
  const score = answers => totalScore(data.prompts.map((p, i) => grade(p.id, answers[i])));
  assert(score(plausible) > 40 && score(plausible) < 50);
  assert(score(informed) > 65 && score(informed) < 80);
});
