import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../shared/protocol';

const CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/**
 * Room code from what a player typed or pasted: a bare code in any case, or a
 * link ending in `/r/CODE` (query and hash ignored). Null when nothing valid is found.
 */
export function parseRoomCode(input: string): string | null {
  let text = input.trim();
  const link = /\/r\/([^/?#\s]+)/i.exec(text);
  if (link?.[1]) text = link[1];
  const code = text.toUpperCase();
  return CODE.test(code) ? code : null;
}
