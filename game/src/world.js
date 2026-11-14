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
    renderer.toneMappingExposure = 1.2;

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(55, 1, .1, 900);
    const C = h => new T.Color(h);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // ----- Moods: calm night vs. demon night (plus grey for the Fog) -----
    const WARM = { top: C('#04060d'), bottom: C('#1a2438'), fog: C('#141c2c'), hSky: C('#8fa0c4'), hGround: C('#15140f'), hemi: .5, moon: .75, density: .028 };
    const COLD = { top: C('#020306'), bottom: C('#141a24'), fog: C('#10141b'), hSky: C('#6f7f9c'), hGround: C('#0d0f13'), hemi: .3, moon: .15, density: .045 };
    const GREY = C('#6b7079');

    // ----- Sky: gradient dome, stars, painted horizon (all follow the camera) -----
    const sky = new T.Group(); scene.add(sky);
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: C('#fff') }, bottom: { value: C('#fff') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.4 + .15, 0., 1.); gl_FragColor = vec4(mix(bottom, top, h), 1.);\n#include <colorspace_fragment>\n}'
    });
    sky.add(new T.Mesh(new T.SphereGeometry(600, 32, 16), skyMat));
    const STARS = 2000, starPos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const y = .15 + Math.random() * .85, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      starPos.set([Math.cos(th) * r * 560, y * 560, Math.sin(th) * r * 560], i * 3);
    }
    const starGeo = new T.BufferGeometry(); starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
    const starMat = new T.PointsMaterial({ color: '#dfe6ff', size: 1.6, sizeAttenuation: true, fog: false, transparent: true, opacity: .8, depthWrite: false });
    sky.add(new T.Points(starGeo, starMat));
    const backdropMat = new T.MeshBasicMaterial({ side: T.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 });
    const backdrop = new T.Mesh(new T.CylinderGeometry(480, 480, 300, 64, 1, true), backdropMat);
    backdrop.position.y = 70; sky.add(backdrop);
    new T.TextureLoader().load('textures/backdrop.jpg', tex => {
      tex.colorSpace = T.SRGBColorSpace; tex.wrapS = T.MirroredRepeatWrapping; tex.repeat.set(4, 1);
      backdropMat.map = tex; backdropMat.opacity = 1; backdropMat.needsUpdate = true;
    }, undefined, () => console.info('No backdrop at textures/backdrop.jpg'));
    scene.fog = new T.FogExp2(0x000000, .03);

    // ----- Light -----
    const hemi = new T.HemisphereLight(0xffffff, 0x222222, .5); scene.add(hemi);
    const moon = new T.DirectionalLight(0xb8c6ff, 1);
    moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -.0004; moon.shadow.normalBias = .04;
    Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
    scene.add(moon, moon.target);
    const MOON_DIR = new T.Vector3(-.45, .75, -.5).normalize();

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
    tiled('textures/grass.jpg', mat.ground, L.size / 7, L.size / 7, '#8b9878');

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
      tiled('textures/cobble.jpg', mat.path, 1, 1, '#7d6c58');
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

    // ----- Ground mist (soft sprites over the river and in hollows) -----
    const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(200,210,230,.55)'); g.addColorStop(1, 'rgba(200,210,230,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
    const mists = [];
    for (let i = 0; i < 40; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: .12, color: '#aab6cc' }));
      const nearRiver = i < 26, x = (rnd() - .5) * (nearRiver ? 160 : 300), z = nearRiver ? RZ + (rnd() - .5) * 18 : (rnd() - .5) * 300;
      s.position.set(x, (nearRiver ? WATER_Y : groundH(x, z)) + 1.2, z); s.scale.set(26, 7, 1);
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
    const items = { oak: [], pine: [], rock: [] };
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
    const CH = 64;
    function plant(kind, proto) {   // proto: an Object3D fitted to height 1, standing at the origin
      for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i].kind === kind) { forest.remove(chunks[i].mesh); chunks.splice(i, 1); }
      proto.updateMatrixWorld(true);
      const parts = []; proto.traverse(o => { if (o.isMesh) parts.push(o); });
      const groups = new Map();
      for (const it of items[kind]) { const k = `${Math.floor(it.x / CH)},${Math.floor(it.z / CH)}`; (groups.get(k) || groups.set(k, []).get(k)).push(it); }
      const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), s = new T.Vector3(), p = new T.Vector3();
      for (const [key, list] of groups) {
        const [cx, cz] = key.split(',').map(Number);
        for (const part of parts) {
          const im = new T.InstancedMesh(part.geometry, part.material, list.length);
          list.forEach((it, j) => {
            q.setFromAxisAngle(up, it.rot); s.setScalar(it.s); p.set(it.x, it.y, it.z);
            m.compose(p, q, s).multiply(part.matrixWorld); im.setMatrixAt(j, m);
          });
          im.castShadow = kind !== 'rock'; im.receiveShadow = true; im.computeBoundingSphere();
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
    ['oak', 'pine', 'rock'].forEach(kind => {
      plant(kind, standIn(kind));
      const file = { oak: 'tree-oak', pine: 'tree-pine', rock: 'rocks' }[kind];
      loader.load(`models/${file}.glb`, g => plant(kind, fit(g.scene, { height: kind === 'rock' ? .9 : 1 })),
        undefined, () => console.info(`No model at models/${file}.glb; using simple trees.`));
    });

    // ----- The Reader (boy or girl) and the player controller -----
    const reader = new T.Group(); scene.add(reader);
    const readerShapes = [add(new T.ConeGeometry(.42, 1.1, 12), mat.cloak, 0, .55, 0, reader), add(new T.SphereGeometry(.17, 14, 10), mat.skin, 0, 1.25, 0, reader)];
    const lantern = add(new T.SphereGeometry(.07, 10, 8), mat.glow, .32, .72, .2, reader);
    const lanternLight = new T.PointLight('#ffb862', 2.2 * LI, 11, 1.7); lanternLight.position.set(.32, .85, .3); lanternLight.castShadow = false; reader.add(lanternLight);
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
      }, undefined, () => console.info(`No model at models/reader-${kind}.glb; using a simple shape.`));
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

      // colors and light
      const g = fogAmt * .6;
      skyMat.uniforms.top.value.copy(mix(WARM.top, COLD.top, mood)).lerp(GREY, g * .5);
      skyMat.uniforms.bottom.value.copy(mix(WARM.bottom, COLD.bottom, mood)).lerp(GREY, g);
      scene.fog.color.copy(mix(WARM.fog, COLD.fog, mood)).lerp(GREY, g);
      scene.fog.density = lerp(WARM.density, COLD.density, mood) + fogAmt * .05;
      hemi.color.copy(mix(WARM.hSky, COLD.hSky, mood)); hemi.groundColor.copy(mix(WARM.hGround, COLD.hGround, mood));
      hemi.intensity = lerp(WARM.hemi, COLD.hemi, mood) * (1 - fogAmt * .3) * LI;
      moon.intensity = lerp(WARM.moon, COLD.moon, mood) * (1 - fogAmt * .6) * LI;
      backdropMat.color.setScalar(1 - Math.max(mood, fogAmt) * .6);
      starMat.opacity = .8 * (1 - Math.max(mood, fogAmt) * .85);
      lanternLight.intensity = (2.2 + mood * 1.5) * LI * (shaking ? .6 + Math.random() * .6 : 1);
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

      // moonlight shadows follow the player
      moon.target.position.set(player.x, player.y, player.z);
      moon.position.copy(moon.target.position).addScaledVector(MOON_DIR, 70);

      // only draw forest chunks near the camera
      for (const c of chunks) c.mesh.visible = Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 150;

      // rain
      if (rainMat.opacity > .01) {
        for (let i = 0; i < DROPS; i++) { const o = i * 6; rainPos[o + 1] -= 20 * dt; rainPos[o + 4] -= 20 * dt; if (rainPos[o + 1] < -2) resetDrop(i, true); }
        rainGeo.attributes.position.needsUpdate = true;
      }
      rain.position.set(camera.position.x, camera.position.y - 6, camera.position.z);

      // mist drifts
      for (const s of mists) { s.position.x += s.userData.v * dt; if (s.position.x > 160) s.position.x = -160; if (s.position.x < -160) s.position.x = 160; s.material.opacity = .1 + mood * .08 + fogAmt * .15; }

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

      water.material.uniforms.time.value += dt * .5;
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
      // for testing: jump the Reader somewhere, facing a direction (radians; Math.PI = toward the tower)
      teleport: (x, z, heading = Math.PI) => { Object.assign(player, { x, z, heading }); player.y = groundH(x, z); camYaw = heading; camPos.set(x - Math.sin(heading) * 5, player.y + 3, z - Math.cos(heading) * 5); },
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
        camYaw = Math.PI; camMode = 'follow';
      }
    };
  }

  GAME.createWorld = createWorld;
})();
