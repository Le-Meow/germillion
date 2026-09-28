import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, regionAt, discoveriesBetween, tierAt, SKINS, createWorld, travelProgress } from '../public/world.js';

test('journey boundaries and discoveries remain stable across consecutive hits', () => {
  assert.equal(regionAt(127).name, 'ROOT DIRECTORY');
  assert.equal(regionAt(128).name, 'PROGRAM FILES');
  assert.equal(regionAt(256).name, 'EXTENDED MEMORY');
  assert.equal(regionAt(512).name, 'PROTECTED MEMORY');
  assert.equal(regionAt(1024).name, 'BOOT SECTOR');
  assert.deepEqual(REGIONS.map(r => r.at), [0,128,256,512,768]);
  assert.deepEqual(discoveriesBetween(0,104).map(d => d.name), ['README.TXT','PASSWORD.TXT']);
  assert(!discoveriesBetween(104,200).some(d => d.name === 'PASSWORD.TXT'));
  assert.deepEqual(discoveriesBetween(104,104), []);
  assert.equal(tierAt(.9).name, 'BEYOND REPAIR');
  assert.equal(tierAt(.7).name, 'FATAL ERROR');
  assert.equal(SKINS.at(-1).days, 30);
});

test('travel clamps an early animation frame and lands at the exact saved MB', async () => {
  const original = Object.fromEntries(['Image','innerWidth','innerHeight','matchMedia','addEventListener','document','requestAnimationFrame','cancelAnimationFrame'].map(k => [k,globalThis[k]]));
  const queue = [], positions = [], motion = { matches:false };
  try {
    Object.assign(globalThis, { Image: class { complete = false; }, innerWidth: 1280, innerHeight: 720,
      matchMedia: () => motion, addEventListener() {}, document: { body:{classList:{contains:()=>false}}, fonts: { ready: Promise.resolve() } },
      requestAnimationFrame: callback => { queue.push(callback); return queue.length; }, cancelAnimationFrame() {} });
    let spotlights = 0;
    const context = new Proxy({ measureText: () => ({ width: 40 }), createRadialGradient: () => { spotlights++;return { addColorStop() {} }; } }, { get: (target,key) => target[key] || (() => {}), set: (target,key,value) => (target[key] = value, true) });
    const canvas = { getContext: () => context };
    const world = createWorld(canvas, position => positions.push(position));
    world.set(0); const traveling = world.travel(136, [{ valid:true, position:136, fraction:.93 }]);
    queue.shift()(0);
    assert.equal(positions.at(-1), 0, 'a frame timestamp before the animation start cannot move backwards');
    queue.shift()(performance.now() + 5000);
    await traveling;
    assert.equal(positions.at(-1), 136);
    assert(positions.every(p => p >= 0 && p <= 136));
    assert(spotlights > 0, 'a strong breach dims the environment');
    const before = spotlights;
    world.phase('question');
    assert.equal(spotlights,before,'the next question clears the landing spotlight');
    queue.length=0;motion.matches=true;
    const still=world.travel(282,[{valid:true,position:282,fraction:1}]);
    queue.shift()(performance.now());await still;
    assert.equal(positions.at(-1),282,'reduced motion lands immediately');
    assert.equal(queue.length,0,'reduced motion leaves no animation loop running');
    assert.equal(spotlights,before,'reduced motion skips animated dimming');
    const interrupted=world.travel(400,[{valid:true,position:400,fraction:1}]);
    world.set(282);await interrupted;
    assert.equal(positions.at(-1),282,'restoring a run cancels travel without a stale landing');
  } finally { for (const [key,value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test('travel accelerates, covers distance monotonically, and brakes before arrival', () => {
  const samples = Array.from({length:101},(_,i)=>travelProgress(i/100));
  assert.equal(samples[0],0); assert.equal(samples.at(-1),1);
  assert(samples.every((p,i)=>p>=0 && p<=1 && (!i || p>=samples[i-1])));
  assert(samples[10] < .1); assert(samples[90] > .9);
  assert(samples[50]-samples[40] > samples[100]-samples[90]);
});
