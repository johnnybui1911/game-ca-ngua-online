import type { Color } from '../../../shared/game/types';
import type { RoomSnapshot } from '../../../shared/protocol';
import type { StateBatch } from '../room/batches';

/**
 * Contract between the match page and the 3D scene. The match page owns all
 * DOM controls (roll button, turn banner, dialogs); the scene owns the canvas.
 */
export interface GameSceneProps {
  /**
   * Latest snapshot. `room.game` is non-null whenever the scene is mounted. `room.settings.quick` sets the
   * animation pace; a quick game (`room.game.variant`) also shows a lock on each closed home column.
   */
  room: RoomSnapshot;
  /**
   * Server state messages in `seq` order, newest last (its `room` is the `room` prop). Several can
   * arrive before one render, so the scene walks every batch newer than the last `seq` it animated
   * and animates its events; it must end up showing exactly `room.game` once its animations
   * finish, and must show it immediately when mounted mid-game (reload), ignoring older batches.
   */
  batches: StateBatch[];
  /** Colour the local player controls, null for none. That colour's stable faces the camera. */
  myColor: Color | null;
  /**
   * Called when the local player taps one of their horses listed in
   * `room.game.legalHorses` while it is their turn and the phase is 'move'.
   */
  onPickHorse: (horse: number) => void;
  /** Called whenever the board starts or finishes animating what the server reported (rolls, moves). */
  onBusyChange?: (busy: boolean) => void;
}

/** DOM label of each horse, `[color][horse]`, owned by the scene's mount point and placed by the frame loop. */
export type HorseLabelElements = (HTMLDivElement | null)[][];
