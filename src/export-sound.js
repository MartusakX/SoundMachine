// Optional defaults verified against BLIT386 1.8.0.
const envelopeDefaults = { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 };
const changed = (values, defaults) => Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== defaults[key]),
);

export function exportSound({ values: v, waveform, pitchEnabled, vibratoEnabled, sweepEnabled, filterEnabled, filterType, loopEnabled }) {
    const envelope = changed({ attack: v.attack, decay: v.tail, sustain: v.sustain, release: v.tail }, envelopeDefaults);
    const params = { waveform, frequency: v.frequency, duration: v.duration, seed: Math.round(v.seed) };
    if (Object.keys(envelope).length) params.envelope = envelope;
    if (sweepEnabled && v.sweep !== v.frequency && waveform !== 'noise') params.pitchSweep = { toFrequency: v.sweep };
    if (vibratoEnabled && v.depth !== 0 && v.rate !== 0 && waveform !== 'noise') params.vibrato = changed({ rate: v.rate, depth: v.depth }, { rate: 5, depth: 0 });
    if (waveform !== 'noise' && v.noise !== 0) params.noiseMix = v.noise;
    if (waveform === 'square' && v.duty !== 0.5) params.dutyCycle = v.duty;
    const pitch = pitchEnabled ? v.pitch : 1;
    const options = changed({ volume: v.volume, pitch, pan: v.pan, loop: loopEnabled }, { volume: 1, pitch: 1, pan: 0, loop: false });
    const json = value => JSON.stringify(value, null, 2);
    const intro = `// BLIT386 1.8+. No SoundMachine files required.
// In init(): this.sound = await createSound();
// After a player gesture: this.sound.play();
// To stop all instances: this.sound.stop();
`;
    if (!filterEnabled) {
        return `import { AudioClip, BT } from 'blit386';

${intro}export async function createSound() {
  const clip = await AudioClip.synth(${json(params)});
  const voices = new Set();
  return {
    play() {
      for (const voice of voices) if (!BT.isSoundPlaying(voice)) voices.delete(voice);
      const voice = BT.soundPlay(clip${Object.keys(options).length ? `, ${json(options)}` : ''});
      if (BT.isSoundPlaying(voice)) voices.add(voice);
      return voice;
    },
    stop() { for (const voice of voices) BT.soundStop(voice); voices.clear(); },
    dispose() { this.stop(); clip.unload(); }
  };
}
`;
    }
    // BLIT386 has no public filter insertion point. Include only the Web Audio
    // nodes this sound needs; gain also reproduces the editor's 15 ms fade-in.
    const nodes = ['source', 'filter', 'gain', ...(v.pan !== 0 ? ['pan'] : [])];
    return `import { AudioClip } from 'blit386';

${intro}// Filtered playback uses Web Audio directly, outside BLIT386's audio buses.
export async function createSound() {
  const clip = await AudioClip.synth(${json(params)});
  const voices = new Set();
  let context;
  let disposed = false;
  return {
    async play() {
      if (disposed) return;
      context ??= new AudioContext();
      await context.resume();
      if (disposed) return;
      const source = context.createBufferSource();
      source.buffer = clip.buffer;
${loopEnabled ? '      source.loop = true;\n' : ''}${pitch !== 1 ? `      source.playbackRate.value = ${pitch};\n` : ''}      const filter = context.createBiquadFilter();
${filterType !== 'lowpass' ? `      filter.type = '${filterType}';\n` : ''}${v.cutoff !== 350 ? `      filter.frequency.value = ${v.cutoff};\n` : ''}${v.resonance !== 1 ? `      filter.Q.value = ${v.resonance};\n` : ''}      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(${v.volume}, context.currentTime + 0.015);
${v.pan !== 0 ? `      const pan = context.createStereoPanner();\n      pan.pan.value = ${v.pan};\n` : ''}      ${nodes[0]}${nodes.slice(1).map(node => `.connect(${node})`).join('')}.connect(context.destination);
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        ${nodes.map(node => `${node}.disconnect();`).join(' ')}
      };
      source.start();
      return source;
    },
    stop() { for (const voice of voices) voice.stop(); voices.clear(); },
    async dispose() {
      disposed = true;
      this.stop();
      clip.unload();
      await context?.close();
    }
  };
}
`;
}
