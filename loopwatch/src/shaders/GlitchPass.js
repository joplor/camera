/**
 * GlitchPass — a small custom post-processing ShaderPass.
 *
 * Features, in one fragment shader:
 *   - chromatic aberration with radial falloff (stronger at screen edge)
 *   - horizontal band tearing that sweeps down the image
 *   - rare full-frame "pixel shift" spikes (triggered via `spike()`)
 *   - slight scanline emphasis that stacks with the CSS CRT overlay
 *
 * All intensity is driven by a single `anomaly` uniform (0..1), plus a
 * short-lived `spikeValue` that decays each frame.
 */
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const shader = {
  uniforms: {
    tDiffuse: { value: null },
    time:     { value: 0 },
    anomaly:  { value: 0 },
    spike:    { value: 0 },
    resolution: { value: [1, 1] },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float anomaly;
    uniform float spike;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Horizontal band tearing. A wavy offset whose frequency rises with anomaly.
      float bandSpeed = 0.6 + anomaly * 3.0;
      float band = sin(uv.y * (80.0 + anomaly * 160.0) + time * bandSpeed);
      float tearAmt = smoothstep(0.95, 1.0, band) * (anomaly * 0.04 + spike * 0.15);
      uv.x += tearAmt * (rand(vec2(uv.y, time)) - 0.5);

      // Radial chromatic aberration. More at the corners.
      vec2 d = uv - vec2(0.5);
      float rad = length(d);
      float ca = (0.004 + anomaly * 0.01 + spike * 0.04) * rad * 2.0;

      float r = texture2D(tDiffuse, uv + d * ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - d * ca).b;

      vec3 color = vec3(r, g, b);

      // Film grain.
      float grain = (rand(uv * (time + 1.0)) - 0.5) * (0.04 + anomaly * 0.1);
      color += grain;

      // Scanline darkening. Subtle; the CSS overlay does the rest.
      float scan = 0.9 + 0.1 * sin(uv.y * 900.0);
      color *= scan;

      // Occasional pixel shift at spike time.
      if (spike > 0.3 && rand(vec2(floor(uv.y * 40.0), time)) > 0.92) {
        color = texture2D(tDiffuse, uv + vec2(0.02 * spike, 0.0)).rgb;
      }

      // Vignette.
      float vign = smoothstep(0.9, 0.35, rad);
      color *= 0.6 + 0.4 * vign;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class GlitchPass extends ShaderPass {
  constructor() {
    super(shader);
    this._spike = 0;
  }

  spike(amount = 0.8) {
    this._spike = Math.max(this._spike, amount);
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    this.uniforms.time.value = performance.now() * 0.001;
    this.uniforms.spike.value = this._spike;
    this._spike *= 0.9;
    if (this._spike < 0.01) this._spike = 0;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
