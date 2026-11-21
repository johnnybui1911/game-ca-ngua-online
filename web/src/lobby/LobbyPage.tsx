import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  MAX_SEATS,
  MIN_SEATS,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomSummary,
  type RoomVisibility,
} from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { useSession } from '../auth/session-context';
import { useMusic } from '../audio/SoundControls';
import { entered } from '../shell/entered';
import { PanelHost } from '../shell/PanelHost';
import { Icon } from '../ui/Icon';
import { useLobby } from './LobbyProvider';
import { parseRoomCode } from './room-code';

const SEAT_OPTIONS = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i);

function CreateRoomForm() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [name, setName] = useState(user ? `Phòng của ${user.displayName}`.slice(0, 40) : '');
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [seats, setSeats] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length === 0) {
      setError('Hãy đặt tên phòng.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: CreateRoomRequest = { name: name.trim(), visibility, seats };
      const res = await api<CreateRoomResponse>('/api/rooms', { method: 'POST', body });
      void navigate(`/r/${res.code}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không tạo được phòng.');
      setBusy(false);
    }
  };

  return (
    <form className="lobby-section form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>Tạo phòng</h2>
      <div className="field">
        <label htmlFor="create-name">Tên phòng</label>
        <input id="create-name" data-testid="create-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="lobby-options">
        <fieldset className="choice-row">
          <legend>Chế độ</legend>
          <label className="ui-pill">
            <input
              type="radio"
              name="visibility"
              data-testid="create-visibility-public"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
            />
            Công khai
          </label>
          <label className="ui-pill">
            <input
              type="radio"
              name="visibility"
              data-testid="create-visibility-private"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
            />
            Riêng tư
          </label>
        </fieldset>
        <div className="field">
          <label htmlFor="create-seats">Số chỗ</label>
          <select id="create-seats" data-testid="create-seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
            {SEAT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} người chơi
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert" data-testid="create-error">
          {error}
        </p>
      )}
      <button type="submit" className="ui-btn ui-btn--primary" data-testid="create-submit" disabled={busy}>
        Tạo phòng
      </button>
    </form>
  );
}

/** Opens a room from its code or link. Also used on the home page, where the visitor may not be signed in yet. */
export function JoinByCodeForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = parseRoomCode(value);
    if (code === null) {
      setError('Không tìm thấy phòng');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<RoomSummary>(`/api/rooms/${code}`);
      void navigate(`/r/${code}`);
    } catch (err) {
      const known = err instanceof ApiRequestError && (err.status === 404 || err.status === 429);
      setError(
        !known
          ? 'Không kiểm tra được phòng, vui lòng thử lại.'
          : err.status === 404
            ? 'Không tìm thấy phòng'
            : err.message,
      );
      setBusy(false);
    }
  };

  return (
    <form className="lobby-section form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>Nhập mã</h2>
      <div className="join-row">
        <div className="field">
          <label htmlFor="join-input">Mã phòng hoặc link</label>
          <input
            id="join-input"
            data-testid="join-input"
            value={value}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus={autoFocus}
            spellCheck={false}
            placeholder="VD: K7M2QX"
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </div>
        <button type="submit" className="ui-btn ui-btn--secondary" data-testid="join-submit" disabled={busy}>
          Vào phòng
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert" data-testid="join-error">
          {error}
        </p>
      )}
    </form>
  );
}

function RoomList() {
  const { rooms } = useLobby();
  const navigate = useNavigate();
  return (
    <section className="lobby-section" aria-labelledby="room-list-title">
      <h2 id="room-list-title">Phòng công khai</h2>
      {rooms.length === 0 ? (
        <p className="muted" data-testid="room-empty">
          Chưa có phòng công khai nào. Hãy tạo phòng đầu tiên!
        </p>
      ) : (
        <ul className="room-list" data-testid="room-list">
          {rooms.map((r) => {
            const full = r.seatsTaken >= r.seatsTotal;
            const playing = r.status === 'playing';
            return (
              <li className="room-item" key={r.code} data-testid={`room-item-${r.code}`}>
                <div className="room-item-info">
                  <strong>{r.name}</strong>
                  <span className="muted">
                    {r.hostName} · {r.seatsTaken}/{r.seatsTotal} chỗ · {playing ? 'Đang chơi' : 'Đang chờ'}
                  </span>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  data-testid={`room-join-${r.code}`}
                  disabled={full || playing}
                  onClick={() => void navigate(`/r/${r.code}`)}
                >
                  Vào
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SignOutControl() {
  const { guest, signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  if (!guest) {
    return (
      <button type="button" className="ui-btn ui-btn--secondary" data-testid="signout" onClick={() => void signOut()}>
        Đăng xuất
      </button>
    );
  }
  if (!confirming) {
    return (
      <button type="button" className="ui-btn ui-btn--secondary" data-testid="signout" onClick={() => setConfirming(true)}>
        Thoát
      </button>
    );
  }
  return (
    <div className="signout-confirm" role="alertdialog" aria-labelledby="signout-confirm-text" data-testid="signout-confirm-box">
      <p id="signout-confirm-text">Thoát sẽ mất tên khách và chỗ ngồi của bạn. Thoát thật không?</p>
      <div className="signout-confirm-actions">
        <button type="button" className="ui-btn ui-btn--danger" data-testid="signout-confirm" onClick={() => void signOut()}>
          Thoát
        </button>
        <button type="button" className="ui-btn ui-btn--secondary" data-testid="signout-cancel" onClick={() => setConfirming(false)}>
          Ở lại
        </button>
      </div>
    </div>
  );
}

/** The lobby, as a glass panel over the board: create a room first, then join by code, then the public rooms. */
export function LobbyPage() {
  const { user, guest } = useSession();
  const { online } = useLobby();
  useMusic('lobby');
  return (
    <PanelHost>
      <main className="glass shell-glass lobby-panel" data-testid="lobby">
        <header className="lobby-header">
          <button type="button" className="ui-btn ui-btn--icon" aria-label="Về trang chủ" data-testid="lobby-home" onClick={() => entered.set(false)}>
            <Icon name="back" />
          </button>
          <div className="lobby-who">
            <h1 className="ui-title" data-testid="greeting">
              Xin chào, {user?.displayName}
            </h1>
            <p className="muted" data-testid="online-count">
              {online.length} người đang online
            </p>
          </div>
          <SignOutControl />
        </header>
        {guest && (
          <aside className="guest-notice" data-testid="guest-notice">
            <span>Bạn đang chơi với tư cách khách</span>
            <Link className="ui-btn ui-btn--secondary" to="/dang-ky?returnTo=/" data-testid="guest-save-link">
              Lưu tài khoản
            </Link>
          </aside>
        )}
        <CreateRoomForm />
        <JoinByCodeForm />
        <RoomList />
      </main>
    </PanelHost>
  );
}
