/**
 * Terminal — in-world computer interface.
 *
 * When the player interacts with a terminal in the facility, this modal
 * opens. It exposes a small command-line surface. Available commands
 * depend on the terminal's `meta` flags:
 *
 *   K7-MAIN    → codes, unlock, manifest
 *   K7-CCTV    → switch, list
 *   K7-AUDIO   → whisper, mute
 *   LAB-*-NOTES→ read (gives diegetic story)
 *   SERV-MAIN  → power on/off, blackout
 *   OBS-LOG    → log (reads recent events)
 *   Ω-CORE     → (ending trigger — see below)
 *
 * The terminal is deliberately tiny — a real shell is overkill for the
 * game's scope, but the command loop is a good vehicle for lore and
 * player intent.
 */
import { $, show, hide } from "../utils/dom.js";

export class Terminal {
  constructor({ node, events, world, loop }) {
    this.node = node;
    this.events = events;
    this.world = world;
    this.loop = loop;
    this.body = $("#term-body", node);
    this.input = $("#term-cmd", node);
    this.title = $("#term-title", node);
    this.active = null;
    this.history = [];
    this.hIndex = -1;

    this.input.addEventListener("keydown", (e) => this._onKey(e));
    // Close on Esc.
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.active) this.close();
    });
  }

  open(interactable) {
    this.active = interactable;
    this.title.textContent = interactable.id;
    this.body.textContent = "";
    this._println(this._banner(interactable));
    this._println(`Type \`help\` for available commands.`);
    show(this.node);
    setTimeout(() => this.input.focus(), 10);
    this.events.emit("terminal:opened", { id: interactable.id });
  }

  close() {
    hide(this.node);
    this.events.emit("terminal:closed", { id: this.active?.id });
    this.active = null;
    this.input.value = "";
  }

  _banner(i) {
    const id = i.id;
    return [
      "┌────────────────────────────────────────┐",
      `│ KARON-7 · ${id.padEnd(24, " ")} │`,
      "│ TIER-B OBSERVER SHELL · v0.7.3         │",
      "└────────────────────────────────────────┘",
    ].join("\n");
  }

  _println(s = "") {
    this.body.textContent += s + "\n";
    this.body.scrollTop = this.body.scrollHeight;
  }

  _onKey(e) {
    if (e.code === "Enter") {
      const cmd = this.input.value.trim();
      this.history.unshift(cmd);
      this.hIndex = -1;
      this.input.value = "";
      this._run(cmd);
      return;
    }
    if (e.code === "ArrowUp") {
      e.preventDefault();
      this.hIndex = Math.min(this.history.length - 1, this.hIndex + 1);
      this.input.value = this.history[this.hIndex] || "";
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      this.hIndex = Math.max(-1, this.hIndex - 1);
      this.input.value = this.history[this.hIndex] || "";
    }
  }

  _run(cmd) {
    if (!cmd) return;
    this._println(`operator@karon-7:~$ ${cmd}`);
    const [head, ...rest] = cmd.split(/\s+/);
    const handler = COMMANDS[head];
    if (!handler) {
      this._println(`command not found: ${head}`);
      return;
    }
    try { handler(this, rest); }
    catch (err) { this._println(`error: ${err.message}`); }
  }
}

// ---------- commands -----------------------------------------------------
const COMMANDS = {
  help(t) {
    t._println("available commands:");
    t._println("  help              show this");
    t._println("  whoami            show the observer stamp");
    t._println("  loop              print the current cycle state");
    t._println("  manifest          list known personnel");
    t._println("  codes             show known codes (if any)");
    t._println("  eventlog          print recent system events");
    t._println("  logs              read terminal-specific notes");
    t._println("  switch <n>        switch CCTV feed to camera n (K7-CCTV only)");
    t._println("  unlock <id> <c>   unlock a door with a code (K7-MAIN only)");
    t._println("  blackout <zone>   kill lights in a zone (SERV-MAIN only)");
    t._println("  restore <zone>    restore lights in a zone (SERV-MAIN only)");
    t._println("  alarm             sound the alarm (K7-AUDIO only)");
    t._println("  read              read lab notes (LAB-*-NOTES only)");
    t._println("  forget            delete this session (hard reset)");
    t._println("  exit              close terminal");
  },
  whoami(t) {
    t._println("operator · observer · tier-B");
    t._println("KARON-7 sublevel 3 · assigned cycle " + (t.loop.cycleIndex + 1));
  },
  loop(t) {
    t._println(`cycle       : ${t.loop.cycleIndex + 1}`);
    t._println(`remaining   : ${t.loop.remainingLabel()}`);
    t._println(`anomaly idx : ${t.loop.anomalyIndex.toFixed(3)}`);
  },
  manifest(t) {
    t._println("DR. LECLERC  · LAB-A · biotech");
    t._println("DR. HALIDE   · LAB-B · cognition");
    t._println("TECH. OKAFOR · SERVER · systems");
    t._println("ADMIN. VANCE · CONTROL · oversight");
    t._println("(tier-B observer roster — you are not listed)");
  },
  codes(t) {
    const codes = [...t.world.knowledge].filter((k) => k.startsWith("code:"));
    if (!codes.length) { t._println("no codes known."); return; }
    for (const c of codes) t._println("  " + c.replace("code:", ""));
  },
  eventlog(t) {
    const rec = t.events.recent?.();
    if (!rec || !rec.length) { t._println("no recent events."); return; }
    for (const e of rec.slice(-12)) {
      const ts = (e.t / 1000).toFixed(2);
      t._println(`${ts.padStart(8)} · ${e.name}`);
    }
  },
  logs(t) {
    const id = t.active?.id || "";
    if (id.startsWith("LAB-A"))      t._println(LOG_LAB_A);
    else if (id.startsWith("LAB-B")) t._println(LOG_LAB_B);
    else if (id.startsWith("OBS"))   t._println(LOG_OBS);
    else if (id.startsWith("Ω"))     t._println(LOG_CORE);
    else                             t._println("no notes available.");
  },
  read(t) { COMMANDS.logs(t); },
  switch(t, args) {
    if (t.active?.id !== "K7-CCTV") { t._println("permission denied."); return; }
    const n = parseInt(args[0], 10);
    if (isNaN(n)) { t._println("usage: switch <n>"); return; }
    t.events.emit("cctv:request", { index: n - 1 });
    t._println(`switched to feed ${n}.`);
  },
  unlock(t, args) {
    if (t.active?.id !== "K7-MAIN") { t._println("permission denied."); return; }
    const [id, code] = args;
    if (!id || !code) { t._println("usage: unlock <doorId> <code>"); return; }
    t.events.emit("intervention:doorUnlock", { id, code });
    t._println(`attempted unlock on ${id}.`);
  },
  blackout(t, args) {
    if (t.active?.id !== "SERV-MAIN") { t._println("permission denied."); return; }
    const zone = args[0];
    t.events.emit("intervention:blackout", { roomId: zone });
    t._println(`blackout issued: ${zone ?? "ALL"}`);
  },
  restore(t, args) {
    if (t.active?.id !== "SERV-MAIN") { t._println("permission denied."); return; }
    const zone = args[0];
    t.events.emit("intervention:restore", { roomId: zone });
    t._println(`restore issued: ${zone ?? "ALL"}`);
  },
  alarm(t) {
    if (t.active?.id !== "K7-AUDIO") { t._println("permission denied."); return; }
    t.events.emit("intervention:alarm");
    t._println("alarm engaged.");
  },
  forget(t) {
    t._println("this will purge your observer state and break the loop.");
    t._println("confirm by entering: forget yes");
  },
  exit(t) { t.close(); },
};

// Double-confirm for forget.
const REAL_FORGET = COMMANDS.forget;
COMMANDS.forget = function (t, args) {
  if (args[0] === "yes") {
    // Only works at the Ω-CORE terminal: that's the loop-breaking ending.
    if (t.active?.id === "Ω-CORE") {
      t.events.emit("ending:trigger", { id: "loopbreaker" });
    } else {
      t._println("this terminal is not authorized to sever the loop.");
    }
    return;
  }
  REAL_FORGET(t, args);
};

const LOG_LAB_A = `
LECLERC  2026-01-03  SUBJECT A has stabilised. Placid. Responds to affection.
LECLERC  2026-01-14  SUBJECT A can predict visitor arrival times. No explanation.
LECLERC  2026-02-07  SUBJECT A warns us about B. We do not discuss B here.
LECLERC  2026-03-??  The loop was always running. We only just noticed.
`.trim();

const LOG_LAB_B = `
HALIDE   2026-01-08  Subject B refuses resolution. Imagery always 1-off.
HALIDE   2026-01-19  Subject B is a camera. It looks back.
HALIDE   2026-02-22  Subject B will not be contained by glass.
HALIDE   2026-03-??  Subject B wrote my name on the inside of the lens.
`.trim();

const LOG_OBS = `
VANCE    cycle 007  The observer keeps being replaced. That's fine.
VANCE    cycle 031  The observer is becoming the subject. That's not.
VANCE    cycle ???  If you are reading this: you are the subject now.
`.trim();

const LOG_CORE = `
Ω-CORE   The loop is a survival mechanism of this facility.
Ω-CORE   If you want out, type 'forget yes' here, at this terminal only.
Ω-CORE   There is no guarantee which side of the loop you'll be on afterward.
`.trim();
