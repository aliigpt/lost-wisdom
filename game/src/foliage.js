// =====================================================================
//  FOLIAGE: grows 3D trees and grass from photo textures, the way most
//  modern games do it. Trunks and branches are real 3D geometry with bark;
//  leaves, needles and grass are small textured pieces with see-through
//  edges, layered at many angles so they look full from every side.
//
//  Textures live in public/textures/ (made with Higgsfield):
//    leaves-oak.webp, needles-pine.webp, grass-clump.webp, fern.webp,
//    bark-oak.jpg, bark-pine.jpg
// =====================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const T = THREE;
// One wind for the whole world. `wind` is the clock, `gust` its strength (0..~1.3),
// updated every frame by world.js. Trees, leaves, grass, ferns, mist and rain all use it.
export const wind = { value: 0 };
export const gust = { value: 1 };
// moon direction in view space + its color, for light shining through leaves (set by world.js)
export const moonView = { value: new THREE.Vector3(0, 1, 0) };
export const moonColor = { value: new THREE.Color('#9fb2e0') };

export function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Vertex shader code that bends a plant in the wind. Heights are normalized (0 at the
// root, 1 at the top), so the top moves most. FLUTTER adds fast leaf trembling on top.
function windCode(bend, flutter) {
  return `#include <begin_vertex>
    float ph = 0.0;
    #ifdef USE_INSTANCING
      ph = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.17;
    #endif
    float h = max(position.y, 0.0);
    float sway = (sin(uTime * 0.85 + ph) * 0.65 + sin(uTime * 2.1 + ph * 1.3) * 0.25 + 0.35) * uGust * h * h * ${bend.toFixed(4)};
    transformed.x += sway; transformed.z += sway * 0.45;
    ${flutter ? `transformed.x += sin(uTime * 7.0 + ph * 3.0 + position.x * 23.0 + position.z * 17.0) * ${flutter.toFixed(4)} * uGust * h;
    transformed.y += cos(uTime * 5.5 + ph * 2.0 + position.z * 19.0) * ${(flutter * .7).toFixed(4)} * uGust * h;` : ''}`;
}
function addWind(m, bend, flutter, leaf) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind; sh.uniforms.uGust = gust;
    let vs = 'uniform float uTime; uniform float uGust;\n' + sh.vertexShader.replace('#include <begin_vertex>', windCode(bend, flutter));
    if (leaf) {
      // aAO: 0 deep inside the crown (dark) .. 1 on the outside (lit)
      vs = 'attribute float aAO; varying float vAO;\n' + vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAO = aAO;');
      sh.uniforms.uMoonView = moonView; sh.uniforms.uMoonCol = moonColor;
      sh.fragmentShader = 'varying float vAO; uniform vec3 uMoonView; uniform vec3 uMoonCol;\n' + bothSidesLit(sh.fragmentShader)
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.28, 1.0, vAO);')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          // light shining through thin leaves when the moon is behind them
          float back = pow(max(dot(-normalize(vViewPosition), uMoonView), 0.0), 3.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * uMoonCol * (0.12 + back * 1.1) * mix(0.4, 1.0, vAO);`);
    }
    sh.vertexShader = vs;
  };
  m.customProgramCacheKey = () => `wind-${bend}-${flutter}-${!!leaf}`;
}

// Cards are double-sided; by default three.js flips the normal on the back side, which
// turns half the leaves/grass black. Keep one normal for both sides instead.
const bothSidesLit = fs => fs.replace('#include <normal_fragment_begin>',
  T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));

// ----- Materials -----
export function foliageMaterials(renderer) {
  const loader = new T.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (url, repeat) => {
    const t = loader.load(url, undefined, undefined, () => console.info(`No texture at ${url}`));
    t.colorSpace = T.SRGBColorSpace; t.anisotropy = aniso;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  };
  const BEND = { tree: .022, fern: .09 };
  const card = (url, tint, bend, flutter) => {
    const map = tex(url);
    const m = new T.MeshStandardMaterial({ map, color: tint, alphaTest: .45, side: T.DoubleSide, roughness: .8 });
    m.userData.isFoliage = true;
    addWind(m, bend, flutter, true);
    // the shadow-casting copy bends the same way, so shadows move with the leaves
    m.customDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map, alphaTest: .45, side: T.DoubleSide });
    addWind(m.customDepth, bend, flutter, false);
    return m;
  };
  const bark = url => {
    const m = new T.MeshStandardMaterial({ map: tex(url, true), roughness: .95 });
    addWind(m, BEND.tree, 0, false);
    m.customDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }); addWind(m.customDepth, BEND.tree, 0, false);
    return m;
  };
  return {
    barkOak: bark('textures/bark-oak.jpg'),
    barkPine: bark('textures/bark-pine.jpg'),
    oakLeaves: card('textures/leaves-oak.webp', '#c9d4b8', BEND.tree, .006),
    pineNeedles: card('textures/needles-pine.webp', '#c3cdb6', BEND.tree, .003),
    fern: card('textures/fern.webp', '#b9c6a6', BEND.fern, .01),
    grass: tex('textures/grass-clump.webp')
  };
}

// ----- Geometry helpers -----
// A tapered, bending limb along a curve (trunks and branches)
function limb(points, r0, r1, radial = 7) {
  const curve = new T.CatmullRomCurve3(points);
  const segs = Math.max(3, points.length * 3), L = curve.getLength();
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t), r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const n = new T.Vector3().addScaledVector(fr.normals[i], c).addScaledVector(fr.binormals[i], s);
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r); nor.push(n.x, n.y, n.z);
      uv.push(j / radial * Math.max(1, Math.round(r0 * 6)), t * L * 1.2);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// A flat textured piece (leaf cluster / needle spray), with normals pointing away
// from the crown center so the canopy is lit like one soft volume
function card(w, h, matrix, crownCenter, ao = 1) {
  const g = new T.PlaneGeometry(w, h);
  g.applyMatrix4(matrix);
  const p = g.attributes.position, n = g.attributes.normal, v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(crownCenter).normalize();
    n.setXYZ(i, v.x, v.y * .7 + .3, v.z);
  }
  g.setAttribute('aAO', new T.Float32BufferAttribute(new Array(p.count).fill(Math.max(0, Math.min(1, ao))), 1));
  return g;
}
const jitter = (r, a) => (r() - .5) * 2 * a;

// Scale a tree so its height is exactly 1 (instances are scaled to real height)
function normalize(geos, height) {
  const s = new T.Matrix4().makeScale(1 / height, 1 / height, 1 / height);
  geos.forEach(g => g.applyMatrix4(s));
}

// ----- Oak: thick bending trunk, spreading branches, leaf clusters at the ends -----
export function buildOak(seed, mats) {
  const r = rng(seed), bark = [], leaves = [];
  const top = new T.Vector3(jitter(r, .4), 3.4 + r() * .8, jitter(r, .4));
  bark.push(limb([new T.Vector3(0, -.3, 0), new T.Vector3(jitter(r, .2), 1.5, jitter(r, .2)), top], .5, .3, 9));
  const crown = new T.Vector3(0, 6.2, 0);
  const tips = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + r() * .6, up = .55 + r() * .4, len = 2.6 + r() * 1.6;
    const dir = new T.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    const start = top.clone().add(new T.Vector3(0, -r() * .8, 0));
    const mid = start.clone().addScaledVector(dir, len * .5).add(new T.Vector3(jitter(r, .3), .3, jitter(r, .3)));
    const end = start.clone().addScaledVector(dir, len).add(new T.Vector3(0, .4 + r() * .6, 0));
    bark.push(limb([start, mid, end], .24, .08));
    tips.push(end);
    const subs = 2 + Math.floor(r() * 2);
    for (let k = 0; k < subs; k++) {
      const b = a + jitter(r, 1.1), d2 = new T.Vector3(Math.cos(b), .4 + r() * .6, Math.sin(b)).normalize();
      const from = mid.clone().lerp(end, r() * .6), to = from.clone().addScaledVector(d2, 1.4 + r() * 1.1);
      bark.push(limb([from, from.clone().lerp(to, .5).add(new T.Vector3(0, .15, 0)), to], .09, .03, 5));
      tips.push(to);
    }
  }
  // fill the crown: clusters around every tip plus some in between
  const q = new T.Quaternion(), e = new T.Euler(), m = new T.Matrix4(), s = new T.Vector3(1, 1, 1);
  const place = (c, spread, count) => {
    for (let k = 0; k < count; k++) {
      const p = c.clone().add(new T.Vector3(jitter(r, spread), jitter(r, spread * .7), jitter(r, spread)));
      e.set(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI); q.setFromEuler(e);
      const size = 1.0 + r() * .7;
      const ao = Math.min(1, p.distanceTo(crown) / 3.6) * .8 + Math.min(1, Math.max(0, (p.y - 4) / 4)) * .3;
      leaves.push(card(size, size, m.compose(p, q, s), crown, ao));
    }
  };
  tips.forEach(t => place(t, 1.15, 13));
  for (let k = 0; k < 70; k++) place(crown.clone().add(new T.Vector3(jitter(r, 3), jitter(r, 1.6), jitter(r, 3))), .3, 1);
  const height = 9;
  const bg = mergeGeometries(bark), lg = mergeGeometries(leaves);
  normalize([bg, lg], height);
  const g = new T.Group();
  const bo = new T.Mesh(bg, mats.barkOak); bo.customDepthMaterial = mats.barkOak.customDepth; g.add(bo);
  const lm = new T.Mesh(lg, mats.oakLeaves); lm.customDepthMaterial = mats.oakLeaves.customDepth; g.add(lm);
  return g;
}

// ----- Pine: straight trunk, tiers of drooping branches covered in needle sprays -----
export function buildPine(seed, mats) {
  const r = rng(seed), bark = [], needles = [];
  const H = 15 + r() * 3;
  bark.push(limb([new T.Vector3(0, -.3, 0), new T.Vector3(jitter(r, .15), H * .5, jitter(r, .15)), new T.Vector3(0, H, 0)], .36, .03, 8));
  const q = new T.Quaternion(), m = new T.Matrix4(), s = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0);
  const axis = new T.Vector3(0, H * .55, 0);
  for (let y = 2.6; y < H - .4; y += .55 + r() * .35) {
    const k = (y - 2.6) / (H - 3), len = (1 - k) * 3.6 + .5;
    const count = 5 + Math.floor(r() * 3), off = r() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = off + i / count * Math.PI * 2 + jitter(r, .25), droop = -.18 - r() * .2;
      const dir = new T.Vector3(Math.cos(a), droop, Math.sin(a)).normalize();
      const start = new T.Vector3(0, y, 0), end = start.clone().addScaledVector(dir, len);
      bark.push(limb([start, start.clone().lerp(end, .5), end], .06 * (1 - k) + .02, .015, 4));
      // two needle sprays per branch, lying along it, slightly tilted apart
      [-.25, .25].forEach(tilt => {
        const center = start.clone().lerp(end, .55);
        const flat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2 + tilt);
        const yaw = new T.Quaternion().setFromAxisAngle(up, -a);
        const pitch = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), droop);
        q.copy(yaw).multiply(pitch).multiply(flat);
        needles.push(card(len * 1.15, len * .62, m.compose(center, q, s), axis, .45 + k * .35 + (tilt > 0 ? .2 : 0)));
      });
    }
  }
  for (let i = 0; i < 3; i++) {   // the very top
    q.setFromAxisAngle(up, i * Math.PI / 3);
    needles.push(card(.9, 1.6, m.compose(new T.Vector3(0, H - .2, 0), q, s), axis, 1));
  }
  const bg = mergeGeometries(bark), ng = mergeGeometries(needles);
  normalize([bg, ng], H);
  const g = new T.Group();
  const bp = new T.Mesh(bg, mats.barkPine); bp.customDepthMaterial = mats.barkPine.customDepth; g.add(bp);
  const nm = new T.Mesh(ng, mats.pineNeedles); nm.customDepthMaterial = mats.pineNeedles.customDepth; g.add(nm);
  return g;
}

// ----- Fern: a rosette of fronds arching outward -----
export function buildFern(mats) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const g = new T.PlaneGeometry(.45, 1);
    g.translate(0, .5, 0);
    g.applyMatrix4(new T.Matrix4().makeRotationX(-.95));
    g.applyMatrix4(new T.Matrix4().makeRotationY(i / 6 * Math.PI * 2));
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  normalize([geo], .85);
  const fp = geo.attributes.position, fao = new Float32Array(fp.count);
  for (let i = 0; i < fp.count; i++) fao[i] = .25 + Math.min(1, fp.getY(i)) * .75;
  geo.setAttribute('aAO', new T.BufferAttribute(fao, 1));
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const g = new T.Group();
  const mesh = new T.Mesh(geo, mats.fern); mesh.customDepthMaterial = mats.fern.customDepth; g.add(mesh);
  return g;
}

// ----- Grass: a field of clumps that follows the Reader -----
// heightTex: R = ground height, G = 1 where grass may grow. size: world size it covers.
export function buildGrass(mats, heightTex, size, count = 16000, radius = 28) {
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const g = new T.PlaneGeometry(.85, .55, 1, 2); g.translate(0, .275, 0);
    g.applyMatrix4(new T.Matrix4().makeRotationY(i / 3 * Math.PI));
    blades.push(g);
  }
  const base = mergeGeometries(blades);
  const geo = new T.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv; geo.attributes.normal = base.attributes.normal;
  const data = new Float32Array(count * 4), r = rng(77);
  for (let i = 0; i < count; i++) data.set([(r() - .5) * radius * 2, (r() - .5) * radius * 2, r() * Math.PI, .6 + r() * .6], i * 4);
  geo.setAttribute('aG', new T.InstancedBufferAttribute(data, 4));
  geo.instanceCount = count;
  const center = { value: new T.Vector2() };
  const mat = new T.MeshStandardMaterial({ map: mats.grass, alphaTest: .5, side: T.DoubleSide, roughness: .9, color: '#86a070' });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uMoonView: moonView, uMoonCol: moonColor, uTime: wind, uGust: gust, uCenter: center, uHeight: { value: heightTex }, uSize: { value: size }, uHalf: { value: radius }, uN: { value: heightTex.image.width } });
    sh.vertexShader = `varying float vH; uniform float uTime; uniform float uGust; uniform vec2 uCenter; uniform sampler2D uHeight; uniform float uSize; uniform float uHalf; uniform float uN; attribute vec4 aG;\n` +
      sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec2 off = mod(aG.xy - uCenter + uHalf, 2.0 * uHalf) - uHalf + uCenter;
          vec4 hm = texture2D(uHeight, ((off + uSize * 0.5) / uSize * (uN - 1.0) + 0.5) / uN);
          float fade = smoothstep(uHalf, uHalf * 0.6, length(off - uCenter)) * step(0.5, hm.g);
          float c = cos(aG.z), s = sin(aG.z);
          vec3 transformed = position; vH = position.y / 0.55;
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
          transformed *= aG.w * fade;
          // gusts roll across the field as waves
          float wave = sin(uTime * 1.6 - off.x * 0.18 + off.y * 0.07) * 0.5 + 0.5;
          float lean = (0.04 + wave * 0.14) * uGust;
          transformed.x += (lean + sin(uTime * 5.0 + off.y * 3.1) * 0.015) * position.y;
          transformed.z += (lean * 0.4 + cos(uTime * 4.3 + off.x * 2.7) * 0.012) * position.y;
          transformed.xz += off; transformed.y += hm.r - 0.04;`);
    sh.fragmentShader = 'varying float vH; uniform vec3 uMoonView; uniform vec3 uMoonCol;\n' + bothSidesLit(sh.fragmentShader)
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.22, 1.05, smoothstep(0.0, 0.9, vH));')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float back = pow(max(dot(-normalize(vViewPosition), uMoonView), 0.0), 3.0);
        reflectedLight.directDiffuse += diffuseColor.rgb * uMoonCol * (0.1 + back * 0.9) * vH;`);
  };
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.receiveShadow = true;
  mesh.userData.follow = (x, z) => center.value.set(x, z);
  return mesh;
}
