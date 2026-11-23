import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, BufferGeometry, Color as ThreeColor, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HOME_STEPS } from '../../../shared/game/types';
import type { Color } from '../../../shared/game/types';
import { HORSE_PAD, type Assets } from './assets';
import { CELEBRATION_SECONDS, DIE_HALF } from './director';
import { HOME } from './layout';
import { HORSE_COLORS } from './palette';
import type { SceneState } from './scene-state';

interface HorseProps {
  assets: Assets;
  state: SceneState;
  color: Color;
  index: number;
  pickable: boolean;
  onPick: (horse: number) => void;
}

/** One horse. The outer group is positioned by the director; the inner group only bobs. */
export function Horse({ assets, state, color, index, pickable, onPick }: HorseProps) {
  const bob = useRef<Group>(null);
  const halo = useRef<Group>(null);
  const arrow = useRef<Group>(null);

  useFrame(() => {
    const b = bob.current;
    if (!b) return;
    let lift = 0;
    if (pickable) lift = 0.04 + state.tap * 0.14;
    else if (state.celebration.color === color) {
      const t = state.celebration.t;
      lift = Math.abs(Math.sin(state.time * 9 + index * 1.4)) * 0.45 * Math.min(1, (CELEBRATION_SECONDS - t) * 2);
    }
    b.position.y = lift;
    const h = halo.current;
    if (h) h.scale.setScalar(1 + state.tap * 0.14);
    const a = arrow.current;
    if (a) a.position.y = 1.78 + state.tap * 0.16;
  });

  const stop = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onPick(index);
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  return (
    <group
      ref={(g) => {
        state.horses[color]![index] = g;
        if (g) g.rotation.order = 'YXZ';
      }}
      visible={false}
    >
      <group ref={bob}>
        <mesh geometry={assets.horsePadGeometry} material={assets.horsePadMat[color]} castShadow receiveShadow />
        <mesh geometry={assets.horseGeometry} material={assets.horseMat[color]} position={[0, HORSE_PAD, 0]} castShadow receiveShadow />
      </group>
      {pickable && (
        <>
          <group ref={halo} position={[0, 0.0, 0]}>
            <mesh geometry={assets.haloGeometry} material={assets.haloMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} />
          </group>
          <group ref={arrow} position={[0, 1.8, 0]}>
            <mesh geometry={assets.arrowGeometry} material={assets.arrowMat} />
          </group>
          <mesh
            geometry={assets.hitGeometry}
            material={assets.hitMat}
            position={[0, 0.85, 0]}
            onClick={stop}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = '';
            }}
          />
        </>
      )}
    </group>
  );
}

const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
/** Face normal per pip count: opposite faces sum to 7 (1 up, 2 front, 3 right). */
const FACE_NORMAL: Record<number, readonly [number, number, number]> = {
  1: [0, 1, 0],
  6: [0, -1, 0],
  2: [0, 0, 1],
  5: [0, 0, -1],
  3: [1, 0, 0],
  4: [-1, 0, 0],
};

function createPipGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const m = new Matrix4();
  const n = new Vector3();
  const t1 = new Vector3();
  const t2 = new Vector3();
  const pos = new Vector3();
  const one = new Vector3(1, 1, 1);
  const size = DIE_HALF * 2;
  for (let v = 1; v <= 6; v++) {
    const normal = FACE_NORMAL[v]!;
    n.set(...normal);
    q.setFromUnitVectors(up, n);
    t1.set(1, 0, 0).applyQuaternion(q);
    t2.set(0, 0, 1).applyQuaternion(q);
    for (const [a, b] of PIPS[v]!) {
      const pip = new CylinderGeometry(v === 1 ? 0.1 : 0.062, v === 1 ? 0.1 : 0.062, 0.03, 16);
      pos.copy(n).multiplyScalar(DIE_HALF + 0.004).addScaledVector(t1, a * size * 0.27).addScaledVector(t2, b * size * 0.27);
      m.compose(pos, q, one);
      pip.applyMatrix4(m);
      parts.push(pip);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Die pip geometry failed to merge');
  return merged;
}

/** The die. Positioned and rotated (Euler YXZ) by the director's view. */
export function Die({ assets, state }: { assets: Assets; state: SceneState }) {
  const parts = useMemo(() => {
    const body = assets.own(new RoundedBoxGeometry(DIE_HALF * 2, DIE_HALF * 2, DIE_HALF * 2, 3, 0.09));
    const pips = assets.own(createPipGeometry());
    const bodyMat = assets.own(new MeshStandardMaterial({ color: '#fbf3df', roughness: 0.32 }));
    const pipMat = assets.own(new MeshStandardMaterial({ color: '#2a1a14', roughness: 0.4 }));
    return { body, pips, bodyMat, pipMat };
  }, [assets]);

  return (
    <group
      ref={(g) => {
        state.die = g;
        if (g) g.rotation.order = 'YXZ';
      }}
      visible={false}
    >
      <mesh geometry={parts.body} material={parts.bodyMat} castShadow />
      <mesh geometry={parts.pips} material={parts.pipMat} />
    </group>
  );
}

const CONFETTI = 96;

/** Confetti burst over the winner's home column. */
export function Celebration({ assets, state }: { assets: Assets; state: SceneState }) {
  const mesh = useRef<InstancedMesh>(null);
  const seeds = useMemo(() => {
    // Deterministic pseudo-random spread; no per-frame randomness or allocation.
    const out = new Float32Array(CONFETTI * 5);
    let s = 12345;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < out.length; i++) out[i] = rnd();
    return out;
  }, []);
  const scratch = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new ThreeColor(), []);
  const geometry = useMemo(() => assets.own(new BoxGeometry(0.26, 0.06, 0.17)), [assets]);
  const painted = useRef<Color | null>(null);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const { color, t } = state.celebration;
    if (color === null) {
      m.visible = false;
      painted.current = null;
      return;
    }
    if (painted.current !== color) {
      painted.current = color;
      for (let i = 0; i < CONFETTI; i++) {
        const pick = i % 4;
        tint.set(pick === 0 ? '#ffd45a' : pick === 1 ? '#fff6dc' : HORSE_COLORS[color]);
        m.setColorAt(i, tint);
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    m.visible = true;
    const fade = Math.min(1, (CELEBRATION_SECONDS - t) * 1.5);
    for (let i = 0; i < CONFETTI; i++) {
      const k = i * 5;
      const home = HOME[color]?.[Math.floor(seeds[k]! * HOME_STEPS)];
      if (!home) continue;
      const a = seeds[k + 1]! * Math.PI * 2;
      const speed = 0.6 + seeds[k + 2]! * 2.2;
      const rise = 3.4 + seeds[k + 3]! * 3.4;
      const y = Math.max(0.09, 0.2 + rise * t - 4.6 * t * t);
      scratch.position.set(home.x + Math.cos(a) * speed * t, y, home.z + Math.sin(a) * speed * t);
      scratch.rotation.set(t * (3 + seeds[k + 4]! * 6), t * 5 * seeds[k + 1]!, t * 4);
      scratch.scale.setScalar(y <= 0.1 ? fade * 0.7 : fade);
      scratch.updateMatrix();
      m.setMatrixAt(i, scratch.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, assets.confettiMat, CONFETTI]} frustumCulled={false} visible={false} />;
}
