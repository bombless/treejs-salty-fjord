import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const app = document.getElementById('app');
const sunToggleInput = document.getElementById('sun-toggle');
const sunStatus = document.getElementById('sun-status');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7ea6bf, 0.0104);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(52, 42, 115);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
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

function createRockTextures(size = 512) {
  const diffuseCanvas = document.createElement('canvas');
  diffuseCanvas.width = size;
  diffuseCanvas.height = size;
  const diffuseCtx = diffuseCanvas.getContext('2d');
  const diffuseData = diffuseCtx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');
  const roughData = roughCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');
  const normalData = normalCtx.createImageData(size, size);

  const heights = new Float32Array(size * size);

  const fract = (v) => v - Math.floor(v);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function hash2(x, y) {
    return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
  }

  function noise2(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);

    const x1 = a + (b - a) * ux;
    const x2 = c + (d - c) * ux;
    return x1 + (x2 - x1) * uy;
  }

  function fbm(x, y, octaves = 5) {
    let value = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i += 1) {
      value += noise2(x * freq, y * freq) * amp;
      freq *= 2.05;
      amp *= 0.5;
    }
    return value;
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;

      const macro = fbm(u * 6.0, v * 6.0, 4);
      const detail = fbm(u * 21.0 + macro * 2.2, v * 21.0 - macro * 1.6, 4);
      const grain = fbm(u * 64.0, v * 64.0, 3);
      const strata = Math.sin(v * 62.0 + macro * 9.5 + detail * 5.2) * 0.5 + 0.5;
      const crack = Math.pow(Math.max(0, detail - 0.6) / 0.4, 1.8);

      const h = clamp01(0.28 + macro * 0.38 + strata * 0.24 - crack * 0.26 + (grain - 0.5) * 0.18);
      heights[y * size + x] = h;

      const r = clamp01(0.34 + h * 0.46 + strata * 0.07 - crack * 0.15);
      const g = clamp01(0.36 + h * 0.44 + macro * 0.06 - crack * 0.16);
      const b = clamp01(0.39 + h * 0.41 + detail * 0.04 - crack * 0.18);
      const rough = clamp01(0.6 + crack * 0.3 + (1 - strata) * 0.1 - grain * 0.05);

      const idx = (y * size + x) * 4;
      diffuseData.data[idx] = Math.round(r * 255);
      diffuseData.data[idx + 1] = Math.round(g * 255);
      diffuseData.data[idx + 2] = Math.round(b * 255);
      diffuseData.data[idx + 3] = 255;

      const roughByte = Math.round(rough * 255);
      roughData.data[idx] = roughByte;
      roughData.data[idx + 1] = roughByte;
      roughData.data[idx + 2] = roughByte;
      roughData.data[idx + 3] = 255;
    }
  }

  const strength = 5.4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xl = (x - 1 + size) % size;
      const xr = (x + 1) % size;
      const yd = (y - 1 + size) % size;
      const yu = (y + 1) % size;
      const hL = heights[y * size + xl];
      const hR = heights[y * size + xr];
      const hD = heights[yd * size + x];
      const hU = heights[yu * size + x];

      const dx = (hR - hL) * strength;
      const dy = (hU - hD) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      normalData.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalData.data[idx + 3] = 255;
    }
  }

  diffuseCtx.putImageData(diffuseData, 0, 0);
  roughCtx.putImageData(roughData, 0, 0);
  normalCtx.putImageData(normalData, 0, 0);

  const diffuseTex = new THREE.CanvasTexture(diffuseCanvas);
  diffuseTex.colorSpace = THREE.NoColorSpace;
  const roughTex = new THREE.CanvasTexture(roughCanvas);
  const normalTex = new THREE.CanvasTexture(normalCanvas);

  for (const tex of [diffuseTex, roughTex, normalTex]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 14);
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  return {
    diffuse: diffuseTex,
    roughness: roughTex,
    normal: normalTex
  };
}

const sunAnchor = new THREE.Vector3(18, 96, -315);
const sunLookAt = new THREE.Vector3(0, 12, -32);
const sunDirection = new THREE.Vector3();

const hemi = new THREE.HemisphereLight(0xb8ddf4, 0x31414d, 0.74);
scene.add(hemi);
const ambientFill = new THREE.AmbientLight(0x93a9bc, 0.16);
scene.add(ambientFill);

const sun = new THREE.DirectionalLight(0xffd7a0, 2.0);
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

const canyonFill = new THREE.DirectionalLight(0xa7bfd6, 0.64);
canyonFill.position.set(-72, 62, 130);
canyonFill.target.position.set(0, 14, -70);
scene.add(canyonFill);
scene.add(canyonFill.target);

const leftRake = new THREE.DirectionalLight(0xffdfbf, 0.34);
leftRake.position.set(-170, 52, -18);
leftRake.target.position.set(12, 20, -92);
scene.add(leftRake);
scene.add(leftRake.target);

const rightRake = new THREE.DirectionalLight(0x9fb8d3, 0.31);
rightRake.position.set(165, 56, 4);
rightRake.target.position.set(-16, 16, -88);
scene.add(rightRake);
scene.add(rightRake.target);

const sunRigIntensity = {
  sun: 2.0,
  canyonFill: 0.64,
  leftRake: 0.34,
  rightRake: 0.31,
  sunGlow: 1.4
};
let sunEnabled = true;

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

const rockTextures = createRockTextures(512);
const rockTriSettings = {
  scale: 0.115,
  blendSharpness: 5.2,
  albedoStrength: 0.84,
  roughnessStrength: 0.88
};

let terrainShader = null;
terrainMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uCutawayEnabled = { value: 0 };
  shader.uniforms.uCameraX = { value: 0 };
  shader.uniforms.uFjordCenterWidth = { value: 5.5 };
  shader.uniforms.uRockDiffuse = { value: rockTextures.diffuse };
  shader.uniforms.uRockRoughness = { value: rockTextures.roughness };
  shader.uniforms.uRockScale = { value: rockTriSettings.scale };
  shader.uniforms.uRockBlendSharpness = { value: rockTriSettings.blendSharpness };
  shader.uniforms.uRockAlbedoStrength = { value: rockTriSettings.albedoStrength };
  shader.uniforms.uRockRoughnessStrength = { value: rockTriSettings.roughnessStrength };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `
      #include <common>
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      `
    )
    .replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
      vWorldPos = worldPos.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
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
      uniform sampler2D uRockDiffuse;
      uniform sampler2D uRockRoughness;
      uniform float uRockScale;
      uniform float uRockBlendSharpness;
      uniform float uRockAlbedoStrength;
      uniform float uRockRoughnessStrength;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          value += noise2(p) * amp;
          p = p * 2.03 + vec2(31.7, 19.2);
          amp *= 0.5;
        }
        return value;
      }

      vec3 triplanarWeights(vec3 n, float sharpness) {
        vec3 w = pow(abs(n), vec3(sharpness));
        return w / max(w.x + w.y + w.z, 0.0001);
      }
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
    )
    .replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      vec3 nWorld = normalize(vWorldNormal);
      float rockSlope = clamp(1.0 - abs(nWorld.y), 0.0, 1.0);

      vec3 triW = triplanarWeights(nWorld, uRockBlendSharpness);
      float sx = nWorld.x < 0.0 ? -1.0 : 1.0;
      float sy = nWorld.y < 0.0 ? -1.0 : 1.0;
      float sz = nWorld.z < 0.0 ? -1.0 : 1.0;
      vec2 triUvX = vWorldPos.zy * uRockScale * vec2(sx, 1.0);
      vec2 triUvY = vWorldPos.xz * uRockScale * vec2(sy, 1.0);
      vec2 triUvZ = vWorldPos.xy * uRockScale * vec2(-sz, 1.0);

      vec3 triColX = texture2D(uRockDiffuse, triUvX).rgb;
      vec3 triColY = texture2D(uRockDiffuse, triUvY).rgb;
      vec3 triColZ = texture2D(uRockDiffuse, triUvZ).rgb;
      vec3 triAlbedo = triColX * triW.x + triColY * triW.y + triColZ * triW.z;
      vec3 triAlbedoContrast = (triAlbedo - 0.5) * 1.3 + 0.5;

      float triRoughX = texture2D(uRockRoughness, triUvX).r;
      float triRoughY = texture2D(uRockRoughness, triUvY).r;
      float triRoughZ = texture2D(uRockRoughness, triUvZ).r;
      float triRough = triRoughX * triW.x + triRoughY * triW.y + triRoughZ * triW.z;

      float macroRock = fbm(vWorldPos.xz * 0.045);
      float detailRock = fbm(vWorldPos.xz * 0.28 + vec2(macroRock * 3.2, macroRock * 1.6));
      float microRock = fbm(vWorldPos.xz * 1.15 + vec2(vWorldPos.y * 0.19, -vWorldPos.y * 0.13));
      float strata = sin(vWorldPos.y * 0.82 + macroRock * 7.2 + detailRock * 2.1) * 0.5 + 0.5;
      float crevice = smoothstep(0.53, 0.9, detailRock) * (0.38 + rockSlope * 0.9);
      float ridge = smoothstep(0.56, 0.93, strata) * (0.45 + rockSlope * 0.6);
      float cavity = smoothstep(0.46, 0.96, detailRock) * (0.22 + rockSlope * 0.8);

      vec3 rockCool = vec3(0.79, 0.82, 0.85);
      vec3 rockDark = vec3(0.46, 0.49, 0.52);
      vec3 rockTint = mix(rockCool, rockDark, crevice);

      float albedoMicro = (ridge * 0.22) - (crevice * 0.29) + (macroRock - 0.5) * 0.14 + (microRock - 0.5) * 0.22;
      diffuseColor.rgb *= mix(vec3(1.0), triAlbedoContrast, uRockAlbedoStrength);
      diffuseColor.rgb *= mix(vec3(0.92, 0.93, 0.95), rockTint, 0.5 + rockSlope * 0.35);
      diffuseColor.rgb *= (0.9 + albedoMicro);
      diffuseColor.rgb += ridge * 0.09;
      diffuseColor.rgb -= cavity * 0.05;
      diffuseColor.rgb *= 1.0 - crevice * 0.18;
      `
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(mix(roughnessFactor, triRough, uRockRoughnessStrength) + crevice * 0.2 + cavity * 0.08 + rockSlope * 0.05 - ridge * 0.1 + (1.0 - microRock) * 0.07, 0.46, 1.0);
      `
    )
    .replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.017, 0.018, 0.019) * (ridge * 0.35 + (1.0 - crevice) * 0.11 + (microRock - 0.5) * 0.04);
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
      uSunTint: { value: new THREE.Color(0xffcc84) },
      uSunStrength: { value: 1.0 }
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
      uniform float uSunStrength;
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

        col += uSunTint * sparkle * 1.3 * uSunStrength;
        col += uSunTint * fresnel * 0.14 * uSunStrength;
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

function setSunEnabled(enabled) {
  sunEnabled = enabled;

  sun.intensity = enabled ? sunRigIntensity.sun : 0;
  canyonFill.intensity = enabled ? sunRigIntensity.canyonFill : 0;
  leftRake.intensity = enabled ? sunRigIntensity.leftRake : 0;
  rightRake.intensity = enabled ? sunRigIntensity.rightRake : 0;
  sunGlow.intensity = enabled ? sunRigIntensity.sunGlow : 0;

  sunDisk.visible = enabled;
  sunHalo.visible = enabled;
  beams.visible = enabled;
  sunDust.visible = enabled;

  water.material.uniforms.uSunStrength.value = enabled ? 1.0 : 0.0;

  if (sunToggleInput) sunToggleInput.checked = enabled;
  if (sunStatus) sunStatus.textContent = enabled ? 'Sun: ON (press L)' : 'Sun: OFF (press L)';
}

if (sunToggleInput) {
  sunToggleInput.addEventListener('change', (event) => {
    setSunEnabled(event.target.checked);
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'l') {
    setSunEnabled(!sunEnabled);
  }
});

setSunEnabled(true);

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

  const warmShift = sunEnabled ? 0.16 + Math.sin(t * 0.33) * 0.06 : 0.0;
  mist.material.color.lerpColors(mistCool, mistWarm, warmShift);

  if (sunEnabled) {
    const sunDustPos = sunDust.geometry.attributes.position;
    for (let i = 0; i < sunDustCount; i += 1) {
      const idx = i * 3;
      sunDustPos.array[idx] += sunDustSpeeds[i] * 0.15;
      sunDustPos.array[idx + 2] += sunDustSpeeds[i] * 0.45;
      if (sunDustPos.array[idx] > 55) sunDustPos.array[idx] = -55;
      if (sunDustPos.array[idx + 2] > 60) sunDustPos.array[idx + 2] = -265;
    }
    sunDustPos.needsUpdate = true;
  }

  sun.position.set(
    sunAnchor.x + Math.sin(t * 0.08) * 4.8,
    sunAnchor.y + Math.sin(t * 0.11) * 1.7,
    sunAnchor.z + Math.cos(t * 0.05) * 3.2
  );
  sunDisk.position.copy(sun.position);
  sunHalo.position.copy(sun.position);
  sunGlow.position.copy(sun.position);
  if (sunEnabled) {
    sunHalo.material.opacity = 0.72 + Math.sin(t * 0.21) * 0.06;
  }

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
