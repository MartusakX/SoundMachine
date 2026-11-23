// BLIT386 renders clips; Web Audio supplies a live filter and playback graph.
export class AudioPlayer {
 context;
 voice;
 constructor() { this.active = false; }
 async unlock() {
  this.context ??= new AudioContext();
  if (!this.analyser) {
   this.analyser = this.context.createAnalyser();
   this.analyser.fftSize = 2048;
   this.samples = new Float32Array(2048);
   this.analyser.connect(this.context.destination);
  }
  await this.context.resume();
 }
 smooth(param, value) {
  const now = this.context.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, .015);
 }
 start(buffer, values, loop, filterEnabled, filterType) {
  const ctx = this.context;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  const fade = ctx.createGain();
  source.buffer = buffer;
  source.loop = loop;
  source.playbackRate.value = values.pitch;
  filter.type = filterEnabled ? filterType : 'allpass';
  filter.frequency.value = values.cutoff;
  filter.Q.value = values.resonance;
  gain.gain.value = values.volume;
  pan.pan.value = values.pan;
  fade.gain.setValueAtTime(0, ctx.currentTime);
  fade.gain.linearRampToValueAtTime(1, ctx.currentTime + .015);
  source.connect(filter).connect(gain).connect(pan).connect(fade).connect(this.analyser);
  this.retire(this.voice);
  const voice = { source, filter, gain, pan, fade };
  this.voice = voice;
  this.active = true;
  source.onended = () => {
   source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); fade.disconnect();
   if (this.voice === voice) {this.active = false; this.voice = null;}
  };
  source.start();
 }
 retire(voice) {
  if (!voice) return;
  const now = this.context.currentTime;
  voice.fade.gain.cancelScheduledValues(now);
  voice.fade.gain.setValueAtTime(voice.fade.gain.value, now);
  voice.fade.gain.linearRampToValueAtTime(0, now + .015);
  voice.source.stop(now + .02);
 }
 update(values, filterEnabled, filterType) {
  if (!this.voice) return;
  const { source, filter, gain, pan } = this.voice;
  this.smooth(source.playbackRate, values.pitch);
  this.smooth(gain.gain, values.volume);
  this.smooth(pan.pan, values.pan);
  filter.type = filterEnabled ? filterType : 'allpass';
  this.smooth(filter.frequency, values.cutoff);
  this.smooth(filter.Q, values.resonance);
 }
 setLoop(loop) { if (this.voice) this.voice.source.loop = loop; }
 stop() {this.retire(this.voice); this.voice = null; this.active = false;}
}
