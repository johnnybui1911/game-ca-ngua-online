import type { RoomSummary, RoomVisibility } from '../../shared/protocol';

interface Entry {
  summary: RoomSummary;
  visibility: RoomVisibility;
}

/**
 * Brings the lobby's entries in line with what each room object answered:
 * a room that reports no summary no longer exists and is dropped, a live one
 * gets its summary refreshed. Entries without an answer are left alone.
 * Returns whether anything changed.
 */
export function applySweep(rooms: Record<string, Entry>, answers: { code: string; summary: RoomSummary | null }[]): boolean {
  let changed = false;
  for (const { code, summary } of answers) {
    const entry = rooms[code];
    if (!entry) continue;
    if (summary === null) {
      delete rooms[code];
      changed = true;
    } else if (JSON.stringify(summary) !== JSON.stringify(entry.summary)) {
      entry.summary = summary;
      changed = true;
    }
  }
  return changed;
}
