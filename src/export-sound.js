// Optional defaults verified against BLIT386 1.8.0.
const envelopeDefaults = { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 };
const changed = (values, defaults) => Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== defaults[key]),
);
// Slider values are long floats; 4 significant digits is finer than one slider step.
const round = n => (Number.isInteger(n) ? n : Number(n.toPrecision(4)));
// JSON with bare keys, indented to sit inside the generated function.
const code = value => JSON.stringify(value, null, 2).replace(/"(\w+)":/g, '$1:').replace(/\n/g, '\n  ');

export function exportSound({ values, waveform, pitchEnabled, vibratoEnabled, sweepEnabled, filterEnabled, filterType, loopEnabled }) {
    const v = Object.fromEntries(Object.entries(values).map(([key, n]) => [key, round(n)]));
    const envelope = changed({ attack: v.attack, decay: v.tail, sustain: v.sustain, release: v.tail }, envelopeDefaults);
    const params = { waveform, frequency: v.frequency, duration: v.duration, seed: v.seed };
    if (Object.keys(envelope).length) params.envelope = envelope;
    if (sweepEnabled && v.sweep !== v.frequency && waveform !== 'noise') params.pitchSweep = { toFrequency: v.sweep };
    if (vibratoEnabled && v.depth !== 0 && v.rate !== 0 && waveform !== 'noise') params.vibrato = changed({ rate: v.rate, depth: v.depth }, { rate: 5, depth: 0 });
    if (waveform !== 'noise' && v.noise !== 0) params.noiseMix = v.noise;
    if (waveform === 'square' && v.duty !== 0.5) params.dutyCycle = v.duty;
    const pitch = pitchEnabled ? v.pitch : 1;
    // The editor always fades in over 15 ms, which also hides the click of a zero attack.
    const options = { ...changed({ volume: v.volume, pitch, pan: v.pan, loop: loopEnabled }, { volume: 1, pitch: 1, pan: 0, loop: false }), fadeInMs: 15 };
    // The editor filters after the pitch change, so bake at cutoff / pitch: playing at `pitch` lands it back on cutoff.
    // shortcut: Web Audio clamps the baked cutoff at Nyquist, so a high cutoff with pitch < 1 drifts; bake at native rate if that matters.
    const cutoff = round(v.cutoff / pitch);
    const filter = !filterEnabled ? '' : `
  // Bake the filter into the clip once, so it plays through BLIT386's sfx bus like any other sound.
  const offline = new OfflineAudioContext(1, clip.buffer.length, clip.buffer.sampleRate);
  const source = offline.createBufferSource();
  const filter = offline.createBiquadFilter();
  source.buffer = clip.buffer;
${filterType !== 'lowpass' ? `  filter.type = '${filterType}';\n` : ''}${cutoff !== 350 ? `  filter.frequency.value = ${cutoff};\n` : ''}${v.resonance !== 1 ? `  filter.Q.value = ${v.resonance};\n` : ''}  source.connect(filter).connect(offline.destination);
  source.start();
  clip.buffer.copyToChannel((await offline.startRendering()).getChannelData(0), 0);
`;
    return `import { AudioClip, BT } from 'blit386';

// BLIT386 1.8+. No SoundMachine files required.
// In init(): this.sound = await createSound();
// After a player gesture: const ref = this.sound.play(); stop it with BT.soundStop(ref).
export async function createSound() {
  const clip = await AudioClip.synth(${code(params)});
${filter}
  return { clip, play: () => BT.soundPlay(clip, { ${Object.entries(options).map(([key, value]) => `${key}: ${value}`).join(', ')} }) };
}
`;
}
