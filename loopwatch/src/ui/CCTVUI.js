/**
 * CCTVUI — the surveillance grid overlay.
 *
 * Shows the current feed, a sidebar list of cameras, live meta
 * (signal/distortion), and a few keybinds. The actual 3D rendering is
 * delegated to SurveillanceSystem, which produces a canvas element we
 * mount into the main pane.
 */
import { $, $$, show, hide, el } from "../utils/dom.js";

export class CCTVUI {
  constructor({ node, events, surveillance }) {
    this.node = node;
    this.events = events;
    this.surveillance = surveillance;

    this.main = $("#cctv-main", node);
    this.list = $("#cctv-list", node);

    // Mount the surveillance canvas.
    this.main.innerHTML = "";
    this.main.appendChild(surveillance.canvas);

    this._buildList();
    events.on("cctv:switch", () => this._refresh());
    events.on("cctv:corrupted", () => this._buildList());
    events.on("loop:reset", () => this._buildList());

    events.on("cctv:request", ({ index }) => {
      this.surveillance.setActive(index);
      this._refresh();
    });

    window.addEventListener("keydown", (e) => {
      if (this.node.classList.contains("hidden")) return;
      if (e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10);
        if (!isNaN(n)) {
          this.surveillance.setActive(n - 1);
          this._refresh();
        }
      } else if (e.code === "KeyR") {
        this.events.emit("cctv:record");
      }
    });
  }

  open()  { this.surveillance.open();  show(this.node); this._refresh(); }
  close() { this.surveillance.close(); hide(this.node); }

  _buildList() {
    this.list.innerHTML = "";
    this.surveillance.cams.forEach((cam, i) => {
      const li = el("li",
        {
          class: cam.corrupted ? "corrupted" : "",
          onClick: () => { this.surveillance.setActive(i); this._refresh(); },
        },
        [
          el("span", {}, cam.name),
          el("span", { class: "tag" }, cam.zone),
        ],
      );
      this.list.appendChild(li);
    });
    this._refresh();
  }

  _refresh() {
    const i = this.surveillance.active;
    const cam = this.surveillance.cams[i];
    $("#cctv-cam-name", this.node).textContent = cam?.name ?? "—";
    const now = new Date();
    $("#cctv-timecode", this.node).textContent = now.toISOString().substring(11, 19);

    $$("#cctv-list li", this.node).forEach((li, idx) => {
      li.classList.toggle("active", idx === i);
    });

    const meta = this.surveillance.meta();
    $("#cctv-signal", this.node).textContent = meta.signal;
    $("#cctv-distort", this.node).textContent = meta.distortion;
    $("#cctv-note",    this.node).textContent = meta.note;
  }

  tick() {
    // Drive a steady clock refresh + meta refresh while open.
    if (this.node.classList.contains("hidden")) return;
    this._refresh();
  }
}
