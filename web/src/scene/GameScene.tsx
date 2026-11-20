import { Canvas } from '@react-three/fiber';
import { Component, useState } from 'react';
import type { ReactNode } from 'react';
import { PCFShadowMap, NeutralToneMapping } from 'three';
import type { GameSceneProps } from './props';
import SceneContent from './SceneContent';

const UNAVAILABLE = 'Trình duyệt không hỗ trợ WebGL nên không thể hiển thị bàn cờ 3D. Hãy thử trình duyệt hoặc thiết bị khác.';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
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
export default function GameScene(props: GameSceneProps) {
  const [supported] = useState(webglAvailable);
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
      {supported ? (
        <CanvasBoundary>
          <Canvas
            dpr={[1, 2]}
            shadows={{ type: PCFShadowMap }}
            camera={{ fov: 40, near: 0.5, far: 200, position: [0, 15, 12] }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <SceneContent {...props} />
          </Canvas>
        </CanvasBoundary>
      ) : (
        <Unavailable />
      )}
    </div>
  );
}
