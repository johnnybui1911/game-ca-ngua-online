import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, lazy, useEffect } from 'react';
import type { ComponentType } from 'react';
import FrameGate from './FrameGate';
import Lighting from './Lighting';
import { useQuality } from './QualityProvider';
import { DIMMED_FPS } from './quality';
import type { QualitySettings } from './quality';

/** A chunk that fails to load (offline, a deploy in between) costs the effects, not the board. */
const Effects = lazy<ComponentType<{ settings: QualitySettings }>>(() => import('./Effects').catch(() => ({ default: () => null })));

/**
 * Frame-rate band per display: below the first number the tier steps down, at or above the
 * second there is room to step up. The upper bound sits under the refresh rate because a
 * display-locked frame rate never measures above it.
 */
function fpsBounds(refreshRate: number): [number, number] {
  return refreshRate > 100 ? [50, 90] : [45, 57];
}

/** Everything of the picture that is not the game: lights, backdrop, post-processing, frame-rate watch. */
export default function RenderPipeline() {
  const { tier, settings, activity, webgl, reportPerformance } = useQuality();
  const invalidate = useThree((s) => s.invalidate);

  // A dimmed canvas draws on demand; this is the demand.
  useEffect(() => {
    if (activity !== 'dimmed') return;
    const id = window.setInterval(() => invalidate(), 1000 / DIMMED_FPS);
    return () => window.clearInterval(id);
  }, [activity, invalidate]);

  return (
    <>
      {/* Only a canvas drawing at full speed says anything about the device. */}
      {activity === 'full' && (
        <PerformanceMonitor
          key={tier}
          bounds={fpsBounds}
          onIncline={() => reportPerformance('incline')}
          onDecline={() => reportPerformance('decline')}
        />
      )}
      <Lighting />
      {/* A software renderer at full activity draws only what changed; the other activities already ration their pictures. */}
      {webgl === 'software' && activity === 'full' && !settings.postprocessing && <FrameGate />}
      {settings.postprocessing && (
        <Suspense fallback={null}>
          <Effects key={tier} settings={settings} />
        </Suspense>
      )}
    </>
  );
}
