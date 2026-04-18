/**
 * Textures — loads image_a, image_b, and alien_a with procedural fallbacks.
 *
 * Drop files into /assets to override the placeholders:
 *   - assets/image_a.png   — Subject A (stable, phosphor green eye)
 *   - assets/image_b.png   — Subject B (anomalous, torn purple)
 *   - assets/alien_a.jpg   — the full-body billboard the enemies wear
 *
 * If any of these is missing we generate something scary-enough to play
 * through. The alien fallback is a spindly silhouette with glowing eyes
 * on transparent backing.
 */
import * as THREE from "three";

export async function loadTextures({ onWarn } = {}) {
  const loader = new THREE.TextureLoader();

  const tryLoad = (url) => new Promise((resolve) => {
    loader.load(url,
      (tex) => resolve(tex),
      undefined,
      () => resolve(null),
    );
  });

  const [a, b, alien] = await Promise.all([
    tryLoad("assets/image_a.png"),
    tryLoad("assets/image_b.png"),
    tryLoad("assets/alien_a.jpg"),
  ]);

  const image_a = a ?? proceduralA();
  const image_b = b ?? proceduralB();
  const alien_a = alien ?? proceduralAlien();

  if (!a)     onWarn?.("assets/image_a.png missing — using procedural placeholder");
  if (!b)     onWarn?.("assets/image_b.png missing — using procedural placeholder");
  if (!alien) onWarn?.("assets/alien_a.jpg missing — using procedural alien silhouette");

  for (const t of [image_a, image_b, alien_a]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
  }

  return { image_a, image_b, alien_a };
}

function proceduralA() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(256, 256, 40, 256, 256, 260);
  g.addColorStop(0, "#0a281a");
  g.addColorStop(1, "#020605");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = "#9cffb2";
  ctx.lineWidth = 2;
  for (let r = 40; r < 230; r += 18) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#00130a";
  ctx.beginPath();
  ctx.arc(256, 256, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9cffb2";
  ctx.beginPath();
  ctx.arc(256, 256, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#62f7ff";
  ctx.font = "16px ui-monospace, 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SUBJECT A · STABLE", 256, 480);
  ctx.fillText("KARON-7 / C-03", 256, 62);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function proceduralB() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#0a0612";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(200,139,255,${Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
  }

  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 60 + Math.random() * 20;
    const w = 50 + Math.random() * 40;
    const y = 100 + Math.random() * 300;
    const h = 40 + Math.random() * 80;
    ctx.fillStyle = `rgba(200,139,255,${0.2 + Math.random() * 0.3})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `#c88bff`;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  ctx.strokeStyle = "#c88bff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(256 + 30, 256 - 10, 180, 100, 0.15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(256 + 40, 256 - 5, 22, 32, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c88bff";
  ctx.beginPath();
  ctx.ellipse(256 + 40, 256 - 5, 5, 9, 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c88bff";
  ctx.font = "16px ui-monospace, 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SUBJECT B · ANOMALOUS", 256, 480);
  ctx.fillText("DO NOT OBSERVE", 256, 62);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Procedural alien — spindly silhouette, glowing eyes, transparent backing.
 * Drawn at 512×1024 so it reads tall when used as the billboard.
 */
function proceduralAlien() {
  const W = 512, H = 1024;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // Transparent base. We'll only draw the silhouette.
  ctx.clearRect(0, 0, W, H);

  // Body: a gaunt, slightly-off-center silhouette. Pointy head, long limbs.
  ctx.fillStyle = "rgba(10,8,14,0.94)";
  ctx.beginPath();
  const cx = W / 2;
  // Head
  ctx.ellipse(cx, 180, 95, 130, 0, 0, Math.PI * 2);
  ctx.fill();
  // Neck
  ctx.fillRect(cx - 26, 280, 52, 80);
  // Shoulders / torso
  ctx.beginPath();
  ctx.moveTo(cx - 150, 360);
  ctx.lineTo(cx + 150, 360);
  ctx.lineTo(cx + 120, 720);
  ctx.lineTo(cx - 120, 720);
  ctx.closePath();
  ctx.fill();
  // Arms (long, thin)
  ctx.fillRect(cx - 200, 370, 30, 380);
  ctx.fillRect(cx + 170, 370, 30, 380);
  // Forearms tapering
  ctx.beginPath();
  ctx.moveTo(cx - 200, 750); ctx.lineTo(cx - 170, 750);
  ctx.lineTo(cx - 150, 900); ctx.lineTo(cx - 200, 910);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 170, 750); ctx.lineTo(cx + 200, 750);
  ctx.lineTo(cx + 200, 910); ctx.lineTo(cx + 150, 900);
  ctx.closePath(); ctx.fill();
  // Legs
  ctx.fillRect(cx - 90, 720, 60, 300);
  ctx.fillRect(cx + 30, 720, 60, 300);

  // Soft rim light so the silhouette isn't flat.
  const rim = ctx.createRadialGradient(cx, 200, 40, cx, 200, 160);
  rim.addColorStop(0, "rgba(200,139,255,0.45)");
  rim.addColorStop(1, "rgba(200,139,255,0)");
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = rim;
  ctx.fillRect(cx - 160, 60, 320, 280);
  ctx.globalCompositeOperation = "source-over";

  // Two glowing eyes. White-hot centers, purple halo.
  for (const [ex, ey] of [[cx - 32, 170], [cx + 32, 170]]) {
    const halo = ctx.createRadialGradient(ex, ey, 0, ex, ey, 40);
    halo.addColorStop(0, "rgba(255,255,255,0.95)");
    halo.addColorStop(0.25, "rgba(255,220,200,0.75)");
    halo.addColorStop(0.6, "rgba(200,139,255,0.35)");
    halo.addColorStop(1, "rgba(200,139,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ex, ey, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // A torn-edge filter: scatter dark pixels around the silhouette edge.
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * W;
    const y = 60 + Math.random() * (H - 120);
    const a = ctx.getImageData(x | 0, y | 0, 1, 1).data[3];
    if (a > 100 && Math.random() < 0.3) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x + (Math.random() * 6 - 3), y + (Math.random() * 6 - 3), 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
