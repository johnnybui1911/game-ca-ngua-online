import type { RoomSummary, RoomVisibility } from '../../shared/protocol';

/** What the lobby stores per room; `rev` is in memory only. */
export interface StoredRoom {
  summary: RoomSummary;
  visibility: RoomVisibility;
  /** The room's current host; null for rooms listed before the lobby recorded it. */
  hostId: string | null;
  /** Insertion order for newest-first listing. */
  at: number;
}

export const ROOM_KEY_PREFIX = 'room:';
export const roomKey = (code: string): string => `${ROOM_KEY_PREFIX}${code}`;

/** Per-room entries plus any left under the legacy single key; a per-room entry wins over its legacy copy. */
export function mergeLegacyRooms(
  current: Record<string, StoredRoom>,
  legacy: Record<string, Omit<StoredRoom, 'hostId'> & { hostId?: string | null }>,
): { merged: Record<string, StoredRoom>; migrated: Record<string, StoredRoom> } {
  const merged = { ...current };
  const migrated: Record<string, StoredRoom> = {};
  for (const [code, old] of Object.entries(legacy)) {
    if (code in merged) continue;
    const entry: StoredRoom = { summary: old.summary, visibility: old.visibility, hostId: old.hostId ?? null, at: old.at };
    merged[code] = entry;
    migrated[code] = entry;
  }
  return { merged, migrated };
}

/** Public, unfinished rooms, newest first, at most `limit`. */
export function publicRoomList(rooms: Record<string, StoredRoom>, limit: number): RoomSummary[] {
  return Object.values(rooms)
    .filter((e) => e.visibility === 'public' && e.summary.status !== 'finished')
    .sort((a, b) => b.at - a.at || (a.summary.code < b.summary.code ? -1 : 1))
    .slice(0, limit)
    .map((e) => e.summary);
}

/** user id -> expiry times of creations whose room has not been listed yet. */
export type PendingCreates = Map<string, number[]>;

function livePending(pending: PendingCreates, userId: string, now: number): number[] {
  const live = (pending.get(userId) ?? []).filter((expiresAt) => expiresAt > now);
  if (live.length > 0) pending.set(userId, live);
  else pending.delete(userId);
  return live;
}

/** Unfinished rooms the user currently hosts, plus creations still waiting for their first listing. */
export function openRoomCount(rooms: Record<string, StoredRoom>, pending: PendingCreates, userId: string, now: number): number {
  let count = livePending(pending, userId, now).length;
  for (const e of Object.values(rooms)) if (e.hostId === userId && e.summary.status !== 'finished') count++;
  return count;
}

/** Counts a creation toward the cap until its room is listed or `ttlMs` passes; false when the cap is reached. */
export function reserveCreate(
  rooms: Record<string, StoredRoom>,
  pending: PendingCreates,
  userId: string,
  now: number,
  max: number,
  ttlMs: number,
): boolean {
  if (openRoomCount(rooms, pending, userId, now) >= max) return false;
  pending.set(userId, [...(pending.get(userId) ?? []), now + ttlMs]);
  return true;
}

/** A room was listed for the first time: its creation no longer needs a reservation. */
export function consumeReservation(pending: PendingCreates, userId: string, now: number): void {
  const live = livePending(pending, userId, now);
  if (live.length === 0) return;
  live.sort((a, b) => a - b).shift();
  if (live.length > 0) pending.set(userId, live);
  else pending.delete(userId);
}
