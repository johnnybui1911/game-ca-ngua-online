import type { GameSceneProps } from './props';

/** Mount point of the 3D board. Default export so the match page can load it lazily. */
export default function GameScene(_props: GameSceneProps) {
  return <div data-testid="game-scene" style={{ width: '100%', height: '100%' }} />;
}
