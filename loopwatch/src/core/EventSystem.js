/**
 * EventSystem — a plain pub/sub bus.
 *
 * Every system in Loopwatch is decoupled: the LoopManager doesn't know about
 * NPCs, NPCs don't know about the UI, etc. They communicate by emitting and
 * subscribing to named events on this bus. The bus also collects a rolling
 * transcript so the Terminal command `eventlog` can dump recent activity —
 * useful both for debugging and as an in-world surveillance artefact.
 */
export class EventSystem {
  constructor({ transcriptSize = 256 } = {}) {
    /** Map<string, Set<fn>> */
    this.handlers = new Map();
    this.transcript = [];
    this.transcriptSize = transcriptSize;
  }

  on(name, fn) {
    let set = this.handlers.get(name);
    if (!set) { set = new Set(); this.handlers.set(name, set); }
    set.add(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(name, fn) {
    const set = this.handlers.get(name);
    if (set) set.delete(fn);
  }

  emit(name, payload) {
    this.transcript.push({ t: performance.now(), name, payload });
    if (this.transcript.length > this.transcriptSize) {
      this.transcript.shift();
    }
    const set = this.handlers.get(name);
    if (!set) return;
    // Copy so handlers that unsubscribe during dispatch don't break iteration.
    for (const fn of [...set]) {
      try { fn(payload); }
      catch (err) { console.error(`[EventSystem] handler for "${name}" threw`, err); }
    }
  }

  /** Recent events, newest last, optionally filtered by name prefix. */
  recent(prefix = "") {
    if (!prefix) return this.transcript.slice();
    return this.transcript.filter((e) => e.name.startsWith(prefix));
  }

  clear() {
    this.handlers.clear();
    this.transcript.length = 0;
  }
}
