const $ = selector => document.querySelector(selector);
const screen = $('#screen'), errorBox = $('#error'), canvas = $('#memory'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let run, day, active = false, busy = false, offset = 0, timer, lastSubmitted, soundEnabled = false, audio;
let displayedScore = 0, targetScore = 0, challengeId = new URLSearchParams(location.search).get('attack');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const format = value => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
const valueText = (answer, prompt) => `${format(answer.value)} ${prompt.unit}`;
function message(text) { errorBox.hidden = !text; errorBox.textContent = text; }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Connection lost. Try again.');
  if (result.serverTime) offset = result.serverTime - Date.now();
  return result;
}
function beep(success = true) {
  if (!soundEnabled) return;
  try {
    audio ||= new AudioContext(); audio.resume();
    const now = audio.currentTime;
    [0, .055, .12].forEach((delay, i) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'square'; oscillator.frequency.value = success ? [170, 340, 510][i] : [130, 110, 80][i];
      gain.gain.setValueAtTime(.017, now + delay); gain.gain.exponentialRampToValueAtTime(.001, now + delay + .05);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now + delay); oscillator.stop(now + delay + .06);
    });
  } catch { /* Sound is optional when an audio device is unavailable. */ }
}
$('#sound').onclick = () => {
  soundEnabled = !soundEnabled;
  $('#sound').textContent = soundEnabled ? 'SND ON' : 'SND OFF';
  $('#sound').setAttribute('aria-pressed', String(soundEnabled));
  $('#sound').setAttribute('aria-label', soundEnabled ? 'Disable sound' : 'Enable sound');
  beep();
};
// Ten rows × ten files. Each file occupies two text cells, never a mascot.
const cells = Array.from({ length: 100 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10), noise: Math.sin(i * 127.1 + 19) * .5 + .5 }));
const spread = [...cells].sort((a, b) => (a.x + a.noise * 2 + Math.abs(a.y - 4.5) * .22) - (b.x + b.noise * 2 + Math.abs(b.y - 4.5) * .22));
const glyphs = '░▒▓█#01A79F';
let frame = 0;
function drawMemory() {
  const delta = targetScore - displayedScore;
  displayedScore = reducedMotion.matches || Math.abs(delta) < .1 ? targetScore : displayedScore + delta * .35;
  const occupied = new Set(spread.slice(0, Math.round(displayedScore)));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '25px "Courier New", monospace'; ctx.textBaseline = 'middle';
  for (const cell of cells) {
    const infected = occupied.has(cell);
    for (let part = 0; part < 2; part++) {
      const n = Math.abs(Math.floor(Math.sin(cell.x * 23 + cell.y * 47 + part * 113 + (reducedMotion.matches ? 0 : frame * .13)) * 1000));
      ctx.fillStyle = infected ? ['#4bba67', '#75ef8b', '#a4ffb5', '#3a9a50'][n % 4] : '#21462b';
      const char = infected ? glyphs[n % glyphs.length] : '·';
      ctx.fillText(char, 25 + cell.x * 60 + part * 28, 20 + cell.y * 24);
    }
  }
  $('#infection').textContent = `${format(Math.round(displayedScore * 10) / 10)}% INFECTED`;
  frame++;
}
document.fonts.ready.then(drawMemory);
setInterval(() => { if (!document.hidden) drawMemory(); }, 170);
function showDialog(html) {
  $('#info-content').innerHTML = html;
  if (!$('#info').open) $('#info').showModal();
}
$('#how').onclick = () => showDialog(`<h2>Infect the machine.</h2><ol><li><strong>Seven prompts, 20 seconds each.</strong> Type one answer. Everyone gets the same daily questions.</li><li><strong>Pick high on the scale.</strong> An answer's position in its catalogue determines how much of that question's 1/7 share you infect.</li><li><strong>No match, no infection.</strong> Common aliases and clear typos are accepted. Each prompt's [?] explains its answer pool.</li><li><strong>Compare your run.</strong> Results show real completed daily runs. Sending your virus to a friend is optional.</li></ol><p class="small">The daily resets at 00:00 UTC. Your browser remembers your run. During a question, the clock keeps running even if you leave.</p><p class="small">In a challenge, the higher-ranked answer wins the whole chunk; ties split it.</p>`);
$('#archive').onclick = () => {
  const yesterday = new Date(`${day}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const max = yesterday.toISOString().slice(0, 10);
  showDialog(`<h2>Previous infections.</h2><p>Replay a previous day's seven prompts. Archive scores stay separate from the daily ranking.</p>${max >= '2026-09-27' ? `<form id="archive-form"><label for="archive-day">Choose a day</label><input id="archive-day" type="date" min="2026-09-27" max="${max}" value="${max}" required><button class="primary">OPEN ARCHIVE ↵</button></form>` : '<p>The first archived run will appear tomorrow.</p>'}`);
  $('#archive-form')?.addEventListener('submit', event => { event.preventDefault(); $('#info').close(); createRun('archive', { day: $('#archive-day').value }); });
};
$('#practice').onclick = () => createRun('practice');
$('.wordmark').addEventListener('click', () => {
  try { sessionStorage.removeItem('germillion-run'); } catch { /* Daily also restores from the cookie. */ }
});
function setRun(next) {
  if (run?.id !== next.id) displayedScore = next.score;
  run = next; targetScore = next.score;
  try { sessionStorage.setItem('germillion-run', next.id); } catch { /* Cookies still preserve daily progress. */ }
}
async function createRun(mode = 'daily', extra = {}) {
  if (busy) return;
  busy = true; message('');
  try { setRun(await api('/api/run', { mode, ...extra })); render(); }
  catch (error) { message(error.message); }
  finally { busy = false; }
}
function modeLabel() { return run.mode === 'daily' ? 'DAILY' : run.mode === 'challenge' ? 'INCOMING VIRUS' : run.mode === 'archive' ? 'ARCHIVE' : 'UNLIMITED'; }
function intro() {
  document.body.classList.remove('playing');
  screen.innerHTML = `<div class="intro"><p class="eyebrow">${run ? modeLabel() : 'DAILY'} / ${escape(run?.day || day)}</p><h1>How far can you spread?</h1><p class="intro-copy">Seven questions. Twenty seconds each.<br>Your answers infect the machine.</p>${run?.challenge ? `<p class="challenge-line">${escape(run.challenge.name)}'s virus is attacking.<br>Beat their answer to win each chunk.</p>` : ''}<button class="primary" id="begin">BEGIN INFECTION ↵</button><p class="secondary-line">One answer per question. Bigger rank, bigger infection.</p></div>`;
  $('#begin').onclick = async () => { if (!run) await createRun(); if (run?.status === 'ready') startRound(); };
}
function render() {
  clearInterval(timer); active = false; message('');
  if (run.status === 'ready') { intro(); return; }
  if (run.status === 'question') { question(); return; }
  if (run.status === 'reveal') { reveal(); return; }
  results();
}
async function startRound() {
  if (busy) return;
  busy = true; message('');
  try {
    setRun(await api(`/api/run/${run.id}/start`, { round: run.round })); render();
  } catch (error) { message(error.message); }
  finally { busy = false; }
}
function question() {
  document.body.classList.add('playing'); active = true; lastSubmitted = null;
  screen.innerHTML = `<div class="meta"><p class="eyebrow">QUESTION ${run.round + 1} / 7</p><span class="clock" id="clock" aria-label="Seconds remaining">20s</span></div><h1>${escape(run.prompt.title)}</h1><p class="axis">${escape(run.prompt.axis)}<button class="question-info" id="scope" aria-label="Answer catalogue details">[?]</button></p><form class="answer-form" id="answer-form"><label class="status-live" for="answer">Your answer</label><div class="answer-line"><span aria-hidden="true">&gt;</span><input id="answer" name="answer" type="text" maxlength="160" placeholder="your answer" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" autofocus></div><div class="submit-row"><span class="quiet">One answer. Make it count.</span><button class="enter" type="submit">ENTER ↵</button></div></form><span class="status-live" id="time-warning" role="status"></span>`;
  $('#scope').onclick = () => showDialog(`<h2>${escape(run.prompt.title)}</h2><p>${escape(run.prompt.scope)}</p><p><strong>${format(run.prompt.count)} ranked answers.</strong> Common aliases and unambiguous spelling variants accepted.</p><p class="small">The 20-second clock keeps running.</p><a class="source" href="${escape(run.prompt.source)}" target="_blank" rel="noopener noreferrer">Data source ↗</a>`);
  $('#answer-form').onsubmit = event => { event.preventDefault(); submitAnswer($('#answer').value); };
  $('#answer').focus({ preventScroll: true });
  timer = setInterval(tick, 100); tick();
}
function tick() {
  if (!active || !$('#clock')) return;
  const left = Math.max(0, Math.ceil((run.deadline - Date.now() - offset) / 1000));
  $('#clock').textContent = `${left}s`;
  $('#clock').classList.toggle('urgent', left <= 5);
  if (left <= 5 && left > 0) $('#time-warning').textContent = 'Five seconds or less remaining.';
  if (left === 0 && !busy) submitAnswer('', true);
}
async function submitAnswer(answer, expired = false) {
  if (busy || !active) return;
  if (!expired && !answer.trim()) { $('#answer').focus(); return; }
  busy = true; active = false; clearInterval(timer); message('');
  $('#answer').disabled = true; $('.enter').disabled = true;
  lastSubmitted = { answer: expired ? '' : answer, round: run.round };
  try {
    const next = await api(`/api/run/${run.id}/answer`, lastSubmitted);
    $('#info').close(); setRun(next); beep(next.last.valid);
    if (next.status === 'complete') reveal(true); else render();
  } catch (error) {
    message(`${error.message} Your clock is still running.`);
    const retry = document.createElement('button'); retry.textContent = 'Retry submission';
    retry.onclick = async () => {
      if (busy) return; busy = true;
      try { const next = await api(`/api/run/${run.id}/answer`, lastSubmitted); setRun(next); render(); }
      catch (e) { message(e.message); errorBox.append(' ', retry); }
      finally { busy = false; }
    };
    errorBox.append(' ', retry);
  } finally { busy = false; }
}
function reveal(final = false) {
  active = false; clearInterval(timer); document.body.classList.remove('playing');
  const a = run.last;
  screen.innerHTML = `<div class="reveal ${a.valid ? '' : 'caught'}"><p class="eyebrow">QUESTION ${run.round} / 7 — ${a.valid ? 'ACCESS GRANTED' : 'ANTIVIRUS INTERCEPTED'}</p>${a.valid ? `<h1>${escape(a.name)}</h1><p class="reveal-value">${escape(valueText(a, a.prompt))}</p><p class="gain">+${format(a.points)}% infected</p><p class="rank">Rank ${a.rank} of ${format(a.total)} · ${escape(a.prompt.axis)}</p>${a.input.toLowerCase() !== a.name.toLowerCase() ? `<small>Accepted “${escape(a.input)}” as ${escape(a.name)}.</small>` : ''}` : `<h1>${a.expired ? 'Time ran out.' : 'Nothing got through.'}</h1><p>${a.expired ? 'The connection closed before your answer arrived.' : `“${escape(a.input)}” wasn't matched in this question's catalogue.`}</p><p class="gain">+0% infected</p>`}${a.opponent ? `<p class="challenge-line">Their answer: ${escape(a.opponent.name || 'No valid answer')}<br>${a.attack > 14 ? 'You won this chunk.' : a.attack > 0 ? 'A tie. This chunk is split.' : 'Their virus won this chunk.'}</p>` : ''}<button class="primary" id="next">${final ? 'VIEW SYSTEM REPORT' : 'NEXT QUESTION'} ↵</button></div>`;
  $('#next').onclick = final ? results : startRound;
  $('#next').focus({ preventScroll: true });
}
function chart(stats, score) {
  const width = 560, height = 125, max = Math.max(...stats.bins, 1), marker = 8 + score / 100 * 544;
  const bars = stats.bins.map((n, i) => `<rect x="${8 + i * 27.2}" y="${height - n / max * 80}" width="21" height="${n / max * 80}" rx="0"><title>${i * 5}–${i === 19 ? 100 : (i + 1) * 5}%: ${n} players</title></rect>`).join('');
  return `<svg viewBox="0 0 ${width} 157" role="img" aria-label="${stats.count} daily runs, your score ${score} percent"><line x1="8" x2="552" y1="125" y2="125"/>${bars}<line class="marker" x1="${marker}" x2="${marker}" y1="24" y2="130"/><text class="you" x="${Math.max(25, Math.min(535, marker))}" y="16" text-anchor="middle">YOU</text><text x="8" y="151">0%</text><text x="552" y="151" text-anchor="end">100%</text></svg>`;
}
function results() {
  document.body.classList.remove('playing'); clearInterval(timer); active = false;
  const ranked = run.mode === 'daily', s = run.stats;
  const comparison = s.count > 1 ? `Higher than ${Math.round(s.below / s.count * 100)}% of today's ${format(s.count)} completed runs.` : s.count === 1 && ranked ? "You're first in. The distribution grows as others finish." : 'No daily scores yet.';
  screen.innerHTML = `<div class="results"><p class="eyebrow">${modeLabel()} / ${run.day} — CONNECTION CLOSED</p><h1>SYSTEM ${format(run.score)}% INFECTED</h1><p class="result-subtitle">Seven answers. ${format(run.score)}% of the machine is yours.</p>${run.challenge ? `<p class="challenge-line">You infected ${format(run.challenge.infection)}% of ${escape(run.challenge.name)}'s computer.<br>Question ties split the chunk.</p>` : ''}${ranked ? `<div class="distribution">${chart(s, run.score)}<p class="distribution-note">${comparison}</p></div>` : '<p class="archive-warning">This run does not affect the daily distribution.</p>'}<div class="result-actions"><button id="share">SEND YOUR VIRUS ↗</button><button id="copy">COPY RESULT</button><button id="again">PLAY UNLIMITED</button></div><div class="answer-summary">${run.answers.map((a, i) => `<details><summary><span><span class="name">${String(i + 1).padStart(2, '0')} / ${escape(a.name || (a.expired ? 'Timed out' : a.input || 'No answer'))}</span><span class="description">${escape(a.prompt.axis)}</span></span><span class="points">+${format(a.points)}%</span></summary><div class="detail-body"><p>${a.valid ? `${escape(valueText(a, a.prompt))} · Rank ${a.rank} of ${format(a.total)}` : 'Antivirus intercepted. No infection.'}</p><p class="eyebrow">TOP FIVE IN THIS CATALOGUE</p><ol class="leaders">${a.top.map((e, n) => `<li><span>${n + 1}. ${escape(e.name)}</span><span>${escape(valueText(e, a.prompt))}</span></li>`).join('')}</ol><div class="source"><p>${escape(a.prompt.scope)}</p><a href="${escape(a.prompt.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a></div></div></details>`).join('')}</div><p class="streak">${run.streak ? `${run.streak}-day streak · ` : ''}Next daily at 00:00 UTC.</p></div>`;
  $('#again').onclick = () => createRun('practice');
  $('#copy').onclick = async () => {
    const blocks = run.answers.map(a => a.fraction >= .75 ? '▓' : a.fraction >= .4 ? '▒' : a.valid ? '░' : '·').join('');
    const text = `GERMILLION ${run.day}\nSYSTEM ${format(run.score)}% INFECTED\n${blocks}\n${location.origin}`;
    try { await navigator.clipboard.writeText(text); $('#copy').textContent = 'COPIED'; }
    catch { showDialog(`<h2>Your system report.</h2><p class="share-link">${escape(text).replace(/\n/g, '<br>')}</p><p class="small">Select and copy the report above.</p>`); }
  };
  $('#share').onclick = shareDialog;
}
function shareDialog() {
  showDialog(`<h2>Send your virus.</h2><p>A friend plays your seven prompts. The higher-ranked answer wins each chunk of their computer.</p><form id="share-form"><label for="codename">Your name (optional)</label><input id="codename" maxlength="24" value="${escape(run.name)}" placeholder="your codename" autocomplete="nickname"><button class="primary" id="make-link">COPY ATTACK LINK ↗</button></form><p id="share-status" class="share-link" role="status"></p>`);
  $('#share-form').onsubmit = async event => {
    event.preventDefault(); $('#make-link').disabled = true;
    try {
      setRun(await api(`/api/run/${run.id}/share`, { name: $('#codename').value }));
      const link = `${location.origin}/?attack=${run.id}`;
      try { await navigator.clipboard.writeText(link); $('#make-link').textContent = 'LINK COPIED'; } catch { $('#make-link').textContent = 'LINK READY'; }
      $('#share-status').textContent = `${run.name || 'Someone'}'s virus is attacking your computer. ${link}`;
    } catch (error) { $('#share-status').textContent = error.message; }
    finally { $('#make-link').disabled = false; }
  };
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
async function boot() {
  try {
    const state = await api('/api/today'); day = state.day;
    if (challengeId) {
      const incoming = await api(`/api/challenge/${encodeURIComponent(challengeId)}`);
      screen.innerHTML = `<div class="intro"><p class="eyebrow">INCOMING VIRUS / ${incoming.day}</p><h1>${escape(incoming.name)}'s virus<br>is attacking.</h1><p class="intro-copy">Same seven prompts. Your answers against theirs.<br>Win each chunk with a higher-ranked answer.</p><button class="primary" id="defend">ACCEPT ATTACK ↵</button></div>`;
      $('#defend').onclick = () => createRun('challenge', { challenge: challengeId });
      return;
    }
    let saved;
    try { const id = sessionStorage.getItem('germillion-run'); if (id) saved = await api(`/api/run/${id}`); } catch { /* Expired local run: fall back to today's run. */ }
    if (saved && (saved.mode !== 'daily' || saved.day === day)) setRun(saved);
    else if (state.run) setRun(state.run);
    if (run) render(); else intro();
  } catch (error) {
    screen.innerHTML = '<div class="intro"><h1>Connection interrupted.</h1><button class="primary" id="reconnect">RECONNECT ↵</button></div>';
    $('#reconnect').onclick = boot; message(error.message);
  }
}
boot();
