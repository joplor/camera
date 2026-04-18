/**
 * AnomalyManager — orchestrates image_a / image_b manifestations.
 *
 * The two subject images are the heart of the game. They appear on:
 *   - Screen meshes in rooms (wall screens, terminal screens)
 *   - Reflections (a duplicate sprite parented behind observation glass)
 *   - CCTV feeds (handled by SurveillanceSystem reading `textures`)
 *   - Rare world manifestations: a sprite briefly appears in peripheral
 *     vision, then vanishes.
 *
 * Behavioral rules:
 *   - Early cycles: image_a dominates, calm, helpful-seeming.
 *   - As anomaly rises, image_b starts replacing image_a on random screens.
 *   - Prolonged direct line-of-sight to image_b spikes the anomaly index
 *     and emits `anomaly:exposure`.
 *   - image_b occasionally appears *behind* the player (invisible on screen
 *     but detectable via a later reflection).
 */
import * as THREE from "three";

export class AnomalyManager {
  constructor({ scene, facility, textures, events, loopManager, worldState, player }) {
    this.scene = scene;
    this.facility = facility;
    this.textures = textures;
    this.events = events;
    this.loopManager = loopManager;
    this.worldState = worldState;
    this.player = player;

    // Default all terminal + wall screens to image_a.
    for (const s of facility.allScreens()) {
      this._paintScreen(s, s.slot || "image_a");
    }

    // Prepare a reusable sprite we'll summon around the world.
    const spriteMat = new THREE.SpriteMaterial({
      map: textures.image_b,
      transparent: true, opacity: 0,
      depthWrite: false,
    });
    this.roamSprite = new THREE.Sprite(spriteMat);
    this.roamSprite.scale.set(0.8, 1.1, 1);
    this.roamSprite.visible = false;
    scene.add(this.roamSprite);

    this._exposureTimer = 0;
    events.on("loop:tick",   (e) => this._onTick(e));
    events.on("loop:reset",  ()  => this._onReset());
    events.on("loop:phase",  (e) => this._onPhase(e));

    events.on("player:aiming",    (e) => this._onAiming(e));
  }

  _paintScreen(s, which) {
    const tex = this.textures[which] ?? this.textures.image_a;
    // Screens reuse the shared phosphor material; we just swap the map.
    const mat = s.mesh.material;
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.needsUpdate = true;
    s.slot = which;
  }

  _onReset() {
    for (const s of this.facility.allScreens()) {
      this._paintScreen(s, /subjectB|hidden/i.test(s.id) ? "image_b" : "image_a");
    }
    this._exposureTimer = 0;
    this.roamSprite.visible = false;
    this.roamSprite.material.opacity = 0;
  }

  _onPhase({ phase, anomaly }) {
    switch (phase) {
      case "drift":
        this._replaceRandomScreen("image_b", 1);
        break;
      case "rupture":
        this._replaceRandomScreen("image_b", 2);
        this._summonRoaming();
        break;
      case "collapse":
        this._replaceRandomScreen("image_b", 3);
        this._summonRoaming();
        this.events.emit("audio:cue", { id: "whisper" });
        break;
    }
  }

  _onTick({ anomaly }) {
    // Subtle random image_b intrusions even in routine phase if anomaly high.
    if (anomaly > 0.4 && Math.random() < 0.005) {
      this._replaceRandomScreen("image_b", 1);
    }
    if (anomaly > 0.6 && Math.random() < 0.002) {
      this._summonRoaming();
    }
  }

  _replaceRandomScreen(which, count = 1) {
    const pool = this.facility.allScreens().filter((s) => s.slot !== which);
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const s = pool.splice(idx, 1)[0];
      this._paintScreen(s, which);
      this.worldState.sighted(which);
      this.events.emit("anomaly:screen", { screen: s, which });
    }
  }

  _summonRoaming() {
    // Place the sprite at a random spot near the player but not too close.
    const pPos = this.player.group.position;
    const angle = Math.random() * Math.PI * 2;
    const r = 5 + Math.random() * 7;
    const p = new THREE.Vector3(
      pPos.x + Math.cos(angle) * r,
      1.5 + Math.random() * 0.4,
      pPos.z + Math.sin(angle) * r,
    );
    this.roamSprite.position.copy(p);
    this.roamSprite.visible = true;
    this.roamSprite.material.opacity = 0.0;
    // Fade in / out on a short schedule.
    const start = performance.now();
    const dur = 1800 + Math.random() * 1200;
    const tick = () => {
      const t = performance.now() - start;
      const k = Math.min(1, t / (dur / 2));
      const n = t > dur / 2 ? 1 - (t - dur / 2) / (dur / 2) : k;
      this.roamSprite.material.opacity = Math.max(0, n * 0.8);
      if (t < dur) requestAnimationFrame(tick);
      else this.roamSprite.visible = false;
    };
    tick();
    this.worldState.sighted("image_b");
    this.events.emit("anomaly:roam", { position: p });
  }

  _onAiming({ target }) {
    // If the player is aimed at a screen showing image_b, begin exposure.
    if (!target?.mesh) {
      this._exposureTimer = 0;
      return;
    }
    // Screens are not registered as interactables — so aiming only matters if
    // the target *is* a terminal whose slot has been swapped. Cheap check: if
    // within 2m of any image_b screen AND facing it, count as exposure.
  }

  update(dt) {
    // Sample: if the player is looking at any image_b screen, tick exposure.
    const pp = this.player.group.position;
    const dir = new THREE.Vector3();
    this.player.camera.getWorldDirection(dir);
    let exposed = false;
    for (const s of this.facility.allScreens()) {
      if (s.slot !== "image_b") continue;
      const sp = new THREE.Vector3();
      s.mesh.getWorldPosition(sp);
      if (pp.distanceTo(sp) > 6) continue;
      const toScreen = new THREE.Vector3().subVectors(sp, pp).normalize();
      if (dir.dot(toScreen) > 0.85) { exposed = true; break; }
    }

    if (exposed) {
      this._exposureTimer += dt;
      if (this._exposureTimer > 1.6) {
        this._exposureTimer = 0;
        this.loopManager.addAnomaly(0.05);
        this.events.emit("anomaly:exposure", {
          to: "image_b",
          position: pp.clone(),
        });
      }
    } else {
      this._exposureTimer = Math.max(0, this._exposureTimer - dt * 0.7);
    }

    // Roaming sprite should always face the camera (Sprite already does,
    // but we can dampen motion here for a spooky hover effect).
    if (this.roamSprite.visible) {
      this.roamSprite.position.y += Math.sin(performance.now() * 0.003) * 0.0008;
    }
  }
}
