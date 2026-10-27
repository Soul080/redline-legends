/* renderer.js — WebGL setup, PBR lighting, shadow map that follows the car,
   a procedural sky, PMREM environment probes (day / dusk / night), bloom and a
   speed-based radial motion blur. Quality presets turn features off so a mid
   laptop can hold 60fps: low skips the composer entirely. */

import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { settings } from './settings.js';
import { damp } from './util.js';

const MotionBlurShader = {
  name: 'SpeedBlur',
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      if (uAmount < 0.0008) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 dir = c * uAmount * smoothstep(0.0, 0.75, d);
      vec4 col = texture2D(tDiffuse, vUv) * 0.40;
      col += texture2D(tDiffuse, vUv + dir) * 0.18;
      col += texture2D(tDiffuse, vUv - dir) * 0.18;
      col += texture2D(tDiffuse, vUv + dir * 2.0) * 0.12;
      col += texture2D(tDiffuse, vUv - dir * 2.0) * 0.12;
      gl_FragColor = col;
    }
  `
};

const SKY_VERT = `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const SKY_FRAG = `
  varying vec3 vWorld;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform vec3 uSunColor;
  uniform float uElev;
  uniform float uStars;
  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float h = dir.y;
    float skyT = smoothstep(-0.02, 0.55, h);
    vec3 col = mix(uHorizon, uTop, skyT);
    col = mix(uGround, col, smoothstep(-0.25, 0.08, h));
    float sun = pow(max(dot(dir, normalize(uSun)), 0.0), 1400.0);
    float glow = pow(max(dot(dir, normalize(uSun)), 0.0), 8.0);
    col += uSunColor * (sun * 2.2 + glow * 0.35);
    float stars = 0.0;
    vec3 cell = floor(dir * 90.0);
    float n = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    if (n > 0.985 && h > 0.0) stars = smoothstep(0.985, 1.0, n);
    col += stars * uStars;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const gfx = {
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  bloom: null,
  motion: null,
  sun: null,
  hemi: null,
  ambient: null,
  skyMat: null,
  sky: null,
  world: null,
  usePost: true,
  night: 0,
  sunElev: 1,
  focus: new THREE.Vector3(),
  shake: 0,
  blurAmount: 0,
  view: 'third',
  pip: false,
  env: {},
  pmrem: null,
  readyEnv: false,
  lampLights: [],

  init(parent) {
    const renderer = this._createRenderer();
    if (!renderer || !renderer.getContext()) {
      throw new Error('WebGL unavailable. This build draws with WebGL (SwiftShader works); it does not use WebGPU.');
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x07060f, 1);
    parent.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x9bb4c8, 0.0045);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, 1, 0.12, 2500);
    camera.position.set(0, 40, 80);
    this.camera = camera;
    this._pipCam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2500);
    this._pipTarget = new THREE.WebGLRenderTarget(384, 216);
    this._hudScene = new THREE.Scene();
    this._hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2);
    this._hudCam.position.z = 1;
    this._pipQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this._pipTarget.texture, depthTest: false, depthWrite: false })
    );
    this._pipQuad.frustumCulled = false;
    this._pipQuad.visible = false;
    this._hudScene.add(this._pipQuad);

    const hemi = new THREE.HemisphereLight(0xc5d4ee, 0x3a332c, 0.72);
    scene.add(hemi);
    this.hemi = hemi;
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(ambient);
    this.ambient = ambient;

    const sun = new THREE.DirectionalLight(0xfff2dd, 2.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 8;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55;
    sun.shadow.camera.bottom = -55;
    sun.shadow.bias = -0.0016;
    sun.shadow.normalBias = 0.11;
    scene.add(sun, sun.target);
    this.sun = sun;

    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uElev: { value: 1 },
        uStars: { value: 0 }
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 16), skyMat);
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;
    this.skyMat = skyMat;

    this.world = new THREE.Group();
    scene.add(this.world);

    for (let i = 0; i < 6; i++) {
      const l = new THREE.SpotLight(0xffe6b0, 0, 22, 0.7, 0.6, 1.5);
      l.castShadow = false;
      scene.add(l, l.target);
      this.lampLights.push(l);
    }

    try { this._buildComposer(); }
    catch (err) {
      console.warn('Post-processing unavailable, drawing the scene directly.', err);
      this.composer = null;
      this.usePost = false;
    }
    const canvas = renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.usePost = false;
      this.composer = null;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
    });
    this.applyQuality(settings.data.quality);
    this.setAtmosphere({ time: 0.78, weather: 'clear', theme: 'city' });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Probes are baked after the first frame so a slow GPU still shows something.
    setTimeout(() => this.bakeEnvironments(), 40);
  },

  _createRenderer() {
    const attempts = [
      { antialias: true, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: false },
      { antialias: false, powerPreference: 'default', alpha: false, preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: false }
    ];
    let last = null;
    for (const opt of attempts) {
      try {
        const renderer = new THREE.WebGLRenderer(opt);
        const gl = renderer.getContext();
        if (gl && !gl.isContextLost()) return renderer;
        renderer.dispose();
      } catch (err) { last = err; }
    }
    if (last) console.warn(last);
    return null;
  },

  _buildComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.42, 0.86);
    composer.addPass(bloom);
    const motion = new ShaderPass(MotionBlurShader);
    composer.addPass(motion);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.bloom = bloom;
    this.motion = motion;
  },

  applyQuality(id) {
    const q = settings.quality();
    const pr = Math.min(q.pixelRatio, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.sun.shadow.map = null;
    }
    this.usePost = q.bloom || (q.motionBlur && settings.data.motionBlur);
    this.resize();
  },

  /** Software GL (SwiftShader) can spend most of a second on bloom and shadows.
      After a few slow frames, draw the scene directly so the sim stays playable.
      The saved quality preset is left alone. */
  noteFrame(dt) {
    if (this._eased || !(dt > 0.12)) {
      if (dt < 0.05) this._slowFrames = 0;
      return;
    }
    this._slowFrames = (this._slowFrames || 0) + 1;
    if (this._slowFrames < 4) return;
    this._eased = true;
    this.usePost = false;
    this.renderer.shadowMap.enabled = false;
    if (this.sun) this.sun.castShadow = false;
    this.renderer.setPixelRatio(Math.min(0.75, this.renderer.getPixelRatio()));
    this.resize();
  },

  resize() {
    const w = Math.max(2, window.innerWidth);
    const h = Math.max(2, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
  },

  /** time 0 midnight … 0.5 noon. theme tints desert / snow / neon. */
  setAtmosphere({ time, weather, theme }) {
    const elev = -Math.cos(time * Math.PI * 2);
    this.sunElev = elev;
    this.night = THREE.MathUtils.clamp(1 - THREE.MathUtils.smoothstep(elev, -0.05, 0.35), 0, 1);
    const sunset = THREE.MathUtils.clamp(1 - Math.abs(elev) / 0.28, 0, 1) * (elev > -0.15 ? 1 : 0);
    const u = this.skyMat.uniforms;
    const top = new THREE.Color().setHex(0x16324a).lerp(new THREE.Color(0x8ec6f5), THREE.MathUtils.clamp(elev, 0, 1));
    const hor = new THREE.Color().setHex(0x241428).lerp(new THREE.Color(0xf2c9a2), THREE.MathUtils.clamp(elev + 0.2, 0, 1));
    hor.lerp(new THREE.Color(0xff7a3a), sunset * 0.85);
    const ground = new THREE.Color(0x100c12).lerp(new THREE.Color(0x8d7a68), THREE.MathUtils.clamp(elev, 0, 1));
    if (theme === 'desert') {
      top.lerp(new THREE.Color(0x7eb0e8), 0.45);
      hor.lerp(new THREE.Color(0xe7b07a), 0.7);
      ground.set(0xc4a06a);
    } else if (theme === 'snow') {
      top.lerp(new THREE.Color(0xd5e6f5), 0.7);
      hor.lerp(new THREE.Color(0xeef3f8), 0.75);
      ground.set(0xd5dee8);
    } else if (theme === 'neon') {
      top.set(0x070014);
      hor.set(0x3a0a4a);
      ground.set(0x100814);
      this.night = Math.max(this.night, 0.85);
    }
    if (weather === 'rain') { top.multiplyScalar(0.55); hor.multiplyScalar(0.6); }
    if (weather === 'dust') { hor.lerp(new THREE.Color(0xd2b48a), 0.6); top.lerp(new THREE.Color(0xc4a574), 0.4); }
    u.uTop.value.copy(top);
    u.uHorizon.value.copy(hor);
    u.uGround.value.copy(ground);
    const az = time * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(az) * 0.7, Math.max(-0.15, elev), Math.sin(az) * 0.45).normalize();
    if (elev < 0.02) sunDir.set(-0.4, 0.35, 0.5).normalize();
    u.uSun.value.copy(sunDir);
    u.uSunColor.value.set(theme === 'neon' ? 0x88ccff : 0xfff1d4).lerp(new THREE.Color(0xff8844), sunset);
    u.uElev.value = elev;
    u.uStars.value = this.night * (weather === 'rain' || weather === 'dust' ? 0.15 : 1);

    const day = 1 - this.night;
    this.sun.color.set(elev < 0.02 ? 0xb9c8e6 : 0xfff2dd).lerp(new THREE.Color(0xffaa77), sunset * 0.5);
    this.sun.intensity = elev < 0.02 ? 0.42 : 0.35 + day * 2.7;
    this.hemi.color.set(0xc5d4ee).lerp(new THREE.Color(0x1c2840), this.night);
    this.hemi.groundColor.set(0x3a332c).lerp(new THREE.Color(0x140810), this.night);
    this.hemi.intensity = 0.28 + day * 0.5;
    this.ambient.intensity = 0.08 + this.night * 0.12;
    this.renderer.toneMappingExposure = 1.02 + sunset * 0.06 - (weather === 'rain' ? 0.06 : 0);

    const fogCol = hor.clone().lerp(ground, 0.45);
    if (theme === 'neon') fogCol.set(0x14081c);
    this.scene.fog.color.copy(fogCol);
    let dens = 0.0038 + this.night * 0.0022;
    if (weather === 'rain') dens += 0.0025;
    if (weather === 'snow') dens += 0.0015;
    if (weather === 'dust') dens += 0.004;
    if (theme === 'neon') dens = 0.0065;
    this.scene.fog.density = dens;

    this._sunDir = sunDir;
    this._phase = elev > 0.35 ? 'day' : elev > -0.05 ? 'dusk' : 'night';
    if (this.env[this._phase]) this.scene.environment = this.env[this._phase];
    this.scene.environmentIntensity = 0.55 + day * 0.7;

    if (this.bloom) {
      this.bloom.strength = (this.night > 0.4 ? 0.62 : 0.28) * (settings.quality().bloom ? 1 : 0);
      this.bloom.threshold = this.night > 0.4 ? 0.72 : 0.88;
    }
  },

  bakeEnvironments() {
    if (this.readyEnv) return;
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      for (const phase of ['day', 'dusk', 'night']) {
        const sc = new THREE.Scene();
        const sky = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), this.skyMat);
        sc.add(sky);
        // Colored blocks so wet roads and car clearcoat pick up neon, not just a flat sky.
        const cols = phase === 'night' ? [0xff2ef0, 0x2ee6ff, 0xff8a2e, 0x7d5cff] : phase === 'dusk' ? [0xff8844, 0xff2ef0, 0x224466] : [0xffffff, 0x88aacc, 0x445566];
        cols.forEach((c, i) => {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(4, 6, 4),
            new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: phase === 'day' ? 0.15 : 2.2, roughness: 0.4 })
          );
          const a = (i / cols.length) * Math.PI * 2;
          m.position.set(Math.cos(a) * 8, 2, Math.sin(a) * 8);
          sc.add(m);
        });
        const ground = new THREE.Mesh(
          new THREE.CircleGeometry(30, 12),
          new THREE.MeshStandardMaterial({ color: phase === 'night' ? 0x101018 : 0x889098, roughness: 0.8 })
        );
        ground.rotation.x = -Math.PI / 2;
        sc.add(ground);
        const prev = this._phase;
        this.setAtmosphere({ time: phase === 'day' ? 0.5 : phase === 'dusk' ? 0.78 : 0.04, weather: 'clear', theme: 'city' });
        const rt = pmrem.fromScene(sc, 0.04, 0.1, 40);
        this.env[phase] = rt.texture;
        sc.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o !== sky) o.material.dispose(); });
        this._phase = prev;
      }
      pmrem.dispose();
      this.readyEnv = true;
      if (this.env[this._phase]) this.scene.environment = this.env[this._phase];
    } catch (e) {
      this.readyEnv = true;
    }
  },

  /** Move the shadow frustum and the nearest street lamps with the car. */
  follow(target, night, lampPositions) {
    this.focus.copy(target);
    this.sky.position.set(target.x, 0, target.z);
    const dir = this._sunDir || new THREE.Vector3(0.4, 0.8, 0.2);
    this.sun.position.set(target.x + dir.x * 70, Math.max(18, dir.y * 70), target.z + dir.z * 70);
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.target.updateMatrixWorld();
    const q = settings.quality();
    const n = Math.min(q.lamps, this.lampLights.length);
    for (let i = 0; i < this.lampLights.length; i++) this.lampLights[i].intensity *= 0.72;
    if (!lampPositions || n === 0 || night < 0.35) return;
    const ranked = lampPositions
      .map((p) => ({ p, d: (p.x - target.x) ** 2 + (p.z - target.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < n && i < ranked.length; i++) {
      if (ranked[i].d > 70 * 70) break;
      const l = this.lampLights[i];
      const p = ranked[i].p;
      l.intensity += (18 - l.intensity) * 0.35;
      l.position.set(p.x, 7.2, p.z);
      l.target.position.set(p.x, 0, p.z + 0.01);
    }
  },

  setBlur(speedMs) {
    const allow = this.usePost && settings.quality().motionBlur && settings.data.motionBlur;
    const amount = allow ? Math.min(0.02, Math.max(0, speedMs - 18) * 0.00028) : 0;
    this.blurAmount = amount;
    if (this.motion) this.motion.uniforms.uAmount.value = amount;
  },

  render() {
    if (!this.renderer || this.contextLost) return;
    if (this.shake > 0.01 && settings.data.shake) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake *= this.shake > 0.45 ? 0.93 : 0.86;
    } else this.shake = 0;
    try {
      if (this.view === 'second' && this._pipCam) this._renderSecond();
      else if (this.usePost && this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    } catch (err) {
      this.usePost = false;
      this.composer = null;
      try { this.renderer.render(this.scene, this.camera); }
      catch (err2) { console.warn('WebGL frame failed', err2 || err); }
    }
  },

  _renderSecond() {
    const r = this.renderer;
    const size = new THREE.Vector2();
    r.getSize(size);
    r.setRenderTarget(this._pipTarget);
    r.clear();
    r.render(this.scene, this._pipCam);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
    const pw = Math.max(96, Math.round(size.x * 0.28));
    const ph = Math.max(72, Math.round(size.y * 0.22));
    this._hudCam.left = 0;
    this._hudCam.right = size.x;
    this._hudCam.top = size.y;
    this._hudCam.bottom = 0;
    this._hudCam.updateProjectionMatrix();
    this._pipQuad.scale.set(pw, ph, 1);
    // Right side, clear of the top HUD and the bottom speedo.
    const pipY = Math.max(ph / 2 + 150, Math.min(size.y * 0.42, size.y - ph / 2 - 150));
    this._pipQuad.position.set(size.x - pw / 2 - 108, pipY, 0);
    this._pipQuad.visible = true;
    r.autoClear = false;
    r.render(this._hudScene, this._hudCam);
    r.autoClear = true;
    this.pip = true;
  },

  cycle() {
    const order = ['third', 'first', 'second', 'top'];
    const i = order.indexOf(this.view);
    this.view = order[(i + 1) % order.length];
    this.pip = this.view === 'second';
    if (this._pipQuad && this.view !== 'second') this._pipQuad.visible = false;
    return this.view;
  },

  frame(car, dt, extraBack, clipQuery) {
    if (!car) return;
    this._clipQuery = clipQuery || null;
    this.camera.up.set(0, 1, 0);
    const onFoot = !!car.onFoot;
    if (car.mesh) car.mesh.visible = !(this.view === 'first' && onFoot);
    if (this.view === 'first') this.firstPerson(car, dt);
    else if (this.view === 'second') this.secondPerson(car, dt);
    else if (this.view === 'top') this.topDown(car, dt);
    else this.chase(car, dt, extraBack);
    this.pip = this.view === 'second';
  },

  /** Tallest solid roof covering this point, or 0 when the air is clear. */
  _roof(x, z) {
    if (!this._clipQuery) return 0;
    let roof = 0;
    const boxes = this._clipQuery(x, z, 1.6);
    for (const b of boxes) {
      if (!b || b.prop || b.dead) continue;
      if (x < b.minX - 0.5 || x > b.maxX + 0.5 || z < b.minZ - 0.5 || z > b.maxZ + 0.5) continue;
      const top = b.top == null ? 48 : b.top;
      if (top > roof) roof = top;
    }
    return roof;
  },

  /**
   * Overhead follow cam. North-up keeps +Z at the top of the screen.
   * Car-up turns with the car so its nose points up. The camera sits above
   * any roof it would otherwise enter.
   */
  topDown(car, dt) {
    const h = car.h || 0;
    const gy = car.y || 0;
    const north = !(settings.data && settings.data.topNorth === false);
    const fx = Math.sin(h), fz = Math.cos(h);
    const back = north ? 0 : 2.2;
    const tx = car.x - fx * back;
    const tz = car.z - fz * back;
    let roof = this._roof(tx, tz);
    roof = Math.max(roof, this._roof(car.x, car.z));
    const ty = gy + Math.max(26, roof + 10);
    const cam = this.camera;
    const k = 1 - Math.exp(-7 * Math.max(0.001, dt));
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.z += (tz - cam.position.z) * k;
    if (cam.position.y < ty - 0.3) cam.position.y = ty;
    else cam.position.y += (ty - cam.position.y) * k;
    cam.up.set(north ? 0 : fx, 0, north ? 1 : fz);
    cam.lookAt(car.x, gy + 0.4, car.z);
    if (Math.abs(cam.fov - 48) > 0.05) {
      cam.fov = damp(cam.fov, 48, 6, dt);
      cam.updateProjectionMatrix();
    }
    if (Math.abs(cam.near - 0.4) > 0.01) {
      cam.near = 0.4;
      cam.updateProjectionMatrix();
    }
    this.setBlur(0);
  },

  /** Pull a camera back along the view ray so it stays outside building volumes. */
  _clearCam(ax, ay, az, bx, by, bz, minDist) {
    if (!this._clipQuery) return { x: bx, y: by, z: bz };
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.2) return { x: bx, y: by, z: bz };
    const steps = Math.max(4, Math.ceil(len / 0.45));
    let ox = ax, oy = Math.max(ay, 0.6), oz = az;
    const rad = 0.35;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
      if (y < 0.4) break;
      const boxes = this._clipQuery(x, z, rad + 0.3);
      let blocked = false;
      for (const b of boxes) {
        if (!b || b.prop || b.dead) continue;
        if (y > (b.top == null ? 48 : b.top) + 0.2) continue;
        if (x >= b.minX - rad && x <= b.maxX + rad && z >= b.minZ - rad && z <= b.maxZ + rad) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      ox = x; oy = y; oz = z;
    }
    const kept = Math.hypot(ox - ax, oy - ay, oz - az);
    if (kept < (minDist || 0) && len > (minDist || 0)) {
      const t = (minDist || 0) / len;
      const mx = ax + dx * t, my = ay + dy * t, mz = az + dz * t;
      const boxes = this._clipQuery(mx, mz, rad + 0.3);
      let blocked = false;
      for (const b of boxes) {
        if (!b || b.prop || b.dead) continue;
        if (my > (b.top == null ? 48 : b.top) + 0.2) continue;
        if (mx >= b.minX - rad && mx <= b.maxX + rad && mz >= b.minZ - rad && mz <= b.maxZ + rad) blocked = true;
      }
      if (!blocked) return { x: mx, y: my, z: mz };
    }
    return { x: ox, y: oy, z: oz };
  },

  _aim(cam, dt, tx, ty, tz, lx, ly, lz, fov, near) {
    const k = 1 - Math.exp(-12 * Math.max(0.001, dt));
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (ty - cam.position.y) * k;
    cam.position.z += (tz - cam.position.z) * k;
    cam.lookAt(lx, ly, lz);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 6, dt);
      cam.updateProjectionMatrix();
    }
    if (near && Math.abs(cam.near - near) > 0.001) {
      cam.near = near;
      cam.updateProjectionMatrix();
    }
  },

  firstPerson(car, dt) {
    const h = car.h || 0;
    const fx = Math.sin(h), fz = Math.cos(h);
    const gy = car.y || 0;
    const onFoot = !!car.onFoot;
    const spec = !onFoot && car.mesh && car.mesh.userData && car.mesh.userData.spec;
    const eye = onFoot ? 1.55 : (spec ? Math.max(0.7, spec.roof - 0.18) : 0.9);
    const nose = onFoot ? 0.2 : (spec ? (spec.cabinRear + spec.cabinFront) * 0.5 : 0.05);
    const tx = car.x + fx * nose;
    const ty = gy + eye;
    const tz = car.z + fz * nose;
    this._aim(this.camera, dt, tx, ty, tz, car.x + fx * 16, gy + eye - 0.12, car.z + fz * 16, onFoot ? 74 : 66, 0.06);
    this.setBlur(0);
  },

  secondPerson(car, dt) {
    const h = car.h || 0;
    const fx = Math.sin(h), fz = Math.cos(h);
    const gy = car.y || 0;
    const onFoot = !!car.onFoot;
    const ahead = onFoot ? 4.2 : 7.4;
    let tx = car.x + fx * ahead;
    let ty = gy + (onFoot ? 1.65 : 2.35);
    let tz = car.z + fz * ahead;
    const cleared = this._clearCam(car.x, gy + 1.1, car.z, tx, ty, tz, onFoot ? 2.2 : 3.4);
    tx = cleared.x; ty = cleared.y; tz = cleared.z;
    this._aim(this.camera, dt, tx, ty, tz, car.x, gy + (onFoot ? 0.9 : 0.7), car.z, 58, 0.2);
    const spec = !onFoot && car.mesh && car.mesh.userData && car.mesh.userData.spec;
    const eye = onFoot ? 1.55 : (spec ? Math.max(0.78, spec.roof - 0.1) : 1.05);
    const nose = onFoot ? 0.15 : (spec ? spec.cabinFront * 0.45 : 0.2);
    this._pipCam.near = 0.08;
    this._pipCam.position.set(car.x + fx * nose, gy + eye, car.z + fz * nose);
    this._pipCam.lookAt(car.x + fx * 28, gy + eye - 0.25, car.z + fz * 28);
    this._pipCam.updateProjectionMatrix();
    this.setBlur(0);
  },

  /** Smooth chase camera. FOV opens up with speed. */
  chase(car, dt, extraBack) {
    const cam = this.camera;
    const h = car.h || 0;
    const fx = Math.sin(h), fz = Math.cos(h);
    const speed = car.speed || 0;
    const back = (extraBack || 6.4) + Math.min(4.2, speed * 0.06);
    const gy = car.y || 0;
    const up = gy + 2.45 + Math.min(0.9, speed * 0.01);
    let tx = car.x - fx * back + (car.vl || 0) * -0.02;
    let ty = up;
    let tz = car.z - fz * back;
    const cleared = this._clearCam(car.x, gy + 1.2, car.z, tx, ty, tz, 3.6);
    tx = cleared.x; ty = Math.max(cleared.y, gy + 1.35); tz = cleared.z;
    const k = 1 - Math.exp(-4.2 * dt);
    if (cam.near > 0.2) {
      cam.near = 0.12;
      cam.updateProjectionMatrix();
    }
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (ty - cam.position.y) * k;
    cam.position.z += (tz - cam.position.z) * k;
    const look = new THREE.Vector3(car.x + fx * (5 + speed * 0.06), gy + 1.05, car.z + fz * (5 + speed * 0.06));
    cam.lookAt(look);
    const fov = 58 + Math.min(22, speed * 0.28);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 3.5, dt);
      cam.updateProjectionMatrix();
    }
    this.setBlur(speed);
  }
};
