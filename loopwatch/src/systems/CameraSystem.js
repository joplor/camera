/**
 * CameraSystem — main Three.js camera + viewport management.
 *
 * Responsibilities:
 *   - Owns the `PerspectiveCamera` used by the renderer.
 *   - Handles resize events (width/height, DPR clamp for low-end GPUs).
 *   - Switches between third-person mode and CCTV mode. In CCTV mode the
 *     active surveillance feed supplies a temporary position/look-at, and
 *     we briefly disable shadow-caster updates for perf.
 *   - Applies a small "anomaly camera shake" that scales with the loop's
 *     anomaly index. At high index the shake becomes intrusive.
 */
import * as THREE from "three";

export class CameraSystem {
  constructor({ renderer, events }) {
    this.renderer = renderer;
    this.events = events;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 400);
    this.camera.position.set(0, 6, 8);
    this.camera.lookAt(0, 1, 0);

    this.mode = "third";   // third | cctv
    this.shakeIntensity = 0;
    this._shakeBase = new THREE.Vector3();

    window.addEventListener("resize", () => this._onResize());
    this._onResize();

    events.on("loop:anomaly", ({ anomaly }) => {
      this.shakeIntensity = Math.max(this.shakeIntensity, anomaly * 0.02);
    });
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
  }

  setMode(mode, opts = {}) {
    this.mode = mode;
    this.events.emit("camera:mode", { mode, opts });
  }

  applyShake() {
    if (this.shakeIntensity <= 0.0001) return;
    const k = this.shakeIntensity;
    this.camera.position.x += (Math.random() - 0.5) * k;
    this.camera.position.y += (Math.random() - 0.5) * k;
    this.camera.position.z += (Math.random() - 0.5) * k;
    this.shakeIntensity *= 0.88;
  }

  update(dt) {
    this.applyShake();
  }
}
