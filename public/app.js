import { createWorld, DISCOVERIES, technicianLine, tierAt, SKINS, icon, regionAt } from './world.js';
import { blockChart } from './chart.js';
const $ = selector => document.querySelector(selector);
const screen = $('#screen'), errorBox = $('#error'), systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = { get matches(){ return systemMotion.matches || document.body.classList.contains('reduce-motion'); } };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const format = value => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
const valueText = (a, p) => `${a.note ? '≈ ' : ''}${format(a.value)} ${p.unit}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const readPreference = key => { try { return localStorage.getItem(key); } catch { return null; } };
const writePreference = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Optional preferences. */ } };
let run, day, active = false, busy = false, offset = 0, timer, retryAt = 0, audio, lastTick = 20, commentToken = 0;
let soundEnabled = readPreference('germillion-sound') === 'on', skin = Number(readPreference('germillion-skin')) || 0;
let profile = { longest: 0, streak: 0, best: null, yesterday: null };
let dailyState, resetAt=0, incomingId;
let comments=[];
for(const name of ['reduce-motion','high-contrast'])document.body.classList.toggle(name,readPreference(`germillion-${name}`)==='on');
const world = createWorld($('#world'), position => { $('#infection').textContent = `${format(position)} MB`; document.documentElement.style.setProperty('--accent', regionAt(position).color); });
const effects = { boot: [[240,.07],[480,.07]], hit: [[700,.05],[1100,.06]], miss: [[150,.065]], land: [[95,.04],[65,.065]], tick: [[500,.025]], report: [[330,.08],[440,.08],[660,.12]] };
let lastSound = 0;
function sound(type) {
  if (!soundEnabled || (type === 'miss' && Date.now() - lastSound < 450)) return;
  try {
    audio ||= new AudioContext(); audio.resume(); let at = audio.currentTime;
    for (const [hz, duration] of effects[type]) {
      const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = 'square'; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(.012, at); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + duration); at += duration + .008;
    }
    lastSound = Date.now();
  } catch { /* Optional audio. */ }
}
function soundButton() { $('#sound').textContent = soundEnabled ? 'SND ON' : 'SND OFF'; $('#sound').setAttribute('aria-pressed', String(soundEnabled)); $('#sound').setAttribute('aria-label', soundEnabled ? 'Disable sound' : 'Enable sound'); }
$('#sound').onclick = () => { soundEnabled = !soundEnabled; writePreference('germillion-sound', soundEnabled ? 'on' : 'off'); soundButton(); if (soundEnabled) sound('boot'); };
soundButton();
function message(text) { errorBox.hidden = !text; errorBox.textContent = text; }
function animate(node, frames, duration) {
  if (!reducedMotion.matches && node) node.animate(frames, { duration, easing: 'ease-out' });
}
function feedback(kind, strength = 0) {
  if (kind === 'reject') {
    animate($('.answer-line'), [{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(4px)'},{transform:'translateX(-2px)'},{transform:'translateX(0)'}], 320);
    animate(errorBox, [{opacity:.35},{opacity:1}], 220);
    animate($('#world'), [{filter:'contrast(1)'},{filter:'contrast(1.4)'},{filter:'contrast(1)'}], 180);
    return;
  }
  const kick = kind === 'timeout' ? 3 : strength >= .9 ? 7 : strength >= .7 ? 5 : strength >= .45 ? 3 : 0;
  animate($('#world'), [
    {transform:'translate(0,0)',filter:'brightness(1)'},
    {transform:`translate(${-kick}px,${kick/2}px)`,filter:`brightness(${kind==='timeout'?.65:1.2})`},
    {transform:`translate(${kick}px,${-kick/2}px)`,filter:'brightness(1)'},
    {transform:`translate(${-kick/2}px,0)`},{transform:'translate(0,0)'}
  ], kind === 'launch' ? 230 : 480);
}
function stopComment() { commentToken++; $('#it-guy').hidden = true; $('#encounter').hidden = true; }
async function comment(text) {
  const token = ++commentToken;
  $('#it-guy').hidden = false; $('#it-line').textContent = '';
  await pause(reducedMotion.matches ? 0 : 190);
  for (let i = 1; i <= text.length && token === commentToken; i++) { $('#it-line').textContent = text.slice(0, reducedMotion.matches ? text.length : i); if (reducedMotion.matches) break; await pause(24); }
  await pause(4200); if (token === commentToken) { $('#it-guy').hidden = true; $('#encounter').hidden = true; }
}
function view(name) { if(name !== 'report') chartResize.disconnect(); document.body.dataset.view = name; world.phase(name); world.show(!['intro','page'].includes(name)); $('.game-menu').open = false; }
function showDialog(html) { $('#info-content').innerHTML = html; if (!$('#info').open) $('#info').showModal(); }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'CONNECTION INTERRUPTED — TRY AGAIN');
  if (result.serverTime) offset = result.serverTime - Date.now(); return result;
}
function setRun(next, animate = false) {
  if(run?.id!==next.id){comments=[];try{comments=JSON.parse(sessionStorage.getItem(`comments-${next.id}`)||'[]');}catch{}}
  run = next; $('#round-label').innerHTML = `<span class="round-blocks" aria-label="${next.round} of 7 completed">${Array.from({length:7},(_,i)=>`<i class="${i<next.round?'done':i===next.round?'current':''}"></i>`).join('')}</span><small>${next.status === 'complete' ? 'RUN COMPLETE' : `${String(Math.min(7,next.round+1)).padStart(2,'0')} / 07`}</small>`;
  if (!animate) world.set(next.megabytes, next.trace);
  try { sessionStorage.setItem('germillion-run', next.id); } catch { /* Cookie also restores the daily. */ }
}
async function createRun(mode = 'daily', extra = {}) {
  if (busy) return; busy = true; active = false; clearInterval(timer); stopComment(); message('');
  try { setRun(await api('/api/run', { mode, ...extra })); history.pushState({},'',`/?run=${run.id}`); window.scrollTo(0,0); render(); return run; } catch (error) { message(error.message); return null; } finally { busy = false; }
}
function modeLabel() { return run?.counterOf ? 'COUNTERATTACK' : run?.mode === 'practice' ? 'UNLIMITED' : run?.mode === 'challenge' ? 'INCOMING VIRUS' : run?.mode === 'archive' ? 'ARCHIVE' : 'DAILY'; }
function intro(incoming) {
  view('intro'); stopComment();
  screen.innerHTML = `<div class="intro"><p class="eyebrow">${incoming ? 'INCOMING VIRUS' : modeLabel()} / ${escape(run?.day || day)}</p><h1>${incoming ? `${escape(incoming.name)}’s virus is attacking.` : 'One disk. A very bad idea.'}</h1><div class="computer"><img src="/assets/486.png" width="1448" height="1086" alt="A pixelated 486 computer, floppy disks, keyboard and soda can"><div class="boot-disk">${icon('floppy')}${icon('virus','disk-virus')}</div></div><p class="intro-copy">Seven questions. Twenty seconds each.<br>How far into the system can you get?</p>${incoming ? `<label class="incoming-name" for="defender-name">YOUR NAME<input id="defender-name" maxlength="24" value="${escape(profile.name)}" placeholder="codename (optional)" autocomplete="nickname"></label>` : ''}<button class="primary" id="begin">${incoming ? 'DEFEND YOUR SYSTEM' : 'INSERT DISK'} ↵</button><p class="secondary-line">${profile.streak ? `${profile.streak}-DAY STREAK · ` : ''}ONE ACCEPTED ANSWER PER QUESTION · NO HIT? KEEP TRYING.</p></div>`;
  $('#begin').onclick = async () => {
    if (busy) return;
    if (incoming) {const button=$('#begin');button.disabled=true;try{const p=await api('/api/profile',{name:$('#defender-name').value});profile.name=p.name;if(!await createRun('challenge',{challenge:incomingId}))return;}catch(e){message(e.message);return;}finally{button.disabled=false;}} else if (!run) await createRun();
    if (run?.status !== 'ready') return;
    busy = true; $('#begin').disabled = true; document.body.classList.add('booting'); sound('boot');
    await pause(reducedMotion.matches ? 0 : 750); document.body.classList.remove('booting'); busy = false; startRound();
  };
}
function render() {
  clearInterval(timer); active = false; message('');
  if (run.status === 'ready') intro(); else if (run.status === 'question') question(); else if (run.status === 'reveal') reveal(); else results();
}
async function startRound() {
  if (busy) return; busy = true; message(''); stopComment();
  try {
    setRun(await api(`/api/run/${run.id}/start`, { round: run.round })); render();
  } catch (error) { message(error.message); } finally { busy = false; }
}
function question() {
  const entrance = Math.max(0,(run.readyAt || 0)-Date.now()-offset);
  if (entrance > 0) {
    view('ready'); screen.innerHTML = `<p class="eyebrow">QUESTION ${run.round+1} / 07</p><h1>${escape(run.prompt.title)}</h1><p class="axis">${escape(run.prompt.axis)}</p><p class="ready-count">CONNECTING<span class="blink">_</span></p>`;
    const id=run.id, round=run.round; setTimeout(()=>{if(run.id===id && run.round===round && run.status==='question' && document.body.dataset.view==='ready') question();},entrance+10); return;
  }
  view('question'); active = true; retryAt = 0; lastTick = 20;
  screen.innerHTML = `<div class="meta"><p class="eyebrow">${modeLabel()} / QUESTION ${run.round + 1}</p></div><h1>${escape(run.prompt.title)}</h1><p class="axis">${escape(run.prompt.axis)}<button class="question-info" id="scope" aria-label="Answer details">[?]</button></p><form class="answer-form" id="answer-form"><label class="status-live" for="answer">Your answer</label><span class="clock" id="clock" aria-label="Seconds remaining">20s</span><div class="answer-line"><span aria-hidden="true">&gt;</span><input id="answer" type="text" maxlength="160" placeholder="type your answer_" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"></div><div class="timer-track" aria-hidden="true"><span id="timer-fill"></span></div><div class="submit-row"><span class="quiet">No hit? Keep trying.</span><button class="enter" type="submit">[ ENTER ] SEND</button></div></form><span class="status-live" id="time-warning" role="status"></span>`;
  $('#scope').onclick = () => showDialog(`<h2>${escape(run.prompt.title)}</h2><p>${escape(run.prompt.scope)}</p><p class="small">Higher measured values travel further. Equal values score equally. The timer keeps running.</p><a href="${escape(run.prompt.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>`);
  $('#answer-form').onsubmit = event => { event.preventDefault(); submitAnswer($('#answer').value); };
  $('#answer').oninput = () => message(''); $('#answer').focus({ preventScroll: true }); timer = setInterval(tick, 100); tick();
}
function tick() {
  if (!active || !$('#clock')) return;
  const remaining = Math.max(0, run.deadline - Date.now() - offset), left = Math.ceil(remaining / 1000);
  $('#clock').textContent = `${left}s`; $('#clock').classList.toggle('urgent', left <= 5); $('#clock').classList.toggle('warning', left > 5 && left <= 10);
  $('#timer-fill').style.transform = `scaleX(${Math.min(1, remaining / 20000)})`; $('#timer-fill').style.background = left <= 5 ? '#ed7272' : left <= 10 ? '#d6ad57' : '#4cd46c';
  if (left <= 5 && left > 0) $('#time-warning').textContent = 'Five seconds or less remaining.';
  if (left > 0 && left <= 3 && left !== lastTick) sound('tick'); lastTick = left;
  if (left === 0 && !busy && Date.now() >= retryAt) submitAnswer('', true);
}
async function submitAnswer(answer, expired = false) {
  if (busy || !active) return; if (!expired && !answer.trim()) return $('#answer').focus();
  busy = true; message(''); $('#answer').disabled = true; $('.enter').disabled = true; $('.enter').textContent = 'SENDING_';
  animate($('.answer-line'), [{opacity:.45},{opacity:1}], 180);
  try {
    const from = run.megabytes, next = await api(`/api/run/${run.id}/answer`, { answer: expired ? '' : answer, round: run.round });
    if (next.status === 'question') {
      setRun(next); sound('miss'); message(next.feedback?.message || 'DATA ENTRY NOT FOUND — TRY AGAIN');
      const choices = next.feedback?.suggestions || [];
      if (choices.length) {
        const hint = document.createElement('p'); hint.textContent = 'DID YOU MEAN? SELECT, THEN ENTER.'; errorBox.append(hint);
        choices.forEach(name => { const pick = document.createElement('button'); pick.type = 'button'; pick.textContent = name; pick.onclick = () => { $('#answer').value = name; message(''); $('#answer').focus(); }; errorBox.append(pick); });
      }
      const report=document.createElement('button'); report.type='button'; report.textContent='REPORT THIS ANSWER';
      report.onclick=async()=>{report.disabled=true;try{await api('/api/feedback',{kind:'answer',message:'Rejected answer',run:run.id,round:run.round,answer});report.textContent='REPORT SAVED';}catch(e){report.textContent=e.message;report.disabled=false;}};errorBox.append(report);
      $('#answer').disabled = false; $('.enter').disabled = false; $('.enter').textContent = '[ ENTER ] SEND'; $('#answer').focus(); $('#answer').select(); feedback('reject'); return;
    }
    active = false; clearInterval(timer); $('#info').close(); setRun(next, true);
    if (next.last.valid) {
      sound('hit'); view('travel');
      animate(screen, [{opacity:1},{opacity:0}], 300); await pause(reducedMotion.matches ? 0 : 280); screen.innerHTML = '';
      feedback('launch'); await world.travel(next.megabytes, next.trace, next.last.name);
      sound('land'); feedback('land',next.last.fraction); await pause(reducedMotion.matches ? 0 : 180);
    } else { world.set(next.megabytes, next.trace); sound('miss'); feedback('timeout'); }
    reveal(next.status === 'complete', true);
    const aside=technicianLine({from,to:next.megabytes,fraction:next.last.fraction,valid:next.last.valid,round:next.round},comments);
    if (aside) { const token = commentToken; setTimeout(() => { if(token === commentToken && document.body.dataset.view === 'reveal') {comments.push({round:next.round,text:aside});try{sessionStorage.setItem(`comments-${next.id}`,JSON.stringify(comments));}catch{}comment(aside);} }, reducedMotion.matches ? 0 : 1700); }
  } catch (error) {
    message(`${error.message} Your clock is still running.`); retryAt = Date.now() + 2000;
    if ($('#answer')) { $('#answer').disabled = false; $('.enter').disabled = false; $('.enter').textContent = '[ ENTER ] SEND'; $('#answer').focus(); }
  } finally { busy = false; }
}
function reveal(final = false, celebrate = false) {
  active = false; clearInterval(timer); view('reveal');
  const a = run.last, tier = tierAt(a.fraction); document.documentElement.style.setProperty('--accent', tier.color);
  screen.innerHTML = `<div class="reveal ${a.valid ? '' : 'caught'} ${a.valid && a.fraction>=.9?'peak':''}">${icon(a.valid ? tier.icon : 'error')}<h1>${a.valid ? tier.name : 'CONNECTION TIMED OUT'}</h1><p class="answer-name">${a.valid ? `“${escape(a.name)}”` : 'The system held.'}</p><p class="gain" aria-label="${a.megabytes} megabytes gained">+${a.megabytes} MB</p><p class="reaction">${a.valid ? escape(tier.reaction) : 'Nothing was written to the system.'}</p>${a.opponent ? `<p class="challenge-line">${a.attack > 14 ? 'SECTOR DEFENDED' : a.attack > 0 ? 'SECTOR SPLIT' : 'SECTOR INFECTED'} · Their answer: ${escape(a.opponent.name || 'Timed out')}</p>` : ''}<button class="primary continue" id="next">[ ENTER ] ${final ? 'INFECTION LOG' : 'CONTINUE'}</button></div>`;
  const nextButton=$('#next'), gain=$('.gain'); nextButton.onclick = final ? results : startRound;
  if(celebrate && !reducedMotion.matches){
    const duration=a.fraction>=.9?1100:650, start=performance.now(); nextButton.disabled=true;
    animate($('.reveal>.pixel-icon'), [{transform:'scale(.6)',opacity:.2},{transform:'scale(1.15)',opacity:1,offset:.65},{transform:'scale(1)',opacity:1}],a.fraction>=.7?750:450);
    function count(now){
      if(!gain.isConnected)return;
      const p=Math.min(1,(now-start)/duration);gain.textContent=`+${Math.round(a.megabytes*(1-(1-p)**3))} MB`;
      if(p<1)requestAnimationFrame(count);
      else {if(a.valid && a.fraction>=.9)animate(gain,[{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],320);nextButton.disabled=false;nextButton.focus({preventScroll:true});}
    }
    requestAnimationFrame(count);
  }else nextButton.focus({preventScroll:true});
}
const chartResize = new ResizeObserver(entries => {
  for (const {target, contentRect} of entries) if (contentRect.width > 0) {
    target.innerHTML = blockChart(run.stats, run.megabytes, Math.round(contentRect.width));
  }
});
function journeyLog() {
  const rows = run.answers.map((a,i) => {
    const tier = tierAt(a.fraction), x = 65 + a.fraction * 330, y = 22+i*35;
    const endpoint=icon(a.valid?tier.icon:'error',`log-endpoint${a.valid?'':' no-signal'}`).replace('<svg ',`<svg x="${x-12}" y="${y-12}" width="24" height="24" `);
    return `<a href="#round-${i}" data-round="${i}" aria-label="Review question ${i+1}: ${escape(a.name || 'Timed out')}, ${a.valid?tier.name:'No signal'}, ${a.megabytes} MB"><title>${escape(a.name || 'Timed out')} / ${a.valid?tier.name:'NO SIGNAL'}</title><rect x="0" y="${y-16}" width="480" height="33" fill="transparent"/><text x="8" y="${y+5}">${i+1}</text><line x1="45" x2="${x-12}" y1="${y}" y2="${y}" stroke="${a.valid?tier.color:'#424649'}"/>${endpoint}<text x="${x+19}" y="${y+5}">+${a.megabytes}</text></a>`;
  }).join('');
  return `<svg viewBox="0 0 480 280" role="group" aria-label="Individual answer strength; select a tier icon to review the answer">${rows}<text x="45" y="275">0 MB</text><text x="465" y="275" text-anchor="end">~146 MB / ANSWER</text></svg>`;
}
function results() {
  active = false; clearInterval(timer); stopComment(); message(''); view('report'); sound('report');
  chartResize.disconnect();
  const ranked = run.mode === 'daily', s = run.stats, found = DISCOVERIES.filter(d => d.at <= run.megabytes);
  const comparison = s.count > 1 ? `${Math.round(s.below/s.count*100)}% OF RUNS BEHIND YOU.` : s.count === 1 && ranked ? 'FIRST ONE IN. THE OTHERS WILL FOLLOW.' : 'NO COMPLETED DAILY RUNS YET.';
  screen.innerHTML = `<div class="report-title"><div><p class="eyebrow">${run.challenge ? 'DEFENCE REPORT' : 'INFECTION LOG'} / ${run.day}</p><h1>${run.challenge ? `${format(run.challenge.infection)}% INFECTED` : `${format(run.megabytes)} MB`}</h1></div><p class="quiet">${run.megabytes === 1024 ? 'ALL SECTORS REACHED' : regionAt(run.megabytes).name}<br>${modeLabel()} · ${run.megabytes} MB · CONNECTION CLOSED</p></div>${run.counterOf ? '<p class="challenge-line">COUNTERATTACK DEPLOYED. Your rival can find it in their Attack Log.</p>' : ''}${run.challenge ? `<p class="challenge-line">${escape(run.challenge.name)} infected ${format(run.challenge.infection)}% of your system. ${run.challenge.infection < 50 ? 'DEFENCE HELD — YOU WIN.' : run.challenge.infection > 50 ? 'SYSTEM BREACHED — THEY WIN.' : 'STALEMATE.'} Tied sectors are split.${run.reused ? ' Your first daily answers were used.' : ''}</p>` : ''}${run.challenge ? sectorSummary(run.answers) : ''}<div class="report-columns"><section class="distribution">${ranked ? `<div id="daily-chart">${blockChart(s,run.megabytes)}</div><p class="distribution-note">${comparison}</p><p class="distribution-population">${format(s.count)} ${s.count === 1 ? 'PLAYER' : 'PLAYERS'} / FIRST DAILY RUNS</p>` : run.challenge ? '<h2 class="section-label">HEAD-TO-HEAD</h2><p class="quiet">This result is saved in both players’ Attack Logs.</p>' : '<h2 class="section-label">UNRANKED RUN</h2><p class="quiet">Daily runs appear in the shared distribution. This run does not affect your daily rank.</p>'}</section><section class="journey-log"><h2 class="section-label">SEVEN ROUNDS / FURTHER = STRONGER</h2>${journeyLog()}</section></div><div class="result-actions"><button id="share">ATTACK A FRIEND ↗</button><button id="copy">COPY RESULT</button><button id="again">UNLIMITED</button>${run.challenge ? '<button id="counter">COUNTERATTACK</button>' : ''}<button id="share-result">SHARE RESULT</button><a data-page href="/attacks">ATTACK LOG</a><a data-page href="/">HOME</a></div><div class="answer-summary">${run.answers.map((a,i) => `<details id="round-${i}"><summary><span><span class="name">${String(i+1).padStart(2,'0')} / ${escape(a.name || 'Timed out')}</span><span class="description">${a.valid ? tierAt(a.fraction).name : 'NO SIGNAL'} · ${escape(a.prompt.axis)}</span></span><span class="points">+${a.megabytes} MB</span></summary><div class="detail-body"><p>${escape(a.prompt.title)} ${escape(a.prompt.axis)}</p><p>${a.valid ? `${escape(valueText(a,a.prompt))} · Rank ${a.rank} of ${a.total}` : 'The connection closed before an answer landed.'}</p>${a.note ? `<p class="small">${escape(a.note)}</p>` : ''}<button class="text-button" data-report="${i}">REPORT AN ANSWER / ISSUE</button><p class="section-label">TOP FIVE</p><ol class="leaders">${a.top.map(e => `<li><span>${e.rank}. ${escape(e.name)}</span><span>${escape(valueText(e,a.prompt))}</span></li>`).join('')}</ol><div class="source"><p>${escape(a.prompt.scope)}</p><a href="${escape(a.source || a.prompt.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a></div></div></details>`).join('')}</div><section class="found-files"><h2 class="section-label">DISCOVERIES / ${found.length} OF ${DISCOVERIES.length}</h2><div class="file-grid">${found.map(d => `<div>${icon(d.icon)}<span>${escape(d.name)}<small>${d.at} MB · ${escape(d.detail)}</small></span></div>`).join('') || '<p class="quiet">Nothing discovered. There’s more further in.</p>'}</div></section><p class="streak">${run.streak ?? profile.streak ?? 0}-day streak · <span data-countdown></span></p>`;
  screen.querySelectorAll('[data-round]').forEach(button => button.onclick = event => { event.preventDefault(); const details = $(`#round-${button.dataset.round}`); details.open = true; details.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' }); });
  if (ranked) chartResize.observe($('#daily-chart'));
  $('#again').onclick = () => createRun('practice'); $('#share').onclick = () => shareDialog(run);
  $('#counter')?.addEventListener('click',()=>createRun('practice',{counterOf:run.id}));
  $('#share-result').onclick=()=>nativeShare({title:'Germillion',text:resultText(),url:location.origin});
  screen.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>feedbackDialog(Number(b.dataset.report)));
  updateCountdown();
  $('#copy').onclick = async () => {
    const text = resultText();
    try { await navigator.clipboard.writeText(text); $('#copy').textContent = 'COPIED'; } catch { showDialog(`<h2>SYSTEM REPORT</h2><p class="share-link">${escape(text).replace(/\n/g,'<br>')}</p>`); }
  };
  if (ranked) refreshProfile(true).catch(() => {});
}
function resultText(){return `GERMILLION ${run.day}${run.challenge?`\n${run.challenge.name} infected ${run.challenge.infection}% of my system.`:''}\n${run.megabytes} MB / ${regionAt(run.megabytes).name}\n${run.answers.map(a=>a.fraction>=.9?'▓':a.fraction>=.45?'▒':a.valid?'░':'·').join('')}\n${location.origin}`;}
async function nativeShare(payload){
  try{if(navigator.share)await navigator.share(payload);else {await navigator.clipboard.writeText([payload.text,payload.url].filter(Boolean).join('\n'));showDialog('<h2>COPIED</h2><p>Ready to paste into a message.</p>');}}
  catch(e){if(e.name!=='AbortError')showDialog(`<h2>READY TO SHARE</h2><p class="share-link">${escape(payload.text||'')}</p><p class="share-link">${escape(payload.url||'')}</p>`);}
}
function sectorSummary(answers){return `<div class="sectors" aria-label="Seven contested sectors">${answers.map((a,i)=>`<div class="${a.attack>14?'defended':a.attack>0?'split':'infected'}"><small>${i+1}</small>${icon(a.attack>14?'folder':a.attack>0?'wait':'virus')}<span>${a.attack>14?'DEFENDED':a.attack>0?'SPLIT':'INFECTED'}</span></div>`).join('')}</div>`;}
function shareDialog(target=run) {
  showDialog(`<h2>DEPLOY YOUR VIRUS</h2><p>A friend faces your seven questions. The stronger answer wins each sector. Results appear in your Attack Log.</p><form id="share-form"><label for="codename">Your name</label><input id="codename" maxlength="24" value="${escape(profile.name || target.name)}" placeholder="your codename" autocomplete="nickname"><button class="primary" id="make-link">CREATE ATTACK LINK ↗</button></form><p id="share-status" class="share-link" role="status"></p><div id="share-options"></div>`);
  $('#share-form').onsubmit=async event=>{event.preventDefault();const button=$('#make-link');button.disabled=true;
    try{const shared=await api(`/api/run/${target.id}/share`,{name:$('#codename').value});profile.name=shared.name;
      const link=`${location.origin}/?attack=${target.id}`,text=`${shared.name||'Someone'}’s virus is attacking your computer.`;
      $('#share-status').textContent=`${text} ${link}`;
      $('#share-options').innerHTML='<button class="primary" id="copy-link">COPY LINK</button><button id="native-link">SHARE…</button>';
      $('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(link);$('#copy-link').textContent='COPIED';}catch{$('#copy-link').textContent='SELECT THE LINK ABOVE';}};
      $('#native-link').onclick=()=>nativeShare({title:'Incoming virus',text,url:link});button.textContent='LINK READY';
    }catch(e){$('#share-status').textContent=e.message;}finally{button.disabled=false;}
  };
}
const skinPreview=(s)=>`<svg class="skin-preview" viewBox="${s.crop.join(' ')}" aria-hidden="true"><image href="/assets/skins.png" width="1536" height="1024"/></svg>`;
async function refreshProfile(celebrate=false){
  const previous=profile.longest,state=await api('/api/today');dailyState=state.run;day=state.day;resetAt=state.resetAt;profile=state;world.profile(profile);
  if(state.skin!==null)skin=state.skin;
  if(!SKINS[skin]||SKINS[skin].days>profile.longest)skin=0;
  world.skin(skin);updateCountdown();
  const unlocked=SKINS.filter(s=>s.days>previous&&s.days<=profile.longest);
  if(celebrate&&unlocked.length&&document.body.dataset.view==='report'){
    const earned=unlocked.at(-1);showDialog(`<h2>NEW VIRUS UNLOCKED</h2>${skinPreview(earned)}<p>${earned.name} · ${earned.days}-DAY STREAK</p><button class="primary" id="equip-new">EQUIP</button><a data-page href="/virus">VIEW MY VIRUS</a>`);
    $('#equip-new').onclick=async()=>{try{await equipSkin(SKINS.indexOf(earned));$('#info').close();}catch(e){message(e.message);}};
  }
  return state;
}
async function equipSkin(index){const next=await api('/api/profile',{skin:index});profile={...profile,...next};skin=index;writePreference('germillion-skin',String(skin));world.skin(skin);}
function updateCountdown(){
  if(!resetAt)return;
  const seconds=Math.max(0,Math.ceil((resetAt-Date.now()-offset)/1000));
  const text=`NEXT DAILY IN ${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')} · 00:00 UTC`;
  document.querySelectorAll('[data-countdown]').forEach(n=>n.textContent=text);
}
function page(title,html){view('page');stopComment();$('#round-label').textContent='A:\\';$('#infection').textContent=profile.best===null?'—':`${profile.best} MB PB`;screen.innerHTML=`<div class="page-heading"><p class="eyebrow">GERMILLION / ${escape(title)}</p><a data-page href="/">← HOME</a></div>${html}`;}
async function home(){
  await refreshProfile();view('intro');stopComment();$('#round-label').textContent='A:\\';$('#infection').textContent=profile.best===null?'0 MB':`${profile.best} MB PB`;
  const label=dailyState?.status==='complete'?'VIEW TODAY’S RESULT':dailyState?'CONTINUE DAILY':'INSERT DISK';
  screen.innerHTML=`<div class="intro home"><p class="eyebrow">DAILY / ${day}</p><h1>One disk. A very bad idea.</h1><div class="computer"><img src="/assets/486.png" width="1448" height="1086" alt="A pixelated 486 computer, floppy disks, keyboard and soda can"></div><p class="intro-copy">Seven questions. Twenty seconds each.<br>How far into the system can you get?</p><button class="primary" id="home-daily">${label} ↵</button><p class="home-status">${profile.streak}-DAY STREAK · ${SKINS[skin].name}</p><nav class="home-links" aria-label="Play and profile"><button id="home-practice">UNLIMITED</button><a data-page href="/archive">ARCHIVE</a><a data-page href="/virus">MY VIRUS</a><button id="home-attack">INFECT A FRIEND ↗</button><a data-page href="/attacks">ATTACK LOG${profile.unseen?` <span class="badge">${profile.unseen} NEW</span>`:''}</a></nav><p class="quiet" data-countdown></p><nav class="utility-links" aria-label="Help and preferences"><a data-page href="/help">HOW TO PLAY / FAQ</a><a data-page href="/settings">SETTINGS</a><a data-page href="/feedback">FEEDBACK</a><a data-page href="/privacy">PRIVACY</a></nav></div>`;
  $('#home-daily').onclick=async()=>{const started=await createRun();if(started?.status==='ready')$('#begin')?.click();};
  $('#home-practice').onclick=()=>createRun('practice');
  $('#home-attack').onclick=async()=>{try{const p=await api('/api/profile');const completed=p.history.find(r=>r.status==='complete');if(completed)shareDialog(completed);else showDialog('<h2>YOUR FIRST VIRUS</h2><p>Finish a daily or Unlimited run, then send its seven answers to a friend.</p><button class="primary" id="attack-play">PLAY DAILY</button>');$('#attack-play')?.addEventListener('click',()=>{$('#info').close();createRun();});}catch(e){message(e.message);}};
  updateCountdown();
}
async function resume(id){if(busy)return;busy=true;try{setRun(await api(`/api/run/${id}`));history.pushState({},'',`/?run=${run.id}`);window.scrollTo(0,0);render();}catch(e){message(e.message);}finally{busy=false;}}
async function virusPage(){
  const state=await api('/api/profile');profile={...profile,...state};
  const next=SKINS.find(s=>s.days>profile.longest);
  page('MY VIRUS',`<h1>YOUR VIRUS</h1><div class="profile-stats"><div><strong>${profile.streak}</strong><small>CURRENT STREAK</small></div><div><strong>${profile.longest}</strong><small>BEST STREAK</small></div><div><strong>${profile.best??'—'}</strong><small>BEST MB</small></div><div><strong>${profile.played}</strong><small>DAILY RUNS</small></div></div><p class="quiet">Average: ${profile.average??'—'} MB · Completed daily games count. Reset: midnight UTC.</p><section class="next-unlock">${next?`<p>${Math.max(0,next.days-profile.streak)} MORE CONSECUTIVE DAYS TO ${next.name}</p><progress max="${next.days}" value="${profile.streak}">${profile.streak}/${next.days}</progress>`:'<p>ALL FIVE VIRUSES UNLOCKED.</p>'}<small>Unlocked skins stay yours if your streak breaks. Cosmetics only.</small></section><div class="skin-grid">${SKINS.map((s,i)=>`<button class="skin-option ${skin===i?'selected':''} ${s.days>profile.longest?'locked':''}" data-skin="${i}" ${s.days>profile.longest?'disabled':''} aria-pressed="${skin===i}">${skinPreview(s)}${s.name}<small>${skin===i?'EQUIPPED':s.days>profile.longest?`${s.days}-DAY STREAK / LOCKED`:'UNLOCKED / EQUIP'}</small></button>`).join('')}</div><form id="name-form" class="panel-form"><label for="profile-name">Your name on attacks</label><input id="profile-name" maxlength="24" autocomplete="nickname" value="${escape(profile.name)}"><button class="primary">SAVE NAME</button><span id="name-status" role="status"></span></form><section class="recovery"><h2>SAVE YOUR PROGRESS</h2><p>A private recovery code carries your streak, skins and attack history to another browser. No email required.</p><p class="quiet">${profile.recoverable?'You have a recovery code. Creating another replaces it.':'Keep the code somewhere safe. Anyone with it can restore your profile.'}</p><button id="make-recovery" class="primary">${profile.recoverable?'REPLACE RECOVERY CODE':'CREATE RECOVERY CODE'}</button><div id="recovery-result" role="status"></div><details><summary>Restore a saved profile</summary><form id="restore-form" class="panel-form"><label for="recovery-code">Private recovery code</label><input id="recovery-code" type="password" autocomplete="off" spellcheck="false" required maxlength="32"><p class="quiet">Switches this browser to that profile. The two histories are not merged.</p><button class="primary">RESTORE PROFILE</button><p id="restore-status" role="status"></p></form></details></section><h2>RUN HISTORY</h2><p class="quiet">Latest 100 runs. Daily scores alone count towards your streak.</p><div class="history-list">${state.history.map(r=>`<button data-resume="${r.id}"><span>${r.day} / ${r.mode.toUpperCase()}<small>${r.status==='complete'?'COMPLETE':'CONTINUE'}</small></span><span>${r.megabytes} MB →</span></button>`).join('')||'<p>No runs yet. Your first disk is waiting.</p>'}</div>`);
  screen.querySelectorAll('[data-skin]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await equipSkin(Number(b.dataset.skin));await virusPage();}catch(e){message(e.message);b.disabled=false;}});
  screen.querySelectorAll('[data-resume]').forEach(b=>b.onclick=()=>resume(b.dataset.resume));
  $('#name-form').onsubmit=async e=>{e.preventDefault();try{const p=await api('/api/profile',{name:$('#profile-name').value});profile.name=p.name;$('#name-status').textContent='SAVED';}catch(e){$('#name-status').textContent=e.message;}};
  $('#make-recovery').onclick=async()=>{const b=$('#make-recovery');b.disabled=true;try{const {code}=await api('/api/recovery');profile.recoverable=true;$('#recovery-result').innerHTML=`<p>Save this code now. It won’t be displayed again.</p><code>${escape(code)}</code><button id="copy-recovery">COPY CODE</button>`;$('#copy-recovery').onclick=async()=>{try{await navigator.clipboard.writeText(code);$('#copy-recovery').textContent='COPIED';}catch{$('#copy-recovery').textContent='SELECT AND SAVE THE CODE';}};}catch(e){message(e.message);b.disabled=false;}};
  $('#restore-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/recover',{code:$('#recovery-code').value});try{sessionStorage.removeItem('germillion-run');}catch{}run=null;await refreshProfile();await virusPage();}catch(e){$('#restore-status').textContent=e.message;}};
}
async function archivePage(){
  const state=await api('/api/profile'), start=Date.parse('2026-09-27'), end=Date.parse(day)-86400000;
  const dates=[];for(let d=end;d>=Math.max(start,end-29*86400000);d-=86400000)dates.push(new Date(d).toISOString().slice(0,10));
  page('ARCHIVE',`<h1>INFECTION ARCHIVE</h1><p class="page-copy">Old disks. Original questions. Archive runs do not increase your daily streak.</p>${dates.length?`<form id="archive-form" class="panel-form"><label for="archive-day">Choose any past day</label><input type="date" id="archive-day" min="2026-09-27" max="${dates[0]}" value="${dates[0]}" required><button class="primary">LOAD DISK</button></form><div class="history-list">${dates.map(d=>{const saved=state.archive.find(r=>r.day===d);return `<button data-date="${d}" ${saved?`data-existing="${saved.id}"`:''}><span>${d}<small>${saved?saved.status==='complete'?'COMPLETED':'IN PROGRESS':'UNPLAYED'}</small></span><span>${saved?`${saved.megabytes} MB`:'LOAD'} →</span></button>`;}).join('')}</div>`:'<p>The first archive appears tomorrow.</p>'}`);
  $('#archive-form')?.addEventListener('submit',e=>{e.preventDefault();createRun('archive',{day:$('#archive-day').value});});
  screen.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>b.dataset.existing?resume(b.dataset.existing):createRun('archive',{day:b.dataset.date}));
}
async function attacksPage(){
  const log=await api('/api/attacks'), complete=log.matches.filter(m=>m.status==='complete'), rivals=log.rivals;
  page('ATTACK LOG',`<h1>ATTACK LOG</h1><p class="page-copy">Your viruses. Their defences. Settle it over seven questions.</p><div class="profile-stats"><div><strong>${log.totals.win}</strong><small>WINS</small></div><div><strong>${log.totals.loss}</strong><small>LOSSES</small></div><div><strong>${log.totals.draw}</strong><small>DRAWS</small></div></div>${log.incoming.length?`<h2>COUNTERATTACKS INCOMING</h2><div class="history-list">${log.incoming.map(m=>`<button data-defend="${m.id}"><span>${escape(m.name)}’s virus<small>${m.day}</small></span><span>DEFEND →</span></button>`).join('')}</div>`:''}<h2>MATCH HISTORY</h2><p class="quiet">${complete.length?'Latest 200 matches. Infection means the sender’s share of the defender’s system.':'Send a completed run to a friend. Their attempt and result will appear here.'}</p><div class="match-list">${log.matches.map(m=>`<details><summary><span>${m.sent?'SENT TO':'DEFENDED AGAINST'} ${escape(m.name)}<small>${m.day} · ${m.status==='complete'?m.result.toUpperCase():'IN PROGRESS'}</small></span><strong>${m.infection===null?'…':`${m.infection}%`}</strong></summary>${m.status==='complete'?`<p>${m.sent?'You':escape(m.name)} infected ${m.infection}% of ${m.sent?`${escape(m.name)}’s`:'your'} system.</p><ol class="sector-list">${m.sectors.map(s=>`<li><span>${escape(s.question)} ${escape(s.axis)}<small>Attacker: ${escape(s.attacker)} · Defender: ${escape(s.defender)}</small></span><strong>${s.outcome.toUpperCase()}</strong></li>`).join('')}</ol>${m.sent?'':`<button data-counter="${m.id}" class="primary">COUNTERATTACK / FRESH RUN</button><button data-match-run="${m.id}">VIEW MY RUN</button>`}`:`<p>Waiting for all seven answers.</p>${m.sent?'':`<button data-match-run="${m.id}" class="primary">CONTINUE DEFENCE</button>`}`}</details>`).join('')}</div>${rivals.length?`<h2>RIVALRIES</h2><div class="history-list">${rivals.map(r=>`<div><span>${escape(r.name)}</span><span>${r.win} W · ${r.loss} L · ${r.draw} D</span></div>`).join('')}</div>`:''}<h2>YOUR ATTACK LINKS</h2><div class="history-list">${log.links.map(r=>`<button data-share-run="${r.id}"><span>${r.day}<small>${r.megabytes} MB · ${log.matches.filter(m=>m.link===r.id&&m.sent).length} DEFENDERS</small></span><span>SHARE ↗</span></button>`).join('')||'<p>No deployed viruses yet.</p>'}</div><button id="log-refresh" class="primary">REFRESH RESULTS</button><p class="quiet">Counterattacks start a fresh seven-question run. Finish it to send a new virus directly to your rival’s log. Guest profiles can be restored using a recovery code.</p>`);
  screen.querySelectorAll('[data-defend]').forEach(b=>b.onclick=()=>createRun('challenge',{challenge:b.dataset.defend}));
  screen.querySelectorAll('[data-counter]').forEach(b=>b.onclick=()=>createRun('practice',{counterOf:b.dataset.counter}));
  screen.querySelectorAll('[data-match-run]').forEach(b=>b.onclick=()=>resume(b.dataset.matchRun));
  screen.querySelectorAll('[data-share-run]').forEach(b=>b.onclick=()=>shareDialog({id:b.dataset.shareRun}));
  $('#log-refresh').onclick=attacksPage;await api('/api/attacks/seen',{through:log.through});profile.unseen=0;
}
function settingsPage(){page('SETTINGS',`<h1>SETTINGS</h1><div class="settings-list"><label><span>SOUND<small>Short beeps for hits, landings and the final seconds.</small></span><input type="checkbox" id="setting-sound" ${soundEnabled?'checked':''}></label><label><span>REDUCED MOTION & FLASH<small>Skip travel, shaking and flashing. Your device preference is also respected.</small></span><input type="checkbox" id="setting-motion" ${reducedMotion.matches?'checked':''} ${systemMotion.matches?'disabled':''}></label><label><span>HIGH CONTRAST<small>Brighter labels. Results also use names and icons.</small></span><input type="checkbox" id="setting-contrast" ${document.body.classList.contains('high-contrast')?'checked':''}></label></div><button class="primary" id="settings-fullscreen">TOGGLE FULLSCREEN</button><p class="page-copy">Spelling suggestions always need your confirmation. A rejected answer stays in the input so you can correct it.</p><a data-page href="/virus">SAVE / RESTORE YOUR PROGRESS →</a>`);
  $('#setting-sound').onchange=()=>$('#sound').click();
  for(const [id,name] of [['setting-motion','reduce-motion'],['setting-contrast','high-contrast']])$('#'+id).onchange=e=>{document.body.classList.toggle(name,e.target.checked);writePreference(`germillion-${name}`,e.target.checked?'on':'off');};
  $('#settings-fullscreen').onclick=fullscreen;
}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else message('Use your browser’s fullscreen control. On desktop Chrome, press F11.');}catch{message('Use your browser’s fullscreen control. On desktop Chrome, press F11.');}}
function helpPage(){page('HOW TO PLAY / FAQ',`<h1>ENTER THE SYSTEM</h1><ol class="instructions"><li>Seven prompts. Twenty seconds per question, after a short preview.</li><li>Choose an answer high on the stated measurement. Stronger answers propel the virus further.</li><li>No hit? Keep trying until the clock expires. Choose a spelling suggestion, then press Enter to confirm it.</li><li>Finish to see your journey, top answers and the DOS chart of real daily players.</li></ol><details open><summary>What does the score mean?</summary><p>Seven questions share a maximum of 1,024 MB. Each uses a fixed measurement scale; equal values score equally. The score is not based on popularity. Source, edition and scope are shown under [?].</p></details><details><summary>What counts towards my streak?</summary><p>Complete the daily on consecutive UTC dates. It resets at midnight UTC. Archive, Unlimited and attacks do not increase the streak. Earned skins stay unlocked.</p></details><details><summary>How do friend attacks work?</summary><p>Share a completed run. Your friend faces the same questions, and the stronger answer wins each of seven sectors. Ties split the sector. More than 50% infected is an attacker win; less is a defender win. Exactly 50% is a draw. Their first completed daily is reused if it matches, and an attack cannot be replayed to replace a result. An unfinished matching daily must be finished first.</p><p>Counterattack starts a fresh run whose completed virus appears in your rival’s Attack Log.</p></details><details><summary>How is the chart made?</summary><p>It counts actual first daily runs with the same question set. Empty bands stay empty. Unlimited, archive and attacks are excluded. Your position can change as more players finish.</p></details><details><summary>My answer should have counted.</summary><p>Use REPORT THIS ANSWER after a rejection, or report it from the final answer review. The catalogue is sourced and finite. Reports are saved for review; they do not silently change your score.</p></details><details><summary>Can I move to another device?</summary><p>Create a private recovery code in My Virus, then restore it on the other device. Save it before clearing browser cookies. No code means the anonymous profile cannot be recovered.</p></details><details><summary>Why do questions repeat?</summary><p>The bank currently has 17 sourced prompts, selected across seven families. New rotations include Minecraft and Pokémon. It is a growing bank, so categories and questions will recur. Original archived questions and scores remain frozen.</p></details><p class="page-copy"><a data-page href="/feedback">SEND FEEDBACK / SUGGEST A QUESTION →</a></p>`);}
function feedbackForm(context){return `<form id="feedback-form" class="panel-form"><label for="feedback-kind">Type</label><select id="feedback-kind"><option value="${context?'answer':'bug'}">${context?'Answer / scoring issue':'Bug report'}</option><option value="question">Suggest a question</option><option value="other">Other feedback</option></select>${context?`<p>${escape(context.question)}</p><label for="reported-answer">Your answer</label><input id="reported-answer" maxlength="160" value="${escape(context.answer)}">`:''}<label for="feedback-message">What happened?</label><textarea id="feedback-message" maxlength="2000" rows="5" required></textarea><button class="primary" id="feedback-send">SEND FEEDBACK</button><p id="feedback-status" role="status"></p></form>`;}
function bindFeedback(context){$('#feedback-form').onsubmit=async e=>{e.preventDefault();$('#feedback-send').disabled=true;try{await api('/api/feedback',{kind:$('#feedback-kind').value,message:$('#feedback-message').value,...(context?{run:context.run,round:context.round,answer:$('#reported-answer').value}:{})});$('#feedback-status').textContent='SAVED FOR REVIEW. Thank you.';$('#feedback-message').value='';}catch(e){$('#feedback-status').textContent=e.message;}finally{$('#feedback-send').disabled=false;}};}
function feedbackDialog(round){const a=run.answers[round],context={run:run.id,round,question:a.prompt.title+' '+a.prompt.axis,answer:a.input||a.name||''};showDialog('<h2>REPORT AN ANSWER</h2>'+feedbackForm(context));bindFeedback(context);}
function feedbackPage(){page('FEEDBACK','<h1>LEAVE A NOTE</h1><p class="page-copy">Report a bug, suggest a question, or tell us what felt wrong. Reports are saved for the developer to review. Do not include passwords or recovery codes.</p>'+feedbackForm());bindFeedback();}
function privacyPage(){page('PRIVACY',`<h1>YOUR DATA</h1><p class="page-copy">Germillion stores an anonymous browser cookie to reconnect you to your runs. The server stores your submitted answers, scores, daily dates, selected skin, optional display name, attack relationships and feedback.</p><p>Sharing an attack exposes your chosen name and, as each sector is played, its answer comparison. Completed matches are visible to both participants. Other players cannot browse your private run history.</p><p>A recovery code grants access to your profile. Only a hash is stored on the server. Sound and display preferences are saved on this device. This build includes no advertising or third-party analytics.</p><p>Progress and feedback remain in this server’s database until removed by its operator. Clearing cookies does not delete the server record and can lose access without a recovery code.</p><p>For a data request, use <a data-page href="/feedback">Feedback</a> from the affected profile. Never send your recovery code.</p>`);}
async function navigate(path,push=true){
  if(busy)return;busy=true;active=false;clearInterval(timer);stopComment();message('');$('#info').close();
  if(push)history.pushState({},'',path);
  try{if(path==='/')await home();else if(path==='/virus')await virusPage();else if(path==='/archive')await archivePage();else if(path==='/attacks')await attacksPage();else if(path==='/settings')settingsPage();else if(path==='/help')helpPage();else if(path==='/feedback')feedbackPage();else if(path==='/privacy')privacyPage();else await home();window.scrollTo(0,0);screen.focus({preventScroll:true});}catch(e){message(e.message);}finally{busy=false;}
}
document.addEventListener('click',e=>{const a=e.target.closest('a[data-page]');if(a&&!e.ctrlKey&&!e.metaKey){e.preventDefault();navigate(a.getAttribute('href'));}});
$('#daily').onclick=()=>createRun();$('#practice').onclick=()=>createRun('practice');$('#fullscreen').onclick=fullscreen;
window.addEventListener('popstate',()=>boot());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
setInterval(()=>{updateCountdown();if(resetAt&&Date.now()+offset>=resetAt&&!busy){resetAt=0;if(location.pathname==='/'&&document.body.dataset.view==='intro')navigate('/',false);else refreshProfile().catch(()=>{});}},1000);
setInterval(async()=>{if(document.hidden||busy||document.body.dataset.view!=='intro'||location.search)return;try{await refreshProfile();const link=screen.querySelector('[href="/attacks"]');if(link)link.innerHTML=`ATTACK LOG${profile.unseen?` <span class="badge">${profile.unseen} NEW</span>`:''}`;}catch{}},30000);
async function boot(){
  active=false;clearInterval(timer);stopComment();
  try{await refreshProfile();
    const query=new URLSearchParams(location.search);incomingId=query.get('attack');
    if(incomingId){intro(await api(`/api/challenge/${encodeURIComponent(incomingId)}`));return;}
    const saved=query.get('run');if(saved){setRun(await api(`/api/run/${encodeURIComponent(saved)}`));render();return;}
    await navigate(location.pathname,false);
  }catch(e){view('intro');screen.innerHTML='<h1>CONNECTION INTERRUPTED</h1><button class="primary" id="reconnect">RECONNECT</button><p><a data-page href="/">GO HOME</a></p>';$('#reconnect').onclick=boot;message(e.message);}
}
boot();
