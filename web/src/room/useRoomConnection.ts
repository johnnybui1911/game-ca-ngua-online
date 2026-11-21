import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomClientMessage, RoomServerMessage, RoomSnapshot } from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { appendBatch, type StateBatch } from './batches';
import { openReconnectingSocket, type ReconnectingSocket, type SocketStatus } from '../lobby/reconnecting-socket';

export interface RoomFailure {
  code:
    | 'not_found'
    | 'room_full'
    | 'game_in_progress'
    | 'room_closed'
    | 'closed_by_host'
    | 'left'
    | 'unavailable'
    | 'too_many_connections'
    | 'rate_limited';
  message: string;
}

export interface RoomConnection {
  status: SocketStatus;
  /** Latest snapshot, the last of `batches`. */
  room: RoomSnapshot | null;
  /** Every state message in `seq` order; consumers walk it by `seq` so none is skipped by batched rendering. */
  batches: StateBatch[];
  /** Server clock minus local clock (ms) as of the latest state message. */
  clockOffset: number;
  /** Set when the connection is over for good; the page shows it with a way back to the lobby. */
  failure: RoomFailure | null;
  /** The last error the server sent for an action of ours (cleared by the next state). */
  actionError: string | null;
  send: (msg: RoomClientMessage) => void;
}

const FAILURE_TEXT: Record<string, string> = {
  room_full: 'Phòng đã đầy.',
  game_in_progress: 'Ván đấu đang diễn ra, bạn không thể vào phòng này.',
  room_closed: 'Phòng đã đóng.',
  closed_by_host: 'Chủ phòng đã đóng phòng.',
  left: 'Bạn đã rời phòng.',
  too_many_connections: 'Bạn mở phòng này ở quá nhiều tab, kết nối này đã bị đóng.',
  rate_limited: 'Bạn gửi quá nhanh nên kết nối đã bị đóng.',
};

/** Room socket with reconnect; every reconnect rebuilds the view from the snapshot the server sends first. */
export function useRoomConnection(code: string): RoomConnection {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [batches, setBatches] = useState<StateBatch[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [failure, setFailure] = useState<RoomFailure | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const socket = useRef<ReconnectingSocket | null>(null);

  useEffect(() => {
    setStatus('connecting');
    setBatches([]);
    setClockOffset(0);
    setFailure(null);
    setActionError(null);
    const conn = openReconnectingSocket({
      path: `/api/rooms/${code}/ws`,
      onStatus: setStatus,
      gate: async () => {
        try {
          await api(`/api/rooms/${code}`);
          return null;
        } catch (err) {
          if (err instanceof ApiRequestError && err.status === 404) return 'not_found';
          if (err instanceof ApiRequestError && err.status !== 0) return 'unavailable';
          return null;
        }
      },
      onStop: (reason) => {
        setFailure(
          reason === 'not_found'
            ? { code: 'not_found', message: 'Không tìm thấy phòng.' }
            : { code: 'unavailable', message: 'Không vào được phòng, vui lòng thử lại.' },
        );
      },
      onServerStop: () =>
        setFailure((prev) => prev ?? { code: 'room_closed', message: FAILURE_TEXT.room_closed ?? 'Phòng đã đóng.' }),
      onMessage: (data) => {
        const msg = JSON.parse(data) as RoomServerMessage;
        if (msg.t === 'state') {
          setActionError(null);
          setClockOffset(msg.serverNow - Date.now());
          setBatches((prev) => appendBatch(prev, { room: msg.room, events: msg.events }));
        } else if (msg.code in FAILURE_TEXT) {
          // The server ends the socket after these; do not wait for the close, which a proxy may swallow.
          setFailure({ code: msg.code as RoomFailure['code'], message: FAILURE_TEXT[msg.code] ?? msg.message });
          socket.current?.close();
        } else {
          setActionError(msg.message);
        }
      },
    });
    socket.current = conn;
    return () => {
      conn.close();
      socket.current = null;
    };
  }, [code]);

  const send = useCallback((msg: RoomClientMessage) => {
    socket.current?.send(JSON.stringify(msg));
  }, []);

  const room = batches[batches.length - 1]?.room ?? null;
  return { status, room, batches, clockOffset, failure, actionError, send };
}
