import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  CLOSE_SIGNED_OUT,
  SIGNED_OUT_CODE,
  type LobbyClientMessage,
  type LobbyServerMessage,
  type PublicUser,
  type RoomSummary,
} from '../../../shared/protocol';
import { useSession } from '../auth/session-context';
import { openReconnectingSocket, type ReconnectingSocket } from './reconnecting-socket';
import './lobby.css';

interface LobbyValue {
  rooms: RoomSummary[];
  online: PublicUser[];
  invite: (toUserId: string, code: string) => void;
}

const LobbyContext = createContext<LobbyValue | null>(null);

type NewToast =
  | { kind: 'invite'; from: PublicUser; code: string; roomName: string }
  | { kind: 'notice'; text: string };
type Toast = NewToast & { id: number };

const NOTICE_MS = 6000;
const INVITE_MS = 60_000;
/** Newest toasts kept; a flood of invites cannot bury the page. */
const MAX_TOASTS = 3;

/** Keeps one lobby socket open while signed in and renders invite toasts on every page. */
export function LobbyProvider({ children }: { children: ReactNode }) {
  const { user, refresh } = useSession();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [online, setOnline] = useState<PublicUser[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const socket = useRef<ReconnectingSocket | null>(null);
  const nextId = useRef(1);
  const userId = user?.id ?? null;
  /** Bumped to open a fresh socket when the session ended but the same user is signed in again. */
  const [epoch, setEpoch] = useState(0);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (toast: NewToast, ttl: number) => {
      const id = nextId.current++;
      setToasts((all) => [...all, { ...toast, id }].slice(-MAX_TOASTS));
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  useEffect(() => {
    if (userId === null) return;
    const conn = openReconnectingSocket({
      path: '/api/lobby/ws',
      onStatus: () => undefined,
      // The server ended this session's socket. Re-read the session: signed out, the app moves on;
      // still (or again) signed in, a new socket is opened under the live session.
      onServerStop: (code) => {
        if (code !== CLOSE_SIGNED_OUT) return;
        void refresh().then((me) => {
          if (me) setEpoch((n) => n + 1);
        });
      },
      onMessage: (data) => {
        const msg = JSON.parse(data) as LobbyServerMessage;
        if (msg.t === 'lobby') {
          setRooms(msg.rooms);
          setOnline(msg.online);
        } else if (msg.t === 'invited') {
          push({ kind: 'invite', from: msg.from, code: msg.code, roomName: msg.roomName }, INVITE_MS);
        } else if (msg.code !== SIGNED_OUT_CODE) {
          // The close code that follows handles an ended session; no toast for it.
          push({ kind: 'notice', text: msg.message }, NOTICE_MS);
        }
      },
    });
    socket.current = conn;
    return () => {
      conn.close();
      socket.current = null;
      setRooms([]);
      setOnline([]);
    };
  }, [userId, epoch, push, refresh]);

  const invite = useCallback((toUserId: string, code: string) => {
    const msg: LobbyClientMessage = { t: 'invite', toUserId, code };
    socket.current?.send(JSON.stringify(msg));
  }, []);

  const value = useMemo(() => ({ rooms, online, invite }), [rooms, online, invite]);

  return (
    <LobbyContext value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) =>
          t.kind === 'invite' ? (
            <div className="toast" role="alert" data-testid="invite-toast" key={t.id}>
              <p>
                {t.from.displayName} mời bạn vào phòng {t.roomName}
              </p>
              <div className="toast-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="invite-accept"
                  onClick={() => {
                    dismiss(t.id);
                    void navigate(`/r/${t.code}`);
                  }}
                >
                  Vào
                </button>
                <button type="button" className="btn btn-secondary" data-testid="invite-dismiss" onClick={() => dismiss(t.id)}>
                  Bỏ qua
                </button>
              </div>
            </div>
          ) : (
            <div className="toast" role="status" data-testid="lobby-notice" key={t.id}>
              <p>{t.text}</p>
            </div>
          ),
        )}
      </div>
    </LobbyContext>
  );
}

export function useLobby(): LobbyValue {
  const ctx = useContext(LobbyContext);
  if (!ctx) throw new Error('useLobby must be used inside LobbyProvider');
  return ctx;
}
