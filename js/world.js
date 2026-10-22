import * as THREE from "three";

const rand = (a, b) => a + Math.random() * (b - a);

const SHARD_NAMES = [
  "Vesper Shard",
  "Memory of Rain",
  "Quiet Thunder",
  "Glass Aurora",
  "Sleeping Tide",
  "Hollow Star",
  "Ember Bloom",
  "Pale Oracle",
  "Drift Sigil",
  "Lumen Knot",
  "Night Orchard",
  "Still Comet",
];

const NOISE_GLSL = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec3(1.7);
      a *= 0.5;
    }
    return v;
  }
`;

function displace(geo, amp, freq, seed) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * freq + seed) *
      Math.cos(v.y * freq * 1.31 + seed * 2.1) *
      Math.sin(v.z * freq * 0.77 + seed * 3.3);
    const m = 1 + n * amp;
    pos.setXYZ(i, v.x * m, v.y * m, v.z * m);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function buildWorld(scene, initialTheme, opts = {}) {
  const lowPower = !!opts.lowPower;
  const root = new THREE.Group();
  scene.add(root);

  scene.fog = new THREE.FogExp2(new THREE.Color(initialTheme.fog), 0.0125);

  const slots = [];
  const track = (obj, prop, key) => {
    slots.push({ obj, prop, key, target: new THREE.Color(initialTheme[key]) });
    obj[prop] = new THREE.Color(initialTheme[key]);
  };
  const trackUniform = (uniforms, name, key) => {
    slots.push({
      obj: uniforms,
      prop: name,
      key,
      isUniform: true,
      target: new THREE.Color(initialTheme[key]),
    });
    uniforms[name].value = new THREE.Color(initialTheme[key]);
  };

  /* ---------- Nebula dome ---------- */
  const nebulaUniforms = {
    uTime: { value: 0 },
    uA: { value: new THREE.Color(initialTheme.skyA) },
    uB: { value: new THREE.Color(initialTheme.skyB) },
    uC: { value: new THREE.Color(initialTheme.skyC) },
  };
  trackUniform(nebulaUniforms, "uA", "skyA");
  trackUniform(nebulaUniforms, "uB", "skyB");
  trackUniform(nebulaUniforms, "uC", "skyC");

  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(240, 48, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: nebulaUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform float uTime;
        uniform vec3 uA;
        uniform vec3 uB;
        uniform vec3 uC;
        ${NOISE_GLSL}
        void main() {
          vec3 d = vDir;
          float t = uTime * 0.02;
          float n = fbm(d * 2.6 + vec3(t, t * 0.6, -t * 0.4));
          float n2 = fbm(d * 5.5 - vec3(t * 0.7, -t, t * 0.5) + n);
          float band = smoothstep(0.25, 0.85, n);
          float veil = smoothstep(0.45, 0.95, n2);
          vec3 col = uA;
          col = mix(col, uB, band * 0.85);
          col = mix(col, uC, veil * band * 0.65);
          float horizon = pow(1.0 - abs(d.y), 3.0);
          col += uC * horizon * 0.18;
          float stars = step(0.9975, hash(floor(d * 420.0)));
          col += stars * (0.5 + 0.5 * sin(uTime * 2.0 + hash(d) * 30.0)) * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  nebula.frustumCulled = false;
  root.add(nebula);

  /* ---------- Starfield ---------- */
  const starCount = lowPower ? 1400 : 3200;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const starSeed = new Float32Array(starCount);
  const tmpC = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const r = rand(70, 210);
    const th = rand(0, Math.PI * 2);
    const ph = Math.acos(rand(-1, 1));
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = r * Math.cos(ph) * 0.75;
    starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    tmpC.setHSL(rand(0.5, 0.75), rand(0.1, 0.5), rand(0.65, 1));
    starCol[i * 3] = tmpC.r;
    starCol[i * 3 + 1] = tmpC.g;
    starCol[i * 3 + 2] = tmpC.b;
    starSeed[i] = Math.random() * 100;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute("aSeed", new THREE.BufferAttribute(starSeed, 1));
  const starUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
  };
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: starUniforms,
      vertexShader: `
        attribute float aSeed;
        varying vec3 vColor;
        varying float vTw;
        uniform float uTime;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vTw = 0.55 + 0.45 * sin(uTime * 1.6 + aSeed);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.2 + fract(aSeed) * 2.4) * uPixelRatio * (300.0 / -mv.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTw;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, a * vTw);
        }
      `,
    })
  );
  stars.frustumCulled = false;
  root.add(stars);

  /* ---------- Void grid ---------- */
  const gridUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(initialTheme.grid) },
  };
  trackUniform(gridUniforms, "uColor", "grid");
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420, 1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: gridUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          vec2 uv = vUv * 60.0;
          vec2 g = abs(fract(uv - 0.5) - 0.5) / fwidth(uv);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float dist = length(vUv - 0.5) * 2.0;
          float fade = smoothstep(1.0, 0.12, dist);
          float pulse = 0.7 + 0.3 * sin(uTime * 1.2 - dist * 12.0);
          float a = line * fade * pulse * 0.5;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    })
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -3.5;
  root.add(grid);

  /* ---------- Materials ---------- */
  const rockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialTheme.rock),
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  });
  track(rockMat, "color", "rock");

  const makeCrystalMat = (key) => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialTheme[key]),
      emissive: new THREE.Color(initialTheme[key]),
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.3,
      transparent: true,
      opacity: 0.92,
      flatShading: true,
    });
    track(m, "color", key);
    track(m, "emissive", key);
    return m;
  };
  const crystalMatA = makeCrystalMat("crystal");
  const crystalMatB = makeCrystalMat("crystal2");

  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialTheme.glow),
    emissive: new THREE.Color(initialTheme.glow),
    emissiveIntensity: 2.2,
    roughness: 0.2,
    metalness: 0.4,
    flatShading: true,
  });
  track(coreMat, "color", "glow");
  track(coreMat, "emissive", "glow");

  const shellMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(initialTheme.crystal),
    wireframe: true,
    transparent: true,
    opacity: 0.22,
  });
  track(shellMat, "color", "crystal");

  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(initialTheme.crystal2),
    transparent: true,
    opacity: 0.55,
  });
  track(ringMat, "color", "crystal2");

  /* ---------- Aether Core ---------- */
  const core = new THREE.Group();
  core.position.set(0, 7, 0);
  root.add(core);

  const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), coreMat);
  core.add(coreMesh);

  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), shellMat);
  core.add(shell);

  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.045, 8, 120), ringMat);
  ring1.rotation.x = Math.PI / 2;
  core.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.03, 8, 140), ringMat);
  ring2.rotation.set(Math.PI / 2.6, 0.4, 0);
  core.add(ring2);

  const coreLight = new THREE.PointLight(new THREE.Color(initialTheme.glow), 90, 70, 2);
  core.add(coreLight);
  slots.push({
    obj: coreLight,
    prop: "color",
    key: "glow",
    isColorProp: true,
    target: new THREE.Color(initialTheme.glow),
  });

  /* ---------- Islands ---------- */
  const crystals = [];
  let nameIdx = 0;
  const islandGroup = new THREE.Group();
  root.add(islandGroup);

  const crystalGeo = new THREE.OctahedronGeometry(0.42, 0);

  const makeCrystal = (scale, mat) => {
    const mesh = new THREE.Mesh(crystalGeo, mat.clone());
    mesh.material.emissiveIntensity = rand(1.1, 1.8);
    track(mesh.material, "color", mat === crystalMatA ? "crystal" : "crystal2");
    track(mesh.material, "emissive", mat === crystalMatA ? "crystal" : "crystal2");
    mesh.scale.set(scale * rand(0.7, 1), scale * rand(1.6, 2.4), scale * rand(0.7, 1));
    mesh.rotation.set(rand(-0.3, 0.3), rand(0, Math.PI), rand(-0.3, 0.3));
    mesh.userData = {
      label: SHARD_NAMES[nameIdx++ % SHARD_NAMES.length],
      baseScale: mesh.scale.clone(),
      hover: 0,
    };
    crystals.push(mesh);
    return mesh;
  };

  const ISLANDS = [
    { x: -13, z: -5, s: 1.7, y: 2.4 },
    { x: 11, z: 7, s: 1.25, y: 4.2 },
    { x: -7, z: 15, s: 0.95, y: 1.6 },
    { x: 17, z: -11, s: 1.45, y: 3.2 },
    { x: -21, z: 9, s: 1.05, y: 5.4 },
    { x: 5, z: -18, s: 1.15, y: 2.0 },
    { x: 24, z: 3, s: 0.85, y: 6.2 },
    { x: -15, z: -20, s: 1.1, y: 3.6 },
    { x: 2, z: 22, s: 0.8, y: 4.8 },
  ];

  ISLANDS.forEach((cfg, i) => {
    const g = new THREE.Group();
    g.position.set(cfg.x, cfg.y, cfg.z);
    g.userData = { baseY: cfg.y, seed: i * 1.7 + rand(0, 2) };
    islandGroup.add(g);

    const rock = new THREE.Mesh(
      displace(new THREE.IcosahedronGeometry(1, 1), 0.28, 1.8, i * 3.1 + 1),
      rockMat
    );
    rock.scale.set(cfg.s, cfg.s * 1.35, cfg.s);
    g.add(rock);

    const spikes = 3 + (i % 3);
    for (let s = 0; s < spikes; s++) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(rand(0.08, 0.18) * cfg.s, rand(0.5, 1.4) * cfg.s, 5),
        rockMat
      );
      const a = (s / spikes) * Math.PI * 2 + rand(0, 1);
      cone.position.set(Math.cos(a) * 0.4 * cfg.s, -rand(0.9, 1.4) * cfg.s, Math.sin(a) * 0.4 * cfg.s);
      cone.rotation.x = Math.PI;
      g.add(cone);
    }

    const cCount = 2 + (i % 3);
    for (let c = 0; c < cCount; c++) {
      const crystal = makeCrystal(rand(0.55, 1) * cfg.s * 0.9, Math.random() > 0.5 ? crystalMatA : crystalMatB);
      const a = rand(0, Math.PI * 2);
      const r = rand(0.1, 0.55) * cfg.s;
      crystal.position.set(Math.cos(a) * r, rand(0.5, 0.9) * cfg.s, Math.sin(a) * r);
      g.add(crystal);
    }

    const motes = 5;
    for (let m = 0; m < motes; m++) {
      const shard = new THREE.Mesh(
        new THREE.TetrahedronGeometry(rand(0.05, 0.11) * cfg.s),
        Math.random() > 0.5 ? crystalMatA : crystalMatB
      );
      const a = rand(0, Math.PI * 2);
      shard.position.set(Math.cos(a) * rand(0.6, 1.1) * cfg.s, rand(0.3, 1.4) * cfg.s, Math.sin(a) * rand(0.6, 1.1) * cfg.s);
      shard.userData.spin = rand(0.4, 1.6);
      g.add(shard);
      g.userData.motes = g.userData.motes || [];
      g.userData.motes.push(shard);
    }
  });

  /* ---------- Orbiting shards ---------- */
  const orbiters = [];
  const orbiterCount = lowPower ? 7 : 11;
  for (let i = 0; i < orbiterCount; i++) {
    const c = makeCrystal(rand(0.6, 1.05), i % 2 ? crystalMatA : crystalMatB);
    c.userData.orbit = {
      angle: (i / orbiterCount) * Math.PI * 2,
      radius: rand(5.2, 6.6),
      speed: rand(0.12, 0.28) * (i % 2 ? 1 : -1),
      yAmp: rand(0.6, 1.8),
      yPhase: rand(0, Math.PI * 2),
    };
    core.add(c);
    orbiters.push(c);
  }

  /* ---------- Drifting dust ---------- */
  const dustCount = lowPower ? 220 : 520;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = rand(-45, 45);
    dustPos[i * 3 + 1] = rand(-2, 26);
    dustPos[i * 3 + 2] = rand(-45, 45);
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustUniforms = {
    uColor: { value: new THREE.Color(initialTheme.crystal) },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
  };
  trackUniform(dustUniforms, "uColor", "crystal");
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: dustUniforms,
      vertexShader: `
        uniform float uPixelRatio;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 2.2 * uPixelRatio * (60.0 / -mv.z);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * 0.5;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    })
  );
  root.add(dust);

  /* ---------- Lights ---------- */
  const hemi = new THREE.HemisphereLight(0x8899ff, 0x0a0a14, 0.55);
  root.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(12, 24, 8);
  root.add(key);
  const rim = new THREE.PointLight(new THREE.Color(initialTheme.crystal2), 40, 90, 2);
  rim.position.set(-18, 12, -14);
  root.add(rim);
  slots.push({
    obj: rim,
    prop: "color",
    key: "crystal2",
    target: new THREE.Color(initialTheme.crystal2),
  });

  const cursorLight = new THREE.PointLight(new THREE.Color(initialTheme.glow), 25, 40, 2);
  root.add(cursorLight);
  slots.push({
    obj: cursorLight,
    prop: "color",
    key: "glow",
    target: new THREE.Color(initialTheme.glow),
  });

  /* ---------- Burst pool ---------- */
  const BURST_N = lowPower ? 60 : 110;
  const bursts = [];
  for (let b = 0; b < 5; b++) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(BURST_N * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(initialTheme.crystal),
      size: 0.18,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    root.add(pts);
    bursts.push({
      pts,
      vel: new Float32Array(BURST_N * 3),
      life: 0,
      active: false,
    });
  }
  let burstIdx = 0;

  function burst(position, colorKey = "crystal") {
    const b = bursts[burstIdx++ % bursts.length];
    const pos = b.pts.geometry.attributes.position.array;
    const col = new THREE.Color(initialTheme[colorKey]);
    for (let i = 0; i < BURST_N; i++) {
      pos[i * 3] = position.x;
      pos[i * 3 + 1] = position.y;
      pos[i * 3 + 2] = position.z;
      const th = rand(0, Math.PI * 2);
      const ph = Math.acos(rand(-1, 1));
      const sp = rand(2.5, 9);
      b.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      b.vel[i * 3 + 1] = Math.cos(ph) * sp * 0.9 + 2;
      b.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.color.copy(col);
    b.pts.material.opacity = 1;
    b.pts.visible = true;
    b.life = 1;
    b.active = true;
  }

  /* ---------- Theme ---------- */
  let currentTheme = { ...initialTheme };
  function setTheme(theme, instant = false) {
    currentTheme = theme;
    for (const s of slots) s.target.set(theme[s.key]);
    scene.fog.color.set(theme.fog);
    if (instant) {
      for (const s of slots) {
        if (s.isUniform) s.obj[s.prop].value.copy(s.target);
        else s.obj[s.prop].copy(s.target);
      }
    }
  }

  /* ---------- Update ---------- */
  const worldPos = new THREE.Vector3();
  function update(t, dt, lookAtPoint) {
    const k = 1 - Math.exp(-dt * 2.6);
    for (const s of slots) {
      if (s.isUniform) s.obj[s.prop].value.lerp(s.target, k);
      else s.obj[s.prop].lerp(s.target, k);
    }
    scene.fog.color.lerp(new THREE.Color(currentTheme.fog), k * 0.6);

    nebulaUniforms.uTime.value = t;
    gridUniforms.uTime.value = t;
    starUniforms.uTime.value = t;

    coreMesh.rotation.y = t * 0.25;
    coreMesh.rotation.x = Math.sin(t * 0.3) * 0.2;
    const pulse = 1 + Math.sin(t * 1.4) * 0.06;
    coreMesh.scale.setScalar(pulse);
    coreMesh.material.emissiveIntensity = 2 + Math.sin(t * 1.4) * 0.6;
    coreLight.intensity = 80 + Math.sin(t * 1.4) * 25;

    shell.rotation.y = -t * 0.18;
    shell.rotation.z = t * 0.1;
    ring1.rotation.z = t * 0.35;
    ring2.rotation.z = -t * 0.22;
    ring2.rotation.y = 0.4 + Math.sin(t * 0.3) * 0.2;

    core.position.y = 7 + Math.sin(t * 0.7) * 0.35;

    for (const c of orbiters) {
      const o = c.userData.orbit;
      o.angle += o.speed * dt;
      c.position.set(
        Math.cos(o.angle) * o.radius,
        Math.sin(t * 0.8 + o.yPhase) * o.yAmp,
        Math.sin(o.angle) * o.radius
      );
      c.rotation.y += dt * 1.2;
      c.rotation.x += dt * 0.4;
    }

    islandGroup.children.forEach((isle) => {
      const u = isle.userData;
      isle.position.y = u.baseY + Math.sin(t * 0.55 + u.seed) * 0.4;
      isle.rotation.y = Math.sin(t * 0.12 + u.seed) * 0.12;
      if (u.motes) for (const m of u.motes) m.rotation.y += dt * m.userData.spin;
    });

    for (const c of crystals) {
      const target = c.userData.hover;
      const bs = c.userData.baseScale;
      const s = 1 + target * 0.45;
      c.scale.set(bs.x * s, bs.y * s, bs.z * s);
      if (c.material.emissiveIntensity !== undefined) {
        const base = 1.3;
        c.material.emissiveIntensity = base + target * 1.4 + Math.sin(t * 2 + c.id) * 0.15;
      }
    }

    const dpos = dust.geometry.attributes.position.array;
    for (let i = 0; i < dustCount; i++) {
      dpos[i * 3 + 1] += dt * 0.35;
      dpos[i * 3] += Math.sin(t * 0.4 + i) * dt * 0.12;
      if (dpos[i * 3 + 1] > 28) dpos[i * 3 + 1] = -2;
    }
    dust.geometry.attributes.position.needsUpdate = true;

    for (const b of bursts) {
      if (!b.active) continue;
      b.life -= dt * 0.55;
      if (b.life <= 0) {
        b.active = false;
        b.pts.visible = false;
        continue;
      }
      const pos = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < BURST_N; i++) {
        b.vel[i * 3 + 1] -= 4.5 * dt;
        pos[i * 3] += b.vel[i * 3] * dt;
        pos[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
        b.vel[i * 3] *= 1 - dt * 0.8;
        b.vel[i * 3 + 2] *= 1 - dt * 0.8;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(b.life, 0) * 0.95;
    }

    if (lookAtPoint) {
      cursorLight.position.lerp(
        new THREE.Vector3(lookAtPoint.x, lookAtPoint.y + 2, lookAtPoint.z),
        1 - Math.exp(-dt * 4)
      );
    }
  }

  function setCursorLight(pos) {
    cursorLight.position.copy(pos);
  }

  function crystalWorldPosition(crystal, out) {
    return crystal.getWorldPosition(out || worldPos);
  }

  return {
    root,
    crystals,
    orbiters,
    core,
    burst,
    setTheme,
    update,
    setCursorLight,
    crystalWorldPosition,
    getTheme: () => currentTheme,
  };
}
