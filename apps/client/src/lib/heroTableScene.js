import * as THREE from 'three';
import { heroTablePose } from './heroTableMotion.js';

/** Procedural event table: no remote models, textures or continuous render loop. */
export function createHeroTableScene({ mount, palette, pixelRatio = 1, onContextLost = () => {} }) {
  const document = mount.ownerDocument;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4.6, 4.6, 4, -4, 0.1, 60);
  scene.add(new THREE.HemisphereLight(0xfff4df, 0x96836e, 2.7));
  const key = new THREE.DirectionalLight(0xffedcf, 3.3);
  key.castShadow = true;
  key.shadow.mapSize.set(pixelRatio > 1.25 ? 1024 : 512, pixelRatio > 1.25 ? 1024 : 512);
  key.shadow.bias = -0.0003;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xf5fbff, 1.7);
  fill.position.set(5, 4, -3);
  scene.add(fill);

  const setup = new THREE.Group();
  scene.add(setup);
  camera.position.set(6.8, 7.6, 9.5);
  camera.lookAt(0, 1.1, 0);
  key.position.set(-4, 9, 5);
  key.shadow.camera.left = key.shadow.camera.bottom = -6;
  key.shadow.camera.right = key.shadow.camera.top = 6;
  key.shadow.camera.far = 25;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 4;
  renderer.toneMappingExposure = 1.08;

  const material = (color, roughness = 0.5, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const ivory = material(palette.ivory, 0.9);
  const seatMaterial = material(palette.champagne, 0.85);
  const gold = material(palette.gold, 0.31, { metalness: 0.5 });
  const softGold = material(palette.goldLight, 0.56, { metalness: 0.28 });
  const ceramic = material(palette.white, 0.22, { metalness: 0.02 });
  const foliage = material(palette.goldDark, 0.78, { side: THREE.DoubleSide });
  const accent = material(palette.champagne, 0.98, { side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({
    color: palette.ivory,
    transparent: true,
    opacity: 0.4,
    roughness: 0.06,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glassEdge = material(palette.champagne, 0.16, { transparent: true, opacity: 0.73, metalness: 0.12 });
  const candleMaterial = material(palette.ivory, 0.72);
  const flameMaterial = material(palette.goldLight, 0.5, { emissive: palette.gold, emissiveIntensity: 1.4 });
  let seed = 23891;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function mesh(geometry, mat, parent = setup) {
    const object = new THREE.Mesh(geometry, mat);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function cylinder(radius, height, mat, parent, x = 0, y = 0, z = 0) {
    const object = mesh(new THREE.CylinderGeometry(radius, radius, height, 16), mat, parent);
    object.position.set(x, y, z);
    return object;
  }
  function rod(from, to, radius, mat, parent) {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to),
      delta = b.clone().sub(a);
    const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 10), mat, parent);
    object.position.copy(a.add(b).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return object;
  }
  function ring(radius, tube, y, mat, parent = setup) {
    const object = mesh(new THREE.TorusGeometry(radius, tube, 8, 64), mat, parent);
    object.rotation.x = Math.PI / 2;
    object.position.y = y;
    return object;
  }
  function tube(points, radius, mat, parent) {
    return mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        16,
        radius,
        7,
        false
      ),
      mat,
      parent
    );
  }
  function lathe(profile, mat, parent, segments = 48) {
    return mesh(
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        segments
      ),
      mat,
      parent
    );
  }

  const weaveCanvas = document.createElement('canvas');
  weaveCanvas.width = weaveCanvas.height = 128;
  const weaveContext = weaveCanvas.getContext('2d');
  weaveContext.fillStyle = '#eee8dc';
  weaveContext.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 3) {
    weaveContext.strokeStyle = i % 2 ? '#ffffff42' : '#a5998030';
    weaveContext.beginPath();
    weaveContext.moveTo(i, 0);
    weaveContext.lineTo(i, 128);
    weaveContext.stroke();
    weaveContext.beginPath();
    weaveContext.moveTo(0, i);
    weaveContext.lineTo(128, i);
    weaveContext.stroke();
  }
  const weave = new THREE.CanvasTexture(weaveCanvas);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(8, 8);
  ivory.bumpMap = weave;
  ivory.bumpScale = 0.006;
  accent.bumpMap = weave;
  accent.bumpScale = 0.005;

  const table = new THREE.Group();
  setup.add(table);
  cylinder(0.12, 1.76, softGold, table, 0, 0.88, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    rod([0, 0.14, 0], [Math.cos(a) * 0.82, 0.08, Math.sin(a) * 0.82], 0.045, softGold, table);
  }
  cylinder(1.99, 0.07, ivory, table, 0, 1.8, 0);
  const top = mesh(new THREE.CircleGeometry(2.02, 100), ivory, table);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 1.841;
  const clothPositions = [],
    clothUV = [],
    clothIndices = [];
  const segments = 144,
    vertical = 18;
  for (let j = 0; j <= vertical; j++) {
    const t = j / vertical;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const folds = Math.cos(a * 24) * 0.055 * Math.pow(t, 0.72) + Math.sin(a * 48) * 0.009 * t;
      const r = 2.017 + 0.07 * t + folds;
      const y = 1.84 - 1.54 * t + Math.sin(a * 24 + 0.7) * 0.02 * t * t;
      clothPositions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      clothUV.push(i / segments, j / vertical);
      if (j < vertical && i < segments) {
        const n = j * (segments + 1) + i;
        clothIndices.push(n, n + segments + 1, n + 1, n + 1, n + segments + 1, n + segments + 2);
      }
    }
  }
  const clothGeometry = new THREE.BufferGeometry();
  clothGeometry.setAttribute('position', new THREE.Float32BufferAttribute(clothPositions, 3));
  clothGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(clothUV, 2));
  clothGeometry.setIndex(clothIndices);
  clothGeometry.computeVertexNormals();
  const clothMaterial = ivory.clone();
  clothMaterial.side = THREE.DoubleSide;
  mesh(clothGeometry, clothMaterial, table);
  ring(2.02, 0.012, 1.836, ivory, table);

  const runner = new THREE.Group();
  runner.position.y = 1.85;
  setup.add(runner);
  const runnerTop = mesh(new THREE.PlaneGeometry(0.65, 4.02), accent, runner);
  runnerTop.rotation.x = -Math.PI / 2;
  for (const sign of [-1, 1]) {
    const drape = mesh(new THREE.PlaneGeometry(0.65, 1.52, 12, 18), accent, runner);
    drape.position.set(0, -0.76, sign * 2.07);
    const p = drape.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i);
      p.setZ(i, Math.sin(x * 29) * 0.018 * (0.5 - y / 1.52));
    }
    drape.geometry.computeVertexNormals();
  }

  const chairs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.12;
    if (i > 0) {
      const chair = chairs[0].group.clone();
      chair.rotation.y = Math.PI / 2 - a;
      setup.add(chair);
      chairs.push({ group: chair, angle: a });
      continue;
    }
    const chair = new THREE.Group();
    setup.add(chair);
    chair.rotation.y = Math.PI / 2 - a;
    const cushion = mesh(new THREE.BoxGeometry(0.66, 0.1, 0.67), seatMaterial, chair);
    cushion.position.set(0, 0.95, 0);
    const cushionTop = mesh(new THREE.BoxGeometry(0.62, 0.05, 0.63), seatMaterial, chair);
    cushionTop.position.set(0, 1.015, 0);
    for (const x of [-0.3, 0.3]) {
      for (const z of [-0.28, 0.28]) {
        rod([x * 1.06, 0.08, z * 1.1], [x, 0.93, z], 0.027, gold, chair);
        const knob = mesh(new THREE.SphereGeometry(0.043, 10, 8), gold, chair);
        knob.position.set(x, 0.82, z);
      }
      rod([x, 0.92, 0.29], [x, 2.07, 0.3], 0.027, gold, chair);
      const finial = mesh(new THREE.SphereGeometry(0.046, 12, 8), gold, chair);
      finial.position.set(x, 2.08, 0.3);
    }
    for (const z of [-0.28, 0.28]) rod([-0.3, 0.88, z], [0.3, 0.88, z], 0.026, gold, chair);
    for (const x of [-0.3, 0.3]) rod([x, 0.88, -0.28], [x, 0.88, 0.28], 0.026, gold, chair);
    for (const z of [-0.28, 0.28]) rod([-0.3, 0.4, z], [0.3, 0.4, z], 0.017, gold, chair);
    for (const x of [-0.3, 0.3]) rod([x, 0.4, -0.28], [x, 0.4, 0.28], 0.017, gold, chair);
    for (const y of [1.33, 1.57, 1.94]) rod([-0.3, y, 0.3], [0.3, y, 0.3], 0.019, gold, chair);
    for (const x of [-0.15, 0, 0.15]) rod([x, 1.34, 0.3], [x, 1.94, 0.3], 0.016, gold, chair);
    tube(
      [
        [-0.3, 2.02, 0.3],
        [-0.15, 2.065, 0.3],
        [0.15, 2.065, 0.3],
        [0.3, 2.02, 0.3]
      ],
      0.025,
      gold,
      chair
    );
    chairs.push({ group: chair, angle: a });
  }

  const placeSettings = [];
  const plateProfile = [
    [0, 0],
    [0.22, 0],
    [0.28, 0.012],
    [0.32, 0.032],
    [0.335, 0.044],
    [0.33, 0.052],
    [0.29, 0.046],
    [0.25, 0.022],
    [0, 0.022]
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.12;
    if (i > 0) {
      const setting = placeSettings[0].group.clone();
      setting.position.set(Math.cos(a) * 1.43, 1.86, Math.sin(a) * 1.43);
      setting.rotation.y = Math.PI / 2 - a;
      setup.add(setting);
      placeSettings.push({ group: setting, index: i });
      continue;
    }
    const setting = new THREE.Group();
    setting.position.set(Math.cos(a) * 1.43, 1.86, Math.sin(a) * 1.43);
    setting.rotation.y = Math.PI / 2 - a;
    setup.add(setting);
    cylinder(0.392, 0.018, softGold, setting, 0, 0.015, 0);
    ring(0.385, 0.008, 0.028, gold, setting);
    const plate = lathe(plateProfile, ceramic, setting);
    plate.position.y = 0.035;
    ring(0.323, 0.006, 0.084, gold, setting);
    const napkinGeometry = new THREE.BufferGeometry();
    napkinGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.13, 0.092, -0.12, 0.13, 0.092, -0.12, 0, 0.3, 0.07, 0.13, 0.092, -0.12, 0.13, 0.092, 0.16, 0, 0.3, 0.07,
          0.13, 0.092, 0.16, -0.13, 0.092, 0.16, 0, 0.3, 0.07, -0.13, 0.092, 0.16, -0.13, 0.092, -0.12, 0, 0.3, 0.07
        ],
        3
      )
    );
    napkinGeometry.computeVertexNormals();
    mesh(napkinGeometry, accent, setting);
    const fork = mesh(new THREE.BoxGeometry(0.026, 0.012, 0.37), gold, setting);
    fork.position.set(-0.45, 0.02, 0.02);
    for (let tine = 0; tine < 4; tine++) {
      const prong = mesh(new THREE.BoxGeometry(0.007, 0.01, 0.085), gold, setting);
      prong.position.set(-0.478 + tine * 0.018, 0.022, -0.205);
    }
    const forkHead = mesh(new THREE.BoxGeometry(0.065, 0.012, 0.055), gold, setting);
    forkHead.position.set(-0.45, 0.02, -0.15);
    const knife = mesh(new THREE.BoxGeometry(0.027, 0.012, 0.4), gold, setting);
    knife.position.set(0.45, 0.02, 0.0);
    const blade = mesh(new THREE.BoxGeometry(0.05, 0.012, 0.2), gold, setting);
    blade.position.set(0.46, 0.024, -0.115);
    const goblet = new THREE.Group();
    goblet.position.set(0.43, 0.02, -0.41);
    setting.add(goblet);
    cylinder(0.098, 0.009, glassEdge, goblet, 0, 0.01, 0);
    cylinder(0.009, 0.18, glassEdge, goblet, 0, 0.1, 0);
    const bowl = lathe(
      [
        [0, 0.19],
        [0.055, 0.2],
        [0.1, 0.24],
        [0.115, 0.3],
        [0.108, 0.36],
        [0.092, 0.405]
      ],
      glass,
      goblet,
      32
    );
    bowl.castShadow = false;
    ring(0.092, 0.004, 0.405, glassEdge, goblet);
    placeSettings.push({ group: setting, angle: a, index: i });
  }

  const centerpiece = new THREE.Group();
  setup.add(centerpiece);
  const vase = lathe(
    [
      [0, 0],
      [0.17, 0],
      [0.2, 0.04],
      [0.16, 0.09],
      [0.12, 0.16],
      [0.105, 0.4],
      [0.14, 0.47],
      [0.15, 0.48],
      [0.14, 0.495],
      [0.105, 0.47],
      [0.09, 0.18],
      [0, 0.12]
    ],
    gold,
    centerpiece,
    40
  );
  ring(0.15, 0.009, 0.487, gold, centerpiece);

  function leafGeometry() {
    const positions = [],
      indices = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10,
        w = Math.sin(t * Math.PI) * 0.12,
        y = Math.sin(t * Math.PI) * 0.06;
      positions.push(-w, y, t * 0.44, 0, y + 0.018, t * 0.44, w, y, t * 0.44);
      if (i < 10) {
        const n = i * 3;
        indices.push(n, n + 3, n + 1, n + 1, n + 3, n + 4, n + 1, n + 4, n + 2, n + 2, n + 4, n + 5);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }
  const leaves = new THREE.InstancedMesh(leafGeometry(), foliage, 42);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  centerpiece.add(leaves);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 42; i++) {
    const a = random() * Math.PI * 2,
      r = 0.13 + random() * 0.43;
    dummy.position.set(Math.cos(a) * r, 0.46 + random() * 0.3, Math.sin(a) * r);
    dummy.rotation.set((random() - 0.5) * 0.9, a + Math.PI / 2, (random() - 0.5) * 0.55);
    dummy.scale.setScalar(0.7 + random() * 0.45);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  const bloomColors = [palette.ivory, palette.white, palette.champagne, palette.goldLight];
  const bloomCenters = [];
  for (let i = 0; i < 17; i++) {
    const a = i * 2.39996,
      r = Math.sqrt(i / 17) * 0.54;
    bloomCenters.push({
      x: Math.cos(a) * r,
      y: 0.72 + 0.28 * Math.sqrt(1 - (r * r) / 0.36),
      z: Math.sin(a) * r,
      size: 0.09 + random() * 0.035,
      color: bloomColors[i % 4]
    });
  }
  const petals = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 7),
    material(0xffffff, 0.8),
    bloomCenters.length * 16
  );
  petals.castShadow = true;
  petals.receiveShadow = true;
  centerpiece.add(petals);
  let petalIndex = 0;
  bloomCenters.forEach((bloom) => {
    for (let i = 0; i < 16; i++) {
      const inner = i < 6,
        a = (inner ? i / 6 : (i - 6) / 10) * Math.PI * 2,
        rad = bloom.size * (inner ? 0.33 : 0.67);
      dummy.position.set(bloom.x + Math.cos(a) * rad, bloom.y + (inner ? 0.04 : 0), bloom.z + Math.sin(a) * rad);
      dummy.rotation.set(Math.cos(a) * 0.7, a, Math.sin(a) * 0.7);
      dummy.scale.set(bloom.size * 0.63, bloom.size * 0.22, bloom.size * 0.81);
      dummy.updateMatrix();
      petals.setMatrixAt(petalIndex, dummy.matrix);
      petals.setColorAt(petalIndex, new THREE.Color(bloom.color));
      petalIndex++;
    }
    const bud = mesh(new THREE.SphereGeometry(bloom.size * 0.43, 10, 7), material(bloom.color, 0.83), centerpiece);
    bud.position.set(bloom.x, bloom.y + 0.05, bloom.z);
    bud.scale.y = 0.82;
  });

  const candleGroups = [];
  for (const [x, z, height] of [
    [-0.78, 0.1, 0.5],
    [0.78, -0.1, 0.65]
  ]) {
    const candle = new THREE.Group();
    setup.add(candle);
    cylinder(0.105, 0.025, gold, candle, 0, 0.015, 0);
    cylinder(0.021, height * 0.62, gold, candle, 0, height * 0.31, 0);
    cylinder(0.058, 0.045, gold, candle, 0, height * 0.62, 0);
    cylinder(0.038, height * 0.55, candleMaterial, candle, 0, height * 0.62 + height * 0.275, 0);
    const flame = mesh(new THREE.SphereGeometry(0.027, 12, 8), flameMaterial, candle);
    flame.position.y = height * 1.17 + 0.043;
    flame.scale.set(0.7, 1.8, 0.7);
    flame.castShadow = false;
    candleGroups.push({ group: candle, x, z });
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.065;
  ground.receiveShadow = true;
  scene.add(ground);

  let disposed = false;
  function render(progress) {
    if (disposed) return;
    const pose = heroTablePose(progress);
    setup.rotation.y = pose.rotation;
    chairs.forEach(({ group, angle }) => {
      const radius = 2.93 + (1 - pose.chairs) * 0.4;
      group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    });
    runner.visible = pose.runner > 0.001;
    runner.scale.z = Math.max(0.001, pose.runner);
    placeSettings.forEach(({ group }, index) => {
      const show = pose.settings[index];
      group.visible = show > 0.001;
      group.position.y = 1.86 + (1 - show) * 0.7;
      group.scale.setScalar(0.68 + 0.32 * show);
    });
    centerpiece.visible = pose.flowers > 0.001;
    centerpiece.position.y = 1.86 + (1 - pose.flowers) * 0.6;
    centerpiece.scale.setScalar(0.7 + 0.3 * pose.flowers);
    candleGroups.forEach(({ group, x, z }, index) => {
      const show = pose.candles[index];
      group.visible = show > 0.001;
      group.position.set(x, 1.86 + (1 - show) * 0.45, z);
      group.scale.setScalar(0.7 + 0.3 * show);
    });
    renderer.render(scene, camera);
  }
  function resize(width, height) {
    if (disposed || width <= 0 || height <= 0) return;
    // Frame the setup closer, while keeping all six chairs visible on wide, short screens.
    const span = Math.max(7.6, (5.6 * width) / height);
    const verticalSpan = (span * height) / width;
    camera.left = -span / 2;
    camera.right = span / 2;
    camera.top = verticalSpan / 2;
    camera.bottom = -verticalSpan / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const lost = (event) => {
    event.preventDefault();
    onContextLost();
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  mount.appendChild(renderer.domElement);

  return {
    render,
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      const geometries = new Set(),
        materials = new Set(),
        textures = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material)
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((entry) =>
            materials.add(entry)
          );
        if (object.isInstancedMesh) object.dispose();
      });
      materials.forEach((entry) => {
        Object.values(entry).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
        entry.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      textures.forEach((texture) => texture.dispose());
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };
}
