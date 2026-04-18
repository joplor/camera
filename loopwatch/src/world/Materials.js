/**
 * Materials — the shared palette of the facility.
 *
 * We keep materials centralized because the reality-instability system
 * animates them at runtime (tinting floors, shifting emissives, etc).
 * Sharing instances also drastically cuts draw calls.
 */
import * as THREE from "three";

export function makeMaterials() {
  const floor = new THREE.MeshStandardMaterial({
    color: 0x4a5560, roughness: 0.85, metalness: 0.05,
  });
  const floorLine = new THREE.MeshStandardMaterial({
    color: 0x2fd666, emissive: 0x0a331a, emissiveIntensity: 0.7,
    roughness: 0.4, metalness: 0.1,
  });
  const wall = new THREE.MeshStandardMaterial({
    color: 0x2c3238, roughness: 0.9, metalness: 0.0,
  });
  const wallTrim = new THREE.MeshStandardMaterial({
    color: 0x161a1e, roughness: 0.6, metalness: 0.2,
  });
  const ceiling = new THREE.MeshStandardMaterial({
    color: 0x0f1315, roughness: 1.0, metalness: 0.0,
  });
  const lightFixture = new THREE.MeshStandardMaterial({
    color: 0x111519, roughness: 0.3, metalness: 0.4,
    emissive: 0xbbffcc, emissiveIntensity: 1.2,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x3fa8b5, roughness: 0.1, metalness: 0.1,
    transmission: 0.9, transparent: true, opacity: 0.45,
    ior: 1.4, thickness: 0.2,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x4a5258, roughness: 0.35, metalness: 0.85,
  });
  const metalDark = new THREE.MeshStandardMaterial({
    color: 0x20252a, roughness: 0.45, metalness: 0.7,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x0d0f10, roughness: 0.95, metalness: 0.0,
  });
  const screen = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0x2dd676, emissiveIntensity: 0.8,
    roughness: 0.2, metalness: 0.1,
  });
  const door = new THREE.MeshStandardMaterial({
    color: 0x30383e, roughness: 0.5, metalness: 0.5,
    emissive: 0x120808, emissiveIntensity: 0.0,
  });
  const terminalBody = new THREE.MeshStandardMaterial({
    color: 0x1d2226, roughness: 0.5, metalness: 0.6,
  });
  const interactGlow = new THREE.MeshStandardMaterial({
    color: 0x9cffb2, emissive: 0x9cffb2, emissiveIntensity: 1.0,
    roughness: 0.3, metalness: 0.1,
  });
  const anomalyMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xc88bff, emissiveIntensity: 1.5,
    roughness: 0.1, metalness: 0.0,
  });
  const npcBody = new THREE.MeshStandardMaterial({
    color: 0xcfd8dc, roughness: 0.7, metalness: 0.0,
  });
  const npcHead = new THREE.MeshStandardMaterial({
    color: 0xf1d4b6, roughness: 0.8, metalness: 0.0,
  });
  const npcLimb = new THREE.MeshStandardMaterial({
    color: 0xb5bcc1, roughness: 0.8, metalness: 0.0,
  });
  const player = new THREE.MeshStandardMaterial({
    color: 0x6cd1ff, emissive: 0x0a2233, emissiveIntensity: 0.4,
    roughness: 0.45, metalness: 0.2,
  });

  return {
    floor, floorLine, wall, wallTrim, ceiling, lightFixture, glass,
    metal, metalDark, rubber, screen, door, terminalBody, interactGlow,
    anomalyMat, npcBody, npcHead, npcLimb, player,
  };
}
