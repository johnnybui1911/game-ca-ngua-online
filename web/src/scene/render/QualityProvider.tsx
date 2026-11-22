import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createGovernor, effectiveActivity, forcedTier, governorStep, initialTier, settingsFor } from './quality';
import type { PerformanceSignal, QualitySettings, QualityTier, SceneActivity } from './quality';

export type WebglSupport = 'none' | 'software' | 'gpu';

export interface Quality {
  tier: QualityTier;
  settings: QualitySettings;
  webgl: WebglSupport;
  /** What the canvas is doing now: the requested activity, or `paused` while the tab is hidden. */
  activity: SceneActivity;
  /**
   * Lowers or stops the cost of the board while something else has the player's attention:
   * `dimmed` draws about 30 frames a second at a low pixel ratio, `paused` draws nothing
   * (animations freeze and continue where they stopped).
   */
  setActivity: (activity: SceneActivity) => void;
  /** Frame-rate verdict from the canvas; moves the tier unless it is pinned. */
  reportPerformance: (signal: PerformanceSignal) => void;
}

const QualityContext = createContext<Quality | null>(null);

/**
 * Software rasterisers (no GPU, remote desktops, headless browsers) render the
 * full-quality scene at a few frames per second and starve the page, so they
 * are told apart from real GPUs here.
 */
function probeWebgl(): { support: WebglSupport; renderer: string } {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return { support: 'none', renderer: '' };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { support: /swiftshader|llvmpipe|softpipe|software/i.test(renderer) ? 'software' : 'gpu', renderer };
  } catch {
    return { support: 'none', renderer: '' };
  }
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/**
 * Owns the quality tier and the scene activity. `GameScene` mounts one by itself; mount one
 * higher in the tree to read the tier or call `setActivity` from outside the scene.
 */
export function QualityProvider({ children }: { children: ReactNode }) {
  const [start] = useState(() => {
    const webgl = probeWebgl();
    const software = webgl.support === 'software';
    // A software renderer stays on its cheap path even when a tier is asked for.
    const forced = software ? null : forcedTier(window.location.search);
    const tier =
      forced ??
      initialTier({
        software,
        renderer: webgl.renderer,
        devicePixelRatio: window.devicePixelRatio,
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    const pinned = software || forced !== null;
    return { webgl: webgl.support, renderer: webgl.renderer, software, pinned, governor: createGovernor(tier, performance.now(), pinned) };
  });
  const [governor, setGovernor] = useState(start.governor);
  const [requested, setActivity] = useState<SceneActivity>('full');
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden);

  const reportPerformance = useCallback((signal: PerformanceSignal) => {
    setGovernor((g) => governorStep(g, signal, performance.now()));
  }, []);

  // Contract with the stylesheet: endless decorative animations stop on `data-webgl="software"`, where
  // every animated frame makes the CPU composite the whole page again.
  useEffect(() => {
    document.documentElement.dataset.webgl = start.webgl;
  }, [start]);

  const tier = governor.tier;
  // Contract with the stylesheet: glass panels fall back to plain ones on `data-quality="low"`.
  // The log line makes tier switches observable in the field.
  useEffect(() => {
    document.documentElement.dataset.quality = tier;
    console.info(`[quality] ${tier}${start.pinned ? ' (pinned)' : ''} · ${start.renderer || 'unknown renderer'}`);
  }, [tier, start]);

  const value = useMemo<Quality>(
    () => ({
      tier,
      settings: settingsFor(tier, start.software),
      webgl: start.webgl,
      activity: effectiveActivity(requested, hidden),
      setActivity,
      reportPerformance,
    }),
    [tier, start, requested, hidden, reportPerformance],
  );
  // Development builds: `__quality.setActivity('dimmed')`, `__quality.reportPerformance('decline')` from the console.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __quality: value });
  }, [value]);
  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

/** Reuses the provider above when there is one, otherwise provides quality for this subtree. */
export function QualityScope({ children }: { children: ReactNode }) {
  return useContext(QualityContext) ? children : <QualityProvider>{children}</QualityProvider>;
}

export function useQuality(): Quality {
  const quality = useContext(QualityContext);
  if (!quality) throw new Error('useQuality needs a QualityProvider above it');
  return quality;
}
