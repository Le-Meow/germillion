// Counts are supplied by the daily cohort; the drawing never invents a curve.
export function blockChart(stats, megabytes, width = 650) {
  const left = 10, right = width - 10, base = 186, height = 224;
  const maximum = Math.max(1, ...stats.bins), target = Math.max(1, maximum / 14);
  const power = 10 ** Math.floor(Math.log10(target));
  const unit = [1, 2, 5, 10].map(n => n * power).find(n => n >= target);
  const column = (right - left) / stats.bins.length, blockWidth = Math.max(2, Math.floor(column - 3));
  const selected = Math.min(stats.bins.length - 1, Math.floor(megabytes / 1024 * stats.bins.length));
  const marker = left + megabytes / 1024 * (right - left);
  const bars = stats.bins.map((count, i) => {
    const x = Math.round(left + i * column + (column - blockWidth) / 2);
    const from = Math.ceil(i * 1024 / stats.bins.length), to = i === stats.bins.length - 1 ? 1024 : Math.ceil((i + 1) * 1024 / stats.bins.length) - 1;
    let blocks = '';
    for (let j = 0; j < Math.ceil(count / unit); j++) {
      const h = 7 * Math.min(1, (count - j * unit) / unit);
      blocks += `<rect x="${x}" y="${base - j * 10 - h}" width="${blockWidth}" height="${h}"/>`;
    }
    return `<g class="distribution-bin${i === selected ? ' selected' : ''}" data-count="${count}"><title>${from}–${to} MB: ${count} ${count === 1 ? 'run' : 'runs'}</title>${blocks}</g>`;
  }).join('');
  const ticks = (width < 420 ? [0, 512, 1024] : [0, 256, 512, 768, 1024]).map(value => {
    const x = left + value / 1024 * (right - left), anchor = value === 0 ? 'start' : value === 1024 ? 'end' : 'middle';
    return `<line x1="${x}" x2="${x}" y1="${base + 6}" y2="${base + 11}"/><text x="${x}" y="${base + 31}" text-anchor="${anchor}">${value === 1024 ? '1,024 MB' : value === 0 ? '0 MB' : value}</text>`;
  }).join('');
  return `<div class="distribution-heading"><h2 class="section-label">TODAY’S INFECTIONS</h2><span class="block-legend">■ = ${unit.toLocaleString('en')} ${unit === 1 ? 'RUN' : 'RUNS'}</span></div><svg class="block-chart" viewBox="0 0 ${width} ${height}" height="${height}" role="img" aria-label="Distribution of ${stats.count} completed daily runs. Each full block represents ${unit} ${unit === 1 ? 'run' : 'runs'}; partial blocks represent fewer. Your position is ${megabytes} MB."><line x1="${left}" x2="${right}" y1="${base + 6}" y2="${base + 6}"/>${bars}<line class="marker" x1="${marker}" x2="${marker}" y1="32" y2="${base + 11}"/><rect class="marker-tip" x="${marker - 3}" y="29" width="6" height="6"/><text class="you" x="${Math.max(30, Math.min(width - 30, marker))}" y="17" text-anchor="middle">YOU</text>${ticks}</svg>`;
}
