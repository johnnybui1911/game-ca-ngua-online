import { useEffect, useMemo, useRef, useState } from 'react';
import { SceneCanvas } from '../scene/GameScene';
import { useQuality } from '../scene/render/QualityProvider';
import { MATCH_TRANSITION_LIMIT_MS, useSceneHost, useSceneHostState } from './scene-host';
import { idleShowcase, showcaseBatches } from './showcase';

const NOTHING = () => undefined;

/**
 * The app's one canvas. Shows the showcase game framed for the current screen, and hands the
 * board to a match when one asks for it. Default export: loaded lazily, with three.js.
 */
export default function PersistentScene() {
  const host = useSceneHost();
  const { stage, match, showcase } = useSceneHostState();
  const { setActivity, webgl } = useQuality();

  // A match takes the board once the registered transitions (demo horses going home) have run.
  const code = match?.room.code ?? null;
  const [released, setReleased] = useState<string | null>(null);
  const matchRef = useRef(match);
  matchRef.current = match;
  useEffect(() => {
    if (code === null) {
      setReleased(null);
      return;
    }
    const steps = host?.matchTransitions() ?? [];
    if (steps.length === 0) {
      setReleased(code);
      return;
    }
    let live = true;
    // The match page holds the roll button back while the board is busy.
    matchRef.current?.onBusyChange?.(true);
    const limit = new Promise<void>((resolve) => setTimeout(resolve, MATCH_TRANSITION_LIMIT_MS));
    void Promise.race([Promise.allSettled(steps.map(async (step) => step())), limit]).then(() => {
      if (live) setReleased(code);
    });
    return () => {
      live = false;
    };
  }, [code, host]);
  const playing = match !== null && released === code ? match : null;

  // A software renderer cannot afford a moving background: after its first match (the shell
  // gives it no canvas before) it shows still pictures between matches.
  const activity = match !== null ? 'full' : webgl === 'software' ? 'paused' : stage.activity;
  useEffect(() => {
    setActivity(activity);
  }, [activity, setActivity]);
  useEffect(() => () => setActivity('full'), [setActivity]);

  useEffect(() => {
    host?.setLoad('building');
  }, [host]);

  const idle = useMemo(idleShowcase, []);
  const shown = showcase ?? idle;
  const batches = useMemo(() => showcaseBatches(shown), [shown]);
  const latest = batches[batches.length - 1];

  if (playing) {
    return (
      <SceneCanvas
        room={playing.room}
        batches={playing.batches}
        myColor={playing.myColor}
        onPickHorse={playing.onPickHorse}
        onBusyChange={playing.onBusyChange}
        insets={playing.insets}
        eventSource={playing.eventSource}
        sourceKey={`room:${playing.room.code}`}
        view="seat"
        onReady={() => host?.setLoad('ready')}
        onFail={() => host?.setLoad('unavailable')}
        testid="scene-canvas"
      />
    );
  }
  if (!latest) return null;
  return (
    <SceneCanvas
      room={latest.room}
      batches={batches}
      myColor={null}
      onPickHorse={NOTHING}
      insets={stage.insets}
      sourceKey={`showcase:${shown.key ?? ''}`}
      view="free"
      orbit={stage.orbit}
      labelled={false}
      onReady={() => host?.setLoad('ready')}
      onFail={() => host?.setLoad('unavailable')}
      testid="scene-canvas"
    />
  );
}
