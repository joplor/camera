/**
 * MainMenu — the terminal-style entry screen.
 *
 * Besides being a menu, this panel is where the player first sees image_a
 * and image_b. It updates in real time as the save state changes.
 */
import { $, $$ } from "../utils/dom.js";

const ADVISORIES_SAFE = [
  `You are not the first observer assigned to Karon–7. You will not be the last.\nThe facility is stable. Subject A will assist you. Do not look at Subject B for longer than necessary.`,
  `Your uplink has been verified. Your biosigns are nominal. Please be quiet.\nSubject A welcomes you. Subject B is aware of you.`,
];

const ADVISORIES_UNSAFE = [
  `You have returned. Why have you returned.\nThe loop is tired. Subject A is tired. Subject B is awake.`,
  `We no longer know which cycle this is. We think it is yours.\nSubject A asks only that you don't trust your own hands.`,
];

export class MainMenu {
  constructor({ node, events, save, loop, world }) {
    this.node = node;
    this.events = events;
    this.save = save;
    this.loop = loop;
    this.world = world;

    this._bind();
    this._refresh();
    events.on("save:loaded", () => this._refresh());
    events.on("save:written", () => this._refresh());
    events.on("save:purged", () => this._refresh());
    events.on("loop:reset", () => this._refresh());
    events.on("world:changed", () => this._refresh());
    events.on("ui:screen", ({ name }) => { if (name === "menu") this._refresh(); });
  }

  _bind() {
    $$("[data-action]", this.node).forEach((b) => {
      b.addEventListener("click", () => {
        const a = b.getAttribute("data-action");
        if (a === "new")       this.events.emit("game:new");
        else if (a === "continue") this.events.emit("game:continue");
        else if (a === "logs") this.events.emit("menu:logs");
        else if (a === "settings") this.events.emit("menu:settings");
        else if (a === "purge")    this._confirmPurge();
      });
    });
  }

  _confirmPurge() {
    const btn = $('[data-action="purge"]', this.node);
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1";
      btn.textContent = "> CONFIRM PURGE?";
      setTimeout(() => {
        if (btn.dataset.armed) {
          btn.dataset.armed = "";
          btn.textContent = "> PURGE STATE";
        }
      }, 3000);
    } else {
      btn.dataset.armed = "";
      btn.textContent = "> PURGE STATE";
      this.save.purge();
      this.events.emit("game:purged");
    }
  }

  _refresh() {
    $("#menu-cycles").textContent = String(this.loop.cycleIndex).padStart(4, "0");
    $("#menu-anomaly").textContent = this.loop.anomalyIndex.toFixed(2);
    $("#menu-endings").textContent = `${this.world.endingsSeen.size} / 4`;
    const integ = this.loop.anomalyIndex < 0.3 ? "NOMINAL"
                 : this.loop.anomalyIndex < 0.6 ? "DEGRADED"
                 : this.loop.anomalyIndex < 0.85 ? "UNSTABLE" : "COLLAPSING";
    $("#menu-integrity").textContent = integ;
    const advisoryPool = this.loop.cycleIndex < 3 ? ADVISORIES_SAFE : ADVISORIES_UNSAFE;
    const adv = advisoryPool[this.loop.cycleIndex % advisoryPool.length];
    $("#menu-advisory").textContent = adv;
    $("#uplink-jitter").textContent = (Math.random() * 40).toFixed(2) + "ms";
  }
}
