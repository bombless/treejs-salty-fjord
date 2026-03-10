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

function createRadialTexture(inner, mid, outer) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  gradient.addColorStop(0.0, inner);
  gradient.addColorStop(0.35, mid);
  gradient.addColorStop(1.0, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sunAnchor = new THREE.Vector3(18, 96, -315);
const sunLookAt = new THREE.Vector3(0, 12, -32);
const sunDirection = new THREE.Vector3();

const hemi = new THREE.HemisphereLight(0xb8ddf4, 0x31414d, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffd7a0, 2.35);
sun.position.copy(sunAnchor);
sun.target.position.copy(sunLookAt);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170;
sun.shadow.camera.right = 170;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 720;
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.6;
scene.add(sun);
scene.add(sun.target);

const sunDisk = new THREE.Mesh(
  new THREE.SphereGeometry(8.8, 32, 24),
  new THREE.MeshBasicMaterial({
    color: 0xffd27f,
    transparent: true,
    opacity: 0.96,
    fog: false
  })
);
sunDisk.position.copy(sunAnchor);
scene.add(sunDisk);

const sunHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createRadialTexture('rgba(255,250,220,0.95)', 'rgba(255,194,104,0.52)', 'rgba(255,160,90,0.0)'),
    color: 0xffd8ad,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false
  })
);
sunHalo.position.copy(sunAnchor);
sunHalo.scale.set(120, 120, 1);
scene.add(sunHalo);

const sunGlow = new THREE.PointLight(0xffc98e, 1.4, 520, 2);
sunGlow.position.copy(sunAnchor);
scene.add(sunGlow);

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

const sunBeamMaterials = [];

function createSunBeam(start, end, radiusTop, radiusBottom, opacity) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uTint: { value: new THREE.Color(0xffd7ab) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
        radial = pow(max(radial, 0.0), 1.7);
        float along = smoothstep(0.02, 0.22, vUv.y) * smoothstep(1.0, 0.4, vUv.y);
        float flow = 0.86 + 0.14 * sin((vUv.y * 21.0) - uTime * 0.9 + vUv.x * 5.0);
        float alpha = radial * along * flow * uOpacity;
        gl_FragColor = vec4(uTint, alpha);
      }
    `
  });

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 28, 1, true), mat);
  beam.position.copy(midpoint);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());

  sunBeamMaterials.push(mat);
  return beam;
}

const beams = new THREE.Group();
beams.add(createSunBeam(sunAnchor, new THREE.Vector3(-26, 18, -120), 2.8, 28, 0.14));
beams.add(createSunBeam(sunAnchor, new THREE.Vector3(0, 15, -55), 3.1, 34, 0.16));
beams.add(createSunBeam(sunAnchor, new THREE.Vector3(30, 22, -25), 2.7, 26, 0.12));
beams.add(createSunBeam(sunAnchor, new THREE.Vector3(8, 28, -80), 2.4, 20, 0.1));
scene.add(beams);

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
      uShallow: { value: new THREE.Color(0x3f8da8) },
      uSunDir: { value: new THREE.Vector3(0.05, 0.32, -0.95) },
      uSunTint: { value: new THREE.Color(0xffcc84) }
    },
    vertexShader: `
      uniform float uTime;
      varying float vWave;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vec3 p = position;
        float waveA = sin((p.y * 0.055) + uTime * 1.25) * 0.75;
        float waveB = cos((p.y * 0.1) - uTime * 0.7) * 0.35;
        float waveC = sin((p.x * 0.15 + p.y * 0.2) + uTime * 0.9) * 0.28;
        p.z += waveA + waveB + waveC;

        float dHx = cos((p.x * 0.15 + p.y * 0.2) + uTime * 0.9) * 0.28 * 0.15;
        float dHy = cos((p.y * 0.055) + uTime * 1.25) * 0.75 * 0.055
          - sin((p.y * 0.1) - uTime * 0.7) * 0.35 * 0.1
          + cos((p.x * 0.15 + p.y * 0.2) + uTime * 0.9) * 0.28 * 0.2;

        vec3 localN = normalize(vec3(-dHx, -dHy, 1.0));
        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * localN);
        vWave = p.z;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSunDir;
      uniform vec3 uSunTint;
      varying float vWave;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        float edgeFade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float mixF = clamp(vWave * 0.35 + 0.48, 0.0, 1.0);
        vec3 col = mix(uDeep, uShallow, mixF);

        vec3 n = normalize(vWorldNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 lightDir = normalize(uSunDir);
        float sparkleMask = pow(max(0.0, sin(vUv.y * 260.0 + vWave * 4.4)), 12.0);
        float spec = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 160.0);
        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.1);
        float sparkle = spec * (0.25 + sparkleMask * 0.75);

        col += uSunTint * sparkle * 1.3;
        col += uSunTint * fresnel * 0.14;
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

const mistCool = new THREE.Color(0xc3dff1);
const mistWarm = new THREE.Color(0xffce9a);

const sunDustCount = 900;
const sunDustGeo = new THREE.BufferGeometry();
const sunDustPositions = new Float32Array(sunDustCount * 3);
const sunDustSpeeds = new Float32Array(sunDustCount);
for (let i = 0; i < sunDustCount; i += 1) {
  const i3 = i * 3;
  sunDustPositions[i3] = THREE.MathUtils.randFloatSpread(96);
  sunDustPositions[i3 + 1] = THREE.MathUtils.randFloat(7, 58);
  sunDustPositions[i3 + 2] = THREE.MathUtils.randFloat(-260, 45);
  sunDustSpeeds[i] = THREE.MathUtils.randFloat(0.012, 0.045);
}
sunDustGeo.setAttribute('position', new THREE.BufferAttribute(sunDustPositions, 3));

const sunDust = new THREE.Points(
  sunDustGeo,
  new THREE.PointsMaterial({
    color: 0xffcc98,
    size: 1.9,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
scene.add(sunDust);

const clock = new THREE.Clock();

function animate() {
  const t = clock.getElapsedTime();

  water.material.uniforms.uTime.value = t;
  foam.material.uniforms.uTime.value = t;
  for (const beamMat of sunBeamMaterials) {
    beamMat.uniforms.uTime.value = t;
  }

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

  const warmShift = 0.16 + Math.sin(t * 0.33) * 0.06;
  mist.material.color.lerpColors(mistCool, mistWarm, warmShift);

  const sunDustPos = sunDust.geometry.attributes.position;
  for (let i = 0; i < sunDustCount; i += 1) {
    const idx = i * 3;
    sunDustPos.array[idx] += sunDustSpeeds[i] * 0.15;
    sunDustPos.array[idx + 2] += sunDustSpeeds[i] * 0.45;
    if (sunDustPos.array[idx] > 55) sunDustPos.array[idx] = -55;
    if (sunDustPos.array[idx + 2] > 60) sunDustPos.array[idx + 2] = -265;
  }
  sunDustPos.needsUpdate = true;

  sun.position.set(
    sunAnchor.x + Math.sin(t * 0.08) * 4.8,
    sunAnchor.y + Math.sin(t * 0.11) * 1.7,
    sunAnchor.z + Math.cos(t * 0.05) * 3.2
  );
  sunDisk.position.copy(sun.position);
  sunHalo.position.copy(sun.position);
  sunGlow.position.copy(sun.position);
  sunHalo.material.opacity = 0.72 + Math.sin(t * 0.21) * 0.06;

  sunDirection.subVectors(sun.position, sun.target.position).normalize();
  water.material.uniforms.uSunDir.value.copy(sunDirection);

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
