import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
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
    <form className="card lobby-card form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>Tạo phòng</h2>
      <div className="field">
        <label htmlFor="create-name">Tên phòng</label>
        <input id="create-name" data-testid="create-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset className="choice-row">
        <legend>Chế độ</legend>
        <label className="choice">
          <input
            type="radio"
            name="visibility"
            data-testid="create-visibility-public"
            checked={visibility === 'public'}
            onChange={() => setVisibility('public')}
          />
          Công khai
        </label>
        <label className="choice">
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
      {error && (
        <p className="form-error" role="alert" data-testid="create-error">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" data-testid="create-submit" disabled={busy}>
        Tạo phòng
      </button>
    </form>
  );
}

function JoinByCodeForm() {
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
      setError(err instanceof ApiRequestError && err.status === 404 ? 'Không tìm thấy phòng' : 'Không kiểm tra được phòng, vui lòng thử lại.');
      setBusy(false);
    }
  };

  return (
    <form className="card lobby-card form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>Nhập mã</h2>
      <div className="field">
        <label htmlFor="join-input">Mã phòng hoặc link</label>
        <input
          id="join-input"
          data-testid="join-input"
          value={value}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="VD: K7M2QX"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </div>
      {error && (
        <p className="form-error" role="alert" data-testid="join-error">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-secondary" data-testid="join-submit" disabled={busy}>
        Vào phòng
      </button>
    </form>
  );
}

function RoomList() {
  const { rooms } = useLobby();
  const navigate = useNavigate();
  return (
    <section className="card lobby-card" aria-labelledby="room-list-title">
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
                  className="btn btn-primary"
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

export function LobbyPage() {
  const { user, signOut } = useSession();
  const { online } = useLobby();
  return (
    <main className="lobby-page">
      <header className="lobby-header card">
        <h1 data-testid="greeting">Xin chào, {user?.displayName}</h1>
        <p className="muted" data-testid="online-count">
          {online.length} người đang online
        </p>
        <button type="button" className="btn btn-secondary" data-testid="signout" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      </header>
      <div className="lobby-grid">
        <CreateRoomForm />
        <JoinByCodeForm />
        <RoomList />
      </div>
    </main>
  );
}
