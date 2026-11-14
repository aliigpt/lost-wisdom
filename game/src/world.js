// =====================================================================
//  THE 3D WORLD (Three.js): the walled town, weather, demons, lanterns.
//  Exposes GAME.createWorld(canvas) -> an object the rest of the game
//  talks to: setMood, fog, shake, summon, settle, celebrate, walls, view.
// =====================================================================

window.GAME = window.GAME || {};

(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function createWorld(canvas) {
    const noop = () => {};
    if (!window.THREE) return { ok: false, setMood: noop, fog: noop, shake: noop, summon: noop, settle: noop, celebrate: noop, walls: noop, reset: noop };
    const T = THREE;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true }); }
    catch (e) { return { ok: false, setMood: noop, fog: noop, shake: noop, summon: noop, settle: noop, celebrate: noop, walls: noop, reset: noop }; }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(50, 1, 0.1, 200);
    const C = h => new T.Color(h);

    // Two moods; every frame blends between them (plus a grey "fog" mood for depression)
    const WARM = { top: C('#f9dba2'), bottom: C('#f0a468'), fog: C('#f1b27a'), hSky: C('#fff0d4'), hGround: C('#7a5c40'), hemi: .58, sun: 1.1, density: .016 };
    const COLD = { top: C('#25303f'), bottom: C('#4a5668'), fog: C('#3b4657'), hSky: C('#9fb2cc'), hGround: C('#1b212b'), hemi: .42, sun: .12, density: .04 };
    const GREY = C('#7b8089');

    // Sky dome
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      uniforms: { top: { value: C('#fff') }, bottom: { value: C('#fff') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + .2, 0., 1.); gl_FragColor = vec4(mix(bottom, top, h), 1.); }'
    });
    scene.add(new T.Mesh(new T.SphereGeometry(95, 32, 16), skyMat));
    scene.fog = new T.FogExp2(0xffffff, .02);

    // Light
    const hemi = new T.HemisphereLight(0xffffff, 0x444444, .8); scene.add(hemi);
    const sun = new T.DirectionalLight(0xffe2b0, 1.5);
    sun.position.set(-18, 24, -16); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    const sunDisc = new T.Mesh(new T.SphereGeometry(5, 24, 16), new T.MeshBasicMaterial({ color: '#fff3c8', fog: false, transparent: true }));
    sunDisc.position.set(-46, 30, -70); scene.add(sunDisc);

    // Materials (flat-shaded, storybook low-poly)
    const M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, flatShading: true, roughness: .92, ...o });
    const mat = {
      ground: M('#9a9a5c'), cobble: M('#cdb48a'), stone: M('#dcc194'), stoneDark: M('#b89a6c'),
      roof: M('#9c5a43'), roofB: M('#6d7d5b'), roofC: M('#8a6d8f'), house: M('#f0e0bf'),
      cloak: M('#2f6f73'), skin: M('#f1c9a2'), wood: M('#6e4a2f'), dark: M('#3a2c25'),
      glow: new T.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: .5, flatShading: true }),
      face: new T.MeshStandardMaterial({ color: '#f6ecd2', emissive: '#f6e2a8', emissiveIntensity: .25 }),
      shadowBody: new T.MeshStandardMaterial({ color: '#100f18', roughness: 1, flatShading: true }),
      eye: new T.MeshBasicMaterial({ color: '#f2d48a' })
    };
    const add = (geo, m, x, y, z, parent = scene) => {
      const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
    };

    // Ground
    const ground = add(new T.CircleGeometry(80, 48), mat.ground, 0, 0, 0); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
    const plaza = add(new T.CircleGeometry(3.6, 20), mat.cobble, 0, .01, 0); plaza.rotation.x = -Math.PI / 2; plaza.castShadow = false;

    // The Archive tower, with its handless clock
    const tower = new T.Group(); scene.add(tower);
    add(new T.CylinderGeometry(1.5, 1.75, 7, 8), mat.stone, 0, 3.5, 0, tower);
    add(new T.CylinderGeometry(1.75, 1.75, .35, 8), mat.stoneDark, 0, 7.1, 0, tower);
    add(new T.ConeGeometry(2.1, 2.8, 8), mat.roof, 0, 8.65, 0, tower);
    const clock = add(new T.CircleGeometry(.62, 20), mat.face, 0, 5.6, 1.66, tower); clock.castShadow = false;
    add(new T.BoxGeometry(.8, 1.4, .3), mat.wood, 0, .7, 1.62, tower);
    const towerWindows = [];
    [[-.75, 3.2], [.75, 3.2], [0, 4.2]].forEach(([x, y]) => towerWindows.push(add(new T.BoxGeometry(.32, .5, .2), mat.glow, x, y, 1.58, tower)));

    // Houses (seeded so the town is the same every visit)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const houses = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * .2;
      const r = 5.5 + rnd() * 7;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (z > 2.5 && Math.abs(x) < 4) continue; // keep the reader's lane clear
      const w = 1.4 + rnd() * 1.1, h = 1.3 + rnd() * 1.3, d = 1.4 + rnd() * 1;
      const g = new T.Group(); g.position.set(x, 0, z); scene.add(g);
      add(new T.BoxGeometry(w, h, d), mat.house, 0, h / 2, 0, g);
      const roof = add(new T.ConeGeometry(Math.max(w, d) * .78, 1.1 + rnd() * .5, 4), [mat.roof, mat.roofB, mat.roofC][i % 3], 0, h + .5, 0, g);
      roof.rotation.y = Math.PI / 4;
      add(new T.BoxGeometry(.3, .4, .06), mat.glow, w * .22, h * .6, d / 2 + .02, g);
      g.lookAt(0, 0, 0);
      houses.push({ g, dist: r });
    }

    // The ring wall — segments move with wallR / wallH so the wall can close in
    const WALL_N = 60, WALL_R = 16, WALL_H = 3;
    const segGeo = new T.BoxGeometry(2 * Math.PI * WALL_R / WALL_N * 1.04, 3, .9); segGeo.translate(0, 1.5, 0);
    const merlonGeo = new T.BoxGeometry(.6, .5, .95); merlonGeo.translate(0, 3.25, 0);
    const segs = [];
    let gateLamp;
    for (let i = 0; i < WALL_N; i++) {
      const a = (i / WALL_N) * Math.PI * 2;
      const s = new T.Group(); scene.add(s);
      add(segGeo, i % 7 === 0 ? mat.stoneDark : mat.stone, 0, 0, 0, s);
      add(merlonGeo, mat.stone, 0, 0, 0, s);
      if (i === 37) { // the Gate, back-left
        add(new T.BoxGeometry(1.4, 2, .2), mat.dark, 0, 1, .48, s);
        gateLamp = add(new T.SphereGeometry(.22, 10, 8), mat.glow, 0, 2.6, .7, s);
        const pl = new T.PointLight('#ffcf80', .9, 7); pl.position.set(0, 2.6, 1.2); s.add(pl);
      }
      segs.push({ s, a });
    }
    let wallR = WALL_R, wallH = WALL_H, wallRT = WALL_R, wallHT = WALL_H;

    // The Reader
    const reader = new T.Group(); reader.position.set(0, 0, 4.2); scene.add(reader);
    add(new T.ConeGeometry(.48, 1.15, 7), mat.cloak, 0, .58, 0, reader);
    add(new T.SphereGeometry(.3, 12, 10), mat.skin, 0, 1.3, 0, reader);
    const hood = add(new T.ConeGeometry(.36, .6, 7), mat.cloak, 0, 1.58, -.05, reader); hood.rotation.x = -.25;
    add(new T.BoxGeometry(.3, .26, .14), mat.wood, -.32, .62, .12, reader);
    const lantern = add(new T.SphereGeometry(.11, 10, 8), mat.glow, .42, .62, .18, reader);
    const lanternLight = new T.PointLight('#ffc46b', .5, 5); lanternLight.position.set(.42, .7, .3); reader.add(lanternLight);

    // Shadow-pieces (the demons) — big while they're attacking, small companions afterwards
    const blobs = {};
    function makeBlob() {
      const g = new T.Group();
      const body = add(new T.SphereGeometry(.6, 12, 9), mat.shadowBody, 0, 0, 0, g); body.scale.set(1, .92, 1);
      const eyes = new T.Group(); g.add(eyes);
      [-.2, .2].forEach(x => { const e = new T.Mesh(new T.SphereGeometry(.08, 8, 6), mat.eye); e.position.set(x, .1, .54); eyes.add(e); });
      g.userData = { eyes, scale: 0, scaleT: 0, mode: 'attack', idx: 0, phase: rnd() * 6 };
      g.scale.setScalar(.001); scene.add(g);
      return g;
    }

    // Moth-lanterns (glowing particles)
    const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,245,210,1)'); gr.addColorStop(.35, 'rgba(255,215,130,.8)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
    const MOTHS = 70, mothPos = new Float32Array(MOTHS * 3), moth = [];
    for (let i = 0; i < MOTHS; i++) moth.push({ a: rnd() * 6.28, r: 2 + rnd() * 6, y: 1 + rnd() * 6, s: .2 + rnd() * .4, vy: 0 });
    const mothGeo = new T.BufferGeometry(); mothGeo.setAttribute('position', new T.BufferAttribute(mothPos, 3));
    const mothMat = new T.PointsMaterial({ size: .35, map: dot, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .55 });
    scene.add(new T.Points(mothGeo, mothMat));
    let burst = 0;

    // Rain
    const DROPS = reduce ? 400 : 1600, rainPos = new Float32Array(DROPS * 6);
    const resetDrop = (i, top) => {
      const x = (rnd() - .5) * 34, z = (rnd() - .5) * 34 + 2, y = top ? 18 + rnd() * 4 : rnd() * 20;
      rainPos.set([x, y, z, x + .06, y + .55, z], i * 6);
    };
    for (let i = 0; i < DROPS; i++) resetDrop(i, false);
    const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
    const rainMat = new T.LineBasicMaterial({ color: '#d4e0f0', transparent: true, opacity: 0, depthWrite: false });
    const rain = new T.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);

    // Lanterns for the Closing Wall (placed in screen space so they're always findable)
    const LANTERN_NDC = [[-.62, .3], [.64, .02], [-.12, -.42]];
    const lanterns = LANTERN_NDC.map(() => {
      const g = new T.Group(); g.visible = false; scene.add(g);
      const core = new T.Mesh(new T.SphereGeometry(.16, 12, 10), new T.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: .6 }));
      const halo = new T.Sprite(new T.SpriteMaterial({ map: dot, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .5 }));
      halo.scale.setScalar(1.2);
      const hit = new T.Mesh(new T.SphereGeometry(.7, 8, 6), new T.MeshBasicMaterial({ visible: false }));
      const light = new T.PointLight('#ffd68a', 0, 9);
      g.add(core, halo, hit, light);
      g.userData = { core, halo, hit, light, lit: false };
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
      wallRT = Math.min(WALL_R, 8.5 + wallsLit * 2.6); wallHT = Math.max(WALL_H, 9 - wallsLit * 2);
      if (wallsLit === 3) {
        wallsActive = false; wallRT = WALL_R; wallHT = WALL_H; camMode = 'home';
        setTimeout(() => lanterns.forEach(l => { l.visible = false; }), 1600);
      }
      onLantern && onLantern(wallsLit);
    });

    // Mood state
    let mood = 0, moodT = 0, fogAmt = 0, fogT = 0, shaking = false, camMode = 'title';
    const camPos = new T.Vector3(0, 9, 26), camLook = new T.Vector3(0, 2.4, 0), tmpA = new T.Color(), tmpB = new T.Color();
    const v3 = new T.Vector3();

    function resize() {
      const w = innerWidth, h = innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize); resize();

    const mix = (a, b, t, out) => out.copy(a).lerp(b, t);
    const clock3 = new T.Clock();
    function frame() {
      const dt = Math.min(.05, clock3.getDelta()), t = clock3.elapsedTime;
      mood += (moodT - mood) * .025; fogAmt += (fogT - fogAmt) * .02;

      // Colors & light
      const g = fogAmt * .7;
      skyMat.uniforms.top.value.copy(mix(WARM.top, COLD.top, mood, tmpA)).lerp(GREY, g);
      skyMat.uniforms.bottom.value.copy(mix(WARM.bottom, COLD.bottom, mood, tmpA)).lerp(GREY, g);
      scene.fog.color.copy(mix(WARM.fog, COLD.fog, mood, tmpA)).lerp(GREY, g);
      scene.fog.density = T.MathUtils.lerp(WARM.density, COLD.density, mood) + fogAmt * .06;
      hemi.color.copy(mix(WARM.hSky, COLD.hSky, mood, tmpB));
      hemi.groundColor.copy(mix(WARM.hGround, COLD.hGround, mood, tmpB));
      hemi.intensity = T.MathUtils.lerp(WARM.hemi, COLD.hemi, mood) * (1 - fogAmt * .3);
      sun.intensity = T.MathUtils.lerp(WARM.sun, COLD.sun, mood) * (1 - fogAmt * .7);
      sunDisc.material.opacity = 1 - Math.max(mood, fogAmt);
      const glowI = .4 + mood * 1.1;
      mat.glow.emissiveIntensity = shaking ? glowI * (.6 + Math.random() * .6) : glowI;
      lanternLight.intensity = .4 + mood * 1.2;
      rainMat.opacity = mood * .5;

      // Rain fall
      if (rainMat.opacity > .01) {
        for (let i = 0; i < DROPS; i++) {
          const o = i * 6; rainPos[o + 1] -= 22 * dt; rainPos[o + 4] -= 22 * dt; rainPos[o] -= 2 * dt; rainPos[o + 3] -= 2 * dt;
          if (rainPos[o + 1] < 0) resetDrop(i, true);
        }
        rainGeo.attributes.position.needsUpdate = true;
      }

      // Wall closing in / stepping back
      wallR += (wallRT - wallR) * .03; wallH += (wallHT - wallH) * .03;
      for (const { s, a } of segs) { s.position.set(Math.sin(a) * wallR, 0, Math.cos(a) * wallR); s.rotation.y = a + Math.PI; s.scale.y = wallH / WALL_H; }
      for (const h of houses) { const k = T.MathUtils.clamp((wallR - 1 - h.dist) / 1.5, 0, 1); h.g.scale.setScalar(Math.max(.001, k)); }

      // Reader idle
      reader.position.y = Math.sin(t * 2) * .03;
      lantern.position.y = .62 + Math.sin(t * 2.4) * .03;

      // Shadow-pieces
      let ci = 0;
      for (const id in blobs) {
        const b = blobs[id], u = b.userData;
        u.scale += (u.scaleT - u.scale) * .05; b.scale.setScalar(Math.max(.001, u.scale));
        if (u.mode === 'attack') {
          b.position.lerp(v3.set(1.7, 1.4 + Math.sin(t * 1.6 + u.phase) * .2, 3.4), .05);
          if (id === 'flutter') b.position.x += (Math.random() - .5) * .06;
        } else {
          const a = t * .5 + ci * (Math.PI / 2) + u.phase;
          b.position.lerp(v3.set(Math.sin(a) * 1.15, .35 + Math.abs(Math.sin(t * 3 + ci)) * .12, 4.2 + Math.cos(a) * 1.15), .06);
          ci++;
        }
        b.lookAt(camera.position);
        u.eyes.scale.y = (Math.sin(t * .9 + u.phase) > .97) ? .15 : 1; // blink
      }

      // Moths
      burst = Math.max(0, burst - dt * .35);
      for (let i = 0; i < MOTHS; i++) {
        const m = moth[i]; m.a += dt * m.s * (1 + burst * 3);
        const r = m.r + burst * 3, y = m.y + Math.sin(t * m.s * 3 + i) * .4 + burst * 4 * (i % 3) * .5;
        mothPos.set([Math.sin(m.a) * r, y, Math.cos(m.a) * r], i * 3);
      }
      mothGeo.attributes.position.needsUpdate = true;
      mothMat.opacity = .45 + mood * .35 + burst * .4;

      // Camera
      const portrait = Math.max(0, 1 - camera.aspect) * .9;
      if (camMode === 'title') { v3.set(reduce ? 0 : Math.sin(t * .05) * 3, 9 + portrait * 3, 26 + portrait * 10); camLook.lerp(new T.Vector3(0, 7.5, 0), .04); }
      else if (camMode === 'walls') { v3.set(0, 3.2, 6.4 + portrait * 1.5); camLook.lerp(new T.Vector3(0, 3.2, -2), .04); }
      else { v3.set(reduce ? 0 : Math.sin(t * .07) * 1.8, 5.4 + portrait * 2, 12.5 + portrait * 6); camLook.lerp(new T.Vector3(0, 2.6, 0), .04); }
      camPos.lerp(v3, .035);
      camera.position.copy(camPos);
      if (shaking && !reduce) camera.position.add(v3.set((Math.random() - .5) * .07, (Math.random() - .5) * .07, 0));
      camera.lookAt(camLook);

      // Lanterns sit at fixed screen spots, a few meters in front of the camera
      lanterns.forEach((l, i) => {
        if (!l.visible) return;
        v3.set(LANTERN_NDC[i][0], LANTERN_NDC[i][1], .5).unproject(camera).sub(camera.position).normalize();
        l.position.copy(camera.position).addScaledVector(v3, 4.2);
        l.position.y += Math.sin(t * 1.5 + i) * .05;
        const u = l.userData, target = u.lit ? 1 : .5;
        u.core.material.opacity += (target - u.core.material.opacity) * .1;
        u.halo.material.opacity = u.lit ? .95 : .35 + Math.sin(t * 3 + i) * .15;
        u.halo.scale.setScalar(u.lit ? 2.2 : 1.2);
        u.light.intensity += ((u.lit ? 1.4 : 0) - u.light.intensity) * .08;
      });

      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      ok: true,
      setMood: cold => { moodT = cold ? 1 : 0; },
      fog: on => { fogT = on ? 1 : 0; },
      shake: on => { shaking = on; },
      summon: id => { const b = blobs[id] || (blobs[id] = makeBlob()); b.position.set(4, 2, 1); Object.assign(b.userData, { mode: 'attack', scaleT: 1.6 }); },
      settle: id => { const b = blobs[id]; if (b) Object.assign(b.userData, { mode: 'friend', scaleT: .42 }); },
      celebrate: () => { burst = 1; },
      walls: cb => {
        onLantern = cb; wallsActive = true; wallsLit = 0; camMode = 'walls';
        wallRT = 8.5; wallHT = 9;
        lanterns.forEach(l => { l.visible = true; l.userData.lit = false; l.userData.light.intensity = 0; });
      },
      reset: () => { for (const id in blobs) { scene.remove(blobs[id]); delete blobs[id]; } fogT = 0; shaking = false; moodT = 0; camMode = 'home'; }
    };
  }

  GAME.createWorld = createWorld;
})();
