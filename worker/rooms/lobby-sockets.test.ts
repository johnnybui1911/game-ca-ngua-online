import { describe, expect, it } from 'vitest';
import { invitedMessage, onlineUsers, publicUser, type LobbySocketUser } from './lobby-sockets';
import { itemsOfSession } from './session-guard';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const sock = (id: string, sessionHash?: string): LobbySocketUser => ({ id, displayName: `Tên ${id}`, at: 123456, sessionHash });

describe('itemsOfSession', () => {
  it('selects only the sockets of the given session, keeping the same user on another session', () => {
    const sockets = [sock('u1', hashA), sock('u1', hashB), sock('u2', hashA), sock('u3')];
    expect(itemsOfSession(sockets, (s) => s.sessionHash, hashA).map((s) => s.id)).toEqual(['u1', 'u2']);
    expect(itemsOfSession(sockets, (s) => s.sessionHash, hashB)).toHaveLength(1);
    expect(itemsOfSession(sockets, (s) => s.sessionHash, 'c'.repeat(64))).toEqual([]);
  });
});

describe('lobby payloads', () => {
  const leaks = (value: unknown) => {
    const text = JSON.stringify(value);
    return text.includes('sessionHash') || text.includes(hashA) || text.includes('"at"') || text.includes('123456');
  };

  it('publicUser carries only id and name', () => {
    expect(publicUser(sock('u1', hashA))).toEqual({ id: 'u1', displayName: 'Tên u1' });
  });

  it('the invite sender carries no session hash or connect time', () => {
    const msg = invitedMessage(sock('u1', hashA), 'ABC234', 'Phòng');
    expect(msg).toEqual({ t: 'invited', from: { id: 'u1', displayName: 'Tên u1' }, code: 'ABC234', roomName: 'Phòng' });
    expect(leaks(msg)).toBe(false);
  });

  it('the online list lists each user once and leaks nothing', () => {
    const online = onlineUsers([sock('u1', hashA), sock('u1', hashB), null, sock('u2')]);
    expect(online.map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(leaks(online)).toBe(false);
  });
});
