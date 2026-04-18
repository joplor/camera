/**
 * Lighting — ambient + per-room light orchestration.
 *
 * This module does three things:
 *   1. Adds the global ambient / hemispheric lights that every scene needs.
 *   2. Drives per-frame flicker on individual room lights. Some lamps
 *      flicker normally (wall lamps in hallways); others only flicker when
 *      the anomaly index rises or during specific loop phases.
 *   3. Handles "blackouts" triggered by the EventSystem — useful both as a
 *      dramatic beat and as a consequence of player intervention.
 */
import * as THREE from "three";

export class Lighting {
  constructor({ scene, facility, events }) {
    this.scene = scene;
    this.facility = facility;
    this.events = events;
    this.flickerTimers = new Map();
    this.anomaly = 0;

    // Hemisphere light — soft fill so the player isn't blind when a room's
    // lamps are off. Slightly green-tinted to push the facility mood.
    this.hemi = new THREE.HemisphereLight(0x8ca0b8, 0x202830, 1.6);
    scene.add(this.hemi);

    // Ambient — strong so interiors read clearly while still cool-tinted.
    this.ambient = new THREE.AmbientLight(0x4a5566, 2.2);
    scene.add(this.ambient);

    events.on("loop:tick",   (e) => { this.anomaly = e.anomaly; });
    events.on("loop:phase",  ({ phase }) => this._onPhase(phase));
    events.on("loop:reset",  () => this.restoreAll());
    events.on("lighting:blackout", (payload) => this.blackout(payload));
    events.on("lighting:restore",  (payload) => this.restore(payload));
  }

  update(dt) {
    // Per-frame flicker for lamps tagged with `flicker: true` or for any
    // lamp when anomaly is high.
    for (const lamp of this.facility.allLights()) {
      if (!lamp.light) continue;
      const base = lamp.baseIntensity;
      const forceFlicker = lamp.flicker || this.anomaly > 0.55 || lamp.state === "flicker";
      if (forceFlicker) {
        // Deterministic-ish pulse so it looks "electrical".
        const n =
          Math.sin(performance.now() * 0.037 + lamp.light.position.x * 13.3) *
          Math.sin(performance.now() * 0.0013 + lamp.light.position.z * 7.1);
        const jitter = (n > 0.6 ? 0 : 1) * (0.75 + 0.25 * Math.random());
        lamp.light.intensity = base * jitter;
      } else if (lamp.state === "off") {
        lamp.light.intensity = 0;
      } else {
        // Gentle breathing.
        lamp.light.intensity = base * (0.95 + 0.05 * Math.sin(performance.now() * 0.002));
      }
    }
  }

  _onPhase(phase) {
    switch (phase) {
      case "settle":
        this.restoreAll();
        break;
      case "drift":
        // A couple of random lamps start flickering.
        this._stampFlicker(0.15);
        break;
      case "rupture":
        this._stampFlicker(0.4);
        break;
      case "collapse":
        this._stampFlicker(0.8);
        this.events.emit("audio:cue", { id: "collapse-hum" });
        break;
    }
  }

  _stampFlicker(fraction) {
    const lamps = this.facility.allLights();
    for (const lamp of lamps) {
      if (Math.random() < fraction) lamp.state = "flicker";
    }
  }

  blackout({ roomId } = {}) {
    for (const room of this.facility.allRooms()) {
      if (roomId && room.id !== roomId) continue;
      for (const lamp of room.lights) lamp.state = "off";
    }
    this.events.emit("audio:cue", { id: "blackout" });
  }

  restore({ roomId } = {}) {
    for (const room of this.facility.allRooms()) {
      if (roomId && room.id !== roomId) continue;
      for (const lamp of room.lights) lamp.state = "on";
    }
  }

  restoreAll() {
    for (const lamp of this.facility.allLights()) lamp.state = "on";
  }
}
