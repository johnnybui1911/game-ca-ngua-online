import type { RoomSummary, RoomVisibility } from '../../shared/protocol';

interface Entry {
  summary: RoomSummary;
  visibility: RoomVisibility;
  /** Changes on every write to the entry; never repeats within one lobby object's lifetime. */
  rev: number;
}

export interface SweepAnswer {
  code: string;
  /** Null when the room object says the room no longer exists. */
  summary: RoomSummary | null;
  /** The entry's revision when the question was asked. */
  rev: number;
}

/**
 * Brings the lobby's entries in line with what each room object answered:
 * a room that reports no summary no longer exists and is dropped, a live one
 * gets its summary refreshed. Entries without an answer are left alone, and so
 * is an entry written (or removed and listed again) after its question was
 * asked: that answer is older than what the lobby already holds.
 * Returns the codes whose entry changed or was dropped.
 */
export function applySweep(rooms: Record<string, Entry>, answers: SweepAnswer[]): string[] {
  const changed: string[] = [];
  for (const { code, summary, rev } of answers) {
    const entry = rooms[code];
    if (!entry || entry.rev !== rev) continue;
    if (summary === null) {
      delete rooms[code];
      changed.push(code);
    } else if (JSON.stringify(summary) !== JSON.stringify(entry.summary)) {
      entry.summary = summary;
      changed.push(code);
    }
  }
  return changed;
}
