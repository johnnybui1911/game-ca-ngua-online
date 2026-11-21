/**
 * The self-lit parts of the set, drawn with small shaders so a whole row of lanterns and a
 * cloud of dust each cost one draw call: lantern paper, the halo around it and the motes.
 * Per-lantern brightness arrives as an instanced `level` attribute, the entrance as `fade`.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Point3 } from './layout';

/** Tone curve and output colour space of the renderer, as the built-in materials apply them. */
const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const PAPER_VERTEX = /* glsl */ `
  attribute float level;
  varying float vLevel;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vLevel = level;
    vLocal = position;
    mat4 toView = modelViewMatrix * instanceMatrix;
    vec4 mv = toView * vec4(position, 1.0);
    vNormal = mat3(toView) * normal;
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/** Red paper lit from inside: hot where the eye looks straight at the bulb, deep red at the rim, ribbed. */
const PAPER_FRAGMENT = /* glsl */ `
  uniform float fade;
  varying float vLevel;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    float core = pow(facing, 1.7);
    float ribs = 0.86 + 0.14 * cos(atan(vLocal.z, vLocal.x) * 16.0);
    float ends = 1.0 - 0.4 * smoothstep(0.5, 1.02, abs(vLocal.y));
    vec3 colour = mix(vec3(0.5, 0.03, 0.02), vec3(3.3, 0.6, 0.15), core) * ribs * ends;
    gl_FragColor = vec4(colour * vLevel * fade, 1.0);
    ${OUTPUT}
  }
`;

const HALO_VERTEX = /* glsl */ `
  attribute float level;
  uniform float size;
  varying float vLevel;
  varying vec2 vUv;
  void main() {
    vLevel = level;
    vUv = uv;
    // A sheet that always faces the eye, centred on the lantern.
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform float fade;
  varying float vLevel;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float falloff = pow(max(0.0, 1.0 - d), 2.4);
    vec3 colour = mix(vec3(0.85, 0.2, 0.06), vec3(1.0, 0.62, 0.3), falloff) * falloff * 0.75;
    gl_FragColor = vec4(colour * vLevel * fade, 1.0);
    ${OUTPUT}
  }
`;

export interface Lanterns {
  paper: InstancedMesh;
  halo: InstancedMesh;
  /** Sets the brightness of one lantern (1 = resting). */
  setLevel(index: number, level: number): void;
  setFade(level: number): void;
  dispose(): void;
}

/** Paper bodies and halos of all lanterns. Takes the body geometry over. */
export function createLanterns(body: BufferGeometry, centres: readonly Point3[], haloSize: number): Lanterns {
  const count = centres.length;
  const levels = () => new InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
  const paperLevels = levels();
  const haloLevels = levels();
  body.setAttribute('level', paperLevels);
  const sheet = new PlaneGeometry(1, 1);
  sheet.setAttribute('level', haloLevels);

  const paperMaterial = new ShaderMaterial({ vertexShader: PAPER_VERTEX, fragmentShader: PAPER_FRAGMENT, uniforms: { fade: { value: 0 } } });
  const haloMaterial = new ShaderMaterial({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms: { fade: { value: 0 }, size: { value: haloSize } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const paper = new InstancedMesh(body, paperMaterial, count);
  const halo = new InstancedMesh(sheet, haloMaterial, count);
  const matrix = new Matrix4();
  centres.forEach((centre, i) => {
    matrix.makeTranslation(...centre);
    paper.setMatrixAt(i, matrix);
    halo.setMatrixAt(i, matrix);
  });
  // The halo is moved in the shader, so its bounds mean nothing.
  halo.frustumCulled = false;
  halo.renderOrder = 2;

  return {
    paper,
    halo,
    setLevel(index, level) {
      paperLevels.setX(index, level);
      haloLevels.setX(index, level);
      paperLevels.needsUpdate = true;
      haloLevels.needsUpdate = true;
    },
    setFade(level) {
      paperMaterial.uniforms.fade!.value = level;
      haloMaterial.uniforms.fade!.value = level;
    },
    dispose() {
      body.dispose();
      sheet.dispose();
      paperMaterial.dispose();
      haloMaterial.dispose();
      paper.dispose();
      halo.dispose();
    },
  };
}

/** Lamps a mote can catch the light of; unused slots sit too far away to light anything. */
const LAMPS = 8;
const FAR_AWAY: Point3 = [0, 1e4, 0];

const DUST_VERTEX = /* glsl */ `
  attribute vec4 seed; // phase, pace, size, twinkle phase
  uniform float time;
  uniform float viewport;
  uniform vec3 lamps[${LAMPS}];
  varying float vBright;
  void main() {
    float t = time * seed.y + seed.x;
    vec3 p = position + vec3(sin(t * 0.7 + seed.x * 3.0), sin(t * 0.5) * 0.6, cos(t * 0.6 + seed.x * 5.0)) * 0.9;
    float lit = 0.0;
    for (int i = 0; i < ${LAMPS}; i++) {
      vec3 d = p - lamps[i];
      lit += exp(-dot(d, d) * 0.05);
    }
    vBright = (0.035 + lit * 0.7) * (0.75 + 0.25 * sin(t * 2.3 + seed.w));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = seed.z * viewport * projectionMatrix[1][1] * 0.5 / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform float fade;
  varying float vBright;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float soft = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * soft * soft * vBright * fade, 1.0);
    ${OUTPUT}
  }
`;

export interface Dust {
  points: Points;
  /** `time` moves the motes; `viewport` is the height of the picture in device pixels. */
  update(time: number, viewport: number, fade: number): void;
  dispose(): void;
}

/**
 * Motes drifting in the air over the platform, brighter the closer they are to a lantern.
 * They move in the vertex shader, so a still frame and a moving one cost the same.
 */
export function createDust(count: number, radius: number, floor: number, ceiling: number, lamps: readonly Point3[]): Dust {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  // Fixed sequence: the same motes on every visit.
  let state = 20261;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rand()) * radius;
    const a = rand() * Math.PI * 2;
    positions.set([Math.cos(a) * r, floor + rand() * (ceiling - floor), Math.sin(a) * r], i * 3);
    seeds.set([rand() * 40, 0.25 + rand() * 0.5, 0.05 + rand() * 0.08, rand() * 6.28], i * 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 4));
  const lampUniform = Array.from({ length: LAMPS }, (_, i) => new Vector3(...(lamps[i] ?? FAR_AWAY)));
  const material = new ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    uniforms: { time: { value: 0 }, viewport: { value: 1 }, fade: { value: 0 }, lamps: { value: lampUniform } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  // The motes wander outside the bounds of their resting places.
  points.frustumCulled = false;
  points.renderOrder = 3;
  return {
    points,
    update(time, viewport, fade) {
      material.uniforms.time!.value = time;
      material.uniforms.viewport!.value = viewport;
      material.uniforms.fade!.value = fade;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
