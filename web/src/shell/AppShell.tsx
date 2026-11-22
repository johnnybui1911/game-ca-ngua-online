import { Component, Suspense, lazy, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { SoundPlacement } from '../audio/SoundControls';
import { entered } from './entered';
import { LoadingOverlay } from './LoadingOverlay';
import { useQuality } from '../scene/render/QualityProvider';
import { SceneHostProvider, useSceneHost, useSceneHostState } from './scene-host';
import type { SceneLoad } from './scene-host';
import { CreatorLogoSlot, FeedbackSlot, SoundSlot } from './slots';
import './shell.css';

const PersistentScene = lazy(() => import('./PersistentScene'));

/** The 3D chunk failed to load or the canvas failed: the poster stays and says so. */
class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SceneLayer() {
  const host = useSceneHost();
  const { load, match } = useSceneHostState();
  const { webgl } = useQuality();
  // A software rasteriser builds and draws the board on the CPU, which stalls the page for
  // seconds: it gets the poster until a match needs the real board. Once created the canvas stays.
  const wanted = webgl === 'gpu' || (webgl === 'software' && match !== null);
  const [created, setCreated] = useState(wanted);
  useEffect(() => {
    if (wanted) setCreated(true);
  }, [wanted]);
  const mounted = created || wanted;
  const shown: SceneLoad = mounted ? load : webgl === 'none' ? 'unavailable' : 'poster';
  return (
    <div className="shell-scene" data-testid="scene-host" data-load={shown} data-match={match ? '' : undefined}>
      <div className="shell-canvas">
        {mounted && (
          <SceneBoundary onFail={() => host?.setLoad('unavailable')}>
            <Suspense fallback={null}>
              <PersistentScene />
            </Suspense>
          </SceneBoundary>
        )}
      </div>
      <LoadingOverlay load={shown} />
    </div>
  );
}

/** The corner controls. A match has its own menu, so all but the creator's badge step aside for it. */
function Chrome() {
  const { stage, match } = useSceneHostState();
  // A match has its own menu and bottom bar: only the creator's badge stays (the feedback entry is in the menu).
  const style = {
    '--shell-panel-right': `${stage.panel?.right ?? 0}px`,
    '--shell-panel-bottom': `${stage.panel?.bottom ?? 0}px`,
  } as CSSProperties;
  return (
    <div className="shell-chrome" style={style}>
      <div className="shell-slot shell-slot--top-right" data-testid="slot-creator" data-match={match ? '' : undefined}>
        <CreatorLogoSlot />
      </div>
      {!match && (
        <>
          <div className="shell-slot shell-slot--bottom-left" data-testid="slot-sound">
            <SoundPlacement value="inline">
              <SoundSlot />
            </SoundPlacement>
          </div>
          <div className="shell-slot shell-slot--bottom-right" data-testid="slot-feedback">
            <FeedbackSlot />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Layout route above every page: one canvas for the whole app with the pages drawn over it, so
 * moving between the home page, the panels and a match never rebuilds the board.
 */
export function AppShell() {
  const { pathname } = useLocation();
  // Anyone on a screen past the home page has entered the game for this tab.
  useEffect(() => {
    if (pathname !== '/') entered.set(true);
  }, [pathname]);
  return (
    <SceneHostProvider>
      <div className="shell">
        <SceneLayer />
        <Chrome />
        <SoundPlacement value="docked">
          <Outlet />
        </SoundPlacement>
      </div>
    </SceneHostProvider>
  );
}
