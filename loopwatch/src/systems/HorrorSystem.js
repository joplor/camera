/**
 * HorrorSystem — jump scares, heartbeat intensity, creeping dread.
 *
 * Orchestrates the stuff you can't tie to a single alien or room:
 *   - heartbeat audio pulses that speed up as the nearest alien closes in
 *   - occasional "jump scare" screen flashes at high anomaly
 *   - creeping whisper spam
 *   - asks the AI to spawn extra aliens at rupture/collapse phases
 */
export class HorrorSystem {
  constructor({ events, loopManager, player }) {
    this.events = events;
    this.loopManager = loopManager;
    this.player = player;

    this._lastNearest = Infinity;
    this._lastHeart = 0;
    this._lastScare = 0;

    events.on("alien:nearest", ({ dist }) => { this._lastNearest = dist; });
    events.on("loop:phase",   ({ phase }) => this._onPhase(phase));
    events.on("alien:chase",  () => this.events.emit("audio:cue", { id: "sting" }));
    events.on("alien:surface",() => this.events.emit("audio:cue", { id: "whisper" }));
  }

  _onPhase(phase) {
    if (phase === "rupture") {
      this.events.emit("horror:spawnAlien", {});
      this.events.emit("hud:whisper", { text: "SOMETHING ELSE IS HERE", ttl: 2400 });
    } else if (phase === "collapse") {
      this.events.emit("horror:spawnAlien", {});
      this.events.emit("horror:spawnAlien", {});
      this.events.emit("hud:flash", { intensity: 1.0 });
      this.events.emit("audio:cue", { id: "scream" });
    }
  }

  update(dt) {
    const t = performance.now() * 0.001;
    const d = this._lastNearest;
    const anomaly = this.loopManager.anomalyIndex;

    // Heartbeat: faster and louder the closer the nearest alien is, with a
    // floor governed by the anomaly index. Period goes from ~1.1s (far) to
    // ~0.35s (right on top of you).
    const prox = Math.max(0, 1 - Math.min(1, d / 16));
    const period = Math.max(0.35, 1.1 - prox * 0.75 - anomaly * 0.15);
    if (t - this._lastHeart > period) {
      this._lastHeart = t;
      if (prox > 0.1 || anomaly > 0.4) {
        this.events.emit("audio:cue", { id: "heartbeat", strength: prox });
        this.events.emit("hud:pulse", { intensity: prox });
      }
    }

    // Rare jump-scare flash at high anomaly.
    if (anomaly > 0.6 && t - this._lastScare > 14 && Math.random() < 0.003) {
      this._lastScare = t;
      this.events.emit("hud:flash", { intensity: 0.8 });
      this.events.emit("audio:cue", { id: "sting" });
    }
  }
}
