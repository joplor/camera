/**
 * WorldStateManager — the memory of the facility.
 *
 * Across loops, most things reset. But *some* state must carry forward or
 * the player can't actually make progress. This class is the authoritative
 * record of what the observer has learned, unlocked, broken, or witnessed.
 *
 * Categories:
 *   - knowledge[]     : facts the observer now knows (terminal codes, NPC names)
 *   - unlocks[]       : doors / systems / cameras that stay opened after reset
 *   - intrusions[]    : the places where the observer meddled in prior cycles
 *   - sightings{}     : counts of image_a and image_b appearances
 *   - endingsSeen[]   : ending IDs already witnessed
 *   - flags{}         : arbitrary boolean/string flags set by scripted events
 *
 * Every mutation emits `world:changed`. The Save system listens for this to
 * debounce writes; the UI listens to refresh the menu stats panel.
 */
export class WorldStateManager {
  constructor({ events } = {}) {
    this.events = events;
    this.reset();
  }

  reset() {
    this.knowledge = new Set();
    this.unlocks = new Set();
    this.intrusions = [];      // { cycle, zone, action, t }
    this.sightings = { image_a: 0, image_b: 0, mirrored: 0 };
    this.endingsSeen = new Set();
    this.flags = {};
    this._dirty = false;
  }

  // ----- knowledge -------------------------------------------------------
  learn(fact, meta = {}) {
    if (this.knowledge.has(fact)) return false;
    this.knowledge.add(fact);
    this._changed("knowledge", { fact, meta });
    return true;
  }
  knows(fact) { return this.knowledge.has(fact); }

  // ----- unlocks ---------------------------------------------------------
  unlock(id) {
    if (this.unlocks.has(id)) return false;
    this.unlocks.add(id);
    this._changed("unlock", { id });
    return true;
  }
  isUnlocked(id) { return this.unlocks.has(id); }

  // ----- intrusions ------------------------------------------------------
  recordIntrusion({ cycle, zone, action, t }) {
    this.intrusions.push({ cycle, zone, action, t });
    // Keep the log bounded so memory-mapped saves stay small.
    if (this.intrusions.length > 500) this.intrusions.shift();
    this._changed("intrusion", { cycle, zone, action, t });
  }
  intrusionsIn(zone) {
    return this.intrusions.filter((i) => i.zone === zone);
  }

  // ----- sightings -------------------------------------------------------
  sighted(which /* 'image_a' | 'image_b' | 'mirrored' */) {
    this.sightings[which] = (this.sightings[which] || 0) + 1;
    this._changed("sighting", { which, count: this.sightings[which] });
  }

  // ----- endings ---------------------------------------------------------
  markEnding(id) {
    if (this.endingsSeen.has(id)) return false;
    this.endingsSeen.add(id);
    this._changed("ending", { id });
    return true;
  }

  // ----- flags -----------------------------------------------------------
  setFlag(k, v) {
    if (this.flags[k] === v) return false;
    this.flags[k] = v;
    this._changed("flag", { k, v });
    return true;
  }
  getFlag(k, dflt = null) { return this.flags[k] ?? dflt; }

  _changed(kind, payload) {
    this._dirty = true;
    this.events.emit("world:changed", { kind, payload });
  }

  // ----- serialization ---------------------------------------------------
  toJSON() {
    return {
      knowledge: [...this.knowledge],
      unlocks:   [...this.unlocks],
      intrusions: this.intrusions.slice(-200),
      sightings: { ...this.sightings },
      endingsSeen: [...this.endingsSeen],
      flags: { ...this.flags },
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.knowledge   = new Set(data.knowledge   ?? []);
    this.unlocks     = new Set(data.unlocks     ?? []);
    this.intrusions  = data.intrusions  ?? [];
    this.sightings   = Object.assign({ image_a: 0, image_b: 0, mirrored: 0 }, data.sightings ?? {});
    this.endingsSeen = new Set(data.endingsSeen ?? []);
    this.flags       = data.flags       ?? {};
    this._dirty = false;
  }
}
