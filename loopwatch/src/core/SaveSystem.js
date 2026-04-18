/**
 * SaveSystem — localStorage-backed persistence for Loopwatch.
 *
 * Loopwatch deliberately has no user accounts, no cloud, no backend. The
 * entire memory of the observer is stored in one localStorage key as JSON.
 * That makes the game (a) installable as a pure static site on GitHub Pages
 * and (b) completely ephemeral if the player chooses — there is an in-game
 * "PURGE STATE" action that wipes this key and returns the player to cycle
 * one. The purge itself is diegetically framed as a "hard reset" — it is
 * the only way to actually leave the loop.
 *
 * The save payload is intentionally versioned. Early builds will evolve and
 * we want old saves to either migrate cleanly or be rejected with a clear
 * message, not explode at load time.
 */
const KEY = "loopwatch/save/v1";
const SCHEMA = 1;

export class SaveSystem {
  constructor({ events, loopManager, worldState }) {
    this.events = events;
    this.loopManager = loopManager;
    this.worldState = worldState;
    this._writeTimer = null;
    this._debounceMs = 600;

    // Auto-save on world-state changes, debounced.
    this.events.on("world:changed", () => this._scheduleWrite());
    this.events.on("loop:reset",    () => this._scheduleWrite());
  }

  _scheduleWrite() {
    if (this._writeTimer) clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => this.save(), this._debounceMs);
  }

  save() {
    const payload = {
      schema: SCHEMA,
      savedAt: new Date().toISOString(),
      loop: this.loopManager.toJSON(),
      world: this.worldState.toJSON(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      this.events.emit("save:written", { bytes: JSON.stringify(payload).length });
      return true;
    } catch (err) {
      console.error("[SaveSystem] write failed", err);
      this.events.emit("save:failed", { err: String(err) });
      return false;
    }
  }

  load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data.schema !== SCHEMA) {
        console.warn(`[SaveSystem] schema mismatch ${data.schema} != ${SCHEMA}, ignoring save`);
        return null;
      }
      this.loopManager.fromJSON(data.loop);
      this.worldState.fromJSON(data.world);
      this.events.emit("save:loaded", { savedAt: data.savedAt });
      return data;
    } catch (err) {
      console.error("[SaveSystem] load failed", err);
      return null;
    }
  }

  hasSave() {
    return !!localStorage.getItem(KEY);
  }

  purge() {
    localStorage.removeItem(KEY);
    this.events.emit("save:purged");
  }
}
