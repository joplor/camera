/**
 * RealityInstability — visual chaos coupled to the anomaly index.
 *
 * This system owns the post-processing chain and the world-wide "glitch
 * intensity" CSS class. Four levels (none / low / mid / high) toggle body
 * classes that drive the CRT overlay; the glitch post-pass modulates its
 * uniforms off the same curve.
 *
 * It also adds subtle world jitter: at mid/high anomaly we occasionally
 * offset the screen meshes in the facility by a fraction of a meter, and
 * emit `world:stutter` events so other systems can react.
 */
import { GlitchPass } from "../shaders/GlitchPass.js";
import * as THREE from "three";

const LEVELS = [
  { name: "none", min: 0.00, cls: null },
  { name: "low",  min: 0.20, cls: "glitch-low" },
  { name: "mid",  min: 0.50, cls: "glitch-mid" },
  { name: "high", min: 0.78, cls: "glitch-high" },
];

export class RealityInstability {
  constructor({ renderer, scene, camera, events, facility, composer }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.events = events;
    this.facility = facility;
    this.composer = composer;
    this.glitchPass = new GlitchPass();
    composer.addPass(this.glitchPass);

    this.level = "none";
    this._anomaly = 0;
    this._stutterCooldown = 0;

    events.on("loop:tick", (e) => { this._anomaly = e.anomaly; });
    events.on("loop:phase", ({ phase }) => this._onPhase(phase));
    events.on("loop:reset", () => {
      this._anomaly = 0;
      this._applyLevel();
    });
    events.on("anomaly:exposure", () => {
      // A direct exposure to image_b spikes the glitch pass briefly.
      this.glitchPass.spike(1.0);
    });
  }

  _onPhase(phase) {
    if (phase === "rupture" || phase === "collapse") {
      this.glitchPass.spike(phase === "collapse" ? 0.9 : 0.4);
    }
  }

  _levelFor(a) {
    let match = LEVELS[0];
    for (const l of LEVELS) if (a >= l.min) match = l;
    return match;
  }

  _applyLevel() {
    const l = this._levelFor(this._anomaly);
    if (l.name === this.level) return;
    for (const prev of LEVELS) if (prev.cls) document.body.classList.remove(prev.cls);
    if (l.cls) document.body.classList.add(l.cls);
    this.level = l.name;
    this.events.emit("instability:level", { level: l.name });
  }

  update(dt) {
    this._applyLevel();
    this.glitchPass.uniforms.anomaly.value = this._anomaly;

    // World micro-jitter: screens shift a fraction of a meter at mid/high.
    if (this._anomaly > 0.45) {
      this._stutterCooldown -= dt;
      if (this._stutterCooldown <= 0) {
        this._stutterCooldown = 0.3 + Math.random() * 0.6;
        this._stutter();
      }
    }
  }

  _stutter() {
    const screens = this.facility.allScreens();
    if (!screens.length) return;
    const s = screens[Math.floor(Math.random() * screens.length)];
    const dx = (Math.random() - 0.5) * 0.04;
    const dy = (Math.random() - 0.5) * 0.02;
    s.mesh.position.x += dx;
    s.mesh.position.y += dy;
    setTimeout(() => {
      s.mesh.position.x -= dx;
      s.mesh.position.y -= dy;
    }, 60 + Math.random() * 120);
    this.events.emit("world:stutter", { kind: "screen", amount: this._anomaly });
  }
}
