import { Canvas, useFrame } from '@react-three/fiber';
import { Component, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from 'three';
import { HORSES_PER_COLOR } from '../../../shared/game/types';
import { horseLabel } from '../../../shared/protocol';
import { BASE_FAR } from './camera';
import type { HudInsets } from './camera';
import { HORSE_COLORS } from './palette';
import { useSceneHost } from '../shell/scene-host';
import type { SceneHostApi } from '../shell/scene-host';
import type { GameSceneProps, HorseLabelElements, SceneStaging } from './props';
import { BACKDROP } from './render/Lighting';
import { QualityScope, useQuality } from './render/QualityProvider';
import { dprRange } from './render/quality';
import type { SceneActivity } from './render/quality';
import SceneContent from './SceneContent';

const LABEL_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  display: 'none',
  padding: '1px 6px',
  border: '2px solid',
  borderRadius: 999,
  background: 'rgb(251 244 230 / 88%)',
  color: '#2a1c10',
  font: '700 11px/1.3 system-ui, sans-serif',
  whiteSpace: 'nowrap',
  willChange: 'transform',
};

const UNAVAILABLE = 'Trình duyệt không hỗ trợ WebGL nên không thể hiển thị bàn cờ 3D. Hãy thử trình duyệt hoặc thiết bị khác.';

function Unavailable() {
  return (
    <div
      role="alert"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        textAlign: 'center',
        color: '#f4e7cf',
        font: '500 16px/1.5 system-ui, sans-serif',
      }}
    >
      {UNAVAILABLE}
    </div>
  );
}

/** Context creation can still fail after the probe (lost GPU, blocklist); show the same message. */
class CanvasBoundary extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? <Unavailable /> : this.props.children;
  }
}

/**
 * Mount point of the 3D board for a match. Inside the app shell the board is the shell's one
 * persistent canvas: this hands it the match and leaves a placeholder that takes the pointer
 * input. Anywhere else (the dev harness) it mounts a canvas of its own.
 * Default export so the match page can load it lazily.
 */
export default function GameScene(props: GameSceneProps & { insets?: HudInsets }) {
  const host = useSceneHost();
  if (host) return <SceneProxy host={host} {...props} />;
  return (
    <QualityScope>
      <SceneCanvas {...props} />
    </QualityScope>
  );
}

function SceneProxy({ host, ...props }: GameSceneProps & { insets?: HudInsets; host: SceneHostApi }) {
  const { webgl } = useQuality();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (el) host.setMatch({ ...props, eventSource: el });
  });
  useLayoutEffect(() => () => host.setMatch(null), [host]);
  return (
    <div ref={setEl} data-testid="game-scene" style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none' }}>
      {webgl === 'none' && <Unavailable />}
    </div>
  );
}

let canvasMounts = 0;

/** Reports the first picture drawn. */
function FirstFrame({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  // The renderer draws after this callback, so the picture exists one frame later.
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(onReady);
  });
  return null;
}

export interface SceneCanvasProps extends GameSceneProps, SceneStaging {
  insets?: HudInsets;
  /** Element whose pointer events drive the board, when the canvas itself is covered. */
  eventSource?: HTMLElement | null;
  /** False hides the name labels over the horses. */
  labelled?: boolean;
  /** Called once, after the first picture is on screen. */
  onReady?: () => void;
  /** Called when the canvas could not be created or its content failed. */
  onFail?: () => void;
  /** `data-testid` of the canvas container. */
  testid?: string;
}

const FRAMELOOP = { full: 'always', dimmed: 'demand', paused: 'never' } as const satisfies Record<SceneActivity, string>;

/**
 * Filmic tone curve; the exposure is tuned with the lights in `render/Lighting.tsx`.
 * Constant objects, so a re-render never re-applies them over what post-processing set.
 */
const RENDERER = {
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  toneMapping: ACESFilmicToneMapping,
  toneMappingExposure: 1.15,
  outputColorSpace: SRGBColorSpace,
} as const;
/** Software rasterisers render without antialiasing (and, through the low tier, without shadows at pixel ratio 1). */
const SOFTWARE_RENDERER = { ...RENDERER, antialias: false } as const;

/** The canvas and the labels over it. Fills its parent. */
export function SceneCanvas({ eventSource, labelled = true, onReady, onFail, testid = 'game-scene', ...props }: SceneCanvasProps) {
  const { webgl: support, settings, activity } = useQuality();
  const labels = useRef<HorseLabelElements>([[], [], [], []]);
  const software = support === 'software';
  const game = props.room.game;
  return (
    <div
      data-testid={testid}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        background: BACKDROP,
      }}
    >
      {support !== 'none' ? (
        <CanvasBoundary onFail={onFail}>
          <Canvas
            dpr={dprRange(settings, activity)}
            frameloop={FRAMELOOP[activity]}
            shadows={software ? false : { type: PCFShadowMap }}
            camera={{ fov: 40, near: 3, far: BASE_FAR, position: [0, 15, 12] }}
            gl={software ? SOFTWARE_RENDERER : RENDERER}
            style={{ position: 'absolute', inset: 0 }}
            eventSource={eventSource ?? undefined}
            onCreated={() => {
              canvasMounts += 1;
              // Counts every canvas ever created on this page: the app shell must stay at 1 across routes.
              document.documentElement.dataset.sceneMounts = String(canvasMounts);
            }}
          >
            <SceneContent {...props} labels={labelled ? labels.current : undefined} />
            {onReady && <FirstFrame onReady={onReady} />}
          </Canvas>
        </CanvasBoundary>
      ) : (
        <Unavailable />
      )}
      {support !== 'none' && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {labelled && game?.colors.flatMap((color) => {
            const names = props.room.seats.find((s) => s.color === color)?.horseNames;
            return Array.from({ length: HORSES_PER_COLOR }, (_, horse) => (
              <div
                key={`${color}-${horse}`}
                ref={(el) => {
                  labels.current[color]![horse] = el;
                }}
                data-testid={`horse-label-${color}-${horse}`}
                style={{ ...LABEL_STYLE, borderColor: HORSE_COLORS[color] }}
              >
                {horseLabel(names, horse)}
              </div>
            ));
          })}
        </div>
      )}
    </div>
  );
}
