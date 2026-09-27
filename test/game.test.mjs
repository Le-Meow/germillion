import test from 'node:test';
import assert from 'node:assert/strict';
import { data, dailyPrompts, prompts, grade, topFive, totalScore, distribution, attackPoints, CHUNK, normalize } from '../game.mjs';

test('daily selection is deterministic, has seven families and varies by day', () => {
  assert.deepEqual(dailyPrompts('2026-09-27'), dailyPrompts('2026-09-27'));
  assert.equal(new Set(dailyPrompts('2026-09-27').map(id => prompts.get(id).family)).size, 7);
  assert.notDeepEqual(dailyPrompts('2026-09-27'), dailyPrompts('2026-09-28'));
});
test('aliases, accents and unambiguous spelling errors are accepted', () => {
  assert.equal(normalize("The Côte d'Ivoire"), 'cotedivoire');
  for (const text of ['USA', 'America', 'United States of America']) assert.equal(grade('country-area', text).name, 'United States');
  assert.equal(grade('country-area', 'Austraila').name, 'Australia');
  assert.equal(grade('element-number', 'Aluminum').name, 'Aluminium');
  assert.equal(grade('element-number', 'Au').name, 'Gold');
  assert.equal(grade('mammal-sleep', 'cat').name, 'Domestic cat');
  assert.equal(grade('film-runtime', 'LOTR 3').name, 'The Lord of the Rings: The Return of the King');
});
test('empty, expired, short guesses and ambiguous names do not get free points', () => {
  for (const text of ['', '???', 'a', 'Atlantis']) assert.equal(grade('country-area', text).points, 0);
  assert.equal(grade('country-area', 'Russia', true).points, 0);
  assert.equal(grade('mammal-sleep', 'bat').valid, false);
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
  assert.equal(s.bins[19], 1); assert.equal(s.bins.reduce((a, b) => a + b, 0), 5);
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
