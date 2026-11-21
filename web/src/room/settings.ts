import { DEFAULT_ROOM_SETTINGS, QUICK_TURN_SECONDS, type RoomSettings } from '../../../shared/protocol';

/**
 * The settings object to send after the host changes one control. Turning Ván nhanh on while the
 * turn time is still the default preselects the quicker time; any other time the host chose is kept,
 * and turning it off keeps the time too.
 */
export function nextSettings(current: RoomSettings, change: Partial<RoomSettings>): RoomSettings {
  const next = { ...current, ...change };
  if (change.quick === true && !current.quick && change.turnSeconds === undefined && current.turnSeconds === DEFAULT_ROOM_SETTINGS.turnSeconds) {
    next.turnSeconds = QUICK_TURN_SECONDS;
  }
  return next;
}
