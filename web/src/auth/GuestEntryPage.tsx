import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { RoomSummary } from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { parseRoomCode } from '../lobby/room-code';
import { AuthLayout } from './AuthLayout';
import { sanitizeReturnTo } from './return-to';
import { useSession } from './session-context';

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 24;

type RoomState = { kind: 'none' } | { kind: 'loading' } | { kind: 'found'; room: RoomSummary } | { kind: 'missing' } | { kind: 'limited'; message: string }
  | { kind: 'failed' };

/** The room code a `returnTo` path points at, or null when it is not a room link. */
export function roomCodeOf(returnTo: string): string | null {
  const match = /^\/r\/([^/?#]+)\/?(?:[?#].*)?$/.exec(returnTo);
  return match?.[1] ? parseRoomCode(match[1]) : null;
}

function useRoomSummary(code: string | null): RoomState {
  const [state, setState] = useState<RoomState>(code ? { kind: 'loading' } : { kind: 'none' });
  useEffect(() => {
    if (!code) {
      setState({ kind: 'none' });
      return;
    }
    let live = true;
    setState({ kind: 'loading' });
    api<RoomSummary>(`/api/rooms/${code}`)
      .then((room) => live && setState({ kind: 'found', room }))
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof ApiRequestError && err.status === 404) setState({ kind: 'missing' });
        else if (err instanceof ApiRequestError && err.status === 429) setState({ kind: 'limited', message: err.message });
        else setState({ kind: 'failed' });
      });
    return () => {
      live = false;
    };
  }, [code]);
  return state;
}

/** The first screen for a visitor without a session: a name and one button. */
export function GuestEntryPage() {
  const { ready, user, playAsGuest } = useSession();
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const code = roomCodeOf(returnTo);
  const room = useRoomSummary(code);

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const missing = room.kind === 'missing';
  // A missing room cannot be entered, so the visitor continues to the lobby instead.
  const target = missing ? '/' : returnTo;
  const entering = code !== null && !missing;

  if (!ready) return <p className="page-status" role="status">Đang tải…</p>;
  if (user) return <Navigate to={target} replace />;

  const signInLink = `/dang-nhap${returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const length = [...name.trim().replace(/\s+/g, ' ')].length;
    if (length < MIN_NAME_LENGTH || length > MAX_NAME_LENGTH) {
      setError(`Tên hiển thị phải từ ${MIN_NAME_LENGTH} đến ${MAX_NAME_LENGTH} ký tự.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // The session change re-renders this page, which then navigates to the target.
      await playAsGuest(name);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.');
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={entering ? 'Vào phòng chơi' : 'Chơi ngay'}>
      {room.kind === 'found' && (
        <p className="entry-room" data-testid="entry-room">
          Vào phòng <strong data-testid="entry-room-name">{room.room.name}</strong> của{' '}
          <strong data-testid="entry-room-host">{room.room.hostName}</strong>
        </p>
      )}
      {missing && (
        <p className="entry-room entry-room-missing" role="status" data-testid="entry-room-missing">
          Không tìm thấy phòng. Bạn vẫn có thể vào sảnh và chơi.
        </p>
      )}
      {room.kind === 'limited' && (
        <p className="entry-room" role="status" data-testid="entry-room-limited">
          {room.message}
        </p>
      )}
      {code === null && (
        <div className="entry-pitch" data-testid="entry-pitch">
          <img src="/board.jpg" alt="Bàn cờ cá ngựa 3D với ngựa bốn màu" width={800} height={420} />
          <ul>
            <li>Không cài app, nhập tên là chơi</li>
            <li>Tạo phòng, gửi link rủ cả nhóm</li>
            <li>Thiếu người? Có máy chơi cùng</li>
          </ul>
          <a className="entry-pitch-more" href="/co-ca-ngua-online" data-testid="entry-landing-link">
            Luật chơi và giới thiệu
          </a>
        </div>
      )}
      <form className="form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor="guest-name">Tên của bạn</label>
          <input
            id="guest-name"
            data-testid="guest-name"
            type="text"
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'guest-name-error' : undefined}
          />
        </div>
        {error && (
          <p className="form-error" id="guest-name-error" role="alert" data-testid="guest-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" data-testid="guest-submit" disabled={busy || room.kind === 'loading'}>
          {busy ? 'Đang vào…' : entering ? 'Vào phòng' : 'Chơi ngay'}
        </button>
      </form>
      <p className="switch-link">
        Đã có tài khoản?{' '}
        <Link to={signInLink} data-testid="to-signin">
          Đăng nhập
        </Link>
      </p>
    </AuthLayout>
  );
}
