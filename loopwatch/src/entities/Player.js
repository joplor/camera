/**
 * Player — first-person horror controller.
 *
 * No visible body. The camera *is* the player. Movement and look are tuned
 * for tension, not precision: a slow baseline, a meaningful sprint cap that
 * costs stamina, and a forgiving crouch. Mouse look is smoothed lightly so
 * fast flicks still feel responsive but tiny jitter is suppressed.
 *
 * Collision is an axis-swept capsule against the facility's AABBs. It's
 * crude — but for a corridor horror game it's the right amount of jank.
 *
 * The flashlight is a spot light tied to the camera forward. It has a
 * battery that drains while on and regenerates slowly while off. The
 * flashlight is also the game's main anti-alien tool.
 */
import * as THREE from "three";

const FWD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const MOVE = new THREE.Vector3();
const NEXT = new THREE.Vector3();
const TMP = new THREE.Vector3();

export class Player {
  constructor({ scene, camera, facility, events, input }) {
    this.scene = scene;
    this.camera = camera;
    this.facility = facility;
    this.events = events;
    this.input = input;

    this.radius = 0.36;
    this.eyeHeight = 1.68;
    this.crouchEyeHeight = 1.05;

    this.walkSpeed = 2.5;
    this.runSpeed  = 4.6;
    this.crouchSpeed = 1.3;

    this.stamina = 1.0;
    this.staminaDrain = 0.28;     // per second while sprinting
    this.staminaRegen = 0.18;     // per second while not sprinting

    // Head-bob state.
    this.bobPhase = 0;
    this.bobAmount = 0;

    // Mouse look state (smoothed).
    this.yaw = 0;
    this.pitch = 0;
    this._yawTarget = 0;
    this._pitchTarget = 0;
    this.mouseSensitivity = 0.0018;
    this._smooth = 0.32;           // 0 = no smoothing, 1 = ignore input

    // Pointer group — the invisible player. Other systems still reference
    // `player.group.position`, so we keep one, just with no body mesh.
    this.group = new THREE.Group();
    this.group.name = "Player";
    this.group.position.copy(facility.playerSpawn);
    scene.add(this.group);

    // --- Flashlight ----------------------------------------------------
    this.flashlight = new THREE.SpotLight(0xfff5dc, 0, 18, Math.PI / 7, 0.5, 1.2);
    this.flashlight.castShadow = false;
    this.flashlightTarget = new THREE.Object3D();
    this.flashlight.target = this.flashlightTarget;
    scene.add(this.flashlight, this.flashlightTarget);
    this.flashlightOn = false;
    this.flashlightBattery = 1.0;       // 0..1
    this.flashlightPower = 6.5;

    // Interact state.
    this.aimingAt = null;
    this._colliders = [];

    events.on("world:built", () => this._rebuildColliders());
    events.on("door:changed", () => this._rebuildColliders());

    this._bindMouse();
    this._lastZone = null;

    // Health is owned by HealthSystem, but we expose a reference for convenience.
    this.health = null;
  }

  _rebuildColliders() {
    this._colliders = this.facility.collisionMeshes().map((mesh) => ({
      mesh,
      box: new THREE.Box3().setFromObject(mesh),
    }));
  }

  _bindMouse() {
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== document.body) return;
      this._yawTarget   -= e.movementX * this.mouseSensitivity;
      this._pitchTarget -= e.movementY * this.mouseSensitivity;
      this._pitchTarget = Math.max(-Math.PI / 2 + 0.05,
                          Math.min(Math.PI / 2 - 0.05, this._pitchTarget));
    });
  }

  requestLock() {
    if (document.pointerLockElement !== document.body) {
      document.body.requestPointerLock?.();
    }
  }
  releaseLock() {
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock?.();
    }
  }

  update(dt) {
    this._updateLook(dt);
    this._updateMovement(dt);
    this._updateCamera(dt);
    this._updateFlashlight(dt);
    this._updateInteract();
    this._emitZoneIfChanged();
  }

  // ----- look --------------------------------------------------------
  _updateLook(dt) {
    // Lightly smooth yaw/pitch so very fast flicks don't feel like a
    // guillotine. Smoothing is frame-rate independent.
    const k = 1 - Math.pow(this._smooth, dt * 60);
    this.yaw   += (this._yawTarget   - this.yaw)   * k;
    this.pitch += (this._pitchTarget - this.pitch) * k;
  }

  // ----- movement ----------------------------------------------------
  _updateMovement(dt) {
    const k = this.input.keys;

    // Camera-relative forward/right on the XZ plane.
    // Camera looks down -Z at yaw=0, so FWD is (-sin, 0, -cos).
    FWD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    MOVE.set(0, 0, 0);
    if (k.has("KeyW") || k.has("ArrowUp"))    MOVE.add(FWD);
    if (k.has("KeyS") || k.has("ArrowDown"))  MOVE.sub(FWD);
    if (k.has("KeyD") || k.has("ArrowRight")) MOVE.add(RIGHT);
    if (k.has("KeyA") || k.has("ArrowLeft"))  MOVE.sub(RIGHT);
    const hasInput = MOVE.lengthSq() > 0;
    if (hasInput) MOVE.normalize();

    const crouching = k.has("ControlLeft") || k.has("ControlRight");
    const wantRun = k.has("ShiftLeft") || k.has("ShiftRight");
    const canRun = this.stamina > 0.08 && hasInput && !crouching;
    const running = wantRun && canRun;

    if (running) this.stamina = Math.max(0, this.stamina - this.staminaDrain * dt);
    else         this.stamina = Math.min(1, this.stamina + this.staminaRegen * dt);

    const speed = crouching ? this.crouchSpeed : (running ? this.runSpeed : this.walkSpeed);

    NEXT.copy(this.group.position).addScaledVector(MOVE, speed * dt);
    this._resolveCollisions(NEXT);
    this.group.position.copy(NEXT);

    // Bob state. Running bobs harder; crouching barely at all.
    const moveSpeed = hasInput ? 1 : 0;
    const bobAmp = crouching ? 0.01 : running ? 0.05 : 0.028;
    this.bobAmount = THREE.MathUtils.lerp(this.bobAmount, moveSpeed * bobAmp, Math.min(1, dt * 10));
    this.bobPhase += (crouching ? 6 : running ? 14 : 9) * dt * moveSpeed;

    // Footsteps — emit cue on bob peaks.
    if (hasInput && this.bobAmount > 0.01) {
      const n = Math.floor(this.bobPhase / Math.PI);
      if (n !== this._lastFootN) {
        this._lastFootN = n;
        this.events.emit("audio:cue", { id: running ? "foot-run" : crouching ? "foot-crouch" : "foot-walk" });
      }
    }

    // Stash crouched flag for camera.
    this._crouching = crouching;
    this._running = running;
  }

  _resolveCollisions(next) {
    const curr = this.group.position;
    const tryAxis = (prop) => {
      TMP.copy(curr); TMP[prop] = next[prop];
      if (this._blocked(TMP)) next[prop] = curr[prop];
    };
    tryAxis("x"); tryAxis("z");
  }

  _blocked(p) {
    const r = this.radius;
    for (const c of this._colliders) {
      const b = c.box;
      if (
        p.x + r > b.min.x && p.x - r < b.max.x &&
        p.z + r > b.min.z && p.z - r < b.max.z &&
        p.y + this.eyeHeight * 0.9 > b.min.y && p.y + 0.05 < b.max.y
      ) return true;
    }
    return false;
  }

  // ----- camera ------------------------------------------------------
  _updateCamera(dt) {
    const eyeY = this._crouching ? this.crouchEyeHeight : this.eyeHeight;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * this.bobAmount;
    const bobX = Math.sin(this.bobPhase * 0.5) * this.bobAmount * 0.6;

    this.camera.position.set(
      this.group.position.x + bobX * Math.cos(this.yaw),
      this.group.position.y + eyeY + bobY,
      this.group.position.z - bobX * Math.sin(this.yaw),
    );

    // Euler order YXZ so yaw rotates head then pitch tilts forward.
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  // ----- flashlight --------------------------------------------------
  _updateFlashlight(dt) {
    if (this.input.consumedEdge("KeyF") && this.flashlightBattery > 0.02) {
      this.flashlightOn = !this.flashlightOn;
      this.events.emit("player:flashlight", { on: this.flashlightOn, battery: this.flashlightBattery });
    }
    if (this.flashlightOn) {
      this.flashlightBattery = Math.max(0, this.flashlightBattery - 0.02 * dt);
      if (this.flashlightBattery <= 0) {
        this.flashlightOn = false;
        this.events.emit("player:flashlight", { on: false, battery: 0 });
      }
    } else {
      this.flashlightBattery = Math.min(1, this.flashlightBattery + 0.01 * dt);
    }
    // Slight flicker when battery is low.
    const low = this.flashlightBattery < 0.2 ? Math.random() * 0.4 + 0.6 : 1;
    this.flashlight.intensity = this.flashlightOn ? this.flashlightPower * low * (0.5 + this.flashlightBattery * 0.5) : 0;

    // Position + aim.
    const origin = new THREE.Vector3().copy(this.camera.position);
    this.flashlight.position.copy(origin);
    this.camera.getWorldDirection(TMP);
    this.flashlightTarget.position.copy(origin).add(TMP);
  }

  // Expose a lit-cone query for AI. Returns true if `pos` is inside the
  // flashlight's cone and within range, and the flashlight is currently on.
  isLitBy(pos, { range = 12, cosHalfAngle = Math.cos(Math.PI / 7) } = {}) {
    if (!this.flashlightOn) return false;
    const v = new THREE.Vector3().subVectors(pos, this.camera.position);
    const d = v.length();
    if (d > range) return false;
    v.normalize();
    this.camera.getWorldDirection(TMP);
    return v.dot(TMP) > cosHalfAngle;
  }

  // ----- interact ----------------------------------------------------
  _updateInteract() {
    this.camera.getWorldDirection(TMP);
    const ray = new THREE.Raycaster(this.camera.position, TMP, 0.1, 3.2);
    const meshes = this.facility.allInteractables().map((i) => i.mesh).filter(Boolean);
    const hits = ray.intersectObjects(meshes, true);
    let aim = null;
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.interactable) o = o.parent;
      if (o?.userData.interactable?.enabled !== false) { aim = o.userData.interactable; break; }
    }
    if (aim !== this.aimingAt) {
      this.aimingAt = aim;
      this.events.emit("player:aiming", { target: aim });
    }
    if (this.input.consumedEdge("KeyE") && aim) {
      this.events.emit("player:interact", { target: aim, player: this });
    }
  }

  _emitZoneIfChanged() {
    const info = this.facility.zoneAt(this.group.position);
    if (info.zone !== this._lastZone) {
      this._lastZone = info.zone;
      this.events.emit("player:zone", info);
    }
  }

  teleportTo(v) {
    this.group.position.copy(v);
    this.yaw = this._yawTarget = 0;
    this.pitch = this._pitchTarget = 0;
  }
}
