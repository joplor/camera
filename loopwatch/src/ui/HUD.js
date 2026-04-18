/**
 * HUD — in-game heads-up display.
 *
 * Shows cycle, countdown, current zone, anomaly index, interaction prompt,
 * and the occasional "whisper" from the system. Also drives vitals: HP,
 * stamina, flashlight battery, plus damage vignette and jump-scare flash.
 */
import { $ } from "../utils/dom.js";

const WHISPERS = [
  "YOU ARE NOT REQUIRED TO LOOK AT THE SCREENS",
  "SUBJECT A APPROVES",
  "YOU CAN STOP NOW",
  "WE REMEMBER THE LAST ONE",
  "THIS IS THE CORRECT CYCLE",
  "PLEASE STAND STILL",
  "THE FACILITY IS FINE",
  "YOU ARE ALSO INSIDE",
  "DON'T LOOK BEHIND YOU",
  "IT SAW YOU BLINK",
];

export class HUD {
  constructor({ node, events, loop, player }) {
    this.node = node;
    this.events = events;
    this.loop = loop;
    this.player = player;

    this.hint = $("#hud-hint", node);
    this.subtitle = $("#subtitle", node);
    this.whisper = $("#whisper", node);

    this.hpFill = $("#hp-fill", node);
    this.hpNum  = $("#hp-num", node);
    this.staFill = $("#sta-fill", node);
    this.battFill = $("#batt-fill", node);

    this.damageVignette = document.getElementById("damage-vignette");
    this.scareFlash = document.getElementById("scare-flash");

    events.on("loop:tick", () => this._tickHud());
    events.on("player:zone", ({ name }) => this._setZone(name));
    events.on("player:aiming", ({ target }) => this._setPrompt(target));
    events.on("hud:hint", ({ text, ttl }) => this._showHint(text, ttl));
    events.on("hud:subtitle", ({ text, ttl }) => this._showSubtitle(text, ttl));
    events.on("hud:whisper", ({ text, ttl }) => this._showWhisper(text, ttl));
    events.on("hud:health", (e) => this._setHealth(e));
    events.on("hud:damage", () => this._onDamage());
    events.on("hud:flash", ({ intensity }) => this._flash(intensity));
    events.on("loop:phase", ({ phase }) => {
      if (phase === "drift" || phase === "rupture") {
        if (Math.random() < 0.25) this._showWhisper(this._pickWhisper(), 1800);
      }
    });
  }

  _tickHud() {
    $("#hud-cycle", this.node).textContent = String(this.loop.cycleIndex + 1).padStart(2, "0");
    $("#hud-time", this.node).textContent = this.loop.remainingLabel();
    $("#hud-anomaly", this.node).textContent = this.loop.anomalyIndex.toFixed(2);

    // Stamina + flashlight meters driven directly from the player.
    if (this.player) {
      if (this.staFill) this.staFill.style.width = (this.player.stamina * 100).toFixed(0) + "%";
      if (this.battFill) {
        const b = this.player.flashlightBattery;
        this.battFill.style.width = (b * 100).toFixed(0) + "%";
        this.battFill.classList.toggle("low", b < 0.2);
      }
    }
  }

  _setHealth({ hp, ratio }) {
    if (!this.hpFill) return;
    this.hpFill.style.width = (ratio * 100).toFixed(0) + "%";
    this.hpNum.textContent = Math.max(0, Math.round(hp));
    this.hpFill.classList.toggle("low", ratio < 0.3);
    if (this.damageVignette) this.damageVignette.classList.toggle("low", ratio < 0.35);
  }

  _onDamage() {
    if (!this.damageVignette) return;
    this.damageVignette.classList.add("hit");
    clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => this.damageVignette.classList.remove("hit"), 180);
  }

  _flash(intensity = 1) {
    if (!this.scareFlash) return;
    this.scareFlash.style.opacity = Math.min(0.9, intensity);
    this.scareFlash.classList.add("on");
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.scareFlash.classList.remove("on");
      this.scareFlash.style.opacity = "";
    }, 120);
  }

  _setZone(name) {
    $("#hud-zone", this.node).textContent = name ?? "—";
  }

  _setPrompt(target) {
    if (target && target.promptLabel) {
      this.hint.textContent = `[E] ${target.promptLabel}`;
      this.hint.classList.add("visible");
    } else {
      this.hint.classList.remove("visible");
    }
  }

  _showHint(text, ttl = 2000) {
    this.hint.textContent = text;
    this.hint.classList.add("visible");
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.hint.classList.remove("visible"), ttl);
  }

  _showSubtitle(text, ttl = 2400) {
    this.subtitle.textContent = text;
    this.subtitle.classList.add("visible");
    clearTimeout(this._subTimer);
    this._subTimer = setTimeout(() => this.subtitle.classList.remove("visible"), ttl);
  }

  _showWhisper(text, ttl = 1800) {
    this.whisper.textContent = text;
    this.whisper.classList.add("visible");
    clearTimeout(this._whispTimer);
    this._whispTimer = setTimeout(() => this.whisper.classList.remove("visible"), ttl);
  }

  _pickWhisper() {
    return WHISPERS[Math.floor(Math.random() * WHISPERS.length)];
  }
}
