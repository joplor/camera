/**
 * AIBehaviorSystem — stalker AI for a small pack of aliens.
 *
 * Design:
 *   - 3 aliens at start; more can be spawned by HorrorSystem at high anomaly.
 *   - Each alien has a state machine:
 *       HIDING   → invisible, somewhere far from the player
 *       STALKING → visible but distant, wandering, pauses when seen
 *       CHASING  → visible, homing on the player, faster
 *       STUNNED  → frozen for a few seconds after flashlight hit
 *   - Transitions escalate with anomaly. At low anomaly the aliens are
 *     mostly HIDING or STALKING. At high anomaly multiple aliens CHASE.
 *
 * The "observer effect" twist: an alien in STALKING state will step
 * closer every frame the player is NOT looking at it. So looking away
 * is dangerous. We detect looking-at via the camera's forward vector
 * + dot product against the alien's relative direction.
 */
import * as THREE from "three";
import { Alien } from "./Alien.js";
import { Rng } from "../utils/rng.js";

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

export class AIBehaviorSystem {
  constructor({ scene, facility, events, loopManager, worldState, player, texture }) {
    this.scene = scene;
    this.facility = facility;
    this.events = events;
    this.loopManager = loopManager;
    this.worldState = worldState;
    this.player = player;
    this.texture = texture;

    this.aliens = [];
    for (let i = 0; i < 3; i++) {
      const a = new Alien({
        scene, texture,
        id: `alien-${i}`,
        baseScale: 1.9 + Math.random() * 0.4,
      });
      this.aliens.push(a);
    }

    this._respawnAll();

    events.on("loop:reset", () => this._respawnAll());
    events.on("loop:tick",  (e) => this._tick(e));
    events.on("horror:spawnAlien", () => this._spawnExtra());
    events.on("player:flashlight", () => this._onFlashlightToggle());
  }

  _respawnAll() {
    const rng = new Rng(`aliens-${this.loopManager.cycleIndex}`);
    const rooms = this.facility.allRooms().filter((r) => r.tag !== "corridor");
    for (const a of this.aliens) {
      const room = rng.pick(rooms);
      const pos = this._randomInsideRoom(room, rng);
      a.setPosition(pos);
      a.state = "HIDING";
      a.stateTime = 0;
      a.stunTimer = 0;
      a.setVisible(false);
    }
  }

  _randomInsideRoom(room, rng) {
    const pad = 1.4;
    const x = rng.range(room.min.x + pad, room.max.x - pad);
    const z = rng.range(room.min.z + pad, room.max.z - pad);
    return new THREE.Vector3(x, 0, z);
  }

  _spawnExtra() {
    if (this.aliens.length >= 6) return;
    const rng = new Rng(`extra-${performance.now()}`);
    const alien = new Alien({
      scene: this.scene, texture: this.texture,
      id: `alien-${this.aliens.length}`, baseScale: 2.0,
    });
    const rooms = this.facility.allRooms().filter((r) => r.tag !== "corridor");
    alien.setPosition(this._randomInsideRoom(rng.pick(rooms), rng));
    this.aliens.push(alien);
  }

  _tick({ t, anomaly }) {
    const pp = this.player.group.position;
    for (const a of this.aliens) {
      a.stateTime += 1 / this.loopManager.onTickHz;
      const dist = a.position.distanceTo(pp);

      // Flashlight check first — overrides everything.
      if (this.player.isLitBy(a.position)) {
        // Being lit damages the alien's resolve. After enough cumulative
        // exposure, kick it into STUNNED and shove it away.
        a._lightHit = (a._lightHit || 0) + 1 / this.loopManager.onTickHz;
        if (a._lightHit > 1.2) {
          a.state = "STUNNED";
          a.stateTime = 0;
          a.stunTimer = 2.5;
          a._lightHit = 0;
          this.events.emit("alien:stunned", { id: a.id });
        }
      } else {
        a._lightHit = Math.max(0, (a._lightHit || 0) - 0.2 / this.loopManager.onTickHz);
      }

      switch (a.state) {
        case "HIDING":
          a.setVisible(false);
          // After a grace period, surface the alien in STALKING state.
          if (a.stateTime > (anomaly < 0.2 ? 18 : anomaly < 0.5 ? 8 : 3)) {
            a.state = "STALKING"; a.stateTime = 0; a.setVisible(true);
            this.events.emit("alien:surface", { id: a.id });
          }
          break;

        case "STALKING": {
          a.setVisible(true);
          // Move only when not directly observed — the "observer" effect.
          const observed = this._playerLookingAt(a.position, 0.82);
          if (!observed) {
            this._moveToward(a, pp, a.speed * (1 + anomaly));
          }
          // Promotion to CHASING when close + high anomaly.
          if ((dist < 10 && anomaly > 0.45) || dist < 5) {
            a.state = "CHASING"; a.stateTime = 0;
            this.events.emit("alien:chase", { id: a.id });
          }
          // Demote to HIDING if player is very far.
          if (dist > 30 && a.stateTime > 10) {
            a.state = "HIDING"; a.stateTime = 0; a.setVisible(false);
          }
          break;
        }

        case "CHASING":
          a.setVisible(true);
          // Chase is always moving — observer effect no longer saves you.
          this._moveToward(a, pp, a.chaseSpeed * (0.9 + anomaly * 0.7));
          // If we lose sight for a while, fall back to STALKING.
          if (dist > 18 && a.stateTime > 5) {
            a.state = "STALKING"; a.stateTime = 0;
          }
          break;

        case "STUNNED":
          a.setVisible(true);
          // Small backpedal.
          this._moveAway(a, pp, 1.0);
          a.stunTimer -= 1 / this.loopManager.onTickHz;
          if (a.stunTimer <= 0) {
            a.state = "STALKING"; a.stateTime = 0;
          }
          break;
      }

      // Lighting feedback: tint while lit, untint otherwise.
      if (this.player.isLitBy(a.position)) a.lightHit(1 / this.loopManager.onTickHz);
      else                                 a.unlight(1 / this.loopManager.onTickHz);

      // Emit proximity events for HealthSystem and audio heartbeat.
      if (dist < 1.6 && a.state !== "HIDING" && a.state !== "STUNNED") {
        this.events.emit("alien:contact", { id: a.id, dist });
      }
    }

    // Sort a global "closest alien" distance for heartbeat audio.
    const nearest = this._closestDistance();
    this.events.emit("alien:nearest", { dist: nearest });
  }

  _playerLookingAt(pos, cosAngle = 0.8) {
    const cam = this.player.camera;
    TMP.subVectors(pos, cam.position).normalize();
    cam.getWorldDirection(TMP2);
    return TMP.dot(TMP2) > cosAngle;
  }

  _moveToward(a, target, speed) {
    TMP.subVectors(target, a.position); TMP.y = 0;
    const d = TMP.length();
    if (d < 0.4) return;
    TMP.normalize();
    const step = speed / this.loopManager.onTickHz;
    const next = new THREE.Vector3().copy(a.position).addScaledVector(TMP, Math.min(d, step));
    // Crude wall avoidance: if next is inside a collider, nudge along the wall.
    if (!this._inWall(next)) a.setPosition(next);
    else a.setPosition(new THREE.Vector3(next.x, 0, a.position.z));
  }

  _moveAway(a, target, speed) {
    TMP.subVectors(a.position, target); TMP.y = 0;
    if (TMP.lengthSq() < 0.01) return;
    TMP.normalize();
    const step = speed / this.loopManager.onTickHz;
    const next = new THREE.Vector3().copy(a.position).addScaledVector(TMP, step);
    if (!this._inWall(next)) a.setPosition(next);
  }

  _inWall(p) {
    // A tiny radius check against walls only. Doors + screens skipped.
    const r = 0.3;
    const meshes = this.facility.collisionMeshes();
    const box = new THREE.Box3();
    for (const m of meshes) {
      box.setFromObject(m);
      if (
        p.x + r > box.min.x && p.x - r < box.max.x &&
        p.z + r > box.min.z && p.z - r < box.max.z &&
        1.2 > box.min.y && 0.0 < box.max.y
      ) return true;
    }
    return false;
  }

  _closestDistance() {
    const pp = this.player.group.position;
    let min = Infinity;
    for (const a of this.aliens) {
      if (a.state === "HIDING") continue;
      const d = a.position.distanceTo(pp);
      if (d < min) min = d;
    }
    return min;
  }

  _onFlashlightToggle() { /* reserved for future behaviors */ }

  update(dt) {
    const tt = performance.now() * 0.001;
    for (const a of this.aliens) {
      // Billboard pulse amplitude scales inversely with distance to the player.
      const d = a.position.distanceTo(this.player.group.position);
      const amp = Math.max(0, 1 - d / 10);
      a.pulse(tt, amp);
      // Always place sprites at 1.2m so they read as eye-level.
      a.sprite.position.y = 1.2;
    }
  }

  // Legacy accessor for code that referenced npcs.
  get npcs() { return this.aliens; }
}
