import { Canvas } from '@react-three/fiber';
import { Component, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from 'three';
import { HORSES_PER_COLOR } from '../../../shared/game/types';
import { horseLabel } from '../../../shared/protocol';
import type { HudInsets } from './camera';
import { HORSE_COLORS } from './palette';
import type { GameSceneProps, HorseLabelElements } from './props';
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
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Unavailable /> : this.props.children;
  }
}

/** Mount point of the 3D board. Default export so the match page can load it lazily. */
export default function GameScene(props: GameSceneProps & { insets?: HudInsets }) {
  return (
    <QualityScope>
      <Scene {...props} />
    </QualityScope>
  );
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

function Scene(props: GameSceneProps & { insets?: HudInsets }) {
  const { webgl: support, settings, activity } = useQuality();
  const labels = useRef<HorseLabelElements>([[], [], [], []]);
  const software = support === 'software';
  const game = props.room.game;
  return (
    <div
      data-testid="game-scene"
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
        <CanvasBoundary>
          <Canvas
            dpr={dprRange(settings, activity)}
            frameloop={FRAMELOOP[activity]}
            shadows={software ? false : { type: PCFShadowMap }}
            camera={{ fov: 40, near: 3, far: 80, position: [0, 15, 12] }}
            gl={software ? SOFTWARE_RENDERER : RENDERER}
            style={{ position: 'absolute', inset: 0 }}
          >
            <SceneContent {...props} labels={labels.current} />
          </Canvas>
        </CanvasBoundary>
      ) : (
        <Unavailable />
      )}
      {support !== 'none' && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {game?.colors.flatMap((color) => {
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
