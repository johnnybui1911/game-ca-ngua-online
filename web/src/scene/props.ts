import type { Color, GameEvent, GameState } from '../../../shared/game/types';
import type { RoomSnapshot } from '../../../shared/protocol';
import type { StateBatch } from '../room/batches';
import type { RefObject } from 'react';

/**
 * Contract between the match page and the 3D scene. The match page owns all
 * DOM controls (roll button, turn banner, dialogs); the scene owns the canvas.
 */
export interface GameSceneProps {
  /**
   * Latest snapshot. `room.game` is non-null whenever the scene is mounted. `room.settings.pace` and
   * `room.settings.quick` pick the animation timings; a quick game (`room.game.variant`) also shows a lock on each closed home column.
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
  /** Match-owned handle for returning the camera to its seat view. */
  cameraReset?: RefObject<(() => void) | null>;
}

/** DOM label of each horse, `[color][horse]`, owned by the scene's mount point and placed by the frame loop. */
export type HorseLabelElements = (HTMLDivElement | null)[][];

/** One step of a game shown without a room behind it: the state and the events that led to it. */
export interface ShowcaseStep {
  /** Increases with every step, like `RoomSnapshot.seq`. */
  seq: number;
  game: GameState;
  events: GameEvent[];
}

/**
 * A game the board plays by itself while no match owns it (the home page and the panels over it).
 * `steps` follows the contract of `GameSceneProps.batches`: in `seq` order, newest last, never
 * empty; the scene animates every step newer than the last one it showed and ends up showing the
 * newest `game`. Nobody controls a colour, and nothing can be picked.
 */
export interface ShowcaseScene {
  /** Changes when another game starts (a replay): the board shows it at once instead of animating into it. */
  key?: string;
  steps: ShowcaseStep[];
  /** Quick animation pace, as in a quick match. */
  quick?: boolean;
}

/** How the scene is staged around whatever game it shows. */
export interface SceneStaging {
  /**
   * Identity of the game on the board. When it changes the scene shows the new game at once
   * (no animation from the old one) and, in the `seat` view, flies the camera to the seat.
   */
  sourceKey?: string;
  /**
   * `seat` (default): the camera sits behind `myColor`'s stable (the first colour's when null).
   * `free`: the camera belongs to nobody, as on the home page.
   */
  view?: 'seat' | 'free';
  /** Slow turn around the board in the `free` view; stops while the player drags it. */
  orbit?: boolean;
}
