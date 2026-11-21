import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CLOSE_SIGNED_OUT,
  SIGNED_OUT_CODE,
  SIGNED_OUT_MESSAGE,
  type RoomClientMessage,
  type RoomServerMessage,
  type RoomSnapshot,
} from '../../../shared/protocol';
import { api } from '../api';
import { appendBatch, type StateBatch } from './batches';
import { useSession } from '../auth/session-context';
import { gateFailure } from './room-gate';
import { openReconnectingSocket, type ReconnectingSocket, type SocketStatus } from '../lobby/reconnecting-socket';

export interface RoomFailure {
  code:
    | 'not_found'
    | 'room_full'
    | 'game_in_progress'
    | 'room_closed'
    | 'left'
    | 'unavailable'
    | 'too_many_connections'
    | 'rate_limited'
    | 'signed_out';
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
  left: 'Bạn đã rời phòng.',
  too_many_connections: 'Bạn mở phòng này ở quá nhiều tab, kết nối này đã bị đóng.',
  rate_limited: 'Bạn gửi quá nhanh nên kết nối đã bị đóng.',
  [SIGNED_OUT_CODE]: SIGNED_OUT_MESSAGE,
};

/** Room socket with reconnect; every reconnect rebuilds the view from the snapshot the server sends first. */
export function useRoomConnection(code: string): RoomConnection {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [batches, setBatches] = useState<StateBatch[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [failure, setFailure] = useState<RoomFailure | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const socket = useRef<ReconnectingSocket | null>(null);
  const { refresh } = useSession();
  /** Bumped to reconnect when the session ended but the same user is signed in again. */
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    setStatus('connecting');
    setBatches([]);
    setClockOffset(0);
    setFailure(null);
    setActionError(null);
    // Show the notice, then re-read the session: signed out, the page routes away; still (or again)
    // signed in, reconnect under the live session.
    const sessionEnded = () => {
      setFailure({ code: 'signed_out', message: SIGNED_OUT_MESSAGE });
      void refresh().then((me) => {
        if (me) setEpoch((n) => n + 1);
      });
    };
    const conn = openReconnectingSocket({
      path: `/api/rooms/${code}/ws`,
      onStatus: setStatus,
      gate: async () => {
        try {
          await api(`/api/rooms/${code}`);
          return null;
        } catch (err) {
          return gateFailure(err);
        }
      },
      onStop: (reason) => {
        setFailure(
          reason === 'not_found'
            ? { code: 'not_found', message: 'Không tìm thấy phòng.' }
            : { code: 'unavailable', message: 'Không vào được phòng, vui lòng thử lại.' },
        );
      },
      onServerStop: (closeCode) => {
        if (closeCode === CLOSE_SIGNED_OUT) {
          sessionEnded();
          return;
        }
        setFailure((prev) => prev ?? { code: 'room_closed', message: FAILURE_TEXT.room_closed ?? 'Phòng đã đóng.' });
      },
      onMessage: (data) => {
        const msg = JSON.parse(data) as RoomServerMessage;
        if (msg.t === 'state') {
          setActionError(null);
          setClockOffset(msg.serverNow - Date.now());
          setBatches((prev) => appendBatch(prev, { room: msg.room, events: msg.events }));
        } else if (msg.code in FAILURE_TEXT) {
          // The server ends the socket after these; do not wait for the close, which a proxy may swallow.
          if (msg.code === SIGNED_OUT_CODE) {
            socket.current?.close();
            sessionEnded();
            return;
          }
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
  }, [code, epoch, refresh]);

  const send = useCallback((msg: RoomClientMessage) => {
    socket.current?.send(JSON.stringify(msg));
  }, []);

  const room = batches[batches.length - 1]?.room ?? null;
  return { status, room, batches, clockOffset, failure, actionError, send };
}
