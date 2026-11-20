import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/protocol';

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function isRoomCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/** Uniform code from `ROOM_CODE_ALPHABET`: bytes beyond the largest multiple of the alphabet size are rejected. */
export function generateRoomCode(fill: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const size = ROOM_CODE_ALPHABET.length;
  const limit = 256 - (256 % size);
  let code = '';
  const buf = new Uint8Array(16);
  while (code.length < ROOM_CODE_LENGTH) {
    fill(buf);
    for (const b of buf) {
      if (b < limit && code.length < ROOM_CODE_LENGTH) code += ROOM_CODE_ALPHABET[b % size];
    }
  }
  return code;
}
