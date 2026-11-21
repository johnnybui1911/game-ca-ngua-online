import { Canvas } from '@react-three/fiber';
import { Component, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { PCFShadowMap, NeutralToneMapping } from 'three';
import { HORSES_PER_COLOR } from '../../../shared/game/types';
import { horseLabel } from '../../../shared/protocol';
import type { HudInsets } from './camera';
import { HORSE_COLORS } from './palette';
import type { GameSceneProps, HorseLabelElements } from './props';
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

type WebglSupport = 'none' | 'software' | 'gpu';

/**
 * Software rasterisers (no GPU, remote desktops, headless browsers) render the
 * full-quality scene at a few frames per second and starve the page, so they
 * get a cheaper renderer: no shadows, no antialiasing, pixel ratio 1.
 */
function detectWebgl(): WebglSupport {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'none';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software/i.test(renderer) ? 'software' : 'gpu';
  } catch {
    return 'none';
  }
}

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
  const [support] = useState(detectWebgl);
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
        background: 'radial-gradient(ellipse at 50% 38%, #5a3b27 0%, #33211a 55%, #1d130f 100%)',
      }}
    >
      {support !== 'none' ? (
        <CanvasBoundary>
          <Canvas
            dpr={software ? 1 : [1, 2]}
            shadows={software ? false : { type: PCFShadowMap }}
            camera={{ fov: 40, near: 3, far: 80, position: [0, 15, 12] }}
            gl={{ antialias: !software, alpha: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
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
