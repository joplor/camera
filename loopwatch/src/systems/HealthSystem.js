/**
 * HealthSystem — player HP + damage pipeline.
 *
 * Listens for alien:contact events and drains HP. Regenerates slowly if
 * out of contact for a few seconds. On death, triggers a cycle reset
 * rather than a hard game over — this is a loop game, so dying is part
 * of the horror cadence, not a failstate.
 */
export class HealthSystem {
  constructor({ events, player, loopManager }) {
    this.events = events;
    this.player = player;
    this.loopManager = loopManager;

    this.max = 100;
    this.hp = 100;
    this.lastHitAt = -10;
    this.regenDelay = 4.5;
    this.regenPerSec = 6;

    // When HP drops below these thresholds we emit cues so HUD can redden
    // the screen and audio can swell a heartbeat.
    this._lastDmgCueAt = 0;

    player.health = this;

    events.on("alien:contact", ({ dist }) => this._onContact(dist));
    events.on("loop:reset",    () => { this.hp = this.max; });
    events.on("horror:damage", ({ amount }) => this._damage(amount, "horror"));
  }

  get ratio() { return Math.max(0, this.hp) / this.max; }

  update(dt) {
    const t = performance.now() * 0.001;
    // Regen after a grace period.
    if (t - this.lastHitAt > this.regenDelay && this.hp < this.max) {
      this.hp = Math.min(this.max, this.hp + this.regenPerSec * dt);
    }
    this.events.emit("hud:health", { hp: this.hp, max: this.max, ratio: this.ratio });
  }

  _onContact(dist) {
    // Damage per second scales with proximity. At dist=0 this is ~40/s.
    const dps = Math.max(0, 40 * (1 - dist / 1.6));
    this._damage(dps * (1 / 60), "alien");
  }

  _damage(amount, source) {
    if (amount <= 0) return;
    this.hp -= amount;
    this.lastHitAt = performance.now() * 0.001;
    const now = this.lastHitAt;
    if (now - this._lastDmgCueAt > 0.25) {
      this._lastDmgCueAt = now;
      this.events.emit("hud:damage", { amount, source, ratio: this.ratio });
      this.events.emit("audio:cue", { id: "hurt" });
    }
    if (this.hp <= 0) this._onDeath();
  }

  _onDeath() {
    this.hp = this.max;
    this.events.emit("hud:whisper", { text: "YOU WOKE UP AGAIN", ttl: 2600 });
    this.events.emit("audio:cue", { id: "scream" });
    this.loopManager.resetCycle({ reason: "death" });
  }
}
