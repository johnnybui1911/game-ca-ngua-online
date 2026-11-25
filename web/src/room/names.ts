import type { Seat } from '../../../shared/protocol';
import type { TFunction } from '../i18n';

/**
 * A CPU's name as the server stores it ("Máy 2") shown in the player's language ("CPU 2"). The name is stored
 * once, in the room, so it is translated here, on the client; a name a person typed is never touched.
 */
export function cpuDisplayName(t: TFunction, name: string): string {
  const n = /^Máy (\d+)$/.exec(name)?.[1];
  return n ? t('cpu.name', { n }) : name;
}

/**
 * A room's name as the server stores it, shown in the player's language: the default name a Vietnamese client
 * gives ("Phòng của An") reads "Room of An" in English. A name a person typed is never touched.
 */
export function roomDisplayName(t: TFunction, name: string): string {
  const owner = /^Phòng của (.+)$/.exec(name)?.[1];
  return owner ? t('lobby.defaultRoomName', { name: owner }) : name;
}

/** Who sits in `seat`, as shown on screen. */
export function seatName(t: TFunction, seat: Seat | undefined): string {
  const occ = seat?.occupant;
  if (!occ) return '';
  return occ.kind === 'cpu' ? cpuDisplayName(t, occ.name) : occ.user.displayName;
}
