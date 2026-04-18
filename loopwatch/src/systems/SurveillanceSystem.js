/**
 * SurveillanceSystem — player-facing CCTV.
 *
 * When the player opens the CCTV grid (Tab), we:
 *   1. Render the 3D scene from a CCTV slot's viewpoint into an off-screen
 *      target and blit to the HTML overlay's canvas.
 *   2. Optionally composite an "anomaly frame" — some cameras lie. They
 *      show image_b where there is nothing, or show the player in rooms
 *      they're not standing in.
 *   3. Track which cameras the player has observed and for how long.
 *
 * The rendering detail is kept in a dedicated off-screen canvas so the HUD
 * can receive a copy cheaply and so the main viewport is untouched while
 * the player browses feeds.
 */
import * as THREE from "three";

export class SurveillanceSystem {
  constructor({ renderer, scene, facility, events, textures, anomaly }) {
    this.renderer = renderer;
    this.scene = scene;
    this.facility = facility;
    this.events = events;
    this.textures = textures;
    this.anomaly = anomaly;  // used to decide when feeds corrupt

    this.cams = facility.allCamSlots();
    this.active = 0;
    this.opened = false;

    // Internal camera used for CCTV rendering.
    this.virtualCam = new THREE.PerspectiveCamera(72, 4/3, 0.1, 100);

    // A canvas we draw CCTV frames into. The UI layer places this in DOM.
    this.canvas = document.createElement("canvas");
    this.canvas.width = 960; this.canvas.height = 540;
    this.canvas.className = "cctv-canvas";
    Object.assign(this.canvas.style, {
      position: "absolute", inset: "0",
      width: "100%", height: "100%",
      display: "block", background: "#000",
      imageRendering: "pixelated",
    });
    this.ctx = this.canvas.getContext("2d");

    this._rt = new THREE.WebGLRenderTarget(
      this.canvas.width, this.canvas.height,
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter },
    );

    events.on("loop:reset", () => {
      for (const c of this.cams) c.corrupted = false;
      this._decorrupt();
    });
    events.on("loop:tick", (e) => this._maybeCorrupt(e));
  }

  open() { this.opened = true; }
  close() { this.opened = false; }
  setActive(i) {
    if (i < 0 || i >= this.cams.length) return;
    this.active = i;
    this.events.emit("cctv:switch", { index: i, cam: this.cams[i] });
  }

  /** Advance: every so often a feed becomes "corrupted" when anomaly is high. */
  _maybeCorrupt({ anomaly }) {
    if (anomaly < 0.3) return;
    if (Math.random() > 0.003) return;
    const cam = this.cams[Math.floor(Math.random() * this.cams.length)];
    if (!cam || cam.corrupted) return;
    cam.corrupted = true;
    cam.noteText = "SIGNAL DEGRADED";
    this.events.emit("cctv:corrupted", { cam });
  }
  _decorrupt() {
    for (const c of this.cams) { c.corrupted = false; c.noteText = "—"; }
  }

  /** Render one CCTV frame into the canvas. Called each frame when open. */
  renderFrame() {
    if (!this.opened) return;
    const cam = this.cams[this.active];
    if (!cam) return;

    this.virtualCam.position.copy(cam.position);
    this.virtualCam.lookAt(cam.look);

    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this._rt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.virtualCam);
    this.renderer.setRenderTarget(prev);

    // Read pixels via WebGL, then upload to a temp canvas via ImageData.
    // For simplicity / compat we actually render the scene again to the main
    // renderer backbuffer? No — instead, read RT into a typed array and
    // draw it to our 2D canvas.
    const w = this._rt.width, h = this._rt.height;
    const pixels = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this._rt, 0, 0, w, h, pixels);

    // Flip Y into the 2D canvas.
    const img = this.ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      const dst = y * w * 4;
      img.data.set(pixels.subarray(src, src + w * 4), dst);
    }
    this.ctx.putImageData(img, 0, 0);

    this._overlay(cam);
  }

  _overlay(cam) {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;

    // Timecode, cam label, and recording dot.
    c.save();
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.fillRect(0, h - 32, w, 32);
    c.font = "16px 'IBM Plex Mono', monospace";
    c.fillStyle = "#9cffb2";
    c.fillText(cam.name, 12, h - 10);
    const tc = new Date().toISOString().substring(11, 19);
    c.textAlign = "right";
    c.fillText(tc, w - 12, h - 10);

    // Scan line.
    const sy = (performance.now() * 0.15) % h;
    c.fillStyle = "rgba(156,255,178,0.08)";
    c.fillRect(0, sy, w, 2);

    // Corner brackets.
    c.strokeStyle = "#9cffb2";
    c.lineWidth = 2;
    const br = 14;
    c.beginPath();
    c.moveTo(8, 8 + br);        c.lineTo(8, 8);        c.lineTo(8 + br, 8);
    c.moveTo(w - 8 - br, 8);    c.lineTo(w - 8, 8);    c.lineTo(w - 8, 8 + br);
    c.moveTo(8, h - 40 - br);   c.lineTo(8, h - 40);   c.lineTo(8 + br, h - 40);
    c.moveTo(w - 8 - br, h-40); c.lineTo(w - 8, h-40); c.lineTo(w - 8, h - 40 - br);
    c.stroke();

    // Corrupted feed: add tear lines and a ghost of image_b.
    if (cam.corrupted) {
      for (let i = 0; i < 6; i++) {
        const y = Math.floor(Math.random() * h);
        c.fillStyle = "rgba(200,139,255,0.3)";
        c.fillRect(0, y, w, 1 + Math.random() * 3);
      }
      const tex = this.textures?.image_b;
      if (tex?.image) {
        c.globalAlpha = 0.35 + 0.2 * Math.sin(performance.now() * 0.002);
        c.drawImage(tex.image, Math.random() * (w - 200), 40, 200, 200);
        c.globalAlpha = 1;
      }
      c.fillStyle = "#c88bff";
      c.fillText("SIGNAL INTEGRITY: COMPROMISED", 12, h - 48);
    }

    c.restore();
  }

  meta() {
    const cam = this.cams[this.active];
    return {
      name: cam?.name ?? "—",
      distortion: cam?.corrupted ? "1.00" : (Math.random() * 0.12).toFixed(2),
      signal: cam?.corrupted ? "0.25" : (0.75 + Math.random() * 0.2).toFixed(2),
      note: cam?.noteText ?? "—",
    };
  }
}
