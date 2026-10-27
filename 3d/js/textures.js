/* textures.js — procedural textures (asphalt, windows, particles, decals, signs).
   Everything is drawn on canvas so the game has no binary art dependencies. */

import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texOf(c, colorSpace) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (colorSpace) t.colorSpace = colorSpace;
  t.needsUpdate = true;
  return t;
}

function noise(ctx, w, h, paint) {
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) paint(img.data, i * 4, i, w);
  ctx.putImageData(img, 0, 0);
}

export function makeSoftDot() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeStreak() {
  const c = canvas(16, 64);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(4, 0, 8, 64);
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Facade: mid-gray wall, dark window holes. Emissive map lights a subset. */
export function makeFacade() {
  const w = 64, h = 128;
  const color = canvas(w, h);
  const emis = canvas(w, h);
  const gc = color.getContext('2d');
  const ge = emis.getContext('2d');
  gc.fillStyle = '#8d97a8';
  gc.fillRect(0, 0, w, h);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, w, h);
  const floors = 8;
  const cols = 2;
  for (let fy = 0; fy < floors; fy++) {
    for (let fx = 0; fx < cols; fx++) {
      const x = 8 + fx * 28;
      const y = 6 + fy * 16;
      gc.fillStyle = '#1a2030';
      gc.fillRect(x, y, 16, 10);
      const lit = ((fx * 3 + fy * 5) % 7) > 2;
      if (lit) {
        const warm = (fx + fy) % 3 === 0;
        ge.fillStyle = warm ? '#ffd39a' : '#9ad8ff';
        ge.fillRect(x + 1, y + 1, 14, 8);
        gc.fillStyle = warm ? '#c9b48a' : '#8aa4b8';
        gc.fillRect(x + 1, y + 1, 14, 8);
      }
    }
  }
  const map = texOf(color, THREE.SRGBColorSpace);
  const emissiveMap = texOf(emis, THREE.SRGBColorSpace);
  return { map, emissiveMap };
}

export function makeAsphalt() {
  const w = 256, h = 256;
  const color = canvas(w, h);
  const roughDry = canvas(w, h);
  const roughWet = canvas(w, h);
  const height = canvas(w, h);
  const gc = color.getContext('2d');
  const gd = roughDry.getContext('2d');
  const gw = roughWet.getContext('2d');
  const gh = height.getContext('2d');
  noise(gc, w, h, (d, p) => {
    const n = 58 + Math.random() * 22;
    d[p] = n + 8; d[p + 1] = n + 8; d[p + 2] = n + 10; d[p + 3] = 255;
  });
  noise(gd, w, h, (d, p) => {
    const n = 200 + Math.random() * 40;
    d[p] = d[p + 1] = d[p + 2] = n; d[p + 3] = 255;
  });
  // Wet roughness: dark = smooth puddle, light = rough asphalt.
  const wetImg = gw.createImageData(w, h);
  const hImg = gh.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v = 150 + Math.random() * 40;
      const puddle = Math.sin(x * 0.05) * Math.sin(y * 0.04) + Math.sin(x * 0.11 + y * 0.07);
      if (puddle > 0.55) v = 18 + Math.random() * 20;
      else if (puddle > 0.2) v = 70;
      wetImg.data[i] = wetImg.data[i + 1] = wetImg.data[i + 2] = v;
      wetImg.data[i + 3] = 255;
      const grain = 128 + (Math.random() - 0.5) * 40 + (puddle > 0.55 ? 30 : 0);
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = grain;
      hImg.data[i + 3] = 255;
    }
  }
  gw.putImageData(wetImg, 0, 0);
  gh.putImageData(hImg, 0, 0);
  // Lane-free asphalt; markings are separate meshes so they stay sharp.
  gc.strokeStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 30; i++) {
    gc.beginPath();
    gc.moveTo(Math.random() * w, Math.random() * h);
    gc.lineTo(Math.random() * w, Math.random() * h);
    gc.stroke();
  }
  return {
    map: texOf(color, THREE.SRGBColorSpace),
    roughDry: texOf(roughDry),
    roughWet: texOf(roughWet),
    normal: heightToNormal(hImg, w, h, 2.2)
  };
}

function heightToNormal(img, w, h, strength) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const out = g.createImageData(w, h);
  const sample = (x, y) => {
    x = (x + w) % w; y = (y + h) % h;
    return img.data[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength;
      const i = (y * w + x) * 4;
      const nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      out.data[i] = (nx / len * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return texOf(c);
}

export function makeDecalTexture(kind) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  if (kind === 'stripes') {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillRect(0, 70, 256, 28);
    g.fillStyle = 'rgba(255,40,80,0.95)';
    g.fillRect(0, 104, 256, 18);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillRect(0, 128, 256, 28);
  } else if (kind === 'number') {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.font = 'bold 160px Trebuchet MS, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('07', 128, 136);
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.strokeText('07', 128, 136);
  } else if (kind === 'lightning') {
    g.strokeStyle = '#ffe03b';
    g.lineWidth = 18;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(40, 30);
    g.lineTo(150, 30);
    g.lineTo(100, 120);
    g.lineTo(190, 120);
    g.lineTo(70, 230);
    g.lineTo(110, 140);
    g.lineTo(50, 140);
    g.closePath();
    g.stroke();
  } else if (kind === 'chevron') {
    g.fillStyle = 'rgba(46,230,255,0.95)';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(20 + i * 60, 40);
      g.lineTo(70 + i * 60, 128);
      g.lineTo(20 + i * 60, 216);
      g.lineTo(0 + i * 60, 216);
      g.lineTo(40 + i * 60, 128);
      g.lineTo(0 + i * 60, 40);
      g.fill();
    }
  } else {
    return null;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSignTexture(text, color) {
  const c = canvas(512, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(4,2,12,0.72)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = color;
  g.font = 'bold 58px Trebuchet MS, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 16;
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeNameSprite(text, color) {
  const c = canvas(256, 64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(8, 8, 240, 48);
  g.fillStyle = color || '#fff';
  g.font = 'bold 28px Trebuchet MS, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(3.4, 0.85, 1);
  s.position.y = 2.35;
  return s;
}
