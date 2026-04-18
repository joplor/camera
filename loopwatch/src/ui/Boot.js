/**
 * Boot — animated boot log.
 *
 * This is the first thing the player sees. It's deliberately paced: each line
 * lands with a small delay so the player feels like the facility is slowly
 * coming online. A few lines contain faint corruptions — characters swapped,
 * odd encodings — to plant the idea that Karon-7 is not a normal facility.
 */
import { $ } from "../utils/dom.js";

const LINES = [
  { t: 40,  s: "[  0.000] BOOT SEQUENCE INITIATED · KARON-7 · SUBLEVEL 3" },
  { t: 300, s: "[  0.142] POWER BUS A .... OK" },
  { t: 60,  s: "[  0.201] POWER BUS B .... OK" },
  { t: 60,  s: "[  0.278] POWER BUS Ω .... ??" },
  { t: 40,  s: "[  0.279] retry: POWER BUS Ω .... OK" },
  { t: 140, s: "[  0.413] LIFE SUPPORT .... NOMINAL" },
  { t: 40,  s: "[  0.456] CCTV ARRAY ..... 8 / 8 ONLINE" },
  { t: 40,  s: "[  0.498] AI MONITORS .... 0 / 0 SANE" },
  { t: 0,   s: "[  0.498] AI MONITORS .... 4 / 4 SANE" },
  { t: 100, s: "[  0.712] STAFF ROSTER ... 4 PRESENT" },
  { t: 60,  s: "[  0.771] STAFF ROSTER ... 5 PRESENT" },
  { t: 40,  s: "[  0.772] STAFF ROSTER ... 4 PRESENT" },
  { t: 120, s: "[  0.913] LOOP INTEGRITY . VARIANCE 0.0007 — WITHIN TOLERANCE" },
  { t: 60,  s: "[  0.971] OBSERVER UPLINK . ESTABLISHED" },
  { t: 80,  s: "[  1.033] HELLO" },
  { t: 260, s: "[  1.291] WELCOME, OBSERVER." },
  { t: 200, s: "[  1.490] PLEASE KEEP YOUR EYES ON THE FACILITY." },
  { t: 160, s: "[  1.650] WE WILL KEEP OURS ON YOU." },
];

export class Boot {
  constructor({ node, events }) {
    this.node = node;
    this.events = events;
    this.log = $("#boot-log", node);
  }

  async run() {
    this.log.textContent = "";
    for (const ln of LINES) {
      await this._wait(ln.t);
      this.log.textContent += ln.s + "\n";
      this.log.scrollTop = this.log.scrollHeight;
    }
    await this._wait(800);
  }

  _wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
}
