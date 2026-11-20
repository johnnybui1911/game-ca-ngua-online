import type { Color, GameEvent } from '../../../shared/game/types';
import type { RoomSnapshot } from '../../../shared/protocol';

/**
 * Contract between the match page and the 3D scene. The match page owns all
 * DOM controls (roll button, turn banner, dialogs); the scene owns the canvas.
 */
export interface GameSceneProps {
  /** Latest snapshot. `room.game` is non-null whenever the scene is mounted. */
  room: RoomSnapshot;
  /**
   * Events that led to `room`, from the same server message. A new
   * `room.seq` means a new batch to animate; the scene must end up showing
   * exactly `room.game` once its animations finish, and must show it
   * immediately when mounted mid-game (reload) with an empty batch.
   */
  events: GameEvent[];
  /** Colour the local player controls, null for none. That colour's stable faces the camera. */
  myColor: Color | null;
  /**
   * Called when the local player taps one of their horses listed in
   * `room.game.legalHorses` while it is their turn and the phase is 'move'.
   */
  onPickHorse: (horse: number) => void;
}
