import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Camera, InstancedMesh, Object3D } from 'three';
import { createFrameGate, foldSignature, frameDrawn, frameDue } from './frame-gate';

/** Where every visible object is. Hidden subtrees count as hidden, wherever they are. */
function fold(hash: number, object: Object3D): number {
  if (!object.visible) return (Math.imul(hash, 31) + 1) | 0;
  let h = foldSignature(hash, object.matrixWorld.elements);
  const instances = (object as InstancedMesh).instanceMatrix;
  if (instances) h = (Math.imul(h, 31) + instances.version) | 0;
  for (const child of object.children) h = fold(h, child);
  return h;
}

function sceneSignature(scene: Object3D, camera: Camera, width: number, height: number): number {
  scene.updateMatrixWorld();
  // A camera outside the scene graph is not reached by the line above.
  if (camera.parent === null) camera.updateMatrixWorld();
  let h = fold(width * 8191 + height, scene);
  h = foldSignature(h, camera.matrixWorld.elements);
  // The view offset and the far plane move the picture without moving the camera.
  return foldSignature(h, camera.projectionMatrix.elements);
}

/**
 * Takes the drawing over from the frame loop on a software renderer: see `frame-gate.ts`.
 * Mounted only while the canvas runs at full activity and without post-processing, which
 * would want the drawing for itself.
 */
export default function FrameGate() {
  const gate = useMemo(createFrameGate, []);
  // A positive priority tells the frame loop that this callback draws.
  useFrame(({ gl, scene, camera, size }) => {
    const signature = sceneSignature(scene, camera, size.width, size.height);
    const now = performance.now();
    if (!frameDue(gate, signature, now)) return;
    gl.render(scene, camera);
    frameDrawn(gate, signature, now);
  }, 1);
  return null;
}
