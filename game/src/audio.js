// Aurora Falls — procedural audio: 3 radio stations + SFX, all synthesized (no audio files).
export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.radioGain = null; this.sfxGain = null;
    this.station = 0; this.muted = false; this.engineOsc = null; this.engineGain = null;
    this.nextNote = 0; this.step = 0; this.timer = null;
    this.stations = [
      { name: 'AURORA FM', mood: 'synthwave', bpm: 112, root: 55 },
      { name: 'LO-FI LAKE', mood: 'lofi', bpm: 76, root: 65.41 },
      { name: 'NORTHERN LIGHTS', mood: 'ambient', bpm: 60, root: 49 },
    ];
    // step sequencer patterns: [scale degree, octave] per 16th step, -1 = rest
    this.patterns = {
      synthwave: [0, -1, 3, -1, 5, -1, 7, -1, 10, -1, 7, -1, 5, 3, -1, 2],
      lofi: [0, -1, -1, 2, -1, -1, 4, -1, -1, 3, -1, -1, 2, -1, 0, -1],
      ambient: [0, -1, -1, -1, -1, -1, -1, -1, 4, -1, -1, -1, -1, -1, 7, -1],
    };
    this.scale = [1, 1.189, 1.335, 1.498, 1.682, 1.782, 2]; // minor-ish
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    this.radioGain = this.ctx.createGain(); this.radioGain.gain.value = 0.16; this.radioGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.5; this.sfxGain.connect(this.master);
    // engine hum
    this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 50;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.startRadio();
  }
  stationName() { return this.stations[this.station].name; }
  cycleStation() { this.station = (this.station + 1) % this.stations.length; this.step = 0; return this.stationName(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  startRadio() {
    if (this.timer) return;
    const tick = () => {
      if (!this.ctx || this.muted) { this.timer = setTimeout(tick, 120); return; }
      const st = this.stations[this.station];
      const spb = 60 / st.bpm / 4; // 16th note
      const now = this.ctx.currentTime;
      while (this.nextNote < now + 0.25) {
        const pat = this.patterns[st.mood];
        const deg = pat[this.step % 16];
        if (deg >= 0) {
          const f = st.root * this.scale[deg % 7] * (deg >= 7 ? 2 : 1);
          this.pluck(f, spb * 1.8, st.mood);
          if (this.step % 8 === 0) this.bass(st.root / 2, spb * 4);
          if (st.mood === 'ambient' && this.step % 16 === 0) this.pad(st.root, spb * 16);
        }
        if (this.step % 4 === 2 && st.mood !== 'ambient') this.hat();
        this.step++;
        this.nextNote += spb;
      }
      this.timer = setTimeout(tick, 60);
    };
    this.nextNote = this.ctx.currentTime + 0.1;
    tick();
  }
  pluck(freq, dur, mood) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = mood === 'lofi' ? 'triangle' : 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = mood === 'lofi' ? 900 : 2400;
    o.connect(f); f.connect(g); g.connect(this.radioGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  bass(freq, dur) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.radioGain); o.start(t); o.stop(t + dur + 0.05);
  }
  pad(freq, dur) {
    const t = this.ctx.currentTime;
    [1, 1.5, 2].forEach((m, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.radioGain); o.start(t + i * 0.05); o.stop(t + dur + 0.1);
    });
  }
  hat() {
    const t = this.ctx.currentTime;
    const len = 0.05; const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.value = 0.25;
    s.connect(f); f.connect(g); g.connect(this.radioGain); s.start(t);
  }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    this.engineGain.gain.setTargetAtTime(on ? 0.02 + speed01 * 0.05 : 0, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 140, this.ctx.currentTime, 0.1);
  }
  blip(freq, dur = 0.12, type = 'sine', vol = 0.4) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseBurst(dur, filterFreq, vol = 0.6) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t);
  }
  gunshot() { this.noiseBurst(0.12, 1800, 0.5); }
  explosion() { this.noiseBurst(0.9, 400, 0.9); this.blip(55, 0.7, 'sine', 0.8); }
  pickup() { this.blip(880, 0.1); setTimeout(() => this.blip(1318, 0.15), 90); }
  siren() { this.blip(720, 0.25, 'square', 0.12); setTimeout(() => this.blip(540, 0.25, 'square', 0.12), 260); }
  crash() { this.noiseBurst(0.3, 900, 0.7); }
  skid() { this.noiseBurst(0.18, 2400, 0.25); }
}
