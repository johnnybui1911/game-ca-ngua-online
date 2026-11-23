import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CLOSE_SIGNED_OUT,
  SIGNED_OUT_CODE,
  SIGNED_OUT_MESSAGE,
  type RoomClientMessage,
  type RoomServerMessage,
  type RoomSnapshot,
} from '../../../shared/protocol';
import { isEmoteId } from '../../../shared/emotes';
import { sound } from '../audio/sound';
import { api } from '../api';
import { appendBatch, type StateBatch } from './batches';
import { useSession } from '../auth/session-context';
import { receiveEmote, type EmoteBySeat } from './emote-feed';
import { emoteSettings } from './emote-settings';
import { gateFailure } from './room-gate';
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
  /** Newest emote per seat, in memory only: a new socket starts empty. */
  emotes: EmoteBySeat;
  /** The last error the server sent for an action of ours (cleared by the next state). */
  actionError: string | null;
  send: (msg: RoomClientMessage) => void;
}

/** At most one emote sound per this many ms, however many arrive. */
const EMOTE_SOUND_GAP_MS = 400;

const FAILURE_TEXT: Record<string, string> = {
  room_full: 'Phòng đã đầy.',
  game_in_progress: 'Ván đấu đang diễn ra và không còn chỗ máy để vào thay.',
  room_closed: 'Phòng đã đóng.',
  closed_by_host: 'Chủ phòng đã đóng phòng.',
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
  const [emotes, setEmotes] = useState<EmoteBySeat>({});
  const emoteCount = useRef(0);
  const lastEmoteSound = useRef(0);
  const socket = useRef<ReconnectingSocket | null>(null);
  const { refresh, user } = useSession();
  const myId = useRef<string | null>(null);
  myId.current = user?.id ?? null;
  const latestRoom = useRef<RoomSnapshot | null>(null);
  /** Bumped to reconnect when the session ended but the same user is signed in again. */
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    setStatus('connecting');
    setBatches([]);
    setClockOffset(0);
    setFailure(null);
    setActionError(null);
    setEmotes({});
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
        if (msg.t === 'emote') {
          // Not game state: unknown ids from a newer server are ignored.
          if (!isEmoteId(msg.id) || !Number.isInteger(msg.seat)) return;
          const now = Date.now();
          setEmotes((prev) => receiveEmote(prev, msg.seat, msg.id, ++emoteCount.current, now));
          const occ = latestRoom.current?.seats[msg.seat]?.occupant;
          const own = occ?.kind === 'human' && occ.user.id === myId.current;
          if (!own && !emoteSettings.isMuted() && now - lastEmoteSound.current >= EMOTE_SOUND_GAP_MS) {
            lastEmoteSound.current = now;
            sound.playEmote();
          }
          return;
        }
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
  latestRoom.current = room;
  return { status, room, batches, clockOffset, failure, emotes, actionError, send };
}
