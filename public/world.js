export const REGIONS = [
  { at: 0, name: 'ROOT DIRECTORY', color: '#B5B0A1', dim: '#424649' },
  { at: 128, name: 'PROGRAM FILES', color: '#AD8952', dim: '#393024' },
  { at: 256, name: 'EXTENDED MEMORY', color: '#778B8D', dim: '#293338' },
  { at: 512, name: 'PROTECTED MEMORY', color: '#9A8197', dim: '#392B38' },
  { at: 768, name: 'BOOT SECTOR', color: '#AE7560', dim: '#2D1B20' },
];
export const regionAt = mb => REGIONS.findLast(r => mb >= r.at) || REGIONS[0];
export const DISCOVERIES = [
  { at: 48, name: 'README.TXT', detail: 'Still unopened.', icon: 'file', comment: 'Nobody reads the instructions.' },
  { at: 104, name: 'PASSWORD.TXT', detail: '1234', icon: 'file', comment: 'I specifically told you not to do that.' },
  { at: 176, name: 'DISK 2 OF 3', detail: 'Disk 1 not found.', icon: 'disk', comment: 'It was here a minute ago.' },
  { at: 224, name: 'BALL MOUSE', detail: 'Some assembly required.', icon: 'mouse', comment: 'Have you tried cleaning it?' },
  { at: 336, name: 'DUNGEON.EXE', detail: 'Someone is still in there.', icon: 'maze', comment: 'That process has been running since 1994.' },
  { at: 464, name: 'PRINT QUEUE', detail: 'One page. Eventually.', icon: 'file', comment: 'Please stop pressing Print.' },
  { at: 608, name: 'BACKUP/', detail: '404: BACKUP NOT FOUND.', icon: 'folder', comment: 'You said you backed it up.' },
  { at: 896, name: 'BACKUP.BAK', detail: 'Last modified: a very long time ago.', icon: 'disk', comment: 'Please tell me this still opens.' },
];
export const discoveriesBetween = (from, to) => DISCOVERIES.filter(d => d.at > from && d.at <= to);
export const TIERS = [
  { at: 0, name: 'MINOR GLITCH', color: '#B5B0A1', reaction: 'A few bytes slipped through.', comment: 'It does that sometimes.', icon: 'glitch' },
  { at: .2, name: 'NOT RESPONDING', color: '#B5B0A1', reaction: 'You’re in. Something stopped responding.', comment: 'Have you tried restarting it?', icon: 'wait' },
  { at: .45, name: 'SYSTEM FAILURE', color: '#AD8952', reaction: 'Good hit. The damage is spreading.', comment: 'You did make a backup, right?', icon: 'warning' },
  { at: .7, name: 'FATAL ERROR', color: '#AE7560', reaction: 'Deep breach. That should have been protected.', comment: 'That’s… not supposed to be possible.', icon: 'error' },
  { at: .9, name: 'BEYOND REPAIR', color: '#C0BAB0', reaction: 'No clean reboot is fixing that.', comment: 'Have you tried buying a new computer?', icon: 'disk' },
];
export const tierAt = f => TIERS.findLast(t => f >= t.at) || TIERS[0];
// We overhear the technician outside the machine. He never coaches the virus.
export function technicianLine({from,to,fraction,valid,round}, previous = []) {
  if(!valid || to<=from || previous.length>=3 || round-(previous.at(-1)?.round ?? -1)<2) return '';
  const discovery=discoveriesBetween(from,to).at(-1);
  const lines=discovery ? [discovery.comment] : to>=768 ? ['Right. Nobody touch anything.','The reboot did not help.','That is not a reassuring noise.']
    : to>=512 ? ['That’s… not supposed to be possible.','Why is that opening itself?','That was supposed to be protected.']
    : fraction>=.45 ? ['You did make a backup, right?','I did not install that.','Who brought in that disk?']
    : fraction>=.2 ? ['Have you tried restarting it?','Give it a second.','It was working this morning.']
    : ['It does that sometimes.','Probably just the disk drive.'];
  return [...lines.slice(round%lines.length),...lines.slice(0,round%lines.length)].find(line=>!previous.some(p=>p.text===line)) || '';
}
export const SKINS = [
  { name: 'ORIGINAL', days: 0, crop: [24,180,230,162] },
  { name: 'DOS WORM', days: 3, crop: [300,190,224,122] },
  { name: 'MACHINE', days: 7, crop: [618,194,169,130] },
  { name: 'LIQUID METAL', days: 14, crop: [864,162,280,180] },
  { name: 'DEEP HUNTER', days: 30, crop: [1172,114,350,270] },
];
const shapes = {
  virus: '<path d="m16 6 6 6-6 6-4-6zM5 11h7v2H5zM1 4h3v2h2v2h2v3H6V9H4V7H1zm0 16h3v-2h2v-2h2v-3H6v2H4v2H1z"/>',
  floppy: '<path d="M3 2h16v3h3v17H3zm3 2v7h12V4zm1 11v9h10v-9z" fill-rule="evenodd"/>',
  glitch: '<path d="M5 3h12v5H7v2h13v5H5v-4H3V7h2zm0 14h12v4H5z"/>',
  wait: '<path d="M4 2h16v3H4zm2 4h3v3l3 3 3-3V6h3v4l-4 3 4 4v2H6v-2l4-4-4-3zm-2 14h16v3H4z"/>',
  warning: '<path d="M10 2h4v3h2v4h2v4h2v4h2v5H2v-5h2v-4h2V9h2V5h2z"/><path fill="#0B0D0C" d="M10 8h4v7h-4zm0 9h4v3h-4z"/>',
  error: '<path d="M7 2h10v2h3v3h2v10h-2v3h-3v2H7v-2H4v-3H2V7h2V4h3z"/><path fill="#E7E3D6" d="m7 6 5 5 5-5 2 2-5 5 5 5-2 2-5-5-5 5-2-2 5-5-5-5z"/>',
  disk: '<path d="M3 2h16v3h3v17H3zm3 2v7h12V4zm1 11v5h10v-5z" fill-rule="evenodd"/><path d="m13 2-3 9 5 2-5 9h3l5-10-5-3 3-7" fill="#0B0D0C"/>',
  file: '<path d="M5 2h10v3h3v3h3v14H5zm2 2v16h12V9h-5V4zm2 8h7v2H9zm0 4h7v2H9z" fill-rule="evenodd"/>',
  folder: '<path d="M2 5h8v3h12v13H2zm2 5v9h16v-9z" fill-rule="evenodd"/>',
  mouse: '<path d="M8 4h8v3h3v12h-3v3H8v-3H5V7h3zm3 1v8h2V5z" fill-rule="evenodd"/>',
  maze: '<path d="M2 2h20v2H4v16h16V8h-4v8H8V8h4v2h-2v4h4V6h8v16H2z"/>',
};
const tierCrops = { glitch: '150 625 65 65', wait: '478 623 67 68', warning: '798 623 77 70', error: '1116 623 74 71', disk: '1445 622 82 73' };
export const icon = (name, cls = '') => tierCrops[name]
  ? `<svg class="pixel-icon ${cls}" viewBox="${tierCrops[name]}" aria-hidden="true"><image href="/assets/tiers.png" width="1672" height="941"/></svg>`
  : `<svg class="pixel-icon ${cls}" viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${shapes[name] || shapes.file}</svg>`;

export const travelProgress = p => p < .18 ? .5*p*p/.18/.78 : p < .74 ? (p-.09)/.78 : 1-.5*(1-p)**2/.26/.78;
export function createWorld(canvas, onPosition) {
  const ctx = canvas.getContext('2d'), atlas = new Image(), skins = new Image(), tierAtlas = new Image();
  atlas.src = '/assets/sprites.png'; skins.src = '/assets/skins.png'; tierAtlas.src = '/assets/tiers.png';
  let position = 0, trace = [], profile = {}, skin = 0, animation = null, frame = 0, visible = true, time = 0, parked = .25, impact = null;
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = { get matches(){return systemMotion.matches || document.body.classList.contains('reduce-motion');} };
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; draw(); }
  const noise = n => { const v = Math.sin(n * 127.1 + 47.7) * 43758.5453; return v - Math.floor(v); };
  function draw() {
    const w = canvas.width, h = canvas.height, mobile = w < 650;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0B0D0C'; ctx.fillRect(0, 0, w, h);
    if (!visible) return;
    const span = mobile ? 90 : 130, scale = w / span, xAt = mb => w * parked + (mb - position) * scale;
    const y = Math.round(h * (mobile ? .45 : .49)), ruler = Math.round(h * (mobile ? .62 : .66));
    const region = regionAt(position);
    ctx.fillStyle = region.dim; ctx.globalAlpha = .13; ctx.fillRect(0,76,w,ruler-76); ctx.globalAlpha = 1;
    ctx.font = '20px Terminal, monospace'; ctx.textBaseline = 'middle';
    // Stable world coordinates: nothing rerolls between answers or days.
    for (let i = Math.floor((position - span) / 3); i < (position + span) / 3; i++) {
      if (i < 0 || i > 350) continue;
      const wx = i * 3, c = regionAt(wx), x = Math.round(xAt(wx)), py = Math.round(90 + noise(i + 6) * (ruler - 145));
      if (Math.abs(py - y) < 36 && Math.abs(x - w / 2) < 78) continue;
      ctx.fillStyle = noise(i + 50) > .9 ? c.color : c.dim;
      if (i % 7 === 0) ctx.fillText(i % 2 ? '0' : '1', x, py);
      else for (let j = 0; j < 1 + noise(i) * 2; j++) ctx.fillRect(x + j * 9, py + (reduced.matches ? 0 : Math.sin(time/1800+i)*2), 4 + Math.floor(noise(i + j) * 3), 2);
    }
    for (let mb = 0; mb <= 1024; mb += 64) {
      const x = xAt(mb); if (x < -100 || x > w + 100) continue;
      const r = REGIONS.find(r => r.at === mb), c = regionAt(mb);
      for (let j = 0; j < 52; j++) {
        ctx.fillStyle = j % 5 ? c.dim : c.color;
        ctx.fillRect(Math.round(x + noise(j + mb) * (r ? 17 : 5)), 95 + j * ((ruler - 60) / 52), j % 4 ? 2 : 5, 3 + Math.floor(noise(j) * 7));
      }
      if (r && x > -190 && x < w - 28) {
        ctx.fillStyle = c.color; ctx.font = `${mobile ? 15 : 20}px Terminal, monospace`;
        const labelX = Math.min(x + 24, w - (mobile ? 128 : 175));
        ctx.fillText(r.name, labelX, y - 105); ctx.fillText(`${mb} MB`, labelX, y - 83);
      }
    }
    // Keep the actual prompt readable while fragments pass around it.
    ctx.fillStyle = region.color; ctx.font = '15px Terminal, monospace';
    ctx.fillText(`${region.name} / MB`, 24, ruler + 46);
    for (const d of DISCOVERIES) {
      const x = xAt(d.at); if (x < 30 || x > w - 90) continue;
      ctx.globalAlpha = .65; ctx.fillStyle = regionAt(d.at).color; ctx.font = '17px Terminal, monospace';
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
      const iy = ruler - 64;
      if (d.icon === 'mouse') { ctx.strokeRect(x+2,iy+3,12,17); ctx.fillRect(x+7,iy+3,2,7); ctx.fillRect(x+14,iy+22,4,4); }
      else if (d.icon === 'folder') { ctx.strokeRect(x,iy+5,18,15); ctx.fillRect(x,iy,8,5); }
      else if (d.icon === 'maze') { ctx.strokeRect(x-3,iy,22,22); ctx.fillText('@',x+2,iy+11); }
      else { ctx.strokeRect(x,iy,16,20); ctx.fillRect(x+4,iy+5,8,d.icon === 'disk' ? 6 : 2); ctx.fillRect(x+4,iy+13,8,2); }
      ctx.fillText(d.name, x + 24, ruler - 56);
      ctx.fillStyle = '#77796F'; ctx.font = '15px Terminal, monospace'; ctx.fillText(d.detail, x + 24, ruler - 36);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = '#77796F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(24, ruler); ctx.lineTo(w - 24, ruler); ctx.stroke();
    const step = 32;
    for (let mb = 0; mb <= 1024; mb += step) {
      const x = xAt(mb); if (x < 24 || x > w - 24) continue;
      ctx.fillStyle = regionAt(mb).color; ctx.fillRect(Math.round(x), ruler - 5, 2, 11); ctx.font = '18px Terminal, monospace';
      ctx.textAlign = 'center'; ctx.fillText(`${mb}${mb % 128 === 0 ? ' MB' : ''}`, x, ruler + 22);
    }
    for (const [label, mb] of [['YESTERDAY', profile.yesterday], ['PERSONAL BEST', profile.best]]) {
      if (mb == null) continue; const x = xAt(mb); if (x < 30 || x > w - 90) continue;
      ctx.fillStyle = '#77796F'; for (let j = -26; j < 35; j += 8) ctx.fillRect(x, ruler + j, 2, 4);
      ctx.textAlign = 'left'; ctx.font = '14px Terminal, monospace'; ctx.fillText(`${label} / ${mb}`, x + 8, ruler + 47);
    }
    // Infected blocks stay in world coordinates after the payload passes.
    trace.forEach((t, i) => {
      const from = trace[i-1]?.position || 0, end = Math.min(t.position, position);
      if (!t.valid || end <= from) return;
      for (let mb = Math.max(from, Math.floor((position-span)/4)*4); mb < end; mb += 4) {
        const x = xAt(mb); if (x < -12 || x > w) continue;
        ctx.fillStyle = '#184D2E'; ctx.fillRect(Math.round(x), y+27, 7, 3);
        ctx.fillStyle = '#285F39'; ctx.fillRect(Math.round(x)+3, y+32, 3, 3);
      }
    });
    trace.forEach((t, i) => {
      const x = xAt(t.position); if (x < 24 || x > w - 24 || t.position > position + 1) return;
      ctx.fillStyle = t.valid ? '#4CD46C' : '#77796F'; ctx.fillRect(x - 3, ruler - 3, 6, 6);
      ctx.textAlign = 'center'; ctx.font = '14px Terminal, monospace'; ctx.fillText(String(i + 1).padStart(2, '0'), x, ruler - 17 - (i % 2) * 13);
    });
    ctx.textAlign = 'left';
    const moving = animation !== null, sx = Math.round(w * parked), sy = y;
    if (moving) {
      const from = animation.from;
      TIERS.slice(1).forEach(t => {
        const at = from+t.at*1024/7, tx = xAt(at); if(tx < -150 || tx > w+30)return;
        const crossed = position >= at;
        ctx.strokeStyle = crossed ? t.color : '#424649'; ctx.lineWidth = crossed && position-at<8 ? 3 : 1;
        ctx.setLineDash([4,6]); ctx.beginPath();ctx.moveTo(tx,y-65);ctx.lineTo(tx,y+50);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle = crossed ? t.color : '#77796F';ctx.font = `${mobile?14:17}px Terminal, monospace`;ctx.fillText(t.name,tx+8,y-52);
        if(tierAtlas.complete && tierAtlas.naturalWidth){ctx.globalCompositeOperation='lighten';ctx.globalAlpha=crossed?1:.5;ctx.drawImage(tierAtlas,...tierCrops[t.icon].split(' ').map(Number),tx+8,y-35,22,22);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
      });
    }
    const strength = animation?.strength ?? impact?.strength ?? 0, age = impact ? time-impact.at : Infinity;
    // Strong breaches pull the environment into shadow; the payload stays clear.
    const focus = reduced.matches ? 0 : moving && strength >= .7 ? Math.min(1,animation.progress*7)
      : strength >= .7 && age < 2300 ? Math.min(1,(2300-age)/900) : 0;
    if (focus > 0) {
      const radius = Math.min(w,h)*.36 + (moving ? 0 : Math.min(age,1100)*.15);
      const shade = ctx.createRadialGradient(sx,sy,28,sx,sy,radius);
      shade.addColorStop(0,'#0000'); shade.addColorStop(1,`rgba(0,0,0,${.78*focus})`);
      ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    }
    if (moving && !reduced.matches) for (let j=1;j<=6+Math.floor(strength*10);j++) {
      ctx.fillStyle=j<5?'#4CD46C':'#184D2E';ctx.fillRect(sx-30-j*10,sy+(noise(j+Math.floor(time/65))-.5)*18,4,3);
    }
    if (!moving) {
      // The virus is planted, not bobbing. A small socket links it to the blocks.
      ctx.strokeStyle='#285F39';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+26,sy);ctx.lineTo(sx+36,sy);ctx.lineTo(sx+36,sy+28);ctx.lineTo(sx-16,sy+28);ctx.stroke();
      ctx.fillStyle='#4CD46C';ctx.fillRect(sx+33,sy-3,6,6);
    }
    if (age < 900 && !reduced.matches) {
      const p=age/900, reach=12+p*(20+strength*70);
      ctx.globalAlpha=1-p;ctx.fillStyle=tierAt(strength).color;
      for(let i=0;i<4+Math.floor(strength*12);i++) {
        const angle=noise(i+13)*Math.PI*2;
        ctx.fillRect(Math.round(sx+Math.cos(angle)*reach),Math.round(sy+Math.sin(angle)*reach),3,3);
      }
      if(strength>=.9){ctx.strokeStyle='#4CD46C';ctx.lineWidth=2;ctx.strokeRect(sx-reach,sy-reach/2,reach*2,reach);}
      ctx.globalAlpha=1;
    }
    ctx.globalCompositeOperation='lighten';
    if (skin===0 && atlas.complete && atlas.naturalWidth) ctx.drawImage(atlas,681,448,130,90,sx-26,sy-18,52,36);
    else if(skins.complete && skins.naturalWidth){
      let crop=SKINS[skin].crop,sw=mobile?65:80;
      if(skin===4){crop=moving?[625,708,668,228]:[224,736,252,197];sw=moving?112:65;}
      const sh=sw*crop[3]/crop[2];ctx.drawImage(skins,...crop,sx-sw/2,sy-sh/2,sw,sh);
    }
    ctx.globalCompositeOperation='source-over';
    if(moving){
      const answer=animation.answer;ctx.font=`${mobile?20:24}px Terminal, monospace`;ctx.textAlign='center';
      const width=Math.min(w-36,ctx.measureText(answer).width+24),lx=Math.max(width/2+12,Math.min(w-width/2-12,sx));
      ctx.fillStyle='#0B0D0C';ctx.fillRect(lx-width/2,sy+39,width,32);ctx.fillStyle=strength>=.9?'#4CD46C':'#E7E3D6';
      ctx.fillText(answer,lx,sy+56,width-16);ctx.textAlign='left';
    }else if(age<1800 && !reduced.matches){
      ctx.globalAlpha=Math.min(1,(1800-age)/400);ctx.fillStyle='#4CD46C';ctx.font='14px Terminal, monospace';
      ctx.fillText('PAYLOAD WRITTEN',Math.max(16,sx-44),sy+48);ctx.globalAlpha=1;
    }
  }
  function idle(now) {
    time=now; parked += (.25-parked)*.08;
    draw(); frame = visible && !animation && !reduced.matches ? requestAnimationFrame(idle) : 0;
  }
  function travel(to, nextTrace, answer = '') {
    trace = nextTrace || trace;
    if (animation) { cancelAnimationFrame(frame); animation.resolve(); animation = null; }
    cancelAnimationFrame(frame);
    impact=null;
    const from = position, strength = nextTrace?.at(-1)?.fraction || 0, duration = reduced.matches || to <= from ? 0 : 2600 + strength*1800;
    return new Promise(resolve => {
      animation = { from, resolve, answer, strength, progress:0 }; const start = performance.now();
      function step(now) {
        const p = duration ? Math.max(0, Math.min(1, (now - start) / duration)) : 1;
        time=now; animation.progress=p; parked = reduced.matches ? .25 : .25+.15*Math.sin(Math.PI*travelProgress(p));
        position = from + (to - from) * travelProgress(p); onPosition(Math.round(position));
        if (p === 1) { animation = null; impact={at:now,strength}; draw(); frame=0; if(!reduced.matches)frame=requestAnimationFrame(idle); resolve(); } else { draw(); frame = requestAnimationFrame(step); }
      }
      frame = requestAnimationFrame(step);
    });
  }
  addEventListener('resize', resize); atlas.onload = draw; skins.onload = draw; tierAtlas.onload = draw; document.fonts.ready.then(draw); resize();
  return { travel, set(to, nextTrace = []) { if(animation){cancelAnimationFrame(frame);animation.resolve();animation=null;frame=0;} position = to; trace = nextTrace; impact=null;parked=.25;onPosition(to); draw(); },
    show(value) { visible = value; if(value && !frame && !reduced.matches)frame=requestAnimationFrame(idle);draw(); },
    phase(value) { if(value==='question'||value==='ready'||value==='report'||value==='intro')impact=null;draw(); },
    profile(value) { profile = value; draw(); }, skin(value) { skin = value; draw(); },
  };
}
