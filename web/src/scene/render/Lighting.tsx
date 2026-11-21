import { Environment, Lightformer } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, CanvasTexture, SRGBColorSpace } from 'three';
import { useQuality } from './QualityProvider';

/** Warm near-black the scene fades into; also the container colour behind the canvas. */
export const BACKDROP = '#170d0a';

const FOG_DENSITY = 0.011;
/** Height of the ground under the board, just below the slab. */
const GROUND_Y = -0.72;
const POOL_RADIUS = 30;

/** Soft warm disc: the light the lamps above the table throw on the floor around the board. */
function poolTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgb(150 74 36)');
  g.addColorStop(0.3, 'rgb(96 44 24)');
  g.addColorStop(0.65, 'rgb(36 16 10)');
  g.addColorStop(1, 'rgb(0 0 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Backdrop, fog, ground and lights of the board: softbox environment lighting plus a
 * three-point rig (warm key with shadows, cool fill, golden rim). The low tier swaps the
 * environment for a hemisphere light and casts no shadows.
 */
export default function Lighting() {
  const { settings } = useQuality();
  const pool = useMemo(poolTexture, []);
  useEffect(() => () => pool.dispose(), [pool]);
  const env = settings.environmentResolution;

  return (
    <>
      <color attach="background" args={[BACKDROP]} />
      <fogExp2 attach="fog" args={[BACKDROP, FOG_DENSITY]} />

      {env > 0 ? (
        <Environment key={env} resolution={env} frames={1} environmentIntensity={0.3}>
          <color attach="background" args={['#22140d']} />
          <Lightformer form="rect" intensity={1.5} color="#ffe4c0" position={[0, 10, 0]} scale={[12, 12, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={2} color="#ffb672" position={[-11, 4, 3]} scale={[12, 6, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.1} color="#c4d0ff" position={[11, 4, -3]} scale={[12, 6, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={3.5} color="#ff6a3c" position={[0, 4, -12]} scale={5} target={[0, 0, 0]} />
        </Environment>
      ) : (
        <hemisphereLight args={['#ffe9cf', '#5a3a2a', 0.5]} />
      )}

      {/* Key. Remounted when the shadow map changes size, which a live light cannot do. */}
      <directionalLight
        key={settings.shadowMapSize}
        position={[6, 15, 9]}
        intensity={1.75}
        color="#ffe6c4"
        castShadow={settings.shadows}
        shadow-mapSize={[settings.shadowMapSize || 512, settings.shadowMapSize || 512]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={2}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* Fill */}
      <directionalLight position={[-10, 6, 5]} intensity={0.3} color="#c9d4f5" />
      {/* Rim */}
      <directionalLight position={[-4, 7, -12]} intensity={0.9} color="#ffb056" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y - 0.02, 0]} renderOrder={-1}>
        <circleGeometry args={[POOL_RADIUS, 48]} />
        <meshBasicMaterial map={pool} transparent blending={AdditiveBlending} depthWrite={false} fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <shadowMaterial opacity={0.45} />
      </mesh>
    </>
  );
}
