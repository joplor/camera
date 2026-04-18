/**
 * buildComposer — wire up the Three.js EffectComposer with a RenderPass and
 * an UnrealBloomPass in front of the GlitchPass. The GlitchPass is added
 * later by RealityInstability so it owns its uniforms.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export function buildComposer({ renderer, scene, camera }) {
  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Subtle bloom so every emissive green strip feels like phosphor.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45,   // strength
    0.75,   // radius
    0.2,    // threshold
  );
  composer.addPass(bloom);

  window.addEventListener("resize", () => {
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  return { composer, renderPass, bloom };
}
