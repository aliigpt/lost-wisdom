// =====================================================================
//  THE 3D WORLD (Three.js): a large forest you walk through at night.
//  House in a clearing -> a winding path through the woods -> the river
//  -> the bridge -> the clock tower in a clearing on the far bank.
//
//  Exposes GAME.createWorld(canvas) -> an object the rest of the game
//  talks to: setReader, setControl, walkTo, view, setMood, fog, shake,
//  summon, settle, celebrate, walls, reset.
//
//  Every model is optional: if a file in public/models/ is missing, a
//  simple stand-in shape is used so the game still runs.
// =====================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Water } from 'three/addons/objects/Water.js';
import { foliageMaterials, buildOak, buildPine, buildFern, buildGrass, wind, gust, moonView, moonColor } from './foliage.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

window.GAME = window.GAME || {};

(() => {
  const T = THREE;
  const LI = Math.PI; // three.js uses physical light units; this keeps intensities readable
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------
  //  LAYOUT (meters). Change these to reshape the world.
  // ---------------------------------------------------------------
  const L = {
    size: 520,                          // the terrain is size x size
    river: { z: -140, width: 12 },      // the river runs left-right across the path
    house: { x: -8, z: 5 },
    start: { x: 0, z: 1 },              // where the Reader stands at the beginning
    hooded: { x: 3.5, z: 3.5 },
    tower: { x: 3, z: -186 },
    bridgeY: .45,                        // height of the bridge deck
    // the path through the woods: house -> bridge -> tower
    path: [[-3, 6], [0, -4], [6, -20], [-4, -38], [-13, -56], [-3, -74], [10, -91], [7, -108], [-2, -122], [0, -133], [0, -147], [2, -162], [3, -177]],
    treeCount: 1400,
    rockCount: 240
  };
  const RZ = L.river.z, RW = L.river.width;

  // ---------------------------------------------------------------
  //  TERRAIN HEIGHT: rolling hills, flattened along the path, in the
  //  clearings and on the river banks, with a channel for the river.
  // ---------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, z) {
    let s = 0, amp = 1, f = 1 / 60;
    for (let i = 0; i < 5; i++) { s += amp * vnoise(x * f + i * 17.3, z * f - i * 9.1); f *= 2.03; amp *= .5; }
    return s;
  }
  const clearings = [{ x: L.house.x + 4, z: L.house.z - 1, r: 15 }, { x: L.tower.x, z: L.tower.z + 2, r: 20 }];
  function hills(x, z) {
    let h = fbm(x, z) * 5 + fbm(x * .35 + 40, z * .35 - 20) * 7;
    h = lerp(0, h, smooth(12, 45, Math.abs(z - RZ)));                // flat river banks
    for (const c of clearings) h = lerp(0, h, smooth(c.r, c.r + 14, Math.hypot(x - c.x, z - c.z)));
    return h;
  }

  // The path as a smooth curve, sampled every ~0.5 m, with a lookup grid
  const curve = new T.CatmullRomCurve3(L.path.map(([x, z]) => new T.Vector3(x, 0, z)), false, 'centripetal');
  const PATH = curve.getSpacedPoints(Math.round(curve.getLength() * 2));
  const pathH = PATH.map(p => hills(p.x, p.z));
  for (let pass = 0; pass < 4; pass++) for (let i = 1; i < pathH.length - 1; i++) pathH[i] = (pathH[i - 1] + pathH[i] * 2 + pathH[i + 1]) / 4;
  const CELL = 10, pathGrid = new Map();
  PATH.forEach((p, i) => { const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`; (pathGrid.get(k) || pathGrid.set(k, []).get(k)).push(i); });
  function nearestPath(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity, bi = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = pathGrid.get(`${cx + a},${cz + b}`); if (!list) continue;
      for (const i of list) { const d = (PATH[i].x - x) ** 2 + (PATH[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
    }
    return { d: Math.sqrt(best), i: bi };
  }
  const WATER_Y = -.7;
  function groundH(x, z) {
    let h = hills(x, z);
    const n = nearestPath(x, z);
    if (n.i >= 0) h = lerp(pathH[n.i], h, smooth(2, 7, n.d));
    h -= 2.4 * (1 - smooth(RW / 2 - 1, RW / 2 + 2.5, Math.abs(z - RZ)));  // river channel
    return h;
  }
  const onBridge = (x, z) => Math.abs(x) < 1.5 && Math.abs(z - RZ) < RW / 2 + 3;

  // ---------------------------------------------------------------
  function createWorld(canvas) {
    const noop = () => {};
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) {
      return { ok: false, setMood: noop, fog: noop, shake: noop, summon: noop, settle: noop, celebrate: noop, walls: noop, reset: noop,
        setReader: noop, setControl: noop, walkTo: (t, cb) => setTimeout(cb, 500), view: noop, joystick: noop };
    }
    renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    const fmat = foliageMaterials(renderer);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(55, 1, .1, 900);
    const C = h => new T.Color(h);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // ----- Moods: calm night vs. demon night (plus grey for the Fog) -----
    const WARM = { top: C('#04060d'), bottom: C('#1a2438'), fog: C('#141c2c'), hSky: C('#7d8fb8'), hGround: C('#13120e'), hemi: .22, moon: 1.8, density: .026 };
    const COLD = { top: C('#020306'), bottom: C('#141a24'), fog: C('#10141b'), hSky: C('#62718f'), hGround: C('#0a0b0e'), hemi: .12, moon: .35, density: .045 };
    const GREY = C('#6b7079');

    // ----- Sky (all of it follows the camera, so it always looks infinitely far) -----
    // gradient dome -> painted horizon -> twinkling, slowly turning stars -> moon -> drifting clouds
    const sky = new T.Group(); scene.add(sky);
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: C('#fff') }, bottom: { value: C('#fff') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.4 + .15, 0., 1.); gl_FragColor = vec4(mix(bottom, top, h), 1.);\n#include <colorspace_fragment>\n}'
    });
    sky.add(new T.Mesh(new T.SphereGeometry(600, 32, 16), skyMat));

    // painted horizon (mountains, mist), fading out toward the top so it blends into the dome
    const fadeTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#000'); g.addColorStop(.35, '#000'); g.addColorStop(.6, '#fff'); g.addColorStop(1, '#fff');
      x.fillStyle = g; x.fillRect(0, 0, 4, 256); return new T.CanvasTexture(c); })();
    const backdropMat = new T.MeshBasicMaterial({ side: T.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0, alphaMap: fadeTex });
    const backdrop = new T.Mesh(new T.CylinderGeometry(480, 480, 300, 96, 1, true), backdropMat);
    backdrop.position.y = 70; backdrop.renderOrder = -9; sky.add(backdrop);
    new T.TextureLoader().load('textures/backdrop.jpg', tex => {
      tex.colorSpace = T.SRGBColorSpace; tex.wrapS = T.MirroredRepeatWrapping; tex.repeat.set(4, 1); tex.anisotropy = 8;
      backdropMat.map = tex; backdropMat.opacity = 1; backdropMat.needsUpdate = true;
    }, undefined, () => console.info('No backdrop at textures/backdrop.jpg'));

    // stars: each one twinkles at its own speed; the whole sky turns slowly around a tilted axis
    const STARS = 3600, sPos = new Float32Array(STARS * 3), sSize = new Float32Array(STARS), sPhase = new Float32Array(STARS), sCol = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sPos.set([Math.cos(th) * r * 560, u * 560, Math.sin(th) * r * 560], i * 3);
      sSize[i] = 1.2 + Math.pow(Math.random(), 6) * 5.5; sPhase[i] = Math.random() * 100;
      const warm = Math.random(); sCol.set([.85 + warm * .15, .88 + warm * .07, 1 - warm * .2], i * 3);
    }
    const starGeo = new T.BufferGeometry();
    starGeo.setAttribute('position', new T.BufferAttribute(sPos, 3)); starGeo.setAttribute('aSize', new T.BufferAttribute(sSize, 1));
    starGeo.setAttribute('aPhase', new T.BufferAttribute(sPhase, 1)); starGeo.setAttribute('aCol', new T.BufferAttribute(sCol, 3));
    const starMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uScale: { value: Math.min(2, devicePixelRatio || 1) } },
      vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aCol; uniform float uTime; uniform float uScale;
        varying vec3 vCol; varying float vA;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float tw = 0.6 + 0.4 * sin(uTime * (1.2 + fract(aPhase * 7.13) * 3.5) + aPhase) * sin(uTime * 0.7 + aPhase * 3.1);
          vA = tw * smoothstep(-10.0, 140.0, wp.y - cameraPosition.y);
          vCol = aCol;
          gl_Position = projectionMatrix * viewMatrix * wp;
          gl_PointSize = aSize * uScale * (0.75 + 0.35 * tw);
        }`,
      fragmentShader: `uniform float uOpacity; varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vCol * a, a * vA * uOpacity); }`
    });
    const starPivot = new T.Group(); starPivot.rotation.set(.55, 0, .2); sky.add(starPivot);
    const stars = new T.Points(starGeo, starMat); stars.renderOrder = -8; stars.frustumCulled = false; starPivot.add(stars);

    // shooting stars
    const meteorGeo = new T.BufferGeometry();
    meteorGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    meteorGeo.setAttribute('color', new T.BufferAttribute(new Float32Array([1, 1, 1, 1, .7, .8, 1, 0]), 4));
    const meteor = new T.Line(meteorGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, fog: false, depthWrite: false, blending: T.AdditiveBlending }));
    meteor.visible = false; meteor.renderOrder = -7; meteor.frustumCulled = false; sky.add(meteor);
    let meteorT = -1, nextMeteor = 8 + Math.random() * 15; const mA = new T.Vector3(), mB = new T.Vector3();

    // the moon: a real moon texture, with a soft halo; it travels across the sky during the night
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(220,228,255,.55)'); g.addColorStop(.18, 'rgba(190,205,240,.22)'); g.addColorStop(1, 'rgba(160,180,230,0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const moonDisc = new T.Sprite(new T.SpriteMaterial({ color: '#f2efe4', fog: false, depthWrite: false, transparent: true }));
    new T.TextureLoader().load('textures/moon.webp', t => { t.colorSpace = T.SRGBColorSpace; moonDisc.material.map = t; moonDisc.material.needsUpdate = true; });
    moonDisc.scale.setScalar(24); moonDisc.renderOrder = -7;
    const moonGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, fog: false, depthWrite: false, transparent: true, blending: T.AdditiveBlending }));
    moonGlow.scale.setScalar(190); moonGlow.renderOrder = -7;
    sky.add(moonGlow, moonDisc);

    // clouds: thin, moonlit, drifting with the wind
    const cloudMat = new T.ShaderMaterial({
      side: T.BackSide, transparent: true, depthWrite: false, fog: false,
      uniforms: { uOff: { value: new T.Vector2() }, uMoon: { value: new T.Vector3(0, 1, 0) }, uCover: { value: .5 }, uLit: { value: C('#8e9bb8') }, uDark: { value: C('#141a28') }, uAlpha: { value: .8 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec2 uOff; uniform vec3 uMoon; uniform float uCover; uniform vec3 uLit; uniform vec3 uDark; uniform float uAlpha; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          if (d.y < 0.01) discard;
          vec2 uv = d.xz / (d.y + 0.18) * 1.6 + uOff;
          float n = fbm(uv), detail = fbm(uv * 3.1 + 5.0);
          float dens = smoothstep(uCover, uCover + 0.3, n * 0.8 + detail * 0.3) * smoothstep(0.02, 0.3, d.y);
          float lit = pow(max(dot(d, uMoon), 0.0), 7.0);
          vec3 col = mix(uDark, uLit, clamp(0.15 + lit * 1.1 + (1.0 - detail) * 0.25, 0.0, 1.3));
          gl_FragColor = vec4(col, dens * uAlpha);
          #include <colorspace_fragment>
        }`
    });
    const clouds = new T.Mesh(new T.SphereGeometry(540, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat);
    clouds.renderOrder = -6; sky.add(clouds);
    scene.fog = new T.FogExp2(0x000000, .03);

    // ----- The night: 0 = dusk, 1 = sunrise. The moon's path and the light follow it. -----
    const NIGHT_SECONDS = 15 * 60;   // how long one night lasts in real time
    let night = .06;
    const MOON_DIR = new T.Vector3();
    function moonDirAt(p) {
      const az = lerp(-1.3, 1.3, p), el = .16 + .66 * Math.sin(Math.PI * clamp(p, 0, 1));
      return MOON_DIR.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    }
    moonDirAt(night);
    const DAWN = { bottom: C('#5a3f4c'), top: C('#1a2440'), fog: C('#3a3346') };

    // ----- Sky reflections: a blurred copy of the night sky for shiny/rough surfaces to reflect -----
    {
      const envScene = new T.Scene();
      envScene.add(new T.Mesh(new T.SphereGeometry(10, 32, 16), new T.ShaderMaterial({ side: T.BackSide,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y * 1.2 + .2, 0., 1.); gl_FragColor = vec4(mix(vec3(.012, .016, .03), vec3(.05, .07, .13), h), 1.); }' })));
      const moonBall = new T.Mesh(new T.SphereGeometry(.9, 16, 12), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.7, 2.0) }));
      moonBall.position.copy(MOON_DIR).multiplyScalar(8); envScene.add(moonBall);
      const pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(envScene, .04).texture; scene.environmentIntensity = .9;
      pm.dispose();
    }

    // ----- Light -----
    const hemi = new T.HemisphereLight(0xffffff, 0x222222, .5); scene.add(hemi);
    const moon = new T.DirectionalLight(0xb8c6ff, 1);
    moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -.0004; moon.shadow.normalBias = .04;
    Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    scene.add(moon, moon.target);

    // ----- Materials and helpers -----
    const texLoader = new T.TextureLoader();
    const M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: .92, ...o });
    const mat = {
      ground: M('#3d4a2a'), path: M('#6b5b48'), wood: M('#4e3826'), stone: M('#5d5a57'), cloak: M('#5a1820'),
      skin: M('#d9b49a'), dark: M('#0e0d12', { roughness: 1 }),
      glow: new T.MeshStandardMaterial({ color: '#ffcf80', emissive: '#ffb04a', emissiveIntensity: 3 }),
      leaves: M('#1f3320'), bark: M('#3a2a1e')
    };
    function tiled(url, material, rx, ry = rx, tint) {
      texLoader.load(url, tex => {
        tex.colorSpace = T.SRGBColorSpace; tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(rx, ry);
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        material.map = tex; material.color.set(tint || '#ffffff'); material.needsUpdate = true;
      }, undefined, () => console.info(`No texture at ${url}; using plain color.`));
    }
    const add = (geo, m, x, y, z, parent = scene) => {
      const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
    };
    const atGround = (obj, x, z) => { obj.position.set(x, groundH(x, z), z); return obj; };

    // ----- Terrain -----
    const SEG = 260;
    const tGeo = new T.PlaneGeometry(L.size, L.size, SEG, SEG); tGeo.rotateX(-Math.PI / 2);
    const tp = tGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setY(i, groundH(tp.getX(i), tp.getZ(i)));
    tGeo.computeVertexNormals();
    const terrain = new T.Mesh(tGeo, mat.ground); terrain.receiveShadow = true; scene.add(terrain);
    tiled('textures/ground-grass.jpg', mat.ground, L.size / 7, L.size / 7, '#8b9878');

    // ----- The path: a ribbon that follows the ground -----
    {
      const W = 1.4, n = PATH.length, pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
      let dist = 0;
      for (let i = 0; i < n; i++) {
        const p = PATH[i], q = PATH[Math.min(n - 1, i + 1)], o = PATH[Math.max(0, i - 1)];
        const tx = q.x - o.x, tz = q.z - o.z, len = Math.hypot(tx, tz) || 1, nx = -tz / len, nz = tx / len;
        if (i) dist += Math.hypot(p.x - PATH[i - 1].x, p.z - PATH[i - 1].z);
        const w = W * (.85 + vnoise(i * .07, 3) * .25);
        [[-1, 0], [1, 1]].forEach(([s, k]) => {
          const x = p.x + nx * w * s, z = p.z + nz * w * s;
          pos.set([x, (onBridge(x, z) ? -5 : groundH(x, z)) + .05, z], (i * 2 + k) * 3);
          uv.set([k, dist / 2.8], (i * 2 + k) * 2);
        });
        if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // counter-clockwise from above, so it faces up
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const pathMesh = new T.Mesh(g, mat.path); pathMesh.receiveShadow = true; scene.add(pathMesh);
      tiled('textures/ground-path.jpg', mat.path, 1, 1, '#7d6c58');
    }

    // ----- The river -----
    const waterNormals = (() => {
      const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), img = x.createImageData(N, N);
      const hgt = (i, j) => { const u = i / N * Math.PI * 2, v = j / N * Math.PI * 2;
        return Math.sin(u * 3 + v * 2) * .5 + Math.sin(u * 7 - v * 5) * .25 + Math.sin(u * 13 + v * 11) * .12 + Math.sin(u * 2 - v * 9) * .2; };
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const dx = hgt(i + 1, j) - hgt(i - 1, j), dy = hgt(i, j + 1) - hgt(i, j - 1), k = (j * N + i) * 4;
        const l = Math.hypot(dx * 2, dy * 2, 1);
        img.data[k] = (-dx * 2 / l * .5 + .5) * 255; img.data[k + 1] = (-dy * 2 / l * .5 + .5) * 255; img.data[k + 2] = (1 / l * .5 + .5) * 255; img.data[k + 3] = 255;
      }
      x.putImageData(img, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
    })();
    const water = new Water(new T.PlaneGeometry(L.size, RW + 5), {
      textureWidth: 512, textureHeight: 512, waterNormals, size: 2.5,
      sunDirection: MOON_DIR.clone(), sunColor: '#4d5b7a', waterColor: '#02070e', distortionScale: 2.4, fog: true
    });
    water.rotation.x = -Math.PI / 2; water.position.set(0, WATER_Y, RZ); scene.add(water);
    // the current: streaks that drift downstream (toward -x), two layers at different speeds
    const flowTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 260; i++) { const y = Math.random() * 128, w = 20 + Math.random() * 120, x0 = Math.random() * 512, a = .15 + Math.random() * .5;
        const g = x.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(x0, y, w, 1 + Math.random() * 1.5); }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; })();
    const flows = [[16, 1.3, .055, .12], [9, .8, .03, .08]].map(([rep, repY, speed, op]) => {
      const tex = flowTex.clone(); tex.needsUpdate = true; tex.repeat.set(L.size / rep, repY);
      const m = new T.Mesh(new T.PlaneGeometry(L.size, RW + 3), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending, color: '#8fa6cc', fog: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, WATER_Y + .03, RZ); scene.add(m);
      return { tex, speed, mat: m.material, op };
    });

    // ----- Ground mist (soft sprites over the river and in hollows) -----
    const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(200,210,230,.55)'); g.addColorStop(1, 'rgba(200,210,230,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const mists = [];
    for (let i = 0; i < 30; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: .05, color: '#5f6c84' }));
      const nearRiver = i < 12, x = (rnd() - .5) * (nearRiver ? 160 : 300), z = nearRiver ? RZ + (rnd() - .5) * 18 : (rnd() - .5) * 300;
      s.position.set(x, (nearRiver ? WATER_Y + .8 : groundH(x, z) + 1.4), z); s.scale.set(nearRiver ? 30 : 26, nearRiver ? 3.5 : 7, 1);
      s.userData.v = (rnd() - .5) * .6; scene.add(s); mists.push(s);
    }

    // ----- Places: cottage, tower, bridge, hooded figure (stand-ins until models load) -----
    const cottage = atGround(new T.Group(), L.house.x, L.house.z); cottage.rotation.y = Math.PI / 2 - .25; scene.add(cottage);
    add(new T.BoxGeometry(5, 3.6, 4.5), mat.stone, 0, 1.8, 0, cottage);
    const doorLight = new T.PointLight('#ffad55', 4 * LI, 14, 1.6); doorLight.position.set(1.6, 2.4, 3); cottage.add(doorLight);
    add(new T.SphereGeometry(.12, 10, 8), mat.glow, 1.6, 2.4, 2.6, cottage);

    const tower = atGround(new T.Group(), L.tower.x, L.tower.z); scene.add(tower);
    add(new T.CylinderGeometry(3.5, 4, 26, 10), mat.stone, 0, 13, 0, tower);
    const towerLight = new T.PointLight('#ffad55', 8 * LI, 26, 1.5); towerLight.position.set(0, 3, 7); tower.add(towerLight);

    const bridge = new T.Group(); bridge.position.set(0, 0, RZ); scene.add(bridge);
    add(new T.BoxGeometry(2.6, .25, RW + 6), mat.wood, 0, L.bridgeY - .12, 0, bridge);

    const hooded = atGround(new T.Group(), L.hooded.x, L.hooded.z); hooded.rotation.y = -2.3; scene.add(hooded);
    add(new T.ConeGeometry(.45, 1.95, 12), mat.dark, 0, .98, 0, hooded);
    const hoodLight = new T.PointLight('#ffb35c', 1.2 * LI, 7, 1.6); hoodLight.position.set(.35, 1, .45); hooded.add(hoodLight);

    // ----- Loading the Higgsfield models -----
    const loader = new GLTFLoader();
    const mixers = [];
    function fit(root, { height, length }) {
      root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      const size = new T.Box3().setFromObject(root).getSize(new T.Vector3());
      if (length) { if (size.x > size.z) root.rotation.y = Math.PI / 2; root.scale.setScalar(length / Math.max(size.x, size.z)); }
      else root.scale.setScalar(height / (size.y || 1));
      root.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(root), c = box.getCenter(new T.Vector3());
      root.position.set(-c.x, -box.min.y, -c.z);
      return root;
    }
    function loadInto(url, group, size, onLoad) {
      loader.load(url, gltf => {
        const root = fit(gltf.scene, size);
        group.children.filter(o => o.isMesh).forEach(o => { o.visible = false; });
        group.add(root);
        onLoad && onLoad(gltf, root);
      }, undefined, () => console.info(`No model at ${url}; using a simple shape.`));
    }
    function animate(gltf, root) {
      if (!gltf.animations.length) return null;
      const mixer = new T.AnimationMixer(root); mixers.push(mixer);
      const action = mixer.clipAction(gltf.animations[0]); action.play();
      return { mixer, action };
    }
    loadInto('models/cottage.glb', cottage, { height: 6 });
    loadInto('models/clock-tower.glb', tower, { height: 30 });
    loadInto('models/bridge.glb', bridge, { length: RW + 6 }, (g, root) => { root.position.y += L.bridgeY + 1.1 - new T.Box3().setFromObject(root).max.y; });
    loadInto('models/hooded-figure.glb', hooded, { height: 1.95 }, (g, r) => animate(g, r));

    // ----- The forest: instanced trees and rocks in chunks (so off-screen chunks are skipped) -----
    const forest = new T.Group(); scene.add(forest);
    const chunks = [];
    const items = { oak: [], pine: [], rock: [], fern: [] };
    const treeGrid = new Map(), TG = 4;
    const occupied = (x, z, r) => {
      const cx = Math.floor(x / TG), cz = Math.floor(z / TG);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const t of treeGrid.get(`${cx + a},${cz + b}`) || []) if (Math.hypot(t.x - x, t.z - z) < r) return true;
      return false;
    };
    const blocked = (x, z, pad) => {
      if (Math.hypot(x, z) > L.size / 2 - 12) return true;
      if (nearestPath(x, z).d < pad) return true;
      if (Math.abs(z - RZ) < RW / 2 + 3) return true;
      return clearings.some(c => Math.hypot(x - c.x, z - c.z) < c.r - 2);
    };
    for (let tries = 0; items.oak.length + items.pine.length < L.treeCount && tries < 40000; tries++) {
      const x = (rnd() - .5) * L.size, z = (rnd() - .5) * L.size;
      if (blocked(x, z, 4 + rnd() * 3) || occupied(x, z, 3)) continue;
      const pine = rnd() < .6;
      const t = { x, z, y: groundH(x, z), s: pine ? 13 + rnd() * 7 : 9 + rnd() * 5, rot: rnd() * Math.PI * 2, r: pine ? .45 : .7 };
      (pine ? items.pine : items.oak).push(t);
      const k = `${Math.floor(x / TG)},${Math.floor(z / TG)}`; (treeGrid.get(k) || treeGrid.set(k, []).get(k)).push(t);
    }
    for (let tries = 0; items.rock.length < L.rockCount && tries < 8000; tries++) {
      const x = (rnd() - .5) * L.size, z = (rnd() - .5) * L.size;
      if (blocked(x, z, 2.6) || occupied(x, z, 2.5)) continue;
      const t = { x, z, y: groundH(x, z) - .2, s: .6 + rnd() * 1.8, rot: rnd() * Math.PI * 2, r: .9 };
      items.rock.push(t);
      const k = `${Math.floor(x / TG)},${Math.floor(z / TG)}`; (treeGrid.get(k) || treeGrid.set(k, []).get(k)).push(t);
    }
    // ferns and undergrowth: thickest along the path, thinner deeper in the woods
    for (let tries = 0; items.fern.length < 3200 && tries < 30000; tries++) {
      const x = (rnd() - .5) * L.size, z = (rnd() - .5) * L.size, d = nearestPath(x, z).d;
      if (d < 2.1 || Math.abs(z - RZ) < RW / 2 + 1.5 || Math.hypot(x, z) > L.size / 2 - 12) continue;
      if (rnd() > 1.4 - d / 40) continue;
      if (clearings.some(c => Math.hypot(x - c.x, z - c.z) < c.r - 6)) continue;
      items.fern.push({ x, z, y: groundH(x, z), s: .7 + rnd() * .8, rot: rnd() * Math.PI * 2 });
    }
    const CH = 64;
    function plant(kind, proto, list0 = items[kind]) {   // proto: an Object3D fitted to height 1, standing at the origin
      for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i].kind === kind) { forest.remove(chunks[i].mesh); chunks.splice(i, 1); }
      proto.updateMatrixWorld(true);
      const parts = []; proto.traverse(o => { if (o.isMesh) parts.push(o); });
      const groups = new Map();
      for (const it of list0) { const k = `${Math.floor(it.x / CH)},${Math.floor(it.z / CH)}`; (groups.get(k) || groups.set(k, []).get(k)).push(it); }
      const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), s = new T.Vector3(), p = new T.Vector3(), tint = new T.Color();
      for (const [key, list] of groups) {
        const [cx, cz] = key.split(',').map(Number);
        for (const part of parts) {
          const im = new T.InstancedMesh(part.geometry, part.material, list.length);
          list.forEach((it, j) => {
            q.setFromAxisAngle(up, it.rot); s.setScalar(it.s); p.set(it.x, it.y, it.z);
            m.compose(p, q, s).multiply(part.matrixWorld); im.setMatrixAt(j, m);
            if (part.material.userData.isFoliage) {   // every tree a slightly different green
              const h = hash(it.x, it.z), k = .78 + h * .38;
              tint.setRGB(k * (.92 + hash(it.z, it.x) * .16), k, k * (.85 + h * .2)); im.setColorAt(j, tint);
            }
          });
          if (part.customDepthMaterial) im.customDepthMaterial = part.customDepthMaterial;
          // leaves cast shadows on the ground but don't shadow each other (that made blotchy crowns)
          im.castShadow = kind !== 'rock' && kind !== 'fern'; im.receiveShadow = !part.material.userData.isFoliage; im.computeBoundingSphere();
          forest.add(im); chunks.push({ kind, mesh: im, x: (cx + .5) * CH, z: (cz + .5) * CH });
        }
      }
    }
    function standIn(kind) {
      const g = new T.Group();
      if (kind === 'pine') { add(new T.CylinderGeometry(.03, .05, .3, 6), mat.bark, 0, .15, 0, g); add(new T.ConeGeometry(.22, .8, 9), mat.leaves, 0, .6, 0, g); }
      else if (kind === 'oak') { add(new T.CylinderGeometry(.05, .08, .45, 7), mat.bark, 0, .22, 0, g); add(new T.IcosahedronGeometry(.36, 1), mat.leaves, 0, .68, 0, g); }
      else add(new T.DodecahedronGeometry(.5, 0), mat.stone, 0, .3, 0, g);
      return g;
    }
    // Trees are grown from photo textures (see foliage.js), three shapes of each kind
    const VARIANTS = 3;
    ['oak', 'pine'].forEach(kind => {
      for (let v = 0; v < VARIANTS; v++) {
        const list = items[kind].filter((_, i) => i % VARIANTS === v);
        plant(`${kind}${v}`, kind === 'oak' ? buildOak(100 + v, fmat) : buildPine(200 + v, fmat), list);
      }
    });
    plant('fern', buildFern(fmat));
    plant('rock', standIn('rock'));
    loader.load('models/rocks.glb', g => plant('rock', fit(g.scene, { height: .9 })), undefined, () => console.info('No model at models/rocks.glb; using simple rocks.'));

    // Grass that follows the Reader: needs the ground height (R) and where grass may grow (G) as a texture
    const HN = 261, hdata = new Uint16Array(HN * HN * 4);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
      const x = -L.size / 2 + i / (HN - 1) * L.size, z = -L.size / 2 + j / (HN - 1) * L.size, k = (j * HN + i) * 4;
      const ok = nearestPath(x, z).d > 1.9 && Math.abs(z - RZ) > RW / 2 + 1.2;
      hdata[k] = T.DataUtils.toHalfFloat(groundH(x, z)); hdata[k + 1] = T.DataUtils.toHalfFloat(ok ? 1 : 0);
      hdata[k + 2] = 0; hdata[k + 3] = T.DataUtils.toHalfFloat(1);
    }
    const heightTex = new T.DataTexture(hdata, HN, HN, T.RGBAFormat, T.HalfFloatType);
    heightTex.minFilter = heightTex.magFilter = T.LinearFilter; heightTex.needsUpdate = true;
    const grass = buildGrass(fmat, heightTex, L.size); scene.add(grass);

    // ----- The Reader (boy or girl) and the player controller -----
    const reader = new T.Group(); scene.add(reader);
    const readerShapes = [add(new T.ConeGeometry(.42, 1.1, 12), mat.cloak, 0, .55, 0, reader), add(new T.SphereGeometry(.17, 14, 10), mat.skin, 0, 1.25, 0, reader)];
    readerShapes.forEach(o => { o.visible = false; });   // only shown if the model can't load
    const lantern = add(new T.SphereGeometry(.07, 10, 8), mat.glow, .32, .72, .2, reader);
    const lanternLight = new T.PointLight('#ffa65a', 1.4 * LI, 14, 2); lanternLight.position.set(.32, .85, .3); lanternLight.castShadow = false; reader.add(lanternLight);
    const contact = new T.Mesh(new T.PlaneGeometry(1.6, 1.6), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, color: '#000',
      alphaMap: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
        const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#bbb'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })() }));
    contact.rotation.x = -Math.PI / 2; contact.position.y = .03; contact.renderOrder = 1; reader.add(contact);   // soft shadow at the feet
    let readerModel = null, readerAnim = null, readerKind = null;
    function setReader(kind) {
      if (kind === readerKind) return;
      readerKind = kind;
      loader.load(`models/reader-${kind}.glb`, gltf => {
        if (readerKind !== kind) return;
        if (readerModel) { reader.remove(readerModel); const i = mixers.indexOf(readerAnim && readerAnim.mixer); if (i >= 0) mixers.splice(i, 1); }
        readerModel = fit(gltf.scene, { height: 1.45 });
        readerShapes.forEach(o => { o.visible = false; });
        reader.add(readerModel);
        readerAnim = animate(gltf, readerModel);
        if (readerAnim) readerAnim.action.timeScale = 0;
      }, undefined, () => { readerShapes.forEach(o => { o.visible = true; }); console.info(`No model at models/reader-${kind}.glb; using a simple shape.`); });
    }

    const player = { x: L.start.x, z: L.start.z, y: 0, heading: Math.PI, speed: 0 };
    let control = false, camYaw = Math.PI, camPitch = .32, lastLook = -10;
    const keys = new Set();
    const joy = { x: 0, y: 0 };
    const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
    addEventListener('keydown', e => { const k = KEYMAP[e.code]; if (!k || !control) return; keys.add(k); if (e.code.startsWith('Arrow')) e.preventDefault(); });
    addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
    addEventListener('blur', () => keys.clear());
    // drag anywhere that isn't a control to look around
    let drag = null;
    addEventListener('pointerdown', e => {
      if (!control || e.target.closest('button, .dialogue, .book, #tray, .lexicon, #joystick, #breath, .demon-card')) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      camYaw -= (e.clientX - drag.x) * .005; camPitch = clamp(camPitch + (e.clientY - drag.y) * .003, .05, .9);
      drag.x = e.clientX; drag.y = e.clientY; lastLook = clock.elapsedTime;
    });
    addEventListener('pointerup', () => { drag = null; });

    const solids = [{ x: L.house.x, z: L.house.z, r: 3.6 }, { x: L.tower.x, z: L.tower.z, r: 5 }, { x: L.hooded.x, z: L.hooded.z, r: .6 }];
    function collide(nx, nz) {
      if (Math.hypot(nx, nz) > L.size / 2 - 15) return false;
      const inRiver = Math.abs(nz - RZ) < RW / 2 + .6;
      if (inRiver && !(onBridge(nx, nz) && Math.abs(nx) < 1.05)) return false;
      const cx = Math.floor(nx / TG), cz = Math.floor(nz / TG);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const t of treeGrid.get(`${cx + a},${cz + b}`) || []) if (Math.hypot(t.x - nx, t.z - nz) < t.r + .35) return false;
      for (const o of solids) if (Math.hypot(o.x - nx, o.z - nz) < o.r) return false;
      return true;
    }

    // walk-to objectives
    const TARGETS = {
      house: { x: L.house.x + 3.5, z: L.house.z }, start: { x: L.start.x, z: L.start.z },
      river: { x: 0, z: RZ + RW / 2 + 4 }, bridge: { x: 0, z: RZ + RW / 2 + 4 }, tower: { x: L.tower.x, z: L.tower.z + 8 }
    };
    let walkTarget = null, onArrive = null;

    // ----- Fireflies (they swarm when a page is solved) -----
    const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,245,210,1)'); gr.addColorStop(.3, 'rgba(255,215,130,.7)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const FLIES = 90, flyPos = new Float32Array(FLIES * 3), flies = [];
    for (let i = 0; i < FLIES; i++) flies.push({ a: rnd() * 6.28, r: 2 + rnd() * 14, y: .4 + rnd() * 3, s: .1 + rnd() * .3 });
    const flyGeo = new T.BufferGeometry(); flyGeo.setAttribute('position', new T.BufferAttribute(flyPos, 3));
    const flyMat = new T.PointsMaterial({ size: .16, map: dot, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: '#ffd98a' });
    const fliesPts = new T.Points(flyGeo, flyMat); fliesPts.frustumCulled = false; scene.add(fliesPts);
    let burst = 0;

    // ----- Rain (follows the camera) -----
    const DROPS = reduce ? 500 : 2200, rainPos = new Float32Array(DROPS * 6);
    const resetDrop = (i, top) => { const x = (rnd() - .5) * 40, z = (rnd() - .5) * 40, y = top ? 16 + rnd() * 4 : rnd() * 20; rainPos.set([x, y, z, x + .05, y + .5, z], i * 6); };
    for (let i = 0; i < DROPS; i++) resetDrop(i, false);
    const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
    const rainMat = new T.LineBasicMaterial({ color: '#b9c7dc', transparent: true, opacity: 0, depthWrite: false });
    const rain = new T.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);

    // ----- Demons: wraiths in black cloaks (simple stand-in until the model loads) -----
    let demonGltf = null;
    loader.load('models/demon.glb', g => { demonGltf = g; }, undefined, () => console.info('No model at models/demon.glb; using a simple shape.'));
    const demons = {};
    function makeDemon() {
      const g = new T.Group(); g.userData = { scale: 0, scaleT: 0, mode: 'attack', phase: rnd() * 6 };
      if (demonGltf) {
        const model = fit(SkeletonUtils.clone(demonGltf.scene), { height: 1.25 }); g.add(model);
        if (demonGltf.animations.length) { const m = new T.AnimationMixer(model); mixers.push(m); m.clipAction(demonGltf.animations[0]).play(); }
      } else {
        add(new T.ConeGeometry(.45, 1.3, 12), mat.dark, 0, .65, 0, g);
        [-.1, .1].forEach(x => add(new T.SphereGeometry(.035, 8, 6), new T.MeshBasicMaterial({ color: '#cfe0ff' }), x, 1.12, .32, g));
      }
      const glow = new T.PointLight('#7f96c8', .8 * LI, 5, 1.8); glow.position.y = 1; g.add(glow);
      g.scale.setScalar(.001); scene.add(g);
      return g;
    }

    // ----- The Closing Wall: a ring of stone that rises around the Reader -----
    const ring = new T.Group(); ring.visible = false; scene.add(ring);
    const RING_N = 22; let ringR = 26, ringRT = 26, ringH = 0, ringHT = 0;
    const ringCenter = new T.Vector3();
    let wallProto = null;
    function buildRing() {
      ring.clear();
      for (let i = 0; i < RING_N; i++) {
        const s = new T.Group(); s.userData.a = (i / RING_N) * Math.PI * 2;
        if (wallProto) s.add(wallProto.clone());
        else add(new T.BoxGeometry(1, 1, .9), mat.stone, 0, .5, 0, s);
        ring.add(s);
      }
    }
    loader.load('models/wall.glb', g => {
      const root = g.scene; root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      const size = new T.Box3().setFromObject(root).getSize(new T.Vector3());
      if (size.z > size.x) root.rotation.y = Math.PI / 2;
      const len = Math.max(size.x, size.z);
      root.scale.set(1 / len, 1 / size.y, 1 / len);
      root.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(root), c = box.getCenter(new T.Vector3());
      root.position.set(-c.x, -box.min.y, -c.z);
      wallProto = new T.Group(); wallProto.add(root); buildRing();
    }, undefined, () => console.info('No model at models/wall.glb; using simple shapes.'));
    buildRing();

    // Lanterns that push the wall back (placed in screen space so they're always findable)
    const LANTERN_NDC = [[-.62, .3], [.64, .02], [-.12, -.42]];
    const lanterns = LANTERN_NDC.map(() => {
      const g = new T.Group(); g.visible = false; scene.add(g);
      const core = new T.Mesh(new T.SphereGeometry(.12, 12, 10), new T.MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: .6 }));
      const halo = new T.Sprite(new T.SpriteMaterial({ map: dot, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .5 }));
      halo.scale.setScalar(1.1);
      const hit = new T.Mesh(new T.SphereGeometry(.7, 8, 6), new T.MeshBasicMaterial({ visible: false }));
      const light = new T.PointLight('#ffd68a', 0, 10, 1.5);
      g.add(core, halo, hit, light); g.userData = { core, halo, hit, light, lit: false };
      return g;
    });
    let wallsActive = false, wallsLit = 0, onLantern = null;
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    addEventListener('pointerdown', e => {
      if (!wallsActive) return;
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(lanterns.filter(l => !l.userData.lit).map(l => l.userData.hit));
      if (!hits.length) return;
      const l = lanterns.find(l => l.userData.hit === hits[0].object);
      l.userData.lit = true; wallsLit++;
      ringRT = 6 + wallsLit * 5; ringHT = Math.max(0, 8 - wallsLit * 2.2);
      if (wallsLit === 3) { wallsActive = false; ringRT = 30; ringHT = 0; setTimeout(() => lanterns.forEach(l => { l.visible = false; }), 1600); }
      onLantern && onLantern(wallsLit);
    });

    // ----- Post-processing: bloom makes lanterns and windows glow -----
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new T.Vector2(256, 256), .55, .45, .88));
    composer.addPass(new OutputPass());
    // cinematic grade: a touch less saturation, cool shadows, warm highlights, gentle contrast
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 0.88);
          c += vec3(-0.012, 0.004, 0.03) * (1.0 - smoothstep(0.0, 0.35, l));   // cool shadows
          c += vec3(0.03, 0.012, -0.02) * smoothstep(0.45, 1.0, l);            // warm highlights
          c = clamp((c - 0.5) * 1.07 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(c, 1.0);
        }`
    }));
    function resize() {
      renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize); resize();

    // ----- Frame loop -----
    let mood = 0, moodT = 0, fogAmt = 0, fogT = 0, shaking = false, camMode = 'title';
    const camPos = new T.Vector3(30, 22, 40), camLook = new T.Vector3(), v3 = new T.Vector3(), tmp = new T.Color();
    const clock = new T.Clock();
    const mix = (a, b, t) => tmp.copy(a).lerp(b, t);

    function frame() {
      const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
      mood += (moodT - mood) * .025; fogAmt += (fogT - fogAmt) * .02;
      // wind: slow swells with quicker gusts on top; stronger when a demon is near
      gust.value = (.35 + .65 * (.5 + .5 * Math.sin(t * .21)) * (.6 + .4 * Math.sin(t * .63 + 1.3))) * (1 + mood * .5);
      wind.value += dt;
      // the night moves on; the moon travels with it
      night = Math.min(1, night + dt / NIGHT_SECONDS);
      moonDirAt(night);
      const dawn = smooth(.82, 1, night);

      // colors and light
      const g = fogAmt * .6;
      skyMat.uniforms.top.value.copy(mix(WARM.top, COLD.top, mood)).lerp(GREY, g * .5);
      skyMat.uniforms.bottom.value.copy(mix(WARM.bottom, COLD.bottom, mood)).lerp(GREY, g);
      skyMat.uniforms.bottom.value.lerp(DAWN.bottom, dawn * .8); skyMat.uniforms.top.value.lerp(DAWN.top, dawn * .6);
      scene.fog.color.copy(mix(WARM.fog, COLD.fog, mood)).lerp(GREY, g).lerp(DAWN.fog, dawn * .7);
      scene.fog.density = lerp(WARM.density, COLD.density, mood) + fogAmt * .05;
      hemi.color.copy(mix(WARM.hSky, COLD.hSky, mood)); hemi.groundColor.copy(mix(WARM.hGround, COLD.hGround, mood));
      hemi.intensity = lerp(WARM.hemi, COLD.hemi, mood) * (1 - fogAmt * .3) * LI;
      moon.intensity = lerp(WARM.moon, COLD.moon, mood) * (1 - fogAmt * .6) * smooth(.02, .3, MOON_DIR.y) * LI;
      backdropMat.color.setScalar(1 - Math.max(mood, fogAmt) * .6);
      starMat.uniforms.uOpacity.value = (1 - Math.max(mood, fogAmt) * .85) * (1 - dawn);
      starMat.uniforms.uTime.value = t;
      lanternLight.intensity = (1.4 + mood * .9) * LI * (shaking ? .6 + Math.random() * .6 : (.96 + Math.sin(t * 9) * .02 + Math.sin(t * 23) * .02));
      rainMat.opacity = mood * .45;

      // player movement
      let fx = 0, fz = 0;
      if (control) {
        const f = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) + joy.y, r = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + joy.x;
        fx = Math.sin(camYaw) * f + Math.sin(camYaw - Math.PI / 2) * r; fz = Math.cos(camYaw) * f + Math.cos(camYaw - Math.PI / 2) * r;
      }
      const mag = Math.hypot(fx, fz);
      const targetSpeed = mag > .05 ? (keys.has('run') ? 4.6 : 2) * Math.min(1, mag) : 0;
      player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 8);
      if (mag > .05) {
        let d = Math.atan2(fx, fz) - player.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        player.heading += d * Math.min(1, dt * 10);
      }
      if (player.speed > .01) {
        const nx = player.x + Math.sin(player.heading) * player.speed * dt, nz = player.z + Math.cos(player.heading) * player.speed * dt;
        if (collide(nx, nz)) { player.x = nx; player.z = nz; }
        else if (collide(nx, player.z)) player.x = nx;
        else if (collide(player.x, nz)) player.z = nz;
      }
      const gy = onBridge(player.x, player.z) && Math.abs(player.z - RZ) < RW / 2 + 2 ? Math.max(groundH(player.x, player.z), L.bridgeY) : groundH(player.x, player.z);
      player.y += (gy - player.y) * Math.min(1, dt * 12);
      reader.position.set(player.x, player.y, player.z);
      reader.rotation.y = player.heading;
      if (readerAnim) readerAnim.action.timeScale = player.speed > .05 ? player.speed / 1.35 : 0;
      for (const m of mixers) m.update(dt);
      lantern.position.y = .72 + Math.sin(t * 2.4) * .02;

      if (walkTarget && Math.hypot(player.x - walkTarget.x, player.z - walkTarget.z) < 3.5) {
        const cb = onArrive; walkTarget = null; onArrive = null; cb && cb();
      }

      // camera
      if (camMode === 'title') {
        const a = (reduce ? 0 : t * .03) + .6, cx = L.house.x + 6, cz = L.house.z - 2;
        v3.set(cx + Math.sin(a) * 26, groundH(cx, cz) + 14, cz + Math.cos(a) * 26);
        camPos.lerp(v3, .02); camLook.lerp(v3.set(cx - 2, groundH(cx, cz) + 3, cz - 4), .03);
      } else {
        if (player.speed > .3 && t - lastLook > 1.5) { let d = player.heading - camYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); camYaw += d * Math.min(1, dt * 1.6); }
        const dist = 5.2, sy = Math.sin(camYaw), cy = Math.cos(camYaw);
        v3.set(player.x - sy * dist * Math.cos(camPitch), player.y + 1.4 + Math.sin(camPitch) * dist, player.z - cy * dist * Math.cos(camPitch));
        v3.y = Math.max(v3.y, groundH(v3.x, v3.z) + .7);
        camPos.lerp(v3, Math.min(1, dt * 6));
        camLook.lerp(v3.set(player.x + sy * 1.5, player.y + 1.25, player.z + cy * 1.5), Math.min(1, dt * 8));
      }
      camera.position.copy(camPos);
      if (shaking && !reduce) camera.position.add(v3.set((Math.random() - .5) * .06, (Math.random() - .5) * .06, 0));
      camera.lookAt(camLook);
      sky.position.set(camera.position.x, 0, camera.position.z);
      starPivot.rotation.y = night * 1.4 + t * .002;                                   // the stars wheel across the sky
      moonDisc.position.copy(MOON_DIR).multiplyScalar(500); moonGlow.position.copy(MOON_DIR).multiplyScalar(505);
      moonDisc.material.opacity = 1 - fogAmt * .7; moonGlow.material.opacity = (.9 - mood * .5 - fogAmt * .6) * (1 - dawn * .6);
      cloudMat.uniforms.uMoon.value.copy(MOON_DIR);
      camera.updateMatrixWorld(); moonView.value.copy(MOON_DIR).transformDirection(camera.matrixWorldInverse);
      moonColor.value.setRGB(.62, .7, .92).multiplyScalar(smooth(.02, .3, MOON_DIR.y) * (1 - mood * .7) * (1 - fogAmt * .6));
      cloudMat.uniforms.uOff.value.x += dt * .006 * (.4 + gust.value);                 // clouds drift with the wind
      cloudMat.uniforms.uOff.value.y -= dt * .002 * (.4 + gust.value);
      cloudMat.uniforms.uCover.value = lerp(.56, .38, Math.max(mood, fogAmt));           // demons bring heavier cloud
      water.material.uniforms.sunDirection.value.copy(MOON_DIR);
      // shooting stars
      if (meteorT < 0 && (nextMeteor -= dt) < 0 && mood < .5) {
        meteorT = 0; nextMeteor = 14 + Math.random() * 30;
        const az = Math.random() * Math.PI * 2, el = .5 + Math.random() * .5;
        mA.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(450);
        mB.set(Math.random() - .5, -.35 - Math.random() * .3, Math.random() - .5).normalize().multiplyScalar(140);
      }
      if (meteorT >= 0) {
        meteorT += dt / .7; meteor.visible = meteorT < 1;
        const head = v3.copy(mA).addScaledVector(mB, meteorT), arr = meteorGeo.attributes.position.array;
        arr.set([head.x, head.y, head.z, head.x - mB.x * .25, head.y - mB.y * .25, head.z - mB.z * .25]); meteorGeo.attributes.position.needsUpdate = true;
        meteor.material.opacity = Math.sin(Math.PI * Math.min(1, meteorT));
        if (meteorT >= 1) meteorT = -1;
      }

      // moonlight shadows follow the player
      moon.target.position.set(player.x, player.y, player.z);
      moon.position.copy(moon.target.position).addScaledVector(MOON_DIR, 70);

      // only draw forest chunks near the camera
      for (const c of chunks) c.mesh.visible = Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 150;

      // rain
      if (rainMat.opacity > .01) {
        const drift = gust.value * 4 * dt;   // rain slants with the wind
        for (let i = 0; i < DROPS; i++) { const o = i * 6; rainPos[o + 1] -= 20 * dt; rainPos[o + 4] -= 20 * dt; rainPos[o] += drift; rainPos[o + 3] += drift; if (rainPos[o + 1] < -2) resetDrop(i, true); }
        rainGeo.attributes.position.needsUpdate = true;
      }
      rain.position.set(camera.position.x, camera.position.y - 6, camera.position.z);

      // mist drifts
      for (const s of mists) {   // mist rolls along with the wind
        s.position.x += (s.userData.v * .3 + .6 + gust.value * 1.4) * dt;
        if (s.position.x > player.x + 160) s.position.x -= 320;
        s.material.opacity = .045 + mood * .05 + fogAmt * .14;
      }

      // fireflies around the reader
      burst = Math.max(0, burst - dt * .35);
      for (let i = 0; i < FLIES; i++) {
        const f = flies[i]; f.a += dt * f.s * (1 + burst * 4);
        const r = f.r * (1 - burst * .5), y = f.y + Math.sin(t * f.s * 4 + i) * .3 + burst * (i % 4) * .8;
        flyPos.set([player.x + Math.sin(f.a) * r, player.y + y, player.z + Math.cos(f.a) * r], i * 3);
      }
      flyGeo.attributes.position.needsUpdate = true;
      flyMat.opacity = (.55 + Math.sin(t * 3) * .15) * (1 - mood * .6) + burst * .4;

      // demons
      let ci = 0;
      const fwx = Math.sin(player.heading), fwz = Math.cos(player.heading);
      for (const id in demons) {
        const d = demons[id], u = d.userData;
        u.scale += (u.scaleT - u.scale) * .05; d.scale.setScalar(Math.max(.001, u.scale));
        if (u.mode === 'attack') {
          v3.set(player.x + fwx * 2.6 + fwz * 1.1, 0, player.z + fwz * 2.6 - fwx * 1.1);
          v3.y = groundH(v3.x, v3.z) + .15 + Math.sin(t * 1.4 + u.phase) * .15;
          d.position.lerp(v3, .05);
          if (id === 'flutter') d.position.x += (Math.random() - .5) * .05;
        } else {
          const a = t * .45 + ci * (Math.PI / 2) + u.phase;
          v3.set(player.x + Math.sin(a) * 1.3, 0, player.z + Math.cos(a) * 1.3); v3.y = groundH(v3.x, v3.z) + Math.abs(Math.sin(t * 2.5 + ci)) * .08;
          d.position.lerp(v3, .08); ci++;
        }
        d.rotation.y = Math.atan2(camera.position.x - d.position.x, camera.position.z - d.position.z);
      }

      // the Closing Wall ring
      ringR += (ringRT - ringR) * .03; ringH += (ringHT - ringH) * .03;
      ring.visible = ringH > .05;
      if (ring.visible) {
        const segLen = 2 * Math.PI * ringR / RING_N * 1.08;
        ring.children.forEach(s => {
          const a = s.userData.a, x = ringCenter.x + Math.sin(a) * ringR, z = ringCenter.z + Math.cos(a) * ringR;
          s.position.set(x, groundH(x, z) - .3, z); s.rotation.y = a + Math.PI / 2; s.scale.set(segLen, ringH, 1.2);
        });
      }
      lanterns.forEach((l, i) => {
        if (!l.visible) return;
        v3.set(LANTERN_NDC[i][0], LANTERN_NDC[i][1], .5).unproject(camera).sub(camera.position).normalize();
        l.position.copy(camera.position).addScaledVector(v3, 4);
        l.position.y += Math.sin(t * 1.5 + i) * .05;
        const u = l.userData;
        u.core.material.opacity += ((u.lit ? 1 : .5) - u.core.material.opacity) * .1;
        u.halo.material.opacity = u.lit ? .95 : .35 + Math.sin(t * 3 + i) * .15;
        u.halo.scale.setScalar(u.lit ? 2 : 1.1);
        u.light.intensity += ((u.lit ? 3 * LI : 0) - u.light.intensity) * .08;
      });

      water.material.uniforms.time.value += dt * (.45 + gust.value * .35);
      for (const f of flows) { f.tex.offset.x += dt * f.speed; f.mat.opacity = f.op * (1 - fogAmt * .5); }   // the river flows
      grass.userData.follow(player.x, player.z);
      composer.render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      ok: true,
      setReader,
      setControl: on => { control = on; if (!on) keys.clear(); if (on) camMode = 'follow'; },
      walkTo: (target, cb) => {
        walkTarget = typeof target === 'string' ? TARGETS[target] : target;
        if (!walkTarget) { console.warn(`Unknown walk target "${target}". Use house, river, bridge or tower.`); cb && cb(); return; }
        onArrive = cb; control = true; camMode = 'follow';
      },
      joystick: (x, y) => { joy.x = x; joy.y = y; },
      // the night: 0 = dusk, 1 = sunrise (for a 'home before sunrise' timer)
      getNight: () => night,
      setNight: p => { night = clamp(p, 0, 1); },
      // for testing: jump the Reader somewhere, facing a direction (radians; Math.PI = toward the tower)
      teleport: (x, z, heading = Math.PI, pitch = .32) => { camPitch = pitch; Object.assign(player, { x, z, heading }); player.y = groundH(x, z); camYaw = heading; camPos.set(x - Math.sin(heading) * 5, player.y + 3, z - Math.cos(heading) * 5); },
      view: mode => { camMode = mode; },
      setMood: cold => { moodT = cold ? 1 : 0; },
      fog: on => { fogT = on ? 1 : 0; },
      shake: on => { shaking = on; },
      summon: id => { const d = demons[id] || (demons[id] = makeDemon()); d.position.set(player.x + 6, player.y, player.z - 4); Object.assign(d.userData, { mode: 'attack', scaleT: 1.5 }); },
      settle: id => { const d = demons[id]; if (d) Object.assign(d.userData, { mode: 'friend', scaleT: .45 }); },
      celebrate: () => { burst = 1; },
      walls: cb => {
        onLantern = cb; wallsActive = true; wallsLit = 0;
        ringCenter.set(player.x, 0, player.z); ringR = 30; ringRT = 6; ringH = 0; ringHT = 8;
        lanterns.forEach(l => { l.visible = true; l.userData.lit = false; l.userData.light.intensity = 0; });
      },
      reset: () => {
        for (const id in demons) { scene.remove(demons[id]); delete demons[id]; }
        fogT = 0; shaking = false; moodT = 0; walkTarget = null; onArrive = null; control = false;
        Object.assign(player, { x: L.start.x, z: L.start.z, heading: Math.PI, speed: 0 }); player.y = groundH(player.x, player.z);
        camYaw = Math.PI; camMode = 'follow'; night = .06;
      }
    };
  }

  GAME.createWorld = createWorld;
})();
