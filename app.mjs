import { randomBytes, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { data, today, dailyPrompts, publicPrompt, grade, suggestions, topFive, totalScore, totalMB, MAX_MB, attackPoints, ROUND_MS, ROUNDS, streakSummary } from './game.mjs';

function problem(status,message){return Object.assign(new Error(message),{status});}
async function body(request) {
  let size = 0, chunks = [];
  for await (const chunk of request.body || []) {
    size += chunk.length;
    if (size > 4096) throw problem(413, 'That request is too large.');
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed;
  }
  catch { throw problem(400, 'Invalid request.'); }
}

export function createApp(db,config={}) {
const recoveryHash=code=>createHash('sha256').update(code).digest('hex');
const recoverAttempts=new Map();
const token = () => randomBytes(18).toString('base64url');
const savedStates = new WeakMap();
const getRun = async id => {
  const row = (await db.get('SELECT state FROM runs WHERE id=?', id));
  if (!row) return null;
  const run=JSON.parse(row.state); savedStates.set(run,row.state); return run;
};
async function save(run) {
  const state=JSON.stringify(run);
  const result=await db.run('UPDATE runs SET state=?,score=? WHERE id=? AND state=?',state,run.status==='complete'?totalScore(run.answers):null,run.id,savedStates.get(run));
  if(!result.changes){
    const winner=await getRun(run.id);
    if(!winner)throw problem(404,'Run not found.');
    Object.assign(run,winner);
    savedStates.set(run,savedStates.get(winner));
    return;
  }
  savedStates.set(run,state);
}
async function finishAnswer(run, answer, expired) {
  if (run.status !== 'question') return;
  const result = grade(run.prompts[run.answers.length], answer, expired);
  if (!result.valid && !expired) return false;
  if (run.challenge) {
    const target = (await getRun(run.challenge));
    result.opponent = target.answers[run.answers.length];
    result.attack = attackPoints(result, result.opponent);
  }
  run.answers.push(result);
  run.deadline = null;
  run.status = run.answers.length === ROUNDS ? 'complete' : 'reveal';
  if (run.status === 'complete') { run.completedAt = Date.now(); if (run.counterOf) run.sharedAt = Date.now(); }
  (await save(run));
  return true;
}
async function stats(run) {
  const rows=await db.all('SELECT mb,players FROM daily_totals WHERE day=? AND prompt_key=?',run.day,JSON.stringify(run.prompts));
  const score=totalMB(run.answers),bins=Array(32).fill(0);let count=0,below=0,equal=0;
  for(const row of rows){count+=row.players;bins[Math.min(31,Math.floor(row.mb/32))]+=row.players;if(row.mb<score)below+=row.players;if(row.mb===score)equal+=row.players;}
  return {count,bins,below,equal};
}
async function streak(player) {
  return streakSummary((await db.all("SELECT day FROM results WHERE player=? AND mode='daily'",player)).map(r=>r.day),today()).streak;
}
async function unseen(player,seen) {
  const completed=await db.get("SELECT (SELECT count(*) FROM results WHERE mode='challenge' AND player=? AND completed>?) + (SELECT count(*) FROM results WHERE mode='challenge' AND attacker=? AND completed>?) AS n",player,seen,player,seen);
  const incoming=await db.get("SELECT count(*) AS n FROM results r WHERE recipient=? AND completed>? AND NOT EXISTS (SELECT 1 FROM runs d WHERE d.player=? AND d.mode='challenge' AND json_extract(d.state,'$.challenge')=r.id)",player,seen,player);
  return completed.n+incoming.n;
}
async function profile(player) {
  const rows=await db.all("SELECT day,mb FROM results WHERE player=? AND mode='daily' ORDER BY day",player);
  const identity=await db.get('SELECT name,skin,recovery,seen FROM players WHERE id=?',player);
  const yesterday=new Date(Date.parse(today())-86400000).toISOString().slice(0,10);
  let best=null,total=0;for(const row of rows){best=Math.max(best??0,row.mb);total+=row.mb;}
  return {best,played:rows.length,average:rows.length?Math.round(total/rows.length):null,yesterday:rows.find(r=>r.day===yesterday)?.mb??null,...streakSummary(rows.map(r=>r.day),today()),name:identity?.name||'',skin:identity?.skin??null,recoverable:Boolean(identity?.recovery),unseen:await unseen(player,identity?.seen||0)};
}
const displayName = async player => (await db.get('SELECT name FROM players WHERE id=?',player))?.name || 'Someone';
async function attackLog(player) {
  const rows=await db.all("SELECT r.state,t.player AS attacker,t.id AS link,ap.name AS attackerName,dp.name AS defenderName FROM (SELECT run,created FROM attack_members WHERE player=? ORDER BY created DESC LIMIT 200) recent JOIN runs r ON r.id=recent.run JOIN runs t ON t.id=json_extract(r.state,'$.challenge') LEFT JOIN players ap ON ap.id=t.player LEFT JOIN players dp ON dp.id=r.player ORDER BY recent.created DESC",player);
  const all=rows.map(row=>{
    const run=JSON.parse(row.state),complete=run.status==='complete',sent=row.attacker===player;
    const infection=complete?Math.round(run.answers.reduce((s,a)=>s+attackPoints(a.opponent,a),0)*10)/10:null;
    return {id:run.id,link:row.link,sent,day:run.day,name:(sent?row.defenderName:row.attackerName)||'Someone',rival:createHash('sha256').update(sent?run.player:row.attacker).digest('hex').slice(0,16),status:complete?'complete':'playing',infection,result:complete?(infection===50?'draw':(sent?infection>50:infection<50)?'win':'loss'):null,updated:run.completedAt||0,sectors:complete?run.answers.map((a,i)=>({question:publicPrompt(run.prompts[i]).title,axis:publicPrompt(run.prompts[i]).axis,attacker:a.opponent.name||'Timed out',defender:a.name||'Timed out',outcome:a.attack>14?'blocked':a.attack>0?'split':'infected'})):[]};
  });
  const totals=await db.get('SELECT COALESCE(sum(win),0) AS win,COALESCE(sum(loss),0) AS loss,COALESCE(sum(draw),0) AS draw FROM rivalries WHERE player=?',player);
  const rivals=await db.all("SELECT COALESCE(NULLIF(p.name,''),'Someone') AS name,r.win,r.loss,r.draw FROM rivalries r LEFT JOIN players p ON p.id=r.rival WHERE r.player=? ORDER BY r.win+r.loss+r.draw DESC,r.rival LIMIT 100",player);
  const seen=(await db.get('SELECT seen FROM players WHERE id=?',player))?.seen||0;
  const links=(await db.all("SELECT id,state,(SELECT count(*) FROM runs d WHERE d.mode='challenge' AND json_extract(d.state,'$.challenge')=runs.id) AS defenders FROM runs WHERE player=? AND score IS NOT NULL AND (json_extract(state,'$.sharedAt') IS NOT NULL OR json_extract(state,'$.name') IS NOT NULL) ORDER BY created DESC LIMIT 100",player)).map(r=>({id:r.id,defenders:r.defenders,day:JSON.parse(r.state).day,megabytes:totalMB(JSON.parse(r.state).answers)}));
  const incoming=await db.all("SELECT r.id,COALESCE(NULLIF(p.name,''),'Someone') AS name,r.day,r.completed AS updated FROM results r LEFT JOIN players p ON p.id=r.player WHERE r.recipient=? AND NOT EXISTS (SELECT 1 FROM runs d WHERE d.player=? AND d.mode='challenge' AND json_extract(d.state,'$.challenge')=r.id) ORDER BY r.completed DESC LIMIT 100",player,player);
  return {matches:all,totals,rivals,links,incoming,through:Date.now(),unseen:await unseen(player,seen)};

}
async function snapshot(run) {
  if (run.status === 'question' && Date.now() >= run.deadline) (await finishAnswer(run, '', true));
  const complete = run.status === 'complete';
  // Carry rounding through the journey, so displayed gains sum to the final MB.
  const answers = run.answers.map((a, i) => ({ ...a, megabytes: totalMB(run.answers.slice(0, i + 1)) - totalMB(run.answers.slice(0, i)) }));
  return {
    id: run.id, day: run.day, mode: run.mode, status: run.status, round: run.answers.length,
    deadline: run.deadline, readyAt: run.readyAt || 0, serverTime: Date.now(), score: totalScore(run.answers), megabytes: totalMB(run.answers),
    trace: answers.map((a, i) => ({ name: a.name || 'Timed out', valid: a.valid, fraction: a.fraction, megabytes: a.megabytes, position: totalMB(run.answers.slice(0, i + 1)) })),
    prompt: run.status === 'question' ? publicPrompt(run.prompts[run.answers.length]) : null,
    last: answers.length ? { ...answers.at(-1), prompt: publicPrompt(run.prompts[answers.length - 1]) } : null,
    challenge: run.challenge ? { source: run.challenge, name: (await displayName((await getRun(run.challenge)).player)), infection: Math.round(run.answers.reduce((s, a) => s + attackPoints(a.opponent,a), 0) * 10) / 10 } : null,
    counterOf: run.counterOf || null, reused: Boolean(run.reused),
    ...(complete ? {
      answers: answers.map((a, i) => ({ ...a, prompt: publicPrompt(run.prompts[i]), top: topFive(run.prompts[i]) })),
      stats: (await stats(run)), streak: (await streak(run.player)), name: run.name || '',
    } : {}),
  };
}

return async (request,{ip='local'}={}) => {
  const url=new URL(request.url),headers=new Headers({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  const send=(status,payload)=>{headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store');return new Response(JSON.stringify(payload),{status,headers});};
  const cookie=id=>headers.set('Set-Cookie',`germillion=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`);
  try {
    if(url.pathname==='/healthz'&&request.method==='GET'){await db.get('SELECT 1');return send(200,{ok:true});}
    if(!url.pathname.startsWith('/api/')){
      const response=await config.assets(request);
      const out=new Response(response.body,response);
      for(const [key,value] of headers)out.headers.set(key,value);
      return out;
    }
    if(config.rateLimit && !(await config.rateLimit.limit({key:ip})).success)throw problem(429,'Too many requests. Please try again shortly.');
    if (request.method === 'POST') {
      const expectedOrigin = config.origin || `${url.protocol.slice(0,-1)}://${url.host}`;
      if ((request.headers.get('origin') && request.headers.get('origin') !== expectedOrigin) || request.headers.get('sec-fetch-site') === 'cross-site') throw problem(403, 'Open Germillion directly to play.');
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw problem(415, 'Send JSON.');
    }
    let player = (request.headers.get('cookie') || '').match(/(?:^|;\s*)germillion=([A-Za-z0-9_-]{24})(?:;|$)/)?.[1];
    if (!player) {
      player = token();
      cookie(player);
    }
    const identity=await db.get('SELECT player AS id FROM sessions WHERE id=? UNION ALL SELECT id FROM players WHERE id=? LIMIT 1',player,player);
    if(identity)player=identity.id;
    else await db.run('INSERT OR IGNORE INTO players(id) VALUES(?)',player);
    if (url.pathname === '/api/profile') {
      if (request.method === 'POST') {
        const input = await body(request);
        if (input.name !== undefined) {
          if (typeof input.name !== 'string' || input.name.trim().length > 24) throw problem(400,'Use a name of up to 24 characters.');
          (await db.run('UPDATE players SET name=? WHERE id=?', input.name.replace(/[\x00-\x1f\x7f]/g,'').trim(),player));
        }
        if (input.skin !== undefined) {
          if (!Number.isInteger(input.skin) || input.skin<0 || input.skin>4 || [0,3,7,14,30][input.skin]>(await profile(player)).longest) throw problem(400,'That skin is still locked.');
          (await db.run('UPDATE players SET skin=? WHERE id=?', input.skin,player));
        }
      } else if(request.method!=='GET') throw problem(405,'Method not allowed.');
      const history = (await db.all('SELECT id,day,mode,state FROM runs WHERE player=? ORDER BY created DESC LIMIT 100', player)).map(r=>({id:r.id,day:r.day,mode:r.mode,status:JSON.parse(r.state).status,megabytes:totalMB(JSON.parse(r.state).answers)}));
      const archive=(await db.all("SELECT id,day,state FROM runs WHERE player=? AND mode IN ('daily','archive') ORDER BY (score IS NOT NULL) DESC,created DESC", player)).map(r=>({id:r.id,day:r.day,status:JSON.parse(r.state).status,megabytes:totalMB(JSON.parse(r.state).answers)}));
      return send(200,{...(await profile(player)), history,archive});
    }
    if (url.pathname === '/api/recovery' && request.method === 'POST') {
      const code = randomBytes(24).toString('base64url');
      (await db.run('UPDATE players SET recovery=? WHERE id=?', recoveryHash(code),player));
      return send(200,{code});
    }
    if (url.pathname === '/api/recover' && request.method === 'POST') {
      const key=ip, now=Date.now();
      if(config.recoveryLimit && !(await config.recoveryLimit.limit({key})).success) throw problem(429,'Too many recovery attempts. Try again later.');
      for(const [k,v] of recoverAttempts) if(now-v.at>600000) recoverAttempts.delete(k);
      const attempt=recoverAttempts.get(key)||{at:now,count:0}; attempt.count++; recoverAttempts.set(key,attempt);
      if(attempt.count>20) throw problem(429,'Too many recovery attempts. Try again in ten minutes.');
      const input=await body(request), code=typeof input.code==='string'?input.code.trim():'';
      const identity=/^[\w-]{32}$/.test(code)?(await db.get('SELECT id FROM players WHERE recovery=?', recoveryHash(code))):null;
      if(!identity) throw problem(400,'Recovery code not recognised.');
      const session=token(); (await db.run('INSERT INTO sessions(id,player) VALUES(?,?)', session,identity.id)); cookie(session);
      return send(200,{restored:true});
    }
    if (url.pathname === '/api/attacks' && request.method === 'GET') return send(200,(await attackLog(player)));
    if (url.pathname === '/api/attacks/seen' && request.method === 'POST') {
      const input=await body(request);if(!Number.isFinite(input.through))throw problem(400,'Missing log timestamp.');
      (await db.run('UPDATE players SET seen=max(seen,?) WHERE id=?', Math.min(Date.now(),input.through),player)); return send(200,{ok:true});
    }
    if (url.pathname === '/api/feedback' && request.method === 'POST') {
      const input=await body(request);
      if(!['answer','bug','question','other'].includes(input.kind)||typeof input.message!=='string'||!input.message.trim()||input.message.length>2000) throw problem(400,'Choose a feedback type and write up to 2,000 characters.');
      if(input.run){if(typeof input.run!=='string')throw problem(400,'Question not found.');const owned=(await getRun(input.run)); if(!owned||owned.player!==player||!Number.isInteger(input.round)||input.round<0||input.round>=7||input.round>owned.answers.length) throw problem(400,'Question not found.');}
      if(input.answer!==undefined&&(typeof input.answer!=='string'||input.answer.length>160))throw problem(400,'Answer is too long.');
      const id=token();const inserted=await db.run('INSERT INTO feedback SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM feedback WHERE player=? AND created>?)<20',id,player,Date.now(),input.kind,input.message.trim(),input.run||null,input.run?input.round:null,input.answer||null,player,Date.now()-86400000);
      if(!inserted.changes)throw problem(429,'Feedback saved for today. Please try again tomorrow.');
      return send(201,{id});
    }
    if (url.pathname === '/api/today' && request.method === 'GET') {
      const row = (await db.get("SELECT id FROM runs WHERE player=? AND day=? AND mode='daily'", player, today()));
      return send(200, { day: today(), serverTime:Date.now(), resetAt:Date.parse(`${today()}T00:00:00Z`)+86400000, version: data.version, run: row ? (await snapshot((await getRun(row.id)))) : null, ...(await profile(player)) });
    }
    const challengeMatch = url.pathname.match(/^\/api\/challenge\/([A-Za-z0-9_-]{24})$/);
    if (challengeMatch && request.method === 'GET') {
      const target = (await getRun(challengeMatch[1]));
      if (!target || target.status !== 'complete') throw problem(404, 'This virus link was not found.');
      return send(200, { name: (await displayName(target.player)), day: target.day });
    }
    if (url.pathname === '/api/run' && request.method === 'POST') {
      const input = await body(request);
      const mode = input.mode || 'daily';
      if (!['daily', 'practice', 'archive', 'challenge'].includes(mode)) throw problem(400, 'Unknown game mode.');
      let day = today(), target;
      if (mode === 'archive') {
        if (typeof input.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw problem(400, 'Choose a valid date.');
        const parsed = new Date(`${input.day}T00:00:00Z`);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input.day || input.day < '2026-09-27' || input.day >= today()) throw problem(400, 'Choose a past day since September 27, 2026.');
        day = input.day;
      }
      if (mode === 'challenge') {
        if (typeof input.challenge !== 'string') throw problem(400, 'Missing virus link.');
        target = (await getRun(input.challenge));
        if (!target || target.status !== 'complete') throw problem(404, 'This virus link was not found.');
        if(target.player===player) throw problem(400,'That is your own virus. Send the link to a friend.');
        day = target.day;
      }
      if (mode === 'daily') {
        const existing = (await db.get("SELECT id FROM runs WHERE player=? AND day=? AND mode='daily'", player, day));
        if (existing) return send(200, (await snapshot((await getRun(existing.id)))));
      }
      if (mode === 'challenge') {
        const previous=await db.get("SELECT id FROM runs WHERE player=? AND mode='challenge' AND json_extract(state,'$.challenge')=?",player,target.id);
        if (previous) return send(200, (await snapshot(await getRun(previous.id))));
        const daily=(await db.get("SELECT state FROM runs WHERE player=? AND day=? AND mode='daily'", player,day));
        if(daily){const current=(await getRun(JSON.parse(daily.state).id));if(current.status!=='complete'&&JSON.stringify(current.prompts)===JSON.stringify(target.prompts))throw problem(409,'Finish your daily first. We will use those answers to defend this attack.');}
      }
      const id = token();
      const run = { id, player, day, mode, status: 'ready', prompts: target?.prompts || dailyPrompts(mode === 'practice' ? id : day), answers: [], deadline: null, challenge: target?.id || null };
      if(input.counterOf){
        const previous=(await getRun(input.counterOf));
        if(mode!=='practice'||!previous||previous.player!==player||!previous.challenge||previous.status!=='complete') throw problem(400,'Finish defending before launching a counterattack.');
        run.counterOf=previous.id;run.recipient=(await getRun(previous.challenge)).player;
        run.prompts=dailyPrompts(id,previous.prompts);
      }
      if(target){
        const row=await db.get("SELECT state FROM runs WHERE player=? AND day=? AND mode='daily' AND score IS NOT NULL",player,target.day);
        const candidate=row?JSON.parse(row.state):null;
        const first=candidate&&JSON.stringify(candidate.prompts)===JSON.stringify(target.prompts)?candidate:null;
        if(first){run.answers=first.answers.map((a,i)=>({...a,opponent:target.answers[i],attack:attackPoints(a,target.answers[i])}));run.status='complete';run.completedAt=Date.now();run.reused=true;}
      }
      const inserted=await db.run('INSERT OR IGNORE INTO runs(id,player,day,mode,state,score,created) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM runs WHERE player=? AND created>?)<30',id,player,day,mode,JSON.stringify(run),run.status==='complete'?totalScore(run.answers):null,Date.now(),player,Date.now()-3600000);
      if(!inserted.changes){
        const existing=mode==='daily'?await db.get("SELECT id FROM runs WHERE player=? AND day=? AND mode='daily'",player,day):await db.get("SELECT id FROM runs WHERE player=? AND mode='challenge' AND json_extract(state,'$.challenge')=?",player,target?.id||'');
        if(!existing)throw problem(429,'Too many new runs. Come back in a little while.');
        return send(200,await snapshot(await getRun(existing.id)));
      }
      return send(201, (await snapshot(run)));
    }
    const match = url.pathname.match(/^\/api\/run\/([A-Za-z0-9_-]{24})(?:\/(start|answer|share))?$/);
    if (match) {
      const input = request.method === 'POST' ? await body(request) : {};
      const run = (await getRun(match[1]));
      if (!run || run.player !== player) throw problem(404, 'Run not found on this browser.');
      if (request.method === 'GET' && !match[2]) return send(200, (await snapshot(run)));
      if (request.method !== 'POST') throw problem(405, 'Method not allowed.');
      if (match[2] === 'start') {
        if (!Number.isInteger(input.round) || input.round < 0 || input.round > ROUNDS - 1) throw problem(400, 'Invalid question.');
        if (input.round > run.answers.length) throw problem(409, 'Finish the current question first.');
        if (input.round === run.answers.length && (run.status === 'ready' || run.status === 'reveal')) {
          run.status = 'question'; run.readyAt = Date.now() + 3000; run.deadline = run.readyAt + ROUND_MS; (await save(run));
        }
      } else if (match[2] === 'answer') {
        if (!Number.isInteger(input.round) || input.round < 0 || input.round > ROUNDS - 1) throw problem(400, 'Invalid question.');
        if (input.round === run.answers.length) {
          if (run.status !== 'question') throw problem(409, 'Start this question first.');
          if (typeof input.answer !== 'string' || input.answer.length > 160) throw problem(400, 'Keep your answer under 160 characters.');
          const answer = input.answer.trim();
          if (!(await finishAnswer(run, answer, Date.now() >= run.deadline))) {
            const choices = suggestions(run.prompts[run.answers.length], answer);
            const state = (await snapshot(run));
            return send(200, state.status === 'question' ? {
              ...state, feedback: { message: 'DATA ENTRY NOT FOUND — TRY AGAIN', suggestions: choices },
            } : state);
          }
        } else if (input.round > run.answers.length) throw problem(409, 'Answer the current question first.');
      } else if (match[2] === 'share') {
        if (run.status !== 'complete') throw problem(409, 'Finish your run first.');
        if (typeof input.name !== 'string' || input.name.length > 24) throw problem(400, 'Use a name of up to 24 characters.');
        run.name = input.name.replace(/[\x00-\x1f\x7f]/g, '').trim(); run.sharedAt=Date.now(); (await save(run));
        (await db.run('UPDATE players SET name=? WHERE id=?', run.name,player));
      } else throw problem(404, 'Not found.');
      return send(200, (await snapshot(run)));
    }
    throw problem(404, 'Not found.');

  } catch(error){
    if(!error.status&&/overloaded|SQLITE_BUSY|database is locked|D1_ERROR.*(timeout|timed out)/i.test(error.message)){headers.set('Retry-After','2');return send(503,{error:'The system is busy. Please try again shortly.'});}
    if(error.status===429)headers.set('Retry-After','60');
    if(!error.status)console.error(error);
    return send(error.status||500,{error:error.status?error.message:'Connection interrupted. Please try again.'});
  }
};
}
