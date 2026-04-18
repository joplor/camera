/**
 * main.js — Loopwatch bootstrap.
 *
 * Wiring order is intentional:
 *   1. Event bus (every system subscribes to this).
 *   2. Core systems (loop, world-state, save).
 *   3. Renderer + scene + composer.
 *   4. Textures (image_a, image_b).
 *   5. Facility (needs materials, textures).
 *   6. Input + Player.
 *   7. Game systems (AI, anomalies, surveillance, interventions, instability).
 *   8. UI + Audio.
 *   9. Game state machine (boot → menu → playing → pause → ending).
 *
 * The app exposes a small `window.LW` hook for debugging (cycle jumps, etc).
 */
import * as THREE from "three";

import { EventSystem }       from "./core/EventSystem.js";
import { LoopManager }       from "./core/LoopManager.js";
import { WorldStateManager } from "./core/WorldStateManager.js";
import { SaveSystem }        from "./core/SaveSystem.js";

import { loadTextures }      from "./world/Textures.js";
import { Facility }          from "./world/Facility.js";
import { Lighting }          from "./world/Lighting.js";

import { Input }             from "./entities/Input.js";
import { Player }            from "./entities/Player.js";
import { AIBehaviorSystem }  from "./entities/AIBehaviorSystem.js";

import { CameraSystem }      from "./systems/CameraSystem.js";
import { SurveillanceSystem }from "./systems/SurveillanceSystem.js";
import { InterventionSystem }from "./systems/InterventionSystem.js";
import { RealityInstability }from "./systems/RealityInstability.js";
import { AnomalyManager }    from "./systems/AnomalyManager.js";
import { HealthSystem }      from "./systems/HealthSystem.js";
import { HorrorSystem }      from "./systems/HorrorSystem.js";

import { UIManager }         from "./ui/UIManager.js";
import { AudioManager }      from "./audio/AudioManager.js";

import { buildComposer }     from "./shaders/Composer.js";
import { $, show, hide }     from "./utils/dom.js";

// -------------------------------------------------------------------------
//  Bootstrap
// -------------------------------------------------------------------------
async function main() {
  const events = new EventSystem();

  const loopManager = new LoopManager({ events, cycleLength: 600 /* 10 min */ });
  const worldState = new WorldStateManager({ events });
  const save = new SaveSystem({ events, loopManager, worldState });

  // ---- Renderer / scene ------------------------------------------------
  const canvas = $("#game-canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.4;
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1016);
  scene.fog = new THREE.FogExp2(0x0a1016, 0.013);

  const cameraSys = new CameraSystem({ renderer, events });
  const { composer } = buildComposer({ renderer, scene, camera: cameraSys.camera });

  // ---- Textures --------------------------------------------------------
  const textures = await loadTextures({
    onWarn: (m) => console.info("[textures]", m),
  });
  // Paint the menu sigils with whichever textures we ended up with.
  const paintMenuImg = (slot, tex) => {
    document.querySelectorAll(`.sigil img[data-slot="${slot}"]`).forEach((img) => {
      if (tex?.image?.toDataURL) img.src = tex.image.toDataURL();
      else if (tex?.image?.src)  img.src = tex.image.src;
    });
  };
  paintMenuImg("image_a", textures.image_a);
  paintMenuImg("image_b", textures.image_b);

  // ---- Facility + lighting --------------------------------------------
  const facility = new Facility({ scene, events, textures });
  const lighting = new Lighting({ scene, facility, events });

  // ---- Input + player --------------------------------------------------
  const input = new Input();
  const player = Object.assign(new Player({
    scene, camera: cameraSys.camera, facility, events, input,
    materials: facility.mats,
  }), { camera: cameraSys.camera });

  // ---- AI + systems ----------------------------------------------------
  const ai = new AIBehaviorSystem({
    scene, facility, materials: facility.mats,
    events, loopManager, worldState, player,
    texture: textures.alien_a,
  });

  const health = new HealthSystem({ events, player, loopManager });
  const horror = new HorrorSystem({ events, loopManager, player });

  const surveillance = new SurveillanceSystem({
    renderer, scene, facility, events, textures,
    anomaly: loopManager,
  });

  const uiStub = { openTerminal: () => {}, closeTerminal: () => {} };
  const intervention = new InterventionSystem({
    events, worldState, loopManager, facility, ui: uiStub,
  });

  const instability = new RealityInstability({
    renderer, scene, camera: cameraSys.camera, events, facility, composer,
  });

  const anomalies = new AnomalyManager({
    scene, facility, textures, events, loopManager, worldState, player,
  });

  // ---- UI + audio ------------------------------------------------------
  const ui = new UIManager({
    events, saveSystem: save, loopManager, worldState, surveillance, player,
  });
  // Patch the intervention's UI reference so terminals actually open.
  intervention.ui = ui;

  const audio = new AudioManager({ events });

  // ---- Game state machine ---------------------------------------------
  const game = new GameStateMachine({
    events, loopManager, worldState, save, ui, audio, surveillance,
    player, scene, renderer, composer, cameraSys, input, instability,
    lighting, ai, anomalies, facility, health, horror,
  });

  // Expose a debug handle.
  window.LW = {
    events, loopManager, worldState, save, facility, ai,
    anomalies, ui, audio, player, game,
    skipCycle: () => loopManager.resetCycle({ reason: "debug" }),
    jumpAnomaly: (v) => { loopManager.anomalyIndex = v; },
  };

  await game.boot();
}

// -------------------------------------------------------------------------
//  Game state machine
// -------------------------------------------------------------------------
class GameStateMachine {
  constructor(deps) {
    Object.assign(this, deps);
    this.state = "boot";
    this._lastTs = performance.now();
    this._bind();
    this._rafBound = (ts) => this._frame(ts);
  }

  _bind() {
    const e = this.events;
    e.on("game:new",       () => this.startGame(true));
    e.on("game:continue",  () => this.startGame(false));
    e.on("game:purged",    () => { this.loopManager.cycleIndex = 0; this.loopManager.anomalyIndex = 0; this.ui.goto("menu"); });
    e.on("game:resume",    () => this.resume());
    e.on("game:toMenu",    () => this.toMenu());
    e.on("ui:escape",      () => this._escape());
    e.on("ending:trigger", ({ id }) => this._endingFromId(id));
    e.on("ending:dismiss", () => this.toMenu());
    e.on("loop:reset",     () => this.ui.showLoopReset());
    e.on("cctv:corrupted", () => this.audio.cue("whisper"));
    e.on("menu:logs",      () => this.ui.showEnding({
      id: "logs",
      title: "SESSION LOG",
      body: `Cycles: ${this.loopManager.cycleIndex}\nKnowledge: ${this.worldState.knowledge.size}\nIntrusions: ${this.worldState.intrusions.length}\nSightings: A ${this.worldState.sightings.image_a} / B ${this.worldState.sightings.image_b}`,
    }));
    e.on("menu:settings",  () => this.ui.showEnding({
      id: "sys", title: "SYSTEM",
      body: `Controls:\nWASD move · Shift run · Ctrl crouch\nMouse look · E interact · F flashlight\nTab CCTV · Esc pause\nM mute audio`,
    }));

    // Player presses TAB to open/close surveillance while playing.
    window.addEventListener("keydown", (e2) => {
      if (this.state !== "playing") return;
      if (e2.code === "Tab") {
        e2.preventDefault();
        if (this.ui.currentScreen === "cctv") this._exitCCTV();
        else this._enterCCTV();
      }
      if (e2.code === "KeyM") {
        this.audio.setMuted(!this.audio.muted);
        this.events.emit("hud:hint", { text: this.audio.muted ? "AUDIO MUTED" : "AUDIO ON", ttl: 1200 });
      }
    });
  }

  async boot() {
    await this.ui.runBoot();
    // Load existing save (if any) so menu stats reflect returning players.
    if (this.save.hasSave()) this.save.load();
    this.ui.goto("menu");
    this.state = "menu";
    requestAnimationFrame(this._rafBound);
  }

  async startGame(isNew) {
    if (isNew) {
      this.save.purge();
      this.worldState.reset();
      this.loopManager.cycleIndex = 0;
      this.loopManager.anomalyIndex = 0;
      this.loopManager.cycleTime = 0;
    } else if (this.save.hasSave()) {
      this.save.load();
    }

    await this.audio.ensure();
    this.ui.goto("hud");
    this.state = "playing";
    // Pointer lock after user gesture — menu click counts.
    setTimeout(() => this.player.requestLock(), 200);
    this.events.emit("game:started", { cycle: this.loopManager.cycleIndex });
    // Kick off lights + ambient.
    this.events.emit("loop:tick", { cycle: this.loopManager.cycleIndex, t: 0, normalized: 0, anomaly: this.loopManager.anomalyIndex });
  }

  toMenu() {
    this.player.releaseLock();
    this.ui.goto("menu");
    this.state = "menu";
  }

  _enterCCTV() {
    this.player.releaseLock();
    this.ui.goto("cctv");
    this.ui.cctv.open();
  }
  _exitCCTV() {
    this.ui.cctv.close();
    this.ui.goto("hud");
    setTimeout(() => this.player.requestLock(), 50);
  }

  _escape() {
    if (this.state !== "playing" && this.ui.currentScreen !== "pause") {
      if (this.ui.currentScreen === "cctv") this._exitCCTV();
      else if (this.ui.currentScreen === "terminal") this.ui.closeTerminal();
      return;
    }
    if (this.ui.currentScreen === "pause") {
      hide(this.ui.screens.pause);
      this.state = "playing";
      setTimeout(() => this.player.requestLock(), 50);
      this.loopManager.resume();
    } else {
      show(this.ui.screens.pause);
      this.state = "paused";
      this.loopManager.pause();
      this.player.releaseLock();
    }
  }

  resume() { this._escape(); }

  _endingFromId(id) {
    this.worldState.markEnding(id);
    this.state = "ending";
    let title = "—", body = "—";
    if (id === "loopbreaker") {
      title = "THE LOOP BREAKER";
      body  = "You told the core to forget. It obliged.\nKaron-7 is silent now. Your hands are still here, somewhere, but you are not sure they belong to you.\n\nCycles observed: " + (this.loopManager.cycleIndex + 1);
    } else if (id === "compliant") {
      title = "THE COMPLIANT OBSERVER";
      body  = "You did what you were told. Subject A smiled.\nYou will be reassigned next cycle.";
    } else if (id === "defiant") {
      title = "THE DEFIANT OBSERVER";
      body  = "You refused Subject B's invitation. It found someone else.\nYou can still hear it if you stand still.";
    } else {
      title = "THE WITNESS";
      body  = "You watched. You did not touch.\nThe facility holds.";
    }
    this.ui.showEnding({ id, title, body });
    this.player.releaseLock();
  }

  _frame(ts) {
    const dtWall = Math.min(0.05, (ts - this._lastTs) / 1000);
    this._lastTs = ts;

    // Always update UI clocks.
    if (this.state === "playing") {
      this.loopManager.update(dtWall);
      this.ai.update(dtWall);
      this.player.update(dtWall);
      this.health.update(dtWall);
      this.horror.update(dtWall);
      this.lighting.update(dtWall);
      this.instability.update(dtWall);
      this.anomalies.update(dtWall);
      this.cameraSys.update(dtWall);
    } else if (this.state === "paused") {
      this.lighting.update(dtWall); // lights keep breathing
    }

    // CCTV renders its own viewport into its overlay canvas.
    if (this.ui.currentScreen === "cctv") {
      this.surveillance.renderFrame();
      this.ui.cctv.tick();
    } else {
      // Main composer render (post-processed).
      this.composer.render();
    }

    // Drain input edges at the end.
    this.input.endFrame();

    requestAnimationFrame(this._rafBound);
  }
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#ff5f5f;padding:24px;font:14px monospace">LOOPWATCH FAILED TO BOOT\n\n${err.stack ?? err}</pre>`;
});
