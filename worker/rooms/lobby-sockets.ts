import type { LobbyServerMessage, PublicUser } from '../../shared/protocol';
import type { SocketBinding } from './session-guard';

/**
 * What the lobby keeps on a socket: the user, when it connected (to find the oldest) and the hash
 * of its session. It is never sent to a client as is; everything outbound goes through the
 * builders below, which copy only the public fields.
 */
export type LobbySocketUser = PublicUser & Omit<SocketBinding, 'userId'>;

export const publicUser = (a: LobbySocketUser): PublicUser => ({ id: a.id, displayName: a.displayName });

export const bindingOf = (a: LobbySocketUser): SocketBinding => ({ userId: a.id, at: a.at, sessionHash: a.sessionHash });

/** Each online user once, however many sockets they hold. */
export function onlineUsers(sockets: readonly (LobbySocketUser | null)[]): PublicUser[] {
  const online = new Map<string, PublicUser>();
  for (const socket of sockets) if (socket) online.set(socket.id, publicUser(socket));
  return [...online.values()];
}

export function invitedMessage(sender: LobbySocketUser, code: string, roomName: string): LobbyServerMessage {
  return { t: 'invited', from: publicUser(sender), code, roomName };
}
