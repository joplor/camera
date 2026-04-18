/**
 * LoopManager — the heart of the time-loop simulation.
 *
 * Every cycle runs for CYCLE_LENGTH seconds of "facility time". When it
 * expires (or the player forces a reset) the manager emits `loop:reset`
 * and everything that listens to that event — NPCs, doors, world state,
 * intervention history — re-seeds for the next cycle.
 *
 * What persists across loops is *not* stored here. This class only owns
 * the clock. Persistence is owned by WorldStateManager, which decides
 * which observations, unlocks, and anomalies carry forward. That split
 * keeps the clock logic tiny and lets us add persistent categories later
 * without touching timing.
 *
 * Cycle time != wall time. Cycle time pauses while the menu/terminal is
 * open and can be scaled by `timeScale` for anomalies that "skip" time.
 */
export class LoopManager {
  constructor({ events, cycleLength = 600, onTickHz = 10 } = {}) {
    this.events = events;
    this.cycleLength = cycleLength;   // seconds of in-facility time per loop
    this.onTickHz = onTickHz;

    this.cycleIndex = 0;               // 0-indexed; displayed as cycleIndex + 1
    this.cycleTime = 0;                // seconds into the current cycle
    this.timeScale = 1;
    this.paused = false;
    this.stopped = false;
    this.anomalyIndex = 0;             // 0..1 — ticks up with instability
    this._tickAccum = 0;
    this._tickInterval = 1 / onTickHz;

    this._phaseMarkers = [
      { at: 0.00, name: "settle"   }, // NPCs arriving, calm
      { at: 0.18, name: "routine"  }, // normal work
      { at: 0.45, name: "drift"    }, // first small anomalies
      { at: 0.70, name: "rupture"  }, // reality bends
      { at: 0.92, name: "collapse" }, // loud events, imminent reset
    ];
    this._lastPhase = null;
  }

  /** Called once per animation frame with the delta seconds. */
  update(dtWall) {
    if (this.paused || this.stopped) return;
    const dt = dtWall * this.timeScale;
    this.cycleTime += dt;

    // Fire fixed-rate ticks for systems that prefer a stable schedule
    // (NPC scheduling, event roll, audio cue picks).
    this._tickAccum += dt;
    while (this._tickAccum >= this._tickInterval) {
      this._tickAccum -= this._tickInterval;
      this.events.emit("loop:tick", {
        cycle: this.cycleIndex,
        t: this.cycleTime,
        normalized: this.cycleTime / this.cycleLength,
        anomaly: this.anomalyIndex,
      });
    }

    // Phase transitions are how the facility "escalates" within a cycle.
    const norm = this.cycleTime / this.cycleLength;
    const phase = this._phaseFor(norm);
    if (phase !== this._lastPhase) {
      this._lastPhase = phase;
      this.events.emit("loop:phase", {
        cycle: this.cycleIndex,
        phase,
        anomaly: this.anomalyIndex,
      });
    }

    if (this.cycleTime >= this.cycleLength) {
      this.resetCycle({ reason: "timeout" });
    }
  }

  _phaseFor(norm) {
    let match = this._phaseMarkers[0].name;
    for (const m of this._phaseMarkers) {
      if (norm >= m.at) match = m.name;
    }
    return match;
  }

  /** Force a reset. `reason` is forwarded to listeners so they can react. */
  resetCycle({ reason = "manual", anomalyDelta = 0.07 } = {}) {
    const prev = this.cycleIndex;
    this.cycleIndex += 1;
    this.cycleTime = 0;
    this._lastPhase = null;
    this.anomalyIndex = Math.min(1, this.anomalyIndex + anomalyDelta);

    this.events.emit("loop:reset", {
      previousCycle: prev,
      cycle: this.cycleIndex,
      reason,
      anomaly: this.anomalyIndex,
    });
  }

  /** Spike anomaly without ending the cycle (used by image_b exposures). */
  addAnomaly(amount) {
    this.anomalyIndex = Math.max(0, Math.min(1, this.anomalyIndex + amount));
    this.events.emit("loop:anomaly", { anomaly: this.anomalyIndex });
  }

  pause()  { this.paused  = true;  this.events.emit("loop:pause");  }
  resume() { this.paused  = false; this.events.emit("loop:resume"); }
  stop()   { this.stopped = true; }

  /** Seconds remaining in the cycle, floored. */
  remaining() {
    return Math.max(0, this.cycleLength - this.cycleTime);
  }

  /** "MM:SS" formatted countdown. */
  remainingLabel() {
    const s = Math.floor(this.remaining());
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  }

  toJSON() {
    return {
      cycleIndex: this.cycleIndex,
      anomalyIndex: this.anomalyIndex,
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.cycleIndex  = data.cycleIndex  ?? 0;
    this.anomalyIndex = data.anomalyIndex ?? 0;
  }
}
