/**
 * Input — keyboard state with edge-triggered helpers.
 *
 * `keys` is a Set of currently-held `event.code` strings. `consumedEdge(code)`
 * returns true once per keydown — use it for "press to interact" style input
 * without having to write edge-detection everywhere.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this._edges = new Set();
    this._consumed = new Set();

    window.addEventListener("keydown", (e) => {
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      this._edges.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this._consumed.delete(e.code);
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this._edges.clear();
      this._consumed.clear();
    });
  }

  /** Returns true once per press of `code`. */
  consumedEdge(code) {
    if (this._edges.has(code) && !this._consumed.has(code)) {
      this._consumed.add(code);
      this._edges.delete(code);
      return true;
    }
    return false;
  }

  /** Drain all edges — call at end of frame so nothing leaks across frames. */
  endFrame() {
    this._edges.clear();
  }
}
