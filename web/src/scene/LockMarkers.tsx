import { useMemo } from 'react';
import { BoxGeometry, MeshStandardMaterial, TorusGeometry } from 'three';
import { COLORS } from '../../../shared/game/types';
import type { Color } from '../../../shared/game/types';
import type { Assets } from './assets';
import { HOME, armDirection, yawBetween } from './layout';
import { HORSE_COLORS } from './palette';

interface Props {
  assets: Assets;
  /** Colours whose home column is closed; each gets a padlock on the first step of its column. */
  locked: readonly Color[];
}

/** Padlock standing on the first home step of every colour that has not unlocked its column yet (quick match). */
export default function LockMarkers({ assets, locked }: Props) {
  const parts = useMemo(() => {
    const body = assets.own(new BoxGeometry(0.5, 0.36, 0.2));
    const shackle = assets.own(new TorusGeometry(0.14, 0.045, 8, 16, Math.PI));
    const metal = assets.own(new MeshStandardMaterial({ color: '#d8b25a', roughness: 0.35, metalness: 0.5 }));
    const bodyMat = COLORS.map((c) => assets.own(new MeshStandardMaterial({ color: HORSE_COLORS[c], roughness: 0.45 })));
    return { body, shackle, metal, bodyMat };
  }, [assets]);

  return (
    <group>
      {locked.map((c) => {
        const at = HOME[c]?.[0];
        const mat = parts.bodyMat[c];
        if (!at || !mat) return null;
        return (
          <group
            key={`lock${c}`}
            name={`lock-marker-${c}`}
            position={[at.x, 0.09, at.z]}
            rotation={[0, yawBetween({ x: 0, z: 0 }, armDirection(c)), 0]}
          >
            <mesh geometry={parts.body} material={mat} position={[0, 0.18, 0]} castShadow />
            <mesh geometry={parts.shackle} material={parts.metal} position={[0, 0.36, 0]} />
          </group>
        );
      })}
    </group>
  );
}
