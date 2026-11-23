import type { Group } from 'three';
import type { Color } from '../../../shared/game/types';

/**
 * Mutable per-frame state shared by the scene's components. Written by the
 * director's view and the frame loop, read by meshes in `useFrame`; it lives
 * outside React state so animation never triggers a re-render.
 */
export interface SceneState {
  /** horses[color][horse] */
  horses: (Group | null)[][];
  die: Group | null;
  /** Colour whose stable is highlighted. */
  active: Color | null;
  /** Slow 0..1 oscillation for pulsing glows. */
  pulse: number;
  /** Fast 0..1 oscillation for selectable horses. */
  tap: number;
  /** Seconds since mount. */
  time: number;
  celebration: { color: Color | null; t: number };
  /** Dust and flash where a slow-motion kick hit: `t` is seconds since contact, -1 when nothing plays. */
  impact: { x: number; z: number; t: number };
}

export function createSceneState(): SceneState {
  return {
    horses: [[], [], [], []],
    die: null,
    active: null,
    pulse: 0,
    tap: 0,
    time: 0,
    celebration: { color: null, t: 0 },
    impact: { x: 0, z: 0, t: -1 },
  };
}
