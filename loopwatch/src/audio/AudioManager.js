/**
 * AudioManager — procedural audio using the Web Audio API.
 *
 * The game ships zero audio files. Every sound is synthesised on-the-fly:
 *   - ambient drone: three detuned sawtooth oscillators through a low-pass
 *     + a filtered noise bed, whose cutoff tracks the anomaly index.
 *   - electrical hum: 60Hz triangle with slight FM.
 *   - whisper cue: band-passed noise bursts modulated by a sine.
 *   - door / terminal clicks: short exponentially-decayed noise pops.
 *   - alarm: square wave alternating between two pitches.
 *
 * Browsers require a user gesture before an AudioContext can start. We
 * create the context lazily on the first `ensure()` call (triggered by
 * a menu click).
 */
export class AudioManager {
  constructor({ events }) {
    this.events = events;
    this.ctx = null;
    this.master = null;
    this.ambientBus = null;
    this.muted = false;
    this._anomaly = 0;

    events.on("loop:tick",  (e) => { this._anomaly = e.anomaly; this._updateAmbient(); });
    events.on("loop:reset", () => this._reset());
    events.on("audio:cue",  ({ id }) => this.cue(id));
    events.on("audio:mute", () => this.setMuted(true));
    events.on("audio:unmute", () => this.setMuted(false));
    events.on("player:interact", () => this.cue("click"));
    events.on("player:flashlight", () => this.cue("click"));
    events.on("terminal:opened", () => this.cue("terminal-on"));
    events.on("terminal:closed", () => this.cue("terminal-off"));
    events.on("anomaly:exposure", () => this.cue("whisper"));
    events.on("door:changed", () => this.cue("door"));
  }

  async ensure() {
    if (this.ctx) return this.ctx;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this._buildAmbient();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  // ---------- ambient ----------------------------------------------------
  _buildAmbient() {
    const c = this.ctx;
    this.ambientBus = c.createGain();
    this.ambientBus.gain.value = 0.0;
    this.ambientBus.connect(this.master);

    // Detuned saw drone.
    this.droneOscs = [];
    const baseFreqs = [55, 55 * 1.007, 55 * 0.995];
    const droneFilter = c.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 400;
    droneFilter.Q.value = 6;
    droneFilter.connect(this.ambientBus);
    for (const f of baseFreqs) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.08;
      o.connect(g).connect(droneFilter);
      o.start();
      this.droneOscs.push({ o, g });
    }
    this.droneFilter = droneFilter;

    // 60hz electrical hum with FM.
    const hum = c.createOscillator();
    hum.type = "triangle";
    hum.frequency.value = 60;
    const humG = c.createGain();
    humG.gain.value = 0.06;
    const humLfo = c.createOscillator();
    humLfo.frequency.value = 0.4;
    const humLfoGain = c.createGain();
    humLfoGain.gain.value = 3;
    humLfo.connect(humLfoGain).connect(hum.frequency);
    hum.connect(humG).connect(this.ambientBus);
    hum.start(); humLfo.start();
    this.hum = hum;

    // Noise bed.
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
    const noise = c.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const nFilter = c.createBiquadFilter();
    nFilter.type = "bandpass";
    nFilter.frequency.value = 800; nFilter.Q.value = 0.7;
    const nGain = c.createGain();
    nGain.gain.value = 0.035;
    noise.connect(nFilter).connect(nGain).connect(this.ambientBus);
    noise.start();
    this.noise = noise;
    this.noiseFilter = nFilter;

    // Fade in.
    this.ambientBus.gain.linearRampToValueAtTime(0.9, c.currentTime + 2.0);
  }

  _updateAmbient() {
    if (!this.ctx) return;
    const a = this._anomaly;
    // Higher anomaly widens the drone filter and shifts noise brighter.
    if (this.droneFilter) this.droneFilter.frequency.value = 380 + a * 800;
    if (this.noiseFilter) this.noiseFilter.frequency.value = 700 + a * 2200;
  }

  _reset() {
    if (!this.ctx) return;
    // Loop reset: pulse the drone down and back up.
    const t = this.ctx.currentTime;
    this.ambientBus.gain.cancelScheduledValues(t);
    this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, t);
    this.ambientBus.gain.linearRampToValueAtTime(0.05, t + 0.2);
    this.ambientBus.gain.linearRampToValueAtTime(0.9,  t + 1.6);
  }

  // ---------- one-shot cues ---------------------------------------------
  cue(id, opts) {
    if (!this.ctx) return;
    switch (id) {
      case "click":        this._click(900, 0.05, 0.1); break;
      case "terminal-on":  this._click(320, 0.2, 0.25); break;
      case "terminal-off": this._click(180, 0.2, 0.2); break;
      case "door":         this._click(160, 0.35, 0.3); break;
      case "whisper":      this._whisper(); break;
      case "alarm":        this._alarm(); break;
      case "blackout":     this._click(80, 0.5, 0.4); break;
      case "collapse-hum": this._collapse(); break;
      case "heartbeat":    this._heartbeat(opts?.strength ?? 0.5); break;
      case "hurt":         this._hurt(); break;
      case "sting":        this._sting(); break;
      case "scream":       this._scream(); break;
      case "foot-walk":    this._footstep(0.08); break;
      case "foot-run":     this._footstep(0.16); break;
      case "foot-crouch":  this._footstep(0.04); break;
    }
  }

  _click(freq, dur, peak) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = "sine";
    const g = c.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(peak, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  _whisper() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 1.6, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) *
             (0.2 + 0.8 * Math.sin((i / d.length) * Math.PI));
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700; bp.Q.value = 6;
    const g = c.createGain();
    g.gain.value = 0.3;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  _alarm() {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = 520;
    const g = c.createGain();
    g.gain.value = 0.18;
    o.connect(g).connect(this.master);
    o.start();
    const end = c.currentTime + 2.4;
    let t = c.currentTime;
    while (t < end) {
      o.frequency.setValueAtTime(520, t);
      o.frequency.setValueAtTime(380, t + 0.2);
      t += 0.4;
    }
    g.gain.setValueAtTime(0.18, end - 0.1);
    g.gain.linearRampToValueAtTime(0, end);
    o.stop(end + 0.05);
  }

  _heartbeat(strength) {
    const c = this.ctx;
    const now = c.currentTime;
    const peak = 0.18 + strength * 0.22;
    for (const offset of [0, 0.16]) {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(78, now + offset);
      o.frequency.exponentialRampToValueAtTime(44, now + offset + 0.14);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now + offset);
      g.gain.exponentialRampToValueAtTime(peak, now + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      o.connect(g).connect(this.master);
      o.start(now + offset);
      o.stop(now + offset + 0.22);
    }
  }

  _hurt() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.pow(1 - i / d.length, 2);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 900;
    const g = c.createGain();
    g.gain.value = 0.45;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  _sting() {
    const c = this.ctx;
    const now = c.currentTime;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(110, now);
    o.frequency.exponentialRampToValueAtTime(55, now + 1.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    const dist = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1024) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    dist.curve = curve;
    o.connect(dist).connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 1.4);
  }

  _scream() {
    const c = this.ctx;
    const now = c.currentTime;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(320, now);
    o.frequency.exponentialRampToValueAtTime(180, now + 1.0);
    const lfo = c.createOscillator();
    lfo.frequency.value = 14;
    const lfoG = c.createGain();
    lfoG.gain.value = 60;
    lfo.connect(lfoG).connect(o.frequency);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1600; bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.45, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    o.connect(bp).connect(g).connect(this.master);
    o.start(now); lfo.start(now);
    o.stop(now + 1.2); lfo.stop(now + 1.2);
  }

  _footstep(peak) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.pow(1 - i / d.length, 3);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 320;
    const g = c.createGain();
    g.gain.value = peak;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  _collapse() {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 90;
    const g = c.createGain();
    g.gain.value = 0.1;
    o.connect(g).connect(this.master);
    o.start();
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 3);
    g.gain.linearRampToValueAtTime(0, c.currentTime + 3.2);
    o.stop(c.currentTime + 3.3);
  }
}
