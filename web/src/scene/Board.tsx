import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CircleGeometry,
  Color as ThreeColor,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CELLS_PER_COLOR, COLORS, HOME_STEPS, TRACK_LENGTH } from '../../../shared/game/types';
import type { Color } from '../../../shared/game/types';
import type { Assets } from './assets';
import {
  HOME,
  SLAB_HALF,
  STABLE,
  STABLE_CENTERS,
  STABLE_TRAY_SIZE,
  STAIR_RISE,
  TRACK,
  armDirection,
  yawBetween,
} from './layout';
import { HORSE_COLORS } from './palette';
import type { SceneState } from './scene-state';

const INLAY_TOP = 0.04;
const DECAL_Y = 0.0725;
/** Width of a stair tread: the home cell with a little ledge on both sides. */
const TREAD_WIDTH = 1.12;
/** Where the centre medallion floats, above the dais at the top of the stairs, and how far it bobs. */
const HUB_REST = INLAY_TOP + (HOME_STEPS + 1) * STAIR_RISE - DECAL_Y + 0.03;
const HUB_BOB = 0.012;
const CELL_Y = 0.055;

function crossShape(halfWidth: number, halfLength: number): Shape {
  const w = halfWidth;
  const l = halfLength;
  const s = new Shape();
  s.moveTo(-w, -l);
  s.lineTo(w, -l);
  s.lineTo(w, -w);
  s.lineTo(l, -w);
  s.lineTo(l, w);
  s.lineTo(w, w);
  s.lineTo(w, l);
  s.lineTo(-w, l);
  s.lineTo(-w, w);
  s.lineTo(-l, w);
  s.lineTo(-l, -w);
  s.lineTo(-w, -w);
  s.closePath();
  return s;
}

function roundedRect(shape: Shape | Path, half: number, r: number): void {
  shape.moveTo(-half + r, -half);
  shape.lineTo(half - r, -half);
  shape.quadraticCurveTo(half, -half, half, -half + r);
  shape.lineTo(half, half - r);
  shape.quadraticCurveTo(half, half, half - r, half);
  shape.lineTo(-half + r, half);
  shape.quadraticCurveTo(-half, half, -half, half - r);
  shape.lineTo(-half, -half + r);
  shape.quadraticCurveTo(-half, -half, -half + r, -half);
}

function decalMaterial(assets: Assets, map: Texture): MeshStandardMaterial {
  return assets.own(
    new MeshStandardMaterial({
      map,
      roughness: 0.7,
      alphaTest: 0.5,
      alphaToCoverage: true,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
}

interface CellSpec {
  key: string;
  x: number;
  z: number;
  spin: number;
  /** Height of the ground the cell stands on: zero on the track, higher with every home step. */
  y: number;
  mat: MeshStandardMaterial;
}

function buildCells(assets: Assets): CellSpec[] {
  const out: CellSpec[] = [];
  const plain = decalMaterial(assets, assets.kit.plainCell());
  for (let i = 0; i < TRACK_LENGTH; i++) {
    const at = TRACK[i];
    const next = TRACK[(i + 1) % TRACK_LENGTH];
    if (!at || !next) continue;
    const k = i % CELLS_PER_COLOR;
    if (k === 0) {
      const color = Math.floor(i / CELLS_PER_COLOR) as Color;
      out.push({
        key: `t${i}`,
        x: at.x,
        z: at.z,
        spin: Math.atan2(-(next.x - at.x), -(next.z - at.z)),
        y: 0,
        mat: decalMaterial(assets, assets.kit.entryCell(color)),
      });
    } else if (k === CELLS_PER_COLOR - 1) {
      const color = ((Math.floor(i / CELLS_PER_COLOR) + 1) % COLORS.length) as Color;
      out.push({ key: `t${i}`, x: at.x, z: at.z, spin: 0, y: 0, mat: decalMaterial(assets, assets.kit.gateCell(color)) });
    } else {
      out.push({ key: `t${i}`, x: at.x, z: at.z, spin: 0, y: 0, mat: plain });
    }
  }
  for (const color of COLORS) {
    const dir = armDirection(color);
    // Numbers read upright for the colour's own player, who looks towards the centre.
    const spin = Math.atan2(dir.x, dir.z);
    for (let step = 1; step <= HOME_STEPS; step++) {
      const at = HOME[color]?.[step - 1];
      if (!at) continue;
      out.push({
        key: `h${color}${step}`,
        x: at.x,
        z: at.z,
        spin,
        y: step * STAIR_RISE,
        mat: decalMaterial(assets, assets.kit.homeCell(color, step)),
      });
    }
  }
  return out;
}

function trayColor(color: Color, mixWith: string, t: number): ThreeColor {
  return new ThreeColor(HORSE_COLORS[color]).lerp(new ThreeColor(mixWith), t);
}

interface Props {
  assets: Assets;
  state: SceneState;
  /** Colours taking part; the other stables are shown dimmed. */
  colors: readonly Color[];
}

/** Lacquered wood grain (Poly Haven, CC0), shared through the loader cache. */
export const LACQUER_URL = '/models/lacquer-diff.webp';
/** Grain repeats across the slab and across the (world-unit mapped) frame. */
const SLAB_GRAIN_REPEAT = 2.5;
const FRAME_GRAIN_REPEAT = 1 / 7;

/** A private copy of the cached grain, so each surface sets its own tiling without touching the other. */
function grain(source: Texture, repeat: number, assets: Assets): Texture {
  const tex = assets.own(source.clone());
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export default function Board({ assets, state, colors }: Props) {
  const lacquer = useTexture(LACQUER_URL);
  const parts = useMemo(() => {
    const wood = grain(lacquer, SLAB_GRAIN_REPEAT, assets);
    const frameWood = grain(lacquer, FRAME_GRAIN_REPEAT, assets);
    const felt = assets.kit.felt();
    felt.repeat.set(0.18, 0.18);
    felt.wrapS = felt.wrapT = RepeatWrapping;

    const slab = assets.own(new RoundedBoxGeometry(SLAB_HALF * 2, 0.7, SLAB_HALF * 2, 4, 0.16));
    const lacquered = (map: Texture, color: string) =>
      assets.own(new MeshPhysicalMaterial({ map, color, roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 }));
    const slabMat = lacquered(wood, '#ffffff');

    const extrude = (half: number, length: number, depth: number) =>
      assets.own(new ExtrudeGeometry(crossShape(half, length), { depth, bevelEnabled: false }));
    const frame = extrude(1.95, 8.12, 0.03);
    const frameMat = lacquered(frameWood, '#e8d4c0');
    const inlay = extrude(1.74, 7.92, INLAY_TOP);
    const inlayMat = assets.own(new MeshStandardMaterial({ map: felt, roughness: 0.92 }));

    const trayGeo = assets.own(new RoundedBoxGeometry(STABLE_TRAY_SIZE, 0.1, STABLE_TRAY_SIZE, 3, 0.04));
    const floorShape = new Shape();
    roundedRect(floorShape, STABLE_TRAY_SIZE / 2 - 0.2, 0.25);
    const floorGeo = assets.own(new ShapeGeometry(floorShape, 6));
    const frameShape = new Shape();
    roundedRect(frameShape, STABLE_TRAY_SIZE / 2 + 0.24, 0.45);
    const hole = new Path();
    roundedRect(hole, STABLE_TRAY_SIZE / 2 + 0.05, 0.3);
    frameShape.holes.push(hole);
    const glowGeo = assets.own(new ShapeGeometry(frameShape, 6));

    const tray = {} as Record<Color, { wall: MeshStandardMaterial; floor: MeshStandardMaterial; glow: MeshBasicMaterial; present: boolean }>;
    for (const c of COLORS) {
      const present = colors.includes(c);
      const wallCol = present ? trayColor(c, '#2a160a', 0.38) : new ThreeColor('#6a5646');
      const floorCol = present ? trayColor(c, '#fff2d8', 0.62) : new ThreeColor('#a8987f');
      tray[c] = {
        present,
        wall: assets.own(new MeshStandardMaterial({ color: wallCol, roughness: 0.55, emissive: HORSE_COLORS[c], emissiveIntensity: 0 })),
        floor: assets.own(new MeshStandardMaterial({ color: floorCol, roughness: 0.85 })),
        glow: assets.own(
          new MeshBasicMaterial({ color: HORSE_COLORS[c], transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
        ),
      };
    }

    const medallion = COLORS.map((c) => {
      // A quarter disc centred on the colour's arm direction (shape y becomes world -z).
      const dir = armDirection(c);
      const geo = assets.own(new CircleGeometry(0.5, 16, Math.atan2(-dir.z, dir.x) - Math.PI / 4, Math.PI / 2));
      const mat = assets.own(new MeshStandardMaterial({ color: HORSE_COLORS[c], roughness: 0.5 }));
      return { c, geo, mat };
    });
    // The home column is a staircase of lacquered treads; the centre is a dais one step higher still.
    const treads = Array.from({ length: HOME_STEPS }, (_, i) => {
      const h = INLAY_TOP + (i + 1) * STAIR_RISE;
      return assets.own(new BoxGeometry(TREAD_WIDTH, h, 1).translate(0, h / 2, 0));
    });
    const creamSide = assets.own(new MeshStandardMaterial({ color: '#f1e6c8', roughness: 0.8 }));
    const treadMats = {} as Record<Color, MeshStandardMaterial[]>;
    for (const c of COLORS) {
      const top = assets.own(new MeshStandardMaterial({ color: trayColor(c, '#fff2d8', 0.62), roughness: 0.8 }));
      treadMats[c] = [creamSide, creamSide, top, creamSide, creamSide, creamSide];
    }
    const daisHeight = INLAY_TOP + (HOME_STEPS + 1) * STAIR_RISE;
    const dais = assets.own(new BoxGeometry(TREAD_WIDTH, daisHeight, TREAD_WIDTH).translate(0, daisHeight / 2, 0));
    const daisMat = assets.own(new MeshStandardMaterial({ color: '#f1e6c8', roughness: 0.8 }));
    const ringMat = assets.own(new MeshStandardMaterial({ color: '#d8b25a', roughness: 0.35, metalness: 0.5 }));

    const slots = COLORS.map((c) => decalMaterial(assets, assets.kit.slot(c)));

    return { daisMat, treads, treadMats, dais, slab, slabMat, frame, frameMat, inlay, inlayMat, trayGeo, floorGeo, glowGeo, tray, medallion, ringMat, slots, cells: buildCells(assets) };
  }, [assets, colors, lacquer]);

  const glowRefs = useRef<(Mesh | null)[]>([null, null, null, null]);
  const hub = useRef<Group>(null);

  useFrame(() => {
    const h = hub.current;
    if (h) {
      // The centre medallion hovers over the top of the stairs and turns slowly.
      h.position.y = HUB_REST + Math.sin(state.time * 1.4) * HUB_BOB;
      h.rotation.y = state.time * 0.35;
    }
    const t = state.pulse;
    for (const c of COLORS) {
      const entry = parts.tray[c];
      const on = state.active === c && entry.present;
      const glow = glowRefs.current[c];
      if (glow) glow.visible = on;
      entry.glow.opacity = on ? 0.55 + 0.4 * t : 0;
      entry.wall.emissiveIntensity = on ? 0.25 + 0.35 * t : 0;
    }
  });

  return (
    <group>
      <mesh geometry={parts.slab} material={parts.slabMat} position={[0, -0.35, 0]} receiveShadow castShadow />
      <mesh geometry={parts.frame} material={parts.frameMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow />
      <mesh geometry={parts.inlay} material={parts.inlayMat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />

      {COLORS.map((c) => {
        const dir = armDirection(c);
        return (
          <mesh
            key={`lane${c}`}
            geometry={assets.laneGeometry}
            material={assets.laneMat[c]}
            position={[dir.x * 3.64, INLAY_TOP + 0.012, dir.z * 3.64]}
            rotation={[0, yawBetween({ x: 0, z: 0 }, dir), 0]}
          />
        );
      })}

      {COLORS.flatMap((c) => {
        const dir = armDirection(c);
        return parts.treads.map((geo, i) => {
          const at = HOME[c]?.[i];
          if (!at) return null;
          return (
            <mesh
              key={`tread${c}${i}`}
              geometry={geo}
              material={parts.treadMats[c]}
              position={[at.x, 0, at.z]}
              rotation={[0, yawBetween({ x: 0, z: 0 }, dir), 0]}
              receiveShadow
            />
          );
        });
      })}
      <mesh geometry={parts.dais} material={parts.daisMat} receiveShadow />

      {parts.cells.map((cell) => (
        <group key={cell.key} position={[cell.x, cell.y, cell.z]}>
          <mesh geometry={assets.cellBase} material={assets.cellRimMat} position={[0, CELL_Y, 0]} receiveShadow />
          <mesh
            geometry={assets.decalGeometry}
            material={cell.mat}
            position={[0, DECAL_Y, 0]}
            rotation={[-Math.PI / 2, 0, cell.spin]}
            receiveShadow
          />
        </group>
      ))}

      <group ref={hub} position={[0, HUB_REST, 0]}>
        {parts.medallion.map(({ c, geo, mat }) => {
          return <mesh key={`med${c}`} geometry={geo} material={mat} position={[0, DECAL_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} />;
        })}
        <mesh position={[0, DECAL_Y + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={parts.ringMat}>
          <ringGeometry args={[0.48, 0.55, 32]} />
        </mesh>
      </group>

      {COLORS.map((c) => {
        const centre = STABLE_CENTERS[c];
        const entry = parts.tray[c];
        if (!centre) return null;
        return (
          <group key={`tray${c}`} position={[centre.x, 0, centre.z]}>
            <mesh geometry={parts.trayGeo} material={entry.wall} position={[0, 0.01, 0]} receiveShadow castShadow />
            <mesh geometry={parts.floorGeo} material={entry.floor} position={[0, 0.0615, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
            <mesh
              ref={(m) => void (glowRefs.current[c] = m)}
              geometry={parts.glowGeo}
              material={entry.glow}
              position={[0, 0.07, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              visible={false}
            />
            {entry.present &&
              STABLE[c]?.map((slot, h) => (
                <mesh
                  key={h}
                  geometry={assets.decalGeometry}
                  material={parts.slots[c]}
                  position={[slot.x - centre.x, 0.064, slot.z - centre.z]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={1.15}
                />
              ))}
          </group>
        );
      })}

    </group>
  );
}
