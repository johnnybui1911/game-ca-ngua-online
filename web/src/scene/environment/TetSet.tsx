import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { CircleGeometry, Color, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import type { Object3D, PointLight } from 'three';
import { SLAB_HALF } from '../layout';
import { useQuality } from '../render/QualityProvider';
import type { QualityTier } from '../render/quality';
import { VASE_HEIGHT, createFlowerGeometry, growSpray } from './blossom';
import { createDust, createLanterns } from './glow';
import { FLOOR_Y, LANTERN_CENTRES, SIDE_LIGHTS, TABLE_HALF, TABLE_TOP_Y, piecesOf } from './layout';
import type { Point3, SetPiece } from './layout';
import { lanternLevel } from './motion';
import {
  SCROLL_CENTRE_Y,
  SCROLL_HEIGHT,
  SCROLL_WIDTH,
  TEA_TRAY_TOP,
  coupletStand,
  createLanternBody,
  lanternStand,
  platform,
  riceCakes,
  sprayBranches,
  sweetsBox,
  teaTray,
  watermelonPlate,
} from './pieces';
import { SURFACES, SetBuilder, place } from './set-builder';
import { SetKit } from './set-kit';
import { useMotionScale } from './use-motion-scale';

const VASE_URL = '/models/ceramic-vase.glb';
const TEA_SET_URL = '/models/tea-set.glb';
/** Scale that brings the vase model (metres) to `VASE_HEIGHT` and the tea service to the width of its tray. */
const VASE_SCALE = VASE_HEIGHT / 0.4394;
const TEA_SET_SCALE = 4.5;

/** Radius of the tiled floor, the share of it that is fully opaque, and tiles across it. */
const FLOOR_RADIUS = 46;
const FLOOR_SOLID = 0.5;
const FLOOR_TILES = 30;

/** Flowers on each spray. */
const FLOWERS: Record<QualityTier, number> = { low: 36, medium: 64, high: 96 };
const PETALS = ['#f6c61e', '#f39ab5'];
const BUDS = ['#b9c634', '#d64f78'];

/** Offering in front of each seat's far side: watermelon, rice cakes, tea, sweets. */
const OFFERINGS = [watermelonPlate, riceCakes, teaTray, sweetsBox];
const TEA_SIDE = OFFERINGS.indexOf(teaTray);

const LAMP_COLOUR = '#ff9d5c';
/** High tier: one lamp per side, between its lanterns. Medium: two, over opposite corners. */
const LAMP_INTENSITY: Record<QualityTier, number> = { low: 0, medium: 95, high: 60 };
const CORNER_LIGHTS: readonly Point3[] = [
  [-12.5, TABLE_TOP_Y + 4.4, -12.5],
  [12.5, TABLE_TOP_Y + 4.4, 12.5],
];

function standing(piece: SetPiece): Matrix4 {
  return place(new Matrix4(), [piece.x, TABLE_TOP_Y, piece.z], [0, piece.yaw, 0]);
}

/** Seed of a corner's spray: every corner grows its own. */
function spraySeed(corner: number): number {
  return 101 + corner * 37;
}

function buildStatics() {
  const b = new SetBuilder();
  platform(b);
  for (const piece of piecesOf('lantern')) lanternStand(b, standing(piece));
  for (const piece of piecesOf('couplet')) coupletStand(b, standing(piece));
  for (const piece of piecesOf('offering')) OFFERINGS[piece.variant]?.(b, standing(piece));
  for (const piece of piecesOf('blossom')) sprayBranches(b, standing(piece), growSpray(spraySeed(piece.side), 0));
  return b.build();
}

function buildFlowers(kit: SetKit, perSpray: number): InstancedMesh {
  const sprays = piecesOf('blossom');
  const mesh = new InstancedMesh(createFlowerGeometry(), kit.petals, sprays.length * perSpray);
  const up = new Vector3(0, 1, 0);
  const turn = new Quaternion();
  const spin = new Quaternion();
  const matrix = new Matrix4();
  const size = new Vector3();
  const colour = new Color();
  let index = 0;
  for (const piece of sprays) {
    const base = standing(piece);
    for (const flower of growSpray(spraySeed(piece.side), perSpray).flowers) {
      turn.setFromUnitVectors(up, flower.normal).multiply(spin.setFromAxisAngle(up, flower.spin));
      matrix.compose(flower.position, turn, size.setScalar(flower.scale)).premultiply(base);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colour.set((flower.bud ? BUDS : PETALS)[piece.variant] ?? PETALS[0]!));
      index++;
    }
  }
  return mesh;
}

/** A model that fails to load leaves its place empty instead of taking the canvas down. */
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Copies of a compressed model, one per transform, sharing geometry and one faded-in material each. */
function Model({ url, kit, transforms }: { url: string; kit: SetKit; transforms: readonly Matrix4[] }) {
  const { scene } = useGLTF(url, false, true);
  const copies = useMemo(
    () =>
      transforms.map((transform) => {
        const copy: Object3D = scene.clone();
        copy.traverse((child) => {
          if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) child.material = kit.lit(child.material.clone());
        });
        copy.applyMatrix4(transform);
        return copy;
      }),
    [scene, kit, transforms],
  );
  return copies.map((copy, i) => <primitive key={i} object={copy} />);
}

/**
 * The living-room set: platform, floor, lanterns, couplets, blossom, offerings and dust.
 * Its only per-frame work is the entrance fade, the lantern flicker and the dust clock, all
 * driven by the canvas frame loop, so a paused canvas costs nothing.
 */
export default function TetSet() {
  const { tier, settings } = useQuality();
  const motion = useMotionScale();
  const kit = useMemo(() => new SetKit(), []);
  useEffect(() => () => kit.dispose(), [kit]);

  const base = useMemo(() => {
    const statics = buildStatics();
    for (const surface of SURFACES) if (statics[surface]) kit.own(statics[surface]);
    const side = TABLE_HALF * 2;
    return {
      statics,
      top: kit.own(new PlaneGeometry(side, side)),
      topMaterial: kit.platformTop((SLAB_HALF * 2) / side),
      floor: kit.own(new CircleGeometry(FLOOR_RADIUS, 64)),
      floorMaterial: kit.floor(FLOOR_TILES, FLOOR_SOLID),
      shadow: kit.own(new PlaneGeometry(side + 14, side + 14)),
      shadowMaterial: kit.platformShadow(),
      scroll: kit.own(new PlaneGeometry(SCROLL_WIDTH, SCROLL_HEIGHT)),
      scrollMaterials: [kit.scroll(0), kit.scroll(1)],
      lanterns: kit.own(createLanterns(createLanternBody(), LANTERN_CENTRES, 6.4)),
      vases: piecesOf('blossom').map((piece) => place(standing(piece), [0, 0, 0], [0, 0, 0], VASE_SCALE)),
      teaSets: piecesOf('offering')
        .filter((piece) => piece.variant === TEA_SIDE)
        .map((piece) => place(standing(piece), [0, TEA_TRAY_TOP, 0.1], [0, 0, 0], TEA_SET_SCALE)),
    };
  }, [kit]);

  const flowers = useMemo(() => buildFlowers(kit, FLOWERS[tier]), [kit, tier]);
  useEffect(
    () => () => {
      flowers.geometry.dispose();
      flowers.dispose();
    },
    [flowers],
  );

  // The low tier keeps a few particles in its budget for effects of the game; scenery dust is not one of them.
  const motes = tier === 'low' ? 0 : settings.particleBudget;
  const dust = useMemo(() => (motes > 0 ? createDust(motes, TABLE_HALF, 0.6, 8.5, LANTERN_CENTRES) : null), [motes]);
  useEffect(() => () => dust?.dispose(), [dust]);

  const lamps = tier === 'high' ? SIDE_LIGHTS : tier === 'medium' ? CORNER_LIGHTS : [];
  const lampRefs = useRef<(PointLight | null)[]>([]);
  const clock = useRef(0);
  // What the levels were last written for; a change of any of it means they must be written again.
  const applied = useRef<{ motion: number; tier: QualityTier | null; viewport: number }>({ motion: -1, tier: null, viewport: -1 });

  useFrame((state, dt) => {
    kit.tick(Math.min(dt, 0.1));
    const viewport = state.size.height * state.viewport.dpr;
    const last = applied.current;
    const unchanged = last.motion === motion && last.tier === tier && last.viewport === viewport;
    if (motion === 0 && kit.settled && unchanged) return;
    last.motion = motion;
    last.tier = tier;
    last.viewport = viewport;
    clock.current += Math.min(dt, 0.1) * motion;
    const time = clock.current;
    const fade = kit.level;
    base.lanterns.setFade(fade);
    for (let i = 0; i < LANTERN_CENTRES.length; i++) base.lanterns.setLevel(i, lanternLevel(time, i, motion));
    for (let i = 0; i < lamps.length; i++) {
      const lamp = lampRefs.current[i];
      if (lamp) lamp.intensity = LAMP_INTENSITY[tier] * fade * lanternLevel(time, 20 + i, motion);
    }
    dust?.update(time, viewport, fade);
  });

  const flat = [-Math.PI / 2, 0, 0] as const;
  return (
    <group>
      <mesh geometry={base.floor} material={base.floorMaterial} rotation={flat} position={[0, FLOOR_Y, 0]} renderOrder={-4} />
      <mesh geometry={base.shadow} material={base.shadowMaterial} rotation={flat} position={[0, FLOOR_Y + 0.02, 0]} renderOrder={-3} />
      <mesh geometry={base.top} material={base.topMaterial} rotation={flat} position={[0, TABLE_TOP_Y, 0]} />
      {SURFACES.map((surface) => {
        const geometry = base.statics[surface];
        return geometry && <mesh key={surface} geometry={geometry} material={kit.surfaces[surface]} />;
      })}
      {piecesOf('couplet').map((piece, i) => (
        <group key={i} position={[piece.x, TABLE_TOP_Y, piece.z]} rotation={[0, piece.yaw, 0]}>
          <mesh geometry={base.scroll} material={base.scrollMaterials[piece.variant]} position={[0, SCROLL_CENTRE_Y, 0.02]} />
        </group>
      ))}
      <primitive object={flowers} />
      <primitive object={base.lanterns.paper} />
      <primitive object={base.lanterns.halo} />
      {lamps.map((position, i) => (
        <pointLight
          key={`${tier}-${i}`}
          ref={(light) => void (lampRefs.current[i] = light)}
          position={position}
          color={LAMP_COLOUR}
          intensity={0}
          distance={30}
          decay={2}
        />
      ))}
      {dust && <primitive object={dust.points} />}
      <ModelBoundary>
        <Suspense fallback={null}>
          <Model url={VASE_URL} kit={kit} transforms={base.vases} />
        </Suspense>
      </ModelBoundary>
      <ModelBoundary>
        <Suspense fallback={null}>
          <Model url={TEA_SET_URL} kit={kit} transforms={base.teaSets} />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}
