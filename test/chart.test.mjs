import test from 'node:test';
import assert from 'node:assert/strict';
import { blockChart } from '../public/chart.js';
import { distribution } from '../game.mjs';

test('block chart preserves counts, empty bands, exact endpoints and bounded drawing size', () => {
  const stats = distribution([0, 31, 32, 512, 512, 1023, 1024], 512, 1024);
  assert.equal(stats.bins.length, 32);
  assert.deepEqual(stats.bins.slice(0, 2), [2, 1]);
  assert.equal(stats.bins[16], 2); assert.equal(stats.bins[31], 2);
  assert.equal(stats.below, 3); assert.equal(stats.equal, 2);
  for (const counts of [Array(32).fill(0), stats.bins, stats.bins.map(n => n * 100000 + 1)]) {
    const count = counts.reduce((a, b) => a + b, 0);
    const html = blockChart({ count, bins:counts }, 512, 320);
    assert(!/NaN|Infinity/.test(html));
    const unit = Number(html.match(/Each full block represents (\d+)/)[1]);
    const groups = [...html.matchAll(/<g class="distribution-bin[^>]*data-count="(\d+)">([\s\S]*?)<\/g>/g)];
    assert.equal(groups.length, 32);
    groups.forEach((group, i) => {
      const blocks = [...group[2].matchAll(/<rect[^>]*height="([\d.e+-]+)"/g)];
      const represented = blocks.reduce((sum, block) => sum + Number(block[1]) / 7 * unit, 0);
      assert(Math.abs(represented - counts[i]) < 1e-6, `band ${i} preserves its real count`);
      assert(blocks.length <= 14, 'large cohorts cannot create unbounded SVG nodes');
      if (!counts[i]) assert.equal(blocks.length, 0, 'empty bands stay empty');
    });
    assert.match(html, /class="marker" x1="160" x2="160"/);
    assert.match(html, /distribution-bin selected" data-count=/);
  }
  assert.match(blockChart(stats, 0, 320), /class="marker" x1="10" x2="10"/);
  assert.match(blockChart(stats, 1024, 320), /class="marker" x1="310" x2="310"/);
  assert.match(blockChart(stats, 1024, 320), /distribution-bin selected" data-count="2"><title>992–1024 MB/);
});
