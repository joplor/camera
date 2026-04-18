/**
 * Alien — a hostile entity rendered as a single full-body billboard sprite.
 *
 * The design call is simple and deliberately uncanny: the alien is a
 * flat image that follows you around. It never rotates out of plane, it
 * never animates, and when it's close its image eats more of the screen
 * every frame you keep staring. The only way to make it retreat is to
 * point the flashlight at it; looking away and back often finds it
 * closer than it should be.
 *
 * This file is visuals + state. Steering lives in AIBehaviorSystem.
 */
import * as THREE from "three";

export class Alien {
  constructor({ scene, texture, id, baseScale = 2.2 }) {
    this.id = id;
    this.mat = new THREE.SpriteMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(baseScale, baseScale * 1.35, 1);
    this.sprite.renderOrder = 50;
    this.sprite.visible = false;
    scene.add(this.sprite);

    this.position = new THREE.Vector3();
    this.baseScale = baseScale;

    // Finite state automaton. STALKING / CHASING / STUNNED / HIDING.
    this.state = "HIDING";
    this.stateTime = 0;

    // Chase speed. Walk-pace by default; faster when chasing at high anomaly.
    this.speed = 1.6;
    this.chaseSpeed = 3.6;

    // Stun timer — set when the flashlight hits this alien.
    this.stunTimer = 0;

    // Seen-this-frame and last-angle-from-player, used by teleport logic.
    this.lastSeen = 0;
  }

  setPosition(v) {
    this.position.copy(v);
    this.sprite.position.copy(v);
  }

  setVisible(b) { this.sprite.visible = b; }

  /** Pulse the sprite subtly — a heartbeat-style scale wobble. */
  pulse(t, amount) {
    const k = 1 + Math.sin(t * 6) * 0.02 * amount;
    this.sprite.scale.set(this.baseScale * k, this.baseScale * 1.35 * k, 1);
  }

  /** Bright overlay tint while the flashlight is on us. */
  lightHit(dt) {
    this.mat.color.lerp(new THREE.Color(0xffddcc), Math.min(1, dt * 4));
  }
  unlight(dt) {
    this.mat.color.lerp(new THREE.Color(0xffffff), Math.min(1, dt * 2));
  }

  dispose(scene) {
    scene.remove(this.sprite);
    this.mat.dispose();
  }
}
