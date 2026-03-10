import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7ea6bf, 0.0115);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(52, 42, 115);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 10, -10);
controls.minDistance = 22;
controls.maxDistance = 320;
controls.maxPolarAngle = Math.PI * 0.47;

const hemi = new THREE.HemisphereLight(0xb8ddf4, 0x31414d, 0.95);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1d0, 1.9);
sun.position.set(-120, 145, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -220;
sun.shadow.camera.right = 220;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 520;
scene.add(sun);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 40, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      cTop: { value: new THREE.Color(0x8bb8d3) },
      cHorizon: { value: new THREE.Color(0xd9e9ef) },
      cBottom: { value: new THREE.Color(0x0d1a24) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 cTop;
      uniform vec3 cHorizon;
      uniform vec3 cBottom;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y * 0.5 + 0.5;
        vec3 col = mix(cBottom, cHorizon, smoothstep(0.05, 0.52, h));
        col = mix(col, cTop, smoothstep(0.52, 1.0, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
);
scene.add(sky);

const terrainWidth = 260;
const terrainDepth = 460;
const terrainResX = 256;
const terrainResZ = 384;

const terrainGeo = new THREE.PlaneGeometry(terrainWidth, terrainDepth, terrainResX, terrainResZ);
terrainGeo.rotateX(-Math.PI / 2);

const pos = terrainGeo.attributes.position;
const colors = [];
const rockLow = new THREE.Color(0x3f4e58);
const rockMid = new THREE.Color(0x5f6d75);
const snow = new THREE.Color(0xb8c8d6);
const moss = new THREE.Color(0x455c58);

function ridgeNoise(x, z) {
  const n1 = Math.sin(x * 0.082 + z * 0.031) * 7.4;
  const n2 = Math.sin(x * 0.22 - z * 0.13) * 3.7;
  const n3 = Math.cos(x * 0.041 + z * 0.17) * 11.1;
  return n1 + n2 + n3;
}

for (let i = 0; i < pos.count; i += 1) {
  const x = pos.getX(i);
  const z = pos.getZ(i);

  const sideDistance = Math.abs(x);
  const valleyCurve = Math.max(0, 1 - sideDistance / (terrainWidth * 0.5));
  const mountainWall = Math.pow(sideDistance / 38, 1.8) * 21;

  const fjordCarve = Math.exp(-Math.pow(x / 16, 2)) * 34;
  const alongDepthLift = Math.max(0, Math.sin((z + terrainDepth * 0.4) * 0.016)) * 6;

  const noise = ridgeNoise(x, z);
  const cliffBreak = Math.sin((x + z * 0.35) * 0.12) * 2.9;

  let y = mountainWall + noise + alongDepthLift + cliffBreak;
  y -= fjordCarve;

  // Lift terrain near far horizon to create enclosed fjord feeling.
  y += Math.max(0, (z + terrainDepth * 0.42) * 0.058);

  y = Math.max(-17, y);
  pos.setY(i, y);

  const h = THREE.MathUtils.clamp((y + 12) / 78, 0, 1);
  const moisture = THREE.MathUtils.clamp(valleyCurve + 0.1, 0, 1);

  const c = new THREE.Color();
  c.lerpColors(rockLow, rockMid, Math.pow(h, 0.85));
  c.lerp(moss, (1 - h) * moisture * 0.33);
  if (h > 0.65) {
    c.lerp(snow, Math.pow((h - 0.65) / 0.35, 1.4) * 0.75);
  }

  colors.push(c.r, c.g, c.b);
}

terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
terrainGeo.computeVertexNormals();

const terrainMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.92,
  metalness: 0.04,
  flatShading: false
});

let terrainShader = null;
terrainMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uCutawayEnabled = { value: 0 };
  shader.uniforms.uCameraX = { value: 0 };
  shader.uniforms.uFjordCenterWidth = { value: 5.5 };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vWorldPos;
      `
    )
    .replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
      vWorldPos = worldPos.xyz;
      `
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `
      #include <common>
      uniform float uCutawayEnabled;
      uniform float uCameraX;
      uniform float uFjordCenterWidth;
      varying vec3 vWorldPos;
      `
    )
    .replace(
      '#include <clipping_planes_fragment>',
      `
      #include <clipping_planes_fragment>
      if (uCutawayEnabled > 0.5) {
        float camSide = sign(uCameraX);
        float fragSide = sign(vWorldPos.x);
        bool farFromCenter = abs(vWorldPos.x) > uFjordCenterWidth;
        if (camSide != 0.0 && fragSide == camSide && farFromCenter) discard;
      }
      `
    );

  terrainShader = shader;
};

const terrain = new THREE.Mesh(terrainGeo, terrainMaterial);
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(88, 430, 220, 460),
  new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x13364b) },
      uShallow: { value: new THREE.Color(0x3f8da8) }
    },
    vertexShader: `
      uniform float uTime;
      varying float vWave;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float waveA = sin((p.y * 0.055) + uTime * 1.25) * 0.75;
        float waveB = cos((p.y * 0.1) - uTime * 0.7) * 0.35;
        float waveC = sin((p.x * 0.15 + p.y * 0.2) + uTime * 0.9) * 0.28;
        p.z += waveA + waveB + waveC;
        vWave = p.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying float vWave;
      varying vec2 vUv;
      void main() {
        float edgeFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float mixF = clamp(vWave * 0.35 + 0.48, 0.0, 1.0);
        vec3 col = mix(uDeep, uShallow, mixF);
        float sparkle = pow(max(0.0, sin(vUv.y * 180.0 + vWave * 3.2)), 14.0) * 0.08;
        col += sparkle;
        gl_FragColor = vec4(col, 0.84 * edgeFade + 0.06);
      }
    `
  })
);
water.rotation.x = -Math.PI / 2;
water.position.set(0, 0.8, -7);
scene.add(water);

const foam = new THREE.Mesh(
  new THREE.PlaneGeometry(92, 432, 120, 360),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin(p.y * 0.14 + uTime * 1.6) * 0.18;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453);
      }
      void main() {
        float border = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        float n = hash(floor(vUv * vec2(70.0, 280.0) + uTime * 3.2));
        float foamBits = step(0.94, n) * border;
        float alpha = foamBits * 0.34;
        gl_FragColor = vec4(vec3(0.93, 0.99, 1.0), alpha);
      }
    `
  })
);
foam.rotation.x = -Math.PI / 2;
foam.position.set(0, 1.05, -7);
scene.add(foam);

const mistCount = 1800;
const mistGeo = new THREE.BufferGeometry();
const mistPositions = new Float32Array(mistCount * 3);
const mistSpeeds = new Float32Array(mistCount);

for (let i = 0; i < mistCount; i += 1) {
  const i3 = i * 3;
  mistPositions[i3] = THREE.MathUtils.randFloatSpread(140);
  mistPositions[i3 + 1] = THREE.MathUtils.randFloat(3, 28);
  mistPositions[i3 + 2] = THREE.MathUtils.randFloat(-220, 120);
  mistSpeeds[i] = THREE.MathUtils.randFloat(0.012, 0.06);
}

mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPositions, 3));

const mist = new THREE.Points(
  mistGeo,
  new THREE.PointsMaterial({
    color: 0xc3dff1,
    size: 1.55,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
scene.add(mist);

const clock = new THREE.Clock();

function animate() {
  const t = clock.getElapsedTime();

  water.material.uniforms.uTime.value = t;
  foam.material.uniforms.uTime.value = t;

  if (terrainShader) {
    const insideMountain = Math.abs(camera.position.x) > 18;
    terrainShader.uniforms.uCutawayEnabled.value = insideMountain ? 1 : 0;
    terrainShader.uniforms.uCameraX.value = camera.position.x;
  }

  const mistPos = mist.geometry.attributes.position;
  for (let i = 0; i < mistCount; i += 1) {
    const idx = i * 3;
    mistPos.array[idx] += mistSpeeds[i] * 0.2;
    mistPos.array[idx + 2] += mistSpeeds[i] * 0.7;

    if (mistPos.array[idx] > 75) mistPos.array[idx] = -75;
    if (mistPos.array[idx + 2] > 125) mistPos.array[idx + 2] = -220;
  }
  mistPos.needsUpdate = true;

  sun.position.x = -120 + Math.sin(t * 0.06) * 24;
  sun.position.z = 80 + Math.cos(t * 0.05) * 16;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
