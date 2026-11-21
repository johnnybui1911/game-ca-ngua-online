/**
 * A spray of mai or đào blossom: kinked branches rising out of a vase and the flowers along
 * them. Grown from a seed, so a spray looks the same on every device and every visit.
 */
import { BufferAttribute, BufferGeometry, OctahedronGeometry, Vector3 } from 'three';

/** Height of the vase mouth above the platform; the branches start inside the neck below it. */
export const VASE_HEIGHT = 2.2;
/** A spray never reaches further from the vase axis, or higher above the platform, than this. */
export const SPRAY_RADIUS = 2.7;
export const SPRAY_TOP = 5.4;

export interface Branch {
  points: Vector3[];
  radius: number;
}

export interface Flower {
  position: Vector3;
  /** Direction the open face looks. */
  normal: Vector3;
  spin: number;
  scale: number;
  bud: boolean;
}

export interface Spray {
  branches: Branch[];
  /** Spread evenly over the branches in this order, so any leading part of the list is a thinner spray. */
  flowers: Flower[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function direction(heading: number, lean: number): Vector3 {
  return new Vector3(Math.sin(heading) * Math.sin(lean), Math.cos(lean), Math.cos(heading) * Math.sin(lean));
}

/** A branch as a chain of points: straight runs that change course a little at every joint. */
function walk(from: Vector3, dir: Vector3, length: number, steps: number, kink: number, rand: () => number): Vector3[] {
  const points = [from.clone()];
  const at = from.clone();
  const heading = dir.clone();
  for (let i = 0; i < steps; i++) {
    heading.x += (rand() - 0.5) * kink;
    heading.y += (rand() - 0.3) * kink * 0.6;
    heading.z += (rand() - 0.5) * kink;
    heading.normalize();
    at.addScaledVector(heading, length / steps);
    const flat = Math.hypot(at.x, at.z);
    if (flat > SPRAY_RADIUS) {
      at.x *= SPRAY_RADIUS / flat;
      at.z *= SPRAY_RADIUS / flat;
    }
    at.y = Math.min(at.y, SPRAY_TOP);
    points.push(at.clone());
  }
  return points;
}

export function growSpray(seed: number, flowerCount: number): Spray {
  const rand = mulberry32(seed);
  const branches: Branch[] = [];
  const stems = 3;
  for (let s = 0; s < stems; s++) {
    const heading = (s / stems) * Math.PI * 2 + rand() * 0.9;
    const lean = 0.26 + rand() * 0.3;
    const stem = walk(new Vector3(0, VASE_HEIGHT - 0.7, 0), direction(heading, lean), 2.3 + rand() * 0.8, 6, 0.34, rand);
    branches.push({ points: stem, radius: 0.075 });
    for (let k = 0; k < 3; k++) {
      const origin = stem[2 + k]!;
      const twig = walk(origin, direction(heading + (rand() - 0.5) * 2.6, lean + 0.45 + rand() * 0.55), 1 + rand() * 0.9, 3, 0.3, rand);
      branches.push({ points: twig, radius: 0.04 });
    }
  }

  const flowers: Flower[] = [];
  for (let i = 0; i < flowerCount; i++) {
    const branch = branches[i % branches.length]!;
    const last = branch.points.length - 1;
    // Flowers sit on the outer two thirds of a branch, clear of the vase.
    const along = (0.34 + rand() * 0.66) * last;
    const index = Math.min(last - 1, Math.floor(along));
    const position = branch.points[index]!.clone().lerp(branch.points[index + 1]!, along - index);
    const outward = new Vector3(position.x, 0, position.z).normalize();
    const normal = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5)
      .normalize()
      .addScaledVector(outward, 0.5)
      .add(new Vector3(0, 0.6, 0))
      .normalize();
    position.addScaledVector(normal, branch.radius + 0.02);
    const bud = rand() < 0.18;
    flowers.push({ position, normal, spin: rand() * Math.PI * 2, scale: bud ? 0.4 : 0.85 + rand() * 0.5, bud });
  }
  return { branches, flowers };
}

/**
 * One open five-petal flower facing +y, about 0.4 across: each petal a cupped kite of two
 * triangles, white on the vertices so the instance colour tints it, with a warm throat and stamens.
 */
export function createFlowerGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const push = (p: readonly [number, number, number], c: readonly [number, number, number]) => {
    positions.push(...p);
    colours.push(...c);
  };
  const throat = [0.95, 0.5, 0.3] as const;
  const white = [1, 1, 1] as const;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const side = (offset: number): [number, number, number] => [Math.cos(a + offset) * 0.115, 0.04, Math.sin(a + offset) * 0.115];
    const base: [number, number, number] = [0, 0, 0];
    const tip: [number, number, number] = [Math.cos(a) * 0.21, 0.085, Math.sin(a) * 0.21];
    const left = side(-0.52);
    const right = side(0.52);
    push(base, throat);
    push(right, white);
    push(left, white);
    push(left, white);
    push(right, white);
    push(tip, white);
  }
  const stamen = new OctahedronGeometry(0.04).translate(0, 0.045, 0);
  const stamenPositions = stamen.getAttribute('position');
  for (let i = 0; i < stamenPositions.count; i++) {
    push([stamenPositions.getX(i), stamenPositions.getY(i), stamenPositions.getZ(i)], [1, 0.78, 0.22]);
  }
  stamen.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
  geometry.computeVertexNormals();
  return geometry;
}
