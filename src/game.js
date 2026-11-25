import { AudioClip, bootstrap, BT, Color32, Vector2i } from 'blit386';
import './style.css';
import { exportSound } from './export-sound.js';
import { AudioPlayer } from './audio-player.js';
const player = new AudioPlayer();
let filterEnabled = true;
let filterType = 'lowpass';
let liveTimer;
let pitchEnabled = true;
let vibratoEnabled = true;

const waves = ['sine', 'triangle', 'sawtooth', 'square', 'noise'];
const names = ['SINE', 'TRIANGLE', 'SAW', 'PULSE', 'NOISE'];
const specs = {
 cutoff: ['FILTER CUTOFF', 20, 20000, 8000, 'Hz', true],
 resonance: ['RESONANCE', .1, 12, .7, 'Q'],
 frequency: ['FREQUENCY', 40, 2000, 440, 'Hz', true],
 duration: ['DURATION', .1, 4, 1.2, 's'],
 attack: ['ATTACK', 0, .3, .015, 's'],
 tail: ['DECAY / RELEASE', 0, .3, .12, 's'],
 sustain: ['SUSTAIN', 0, 1, .55, '%'],
 sweep: ['SWEEP TARGET', 40, 3000, 440, 'Hz', true],
 rate: ['VIBRATO RATE', 0, 20, 5, 'Hz'],
 depth: ['VIBRATO DEPTH', 0, 100, 0, 'Hz'],
 noise: ['NOISE MIX', 0, 1, 0, '%'],
 duty: ['PULSE WIDTH', .05, .95, .5, '%'],
 volume: ['VOLUME', 0, 1, .6, '%'],
 pitch: ['PLAYBACK PITCH', .25, 2, 1, 'x'],
 pan: ['PAN', -1, 1, 0, ''],
 seed: ['SEED', 0, 65535, 1, ''],
};
const values = Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, s[3]]));
let waveform = 3;
let ready = false;
let loopEnabled = false;
let sweepEnabled = true;
let spaceHeld = false;
let voiceLoops = false;
let currentClip;
let playVersion = 0;
let pendingPlay = false;

function wavePath(index) {
 const pts = [];
 for (let i = 0; i <= 40; i++) {
  const t = i / 40;
  const y = index === 0 ? Math.sin(t * Math.PI * 4) : index === 1 ? 2 / Math.PI * Math.asin(Math.sin(t * Math.PI * 4)) : index === 2 ? 2 * ((t * 2) % 1) - 1 : index === 3 ? ((t * 2) % 1 < .5 ? 1 : -1) : Math.sin(i * 31.7) * Math.cos(i * 7.3);
  pts.push(`${i ? 'L' : 'M'}${i + 3},${17 - y * 10}`);
 }
 return `<svg viewBox="0 0 46 34" aria-hidden="true"><path d="${pts.join(' ')}"/></svg>`;
}
function slider(key) {
 const s = specs[key];
 return `<label class="control" for="${key}"><span>${s[0]}<output id="${key}-value"></output></span><input id="${key}" type="range" min="0" max="1000" step="1" data-param="${key}"/><small>${key === 'tail' ? 'LINKED D + R' : key === 'duty' ? 'PULSE WAVE ONLY' : key === 'noise' ? 'TONE / WHITE NOISE' : '&nbsp;'}</small></label>`;
}
const app = document.querySelector('#app');
app.innerHTML = `<main class="machine">
<header><div class="brand">BLIT<span>386</span><small>PROCEDURAL AUDIO INSTRUMENT</small></div><div class="model">SC–386 <span>SOUND CREATOR</span></div><i class="screw"></i></header>
<div class="topline"><span><b class="led"></b> SYNTH ENGINE / 01</span><span>MONO VOICE · DIGITAL / ANALOG SOUL</span></div>
<div class="upper">
<section class="osc"><h2><b>01</b> OSCILLATOR</h2><div class="selector">${waves.map((w, i) => {const a = (-150 + i * 75) * Math.PI / 180; return `<button class="wave" data-wave="${i}" style="--x:${Math.cos(a) * 103}px;--y:${Math.sin(a) * 82}px" aria-label="${names[i]}" aria-pressed="false">${wavePath(i)}<span>${names[i]}</span></button>`;}).join('')}<div class="knob" role="slider" tabindex="0" aria-label="Waveform" aria-valuemin="0" aria-valuemax="4"><i></i><span>WAVE</span></div></div><div class="wave-name">04 <span>PULSE</span></div></section>
<section class="envelope"><h2><b>02</b> AMPLITUDE ENVELOPE <span>ADSR / LINKED D–R</span></h2><div class="screen"><div class="screen-top"><span>AMP ENV</span><span id="env-time"></span></div><svg id="envelope" viewBox="0 0 600 150" role="img" aria-label="ADSR amplitude envelope"><defs><pattern id="grid" width="30" height="25" patternUnits="userSpaceOnUse"><path d="M30 0H0V25" fill="none" stroke="#52654d" stroke-opacity=".25"/></pattern></defs><rect width="600" height="150" fill="url(#grid)"/><path id="env-fill"/><path id="env-line"/><g id="env-points"></g></svg><div class="phases"><span>ATTACK</span><span>DECAY</span><span>SUSTAIN</span><span>RELEASE</span></div></div><div class="env-controls">${['attack', 'tail', 'sustain'].map(slider).join('')}</div></section>
</div>
<div class="lower"><section><h2><b>03</b> TUNING & TIME</h2>${['frequency','sweep','duration','pitch'].map(slider).join('')}</section><section><h2><b>04</b> MODULATION & COLOR</h2>${['rate','depth','noise','duty'].map(slider).join('')}</section><section><h2><b>05</b> OUTPUT & VARIATION</h2>${['volume','pan','seed'].map(slider).join('')}<div class="meter"><span>OUTPUT</span><div>${'<i></i>'.repeat(18)}</div></div></section></div>
<section class="filter-section"><h2><b>06</b> FILTER <span>LIVE SIGNAL PROCESSING</span></h2><label class="toggle"><input id="filter-enabled" type="checkbox" role="switch" checked><span>FILTER ON</span></label><div class="filter-layout"><div class="filter-dials"><div id="type-dial"></div><div id="cutoff-dial"></div><div id="resonance-dial"></div></div><div class="screen filter-screen"><div class="screen-top"><span>FILTER RESPONSE</span><span id="filter-caption"></span></div><svg viewBox="0 0 400 130" aria-label="Filter frequency response"><path d="M0 30H400M0 65H400M0 100H400M100 0V130M200 0V130M300 0V130" class="graph-grid"/><path id="filter-response"/><path id="filter-marker"/></svg><div class="phases"><span>20 Hz</span><span>200</span><span>2k</span><span>20k Hz</span></div></div></div></section>
<section class="scope screen"><div class="screen-top"><span>OUTPUT OSCILLOSCOPE</span><span>LIVE / POST FILTER</span></div><svg viewBox="0 0 900 100" aria-label="Live output waveform"><path d="M0 50H900" class="graph-grid"/><path id="scope-wave" d="M0 50H900"/></svg></section><div class="preset-bar"><span id="preset-name">UNTITLED PATCH</span><button id="save">SAVE</button><button id="load">LOAD</button><button id="export">EXPORT</button></div><dialog id="preset-dialog"><form id="preset-form"><h2 id="dialog-title"></h2><div id="dialog-body"></div><p id="dialog-error" role="alert"></p><div class="dialog-actions"><button type="button" id="dialog-close">CANCEL</button><button type="submit" id="dialog-submit">SAVE</button></div></form></dialog><footer><label class="toggle loop-toggle"><input id="loop" type="checkbox" role="switch"><span>LOOP</span></label><div class="status"><b class="led" id="status-led"></b><span id="status">INITIALIZING ENGINE</span><small>LIVE CONTROLS / HOLD SPACE TO LOOP.</small></div><button id="random">↗ <span>RANDOM</span></button><button id="play"><span class="triangle"></span> PLAY <kbd>SPACE</kbd></button></footer><div class="bottom"><span>PALETTE FIRST. SOUND ALWAYS.</span><span>BLIT386 / SYNTH LAB</span></div></main>`;

const sweepControl = document.getElementById('sweep').closest('.control');
const sweepToggle = document.createElement('label');
sweepToggle.className = 'toggle sweep-toggle';
sweepToggle.innerHTML = '<input id="sweep-enabled" type="checkbox" role="switch" checked aria-label="Sweep"><span>ON</span>';
sweepControl.before(sweepToggle);
sweepToggle.addEventListener('change', () => {
 sweepEnabled = document.getElementById('sweep-enabled').checked;
 sweepToggle.querySelector('span').textContent = sweepEnabled ? 'ON' : 'OFF';
 refresh();
 liveChange('sweep');
});
document.getElementById('loop').addEventListener('change', () => {
 loopEnabled = document.getElementById('loop').checked;
 if (player.active) {
  voiceLoops = loopEnabled || spaceHeld;
  player.setLoop(voiceLoops);
 }

});

for (const type of ['pointerdown', 'keydown', 'touchend']) {
 window.addEventListener(type, event => { if (event.isTrusted) void player.unlock(); }, {capture:true});
}
document.getElementById('filter-enabled').addEventListener('change', e => {
 filterEnabled = e.target.checked;
 refresh(); liveChange('cutoff');
});
function liveChange(key) {
 player.update(playbackValues(), filterEnabled, filterType);
 if (['volume', 'pitch', 'pan', 'cutoff', 'resonance'].includes(key)) return;
 clearTimeout(liveTimer);
 // Synth parameters are baked into the clip: replace with a short crossfade.
 if (player.active) liveTimer = setTimeout(() => {if (player.active) void play();}, 45);
}

// Forward an actual page gesture in the same event turn to the engine canvas.
// The browser's user activation remains active while BLIT386 resumes its context.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
 window.addEventListener(type, event => {
  if (ready && !BT.isAudioUnlocked && event.target !== document.getElementById('blit386-canvas')) {
   document.getElementById('blit386-canvas').dispatchEvent(new KeyboardEvent('keydown', { code: 'AudioUnlock', key: 'AudioUnlock' }));
  }
 }, { capture: true });
}

function normalized(key) {
 const [, min, max, , , log] = specs[key];
 return log ? Math.log(values[key] / min) / Math.log(max / min) : (values[key] - min) / (max - min);
}
function setNormalized(key, t) {
 const [, min, max, , , log] = specs[key];
 values[key] = key === 'seed' ? Math.round(min + t * (max - min)) : log ? min * (max / min) ** t : min + t * (max - min);
}
function refresh() {
 for (const [key, s] of Object.entries(specs)) {
  const input = document.getElementById(key);
  if (!input) continue;
  input.value = Math.round(normalized(key) * 1000);
  input.style.setProperty('--fill', `${normalized(key) * 100}%`);
  const v = values[key];
  document.getElementById(`${key}-value`).textContent = s[4] === '%' ? `${Math.round(v * 100)}%` : `${key === 'seed' ? Math.round(v) : s[4] === 'Hz' ? v.toFixed(v < 30 ? 1 : 0) : v.toFixed(2)} ${s[4]}`;
 }
 for (const key of []) {
  document.getElementById(key).disabled = !filterEnabled;
  document.getElementById(key).closest('.control').classList.toggle('inactive', !filterEnabled);
 }
 refreshDials();
 drawFilter();
 for (const [key, enabled] of [['pitch',pitchEnabled],['rate',vibratoEnabled],['depth',vibratoEnabled]]) {
 document.getElementById(key).disabled = !enabled;
 document.getElementById(key).closest('.control').classList.toggle('inactive',!enabled);
 }
 document.getElementById('duty').disabled = waveform !== 3;
 document.getElementById('duty').closest('.control').classList.toggle('inactive', waveform !== 3);
 document.getElementById('sweep').disabled = !sweepEnabled;
 sweepControl.classList.toggle('inactive', !sweepEnabled);
 document.querySelectorAll('.wave').forEach((b, i) => b.setAttribute('aria-pressed', String(i === waveform)));
 const knob = document.querySelector('.knob');
 knob.style.setProperty('--angle', `${-150 + waveform * 75 + 90}deg`);
 knob.setAttribute('aria-valuenow', waveform);
 knob.setAttribute('aria-valuetext', names[waveform]);
 document.querySelector('.wave-name').innerHTML = `0${waveform + 1} <span>${names[waveform]}</span>`;
 const { attack, tail, sustain, duration } = values;
 const x = t => 12 + t / duration * 576;
 const points = [[12,126], [x(attack),16], [x(attack + tail),126 - sustain * 110], [x(duration - tail),126 - sustain * 110], [588,126]];
 const d = points.map(([a,b],i) => `${i?'L':'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
 document.getElementById('env-line').setAttribute('d',d);
 document.getElementById('env-fill').setAttribute('d',`${d} Z`);
 document.getElementById('env-points').innerHTML = points.map(([cx,cy])=>`<rect x="${cx-3}" y="${cy-3}" width="6" height="6"/>`).join('');
 document.getElementById('env-time').textContent = `${duration.toFixed(2)} SEC`;
}
// Reserve a hold segment so the displayed envelope matches the rendered ADSR.
function constrainEnvelope() {
 const total = values.attack + values.tail * 2;
 if (total > values.duration * .9) {
  const factor = values.duration * .9 / total;
  values.attack *= factor;
  values.tail *= factor;
 }
}
app.addEventListener('input', e => {
 const key = e.target.dataset.param;
 if (!key) return;
 setNormalized(key, Number(e.target.value) / 1000);
 if (key === 'pitch' && !pitchKeyboard && Math.abs(values.pitch - 1) < .035) values.pitch = 1;
 constrainEnvelope();
 refresh();
 liveChange(key);
});
function selectWave(i) { waveform = (i + 5) % 5; refresh(); liveChange('waveform'); }
document.querySelectorAll('.wave').forEach(b => b.addEventListener('click', () => selectWave(Number(b.dataset.wave))));
const knob = document.querySelector('.knob');
knob.addEventListener('pointerdown', e => { knob.setPointerCapture(e.pointerId); selectAt(e); });
function selectAt(e) {
 const r = knob.getBoundingClientRect();
 const a = Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)*180/Math.PI;
 let best=0,dist=Infinity;
 for(let i=0;i<5;i++){ const delta=Math.abs(((a-(-150+i*75)+540)%360)-180); if(delta<dist){dist=delta;best=i;} }
 selectWave(best);
}
knob.addEventListener('pointermove', e => {if(knob.hasPointerCapture(e.pointerId)) selectAt(e);});
knob.addEventListener('keydown', e => {if(['ArrowRight','ArrowUp','ArrowLeft','ArrowDown'].includes(e.key)){e.preventDefault();selectWave(waveform+(['ArrowRight','ArrowUp'].includes(e.key)?1:-1));}});
document.getElementById('random').addEventListener('click', () => {
 for (const key of Object.keys(specs)) setNormalized(key, Math.random());
 waveform = Math.floor(Math.random()*5);
 constrainEnvelope(); refresh(); liveChange('random');
});
async function play() {
 if (!ready) return;
 if (player.context?.state !== 'running') { pendingPlay = true; return; }
 const version = ++playVersion;
 try {
  const clip = await AudioClip.synth(synthParams());
  if(version!==playVersion){clip.unload();return;}
  currentClip?.unload(); currentClip=clip;
  voiceLoops = loopEnabled || spaceHeld;
  player.start(clip.buffer, playbackValues(), voiceLoops, filterEnabled, filterType);
 } catch(error) { document.getElementById('status').textContent = 'AUDIO ERROR'; console.error(error); }
}
document.getElementById('play').addEventListener('click', play);
function stop() {
 ++playVersion;
 pendingPlay = false;
 clearTimeout(liveTimer);
 player.stop();
 voiceLoops = false;
}
window.addEventListener('keydown', e => {
 if (e.code !== 'Space' || document.querySelector('dialog[open]')) return;
 e.preventDefault();
 if (!e.repeat && !spaceHeld) { spaceHeld = true; void play(); }
});
function releaseSpace() {
 if (!spaceHeld) return;
 spaceHeld = false;
 if (!loopEnabled) stop();
}
window.addEventListener('keyup', e => { if (e.code === 'Space' && !dialog.open) {e.preventDefault(); releaseSpace();} });
window.addEventListener('blur', releaseSpace);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseSpace(); });
class Synth {
 configure(){return {displaySize:new Vector2i(320,240),isSplashEnabled:false,isCapturingKeyboardScroll:true};}
 async init(){const p=BT.paletteCreate(2);p.set(1,new Color32(20,22,20));BT.paletteSet(p);ready=true;return true;}
 update(){
  if(pendingPlay && player.context?.state === 'running'){pendingPlay=false;void play();}
  drawScope();
  const active=player.active;
  document.getElementById('status').textContent=active?(voiceLoops?'VOICE ACTIVE / LOOPING':'VOICE ACTIVE / PLAYING'):ready?'READY / BLIT386 1.8':'INITIALIZING';
  document.querySelector('.machine').classList.toggle('playing',active);
 }
 render(){BT.clear(1);}
}
function playbackValues() { return {...values, pitch: pitchEnabled ? values.pitch : 1}; }
function synthParams() {
 return {waveform:waves[waveform],frequency:values.frequency,duration:values.duration,volume:1,
 envelope:{attack:values.attack,decay:values.tail,sustain:values.sustain,release:values.tail},
 ...(sweepEnabled ? {pitchSweep:{toFrequency:values.sweep}} : {}),
 ...(vibratoEnabled ? {vibrato:{rate:values.rate,depth:values.depth}} : {}),
 noiseMix:values.noise,dutyCycle:values.duty,seed:Math.round(values.seed)};
}
function addBypass(key, name, read, write) {
 const control=document.getElementById(key).closest('.control');
 const label=document.createElement('label');label.className='toggle sweep-toggle';
 label.innerHTML=`<input type="checkbox" role="switch" checked aria-label="${name}"><span>ON</span>`;
 control.before(label);
 label.querySelector('input').addEventListener('change',e=>{write(e.target.checked);label.querySelector('span').textContent=read()?'ON':'OFF';refresh();liveChange(key);});
 return label;
}
const pitchToggle=addBypass('pitch','Playback pitch',()=>pitchEnabled,v=>pitchEnabled=v);
const vibratoToggle=addBypass('rate','Vibrato',()=>vibratoEnabled,v=>vibratoEnabled=v);
let pitchKeyboard=false;
const pitchInput=document.getElementById('pitch');
pitchInput.addEventListener('keydown',()=>{pitchKeyboard=true;});
pitchInput.addEventListener('pointerdown',()=>{pitchKeyboard=false;});
const pitchControl=pitchInput.closest('.control');
pitchControl.classList.add('pitch-control');
pitchControl.insertAdjacentHTML('beforeend','<i class="unity-marker" title="Unity pitch: 1x"></i>');
const filterTypes=['lowpass','highpass','bandpass','notch'];
const filterNames=['LOW PASS','HIGH PASS','BAND PASS','NOTCH'];
const dials=[];
function makeDial(id,title,labels,get,set,enabled=()=>true) {
 const root=document.getElementById(id);
 root.className='rotary-control';
 root.innerHTML=`<div class="dial-labels">${labels.map((label,i)=>{const angle=(-225+i*270/(labels.length-1))*Math.PI/180;return `<button type="button" style="left:${50+Math.cos(angle)*45}%;top:${50+Math.sin(angle)*43}%" data-position="${i/(labels.length-1)}">${label}</button>`;}).join('')}<div class="rotary" role="slider" tabindex="0" aria-label="${title}" aria-valuemin="0" aria-valuemax="1000"><i></i></div></div><span>${title}</span><output></output>`;
 const dial=root.querySelector('.rotary');
 const apply=t=>{if(!enabled())return;set(Math.max(0,Math.min(1,t)));refresh();liveChange('cutoff');};
 let startY,startX,startValue;
 dial.addEventListener('pointerdown',e=>{if(!enabled())return;dial.setPointerCapture(e.pointerId);startY=e.clientY;startX=e.clientX;startValue=get();});
 dial.addEventListener('pointermove',e=>{if(dial.hasPointerCapture(e.pointerId))apply(startValue+(startY-e.clientY+e.clientX-startX)/180);});
 dial.addEventListener('keydown',e=>{if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();apply(e.key==='Home'?0:e.key==='End'?1:get()+(['ArrowUp','ArrowRight'].includes(e.key)?1:-1)/100);}});
 root.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>apply(Number(b.dataset.position))));
 dials.push({root,dial,get,enabled,id});
}
makeDial('type-dial','FILTER TYPE',filterNames,()=>filterTypes.indexOf(filterType)/3,t=>filterType=filterTypes[Math.round(t*3)],()=>filterEnabled);
makeDial('cutoff-dial','CUTOFF',['20','200','2k','20k'],()=>normalized('cutoff'),t=>setNormalized('cutoff',t),()=>filterEnabled);
makeDial('resonance-dial','RESONANCE',['0.1','4','8','12'],()=>normalized('resonance'),t=>setNormalized('resonance',t),()=>filterEnabled);
function refreshDials(){
 for(const d of dials){d.dial.style.setProperty('--rotation',`${-135+d.get()*270}deg`);d.dial.setAttribute('aria-valuenow',Math.round(d.get()*1000));d.dial.setAttribute('aria-disabled',String(!d.enabled()));d.root.classList.toggle('inactive',!d.enabled());d.root.querySelectorAll('button').forEach(b=>b.disabled=!d.enabled());const text=d.id==='type-dial'?filterNames[filterTypes.indexOf(filterType)]:d.id==='cutoff-dial'?`${Math.round(values.cutoff)} Hz`:`${values.resonance.toFixed(2)} Q`;d.root.querySelector('output').textContent=text;d.dial.setAttribute('aria-valuetext',text);}
}
let responseContext,responseFilter;
function drawFilter(){
 // Match the browser's actual biquad response, including its resonance convention.
 responseContext ??= new OfflineAudioContext(1,1,48000);
 responseFilter ??= responseContext.createBiquadFilter();
 responseFilter.type=filterEnabled?filterType:'allpass';responseFilter.frequency.value=values.cutoff;responseFilter.Q.value=values.resonance;
 const freqs=Float32Array.from({length:240},(_,i)=>20*1000**(i/239)),mag=new Float32Array(240),phase=new Float32Array(240);
 responseFilter.getFrequencyResponse(freqs,mag,phase);
 const path=Array.from(mag,(m,i)=>`${i?'L':'M'}${(i/239*400).toFixed(1)},${Math.max(4,Math.min(126,35-20*Math.log10(Math.max(m,1e-6))*1.8)).toFixed(1)}`).join(' ');
 document.getElementById('filter-response').setAttribute('d',path);
 const x=normalized('cutoff')*400;document.getElementById('filter-marker').setAttribute('d',`M${x} 0V130`);
 document.getElementById('filter-caption').textContent=filterEnabled?filterNames[filterTypes.indexOf(filterType)]:'BYPASS';
}
function drawScope(){
 let d='M0 50L900 50';
 if(player.active&&player.analyser){player.analyser.getFloatTimeDomainData(player.samples);const a=player.samples;let start=0;for(let i=1;i<700;i++){if(a[i-1]<=0&&a[i]>0){start=i;break;}}d=Array.from({length:600},(_,i)=>`${i?'L':'M'}${(i*900/599).toFixed(1)},${(50-Math.max(-1,Math.min(1,a[start+i]))*45).toFixed(1)}`).join(' ');}
 document.getElementById('scope-wave').setAttribute('d',d);
}
const dialog=document.getElementById('preset-dialog');
const form=document.getElementById('preset-form');
let dialogMode;
function snapshot(){return {version:1,values:{...values},waveform,pitchEnabled,vibratoEnabled,sweepEnabled,filterEnabled,filterType,loopEnabled};}
const defaults={version:1,values:Object.fromEntries(Object.entries(specs).map(([k,s])=>[k,s[3]])),waveform:3,pitchEnabled:true,vibratoEnabled:true,sweepEnabled:true,filterEnabled:true,filterType:'lowpass',loopEnabled:false};
function compactPatch(){const p=snapshot();const result={version:1};for(const [k,v] of Object.entries(p)){if(k==='values'){const diff=Object.fromEntries(Object.entries(v).map(([key,val])=>[key,Number(val.toPrecision(7))]).filter(([key,val])=>val!==defaults.values[key]));if(Object.keys(diff).length)result.values=diff;}else if(v!==defaults[k])result[k]=v;}return result;}
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function showDialog(mode){
 releaseSpace();dialogMode=mode;document.getElementById('dialog-error').textContent='';
 document.getElementById('dialog-title').textContent=mode==='save'?'SAVE PRESET':mode==='load'?'LOAD PRESET':'EXPORT CODE';
 const body=document.getElementById('dialog-body');body.replaceChildren();
 document.getElementById('dialog-submit').textContent=mode==='save'?'SAVE':mode==='load'?'LOAD':'COPY CODE';
 try{
 if(mode==='save'){body.innerHTML='<label>PRESET NAME<input id="patch-name" required maxlength="80" autocomplete="off"></label><p>Saves a preset JSON file to your disk. Only changed settings are stored.</p>';}
 if(mode==='load'){body.innerHTML='<label>PRESET FILE<input id="import-json" type="file" accept=".json,application/json" required></label><p>Choose a preset JSON file from your disk.</p>';document.getElementById('dialog-submit').disabled=false;}
 else document.getElementById('dialog-submit').disabled=false;
 if(mode==='export'){body.innerHTML='<p>Standalone code for BLIT386 1.8+. Copy this entire block into your game module: no SoundMachine files needed. Create the sound once in init(), then call play() after a player gesture. Default and inactive settings are omitted. The filter is baked into the clip, so every sound plays through BLIT386 volume/mute buses.</p><textarea id="export-code" readonly spellcheck="false" aria-label="Exported JavaScript"></textarea>';body.querySelector('textarea').value=exportCode();}

 }catch(e){document.getElementById('dialog-error').textContent=e.message;}
 dialog.showModal();
}
for(const mode of ['save','load','export'])document.getElementById(mode).onclick=()=>showDialog(mode);
document.getElementById('dialog-close').onclick=()=>dialog.close();
form.addEventListener('submit',async e=>{
 e.preventDefault();try{
 if(dialogMode==='save'){const name=document.getElementById('patch-name').value.trim();if(!name)throw Error('Enter a name.');const patch={...compactPatch(),name};const text=JSON.stringify(patch,null,2);const filename=(name.replace(/[^a-z0-9_ -]/gi,'').trim()||'preset')+'.json';
 if(window.showSaveFilePicker){try{const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'SoundCreator preset',accept:{'application/json':['.json']}}]});const writable=await handle.createWritable();await writable.write(text);await writable.close();}catch(error){if(error.name==='AbortError')return;throw error;}}
 else download(text,filename);
 document.getElementById('preset-name').textContent=name;dialog.close();}
 else if(dialogMode==='load'){const file=document.getElementById('import-json').files[0];if(!file)throw Error('Choose a preset file.');const patch=JSON.parse(await file.text());applyPatch(patch);document.getElementById('preset-name').textContent=typeof patch.name==='string'?patch.name:file.name;dialog.close();}

 else {const textarea=document.getElementById('export-code');try{await navigator.clipboard.writeText(textarea.value);document.getElementById('dialog-submit').textContent='COPIED';}catch{textarea.focus();textarea.select();document.getElementById('dialog-error').textContent='Press Ctrl/Cmd+C to copy the selected code.';}}
 }catch(error){document.getElementById('dialog-error').textContent=error.message;}
});
function applyPatch(p){
 if(p?.version!==1)throw Error('Unsupported preset version.');
 p={...defaults,...p,values:{...defaults.values,...p.values}};
 if(p?.version!==1||!waves[p.waveform]||!filterTypes.includes(p.filterType))throw Error('Unsupported preset.');
 for(const [key,s] of Object.entries(specs)){if(!Number.isFinite(p.values?.[key])||p.values[key]<s[1]||p.values[key]>s[2])throw Error('Invalid preset parameter: '+key);}
 stop();Object.assign(values,p.values);waveform=p.waveform;pitchEnabled=!!p.pitchEnabled;vibratoEnabled=!!p.vibratoEnabled;sweepEnabled=!!p.sweepEnabled;filterEnabled=!!p.filterEnabled;filterType=p.filterType;loopEnabled=!!p.loopEnabled;
 for(const [label,on] of [[pitchToggle,pitchEnabled],[vibratoToggle,vibratoEnabled],[sweepToggle,sweepEnabled]]){label.querySelector('input').checked=on;label.querySelector('span').textContent=on?'ON':'OFF';}
 document.getElementById('filter-enabled').checked=filterEnabled;document.getElementById('loop').checked=loopEnabled;constrainEnvelope();refresh();
}
function exportCode(){
 return exportSound({...snapshot(),waveform:waves[waveform]});
}
refresh();
bootstrap(Synth);
