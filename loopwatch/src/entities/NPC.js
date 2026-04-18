/**
 * NPC — a scientist in Karon-7.
 *
 * Each NPC follows a schedule owned by AIBehaviorSystem. This class only
 * handles visual + animation concerns: a simple stylized body (capsule +
 * sphere head), head-bob, footstep tick, and a dim glow when disturbed.
 *
 * NPCs are deliberately low-fidelity. The game is about the *system*, not
 * the characters, and over-rendered NPCs would fight the atmosphere.
 */
import * as THREE from "three";

export class NPC {
  constructor({ scene, materials, id, name, color }) {
    this.id = id;
    this.name = name;
    this.group = new THREE.Group();
    this.group.name = `NPC:${id}`;

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 1.1, 4, 10),
      materials.npcBody.clone(),
    );
    body.material.color = new THREE.Color(color ?? 0xcfd8dc);
    body.position.y = 0.9;
    body.castShadow = true;
    this.group.add(body);
    this.body = body;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 10),
      materials.npcHead.clone(),
    );
    head.position.y = 1.65;
    this.group.add(head);
    this.head = head;

    // A dim fresnel-ish glow around scientists. Subtle.
    const aura = new THREE.PointLight(0xffeacc, 0.0, 2);
    aura.position.y = 1.4;
    this.group.add(aura);
    this.aura = aura;

    scene.add(this.group);

    // Animation phase for head-bob.
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 0;

    // Visible "busy" indicator when at a work station.
    this.state = "idle";  // idle | walking | working | reacting
    this.statePayload = null;
  }

  setPosition(v) {
    this.group.position.copy(v);
  }
  setHeading(yaw) {
    this.group.rotation.y = yaw;
  }
  setState(state, payload = null) {
    this.state = state;
    this.statePayload = payload;
    // Aura brightens when reacting to anomalies.
    this.aura.intensity = state === "reacting" ? 1.2 : 0.0;
  }

  update(dt) {
    this.phase += dt * (2 + this.speed * 6);
    if (this.speed > 0.01) {
      this.head.position.y = 1.65 + Math.sin(this.phase * 2) * 0.03;
      this.body.position.y = 0.9 + Math.sin(this.phase * 2) * 0.02;
    } else if (this.state === "working") {
      // Subtle typing / turning.
      this.head.rotation.y = Math.sin(performance.now() * 0.002) * 0.2;
    } else {
      this.head.rotation.y *= 0.95;
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose?.();
      }
    });
  }
}
