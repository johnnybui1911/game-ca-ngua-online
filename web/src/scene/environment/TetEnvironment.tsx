import { Suspense, lazy } from 'react';
import type { ComponentType } from 'react';
import { useQuality } from '../render/QualityProvider';

/** A chunk that fails to load (offline, a deploy in between) costs the room, not the board. */
const TetSet = lazy<ComponentType>(() => import('./TetSet').catch(() => ({ default: () => null })));

/**
 * The Tết-night living room around the board. Loaded after the board is on screen and faded
 * in; left out on a software renderer, which has no frames to spare for scenery.
 */
export default function TetEnvironment() {
  const { webgl } = useQuality();
  if (webgl === 'software') return null;
  return (
    <Suspense fallback={null}>
      <TetSet />
    </Suspense>
  );
}
