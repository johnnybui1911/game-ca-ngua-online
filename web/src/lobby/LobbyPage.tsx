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
import { useT } from '../i18n';
import { errorText } from '../i18n/error-text';
import { useMusic } from '../audio/SoundControls';
import { entered } from '../shell/entered';
import { PanelHost } from '../shell/PanelHost';
import { Icon } from '../ui/Icon';
import { roomDisplayName } from '../room/names';
import { useLobby } from './LobbyProvider';
import { parseRoomCode } from './room-code';

const SEAT_OPTIONS = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i);

function CreateRoomForm() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const [name, setName] = useState(user ? t('lobby.defaultRoomName', { name: user.displayName }).slice(0, 40) : '');
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [seats, setSeats] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length === 0) {
      setError(t('lobby.nameRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: CreateRoomRequest = { name: name.trim(), visibility, seats };
      const res = await api<CreateRoomResponse>('/api/rooms', { method: 'POST', body });
      void navigate(`/r/${res.code}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorText(t, err.message) : t('lobby.createFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="lobby-section form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>{t('lobby.createTitle')}</h2>
      <div className="field">
        <label htmlFor="create-name">{t('lobby.roomName')}</label>
        <input id="create-name" data-testid="create-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="lobby-options">
        <fieldset className="choice-row">
          <legend>{t('lobby.mode')}</legend>
          <label className="ui-pill">
            <input
              type="radio"
              name="visibility"
              data-testid="create-visibility-public"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
            />
            {t('lobby.public')}
          </label>
          <label className="ui-pill">
            <input
              type="radio"
              name="visibility"
              data-testid="create-visibility-private"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
            />
            {t('lobby.private')}
          </label>
        </fieldset>
        <div className="field">
          <label htmlFor="create-seats">{t('lobby.seats')}</label>
          <div className="seat-count-select">
            <select id="create-seats" className="glass-input glass-select" data-testid="create-seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
              {SEAT_OPTIONS.map((n) => (
                <option key={n} value={n}>{t('lobby.seatsOption', { n })}</option>
              ))}
            </select>
            <span aria-hidden="true">{seats}</span>
          </div>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert" data-testid="create-error">
          {error}
        </p>
      )}
      <button type="submit" className="ui-btn ui-btn--primary" data-testid="create-submit" disabled={busy}>
        {t('lobby.createTitle')}
      </button>
    </form>
  );
}

/** Opens a room from its code or link. Also used on the home page, where the visitor may not be signed in yet. */
export function JoinByCodeForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = parseRoomCode(value);
    if (code === null) {
      setError(t('lobby.codeNotFound'));
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
          ? t('lobby.codeCheckFailed')
          : err.status === 404
            ? t('lobby.codeNotFound')
            : errorText(t, err.message),
      );
      setBusy(false);
    }
  };

  return (
    <form className="lobby-section form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>{t('lobby.enterCode')}</h2>
      <div className="join-row">
        <div className="field">
          <label htmlFor="join-input">{t('lobby.codeLabel')}</label>
          <input
            id="join-input"
            data-testid="join-input"
            value={value}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus={autoFocus}
            spellCheck={false}
            placeholder={t('lobby.codePlaceholder')}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </div>
        <button type="submit" className="ui-btn ui-btn--secondary" data-testid="join-submit" disabled={busy}>
          {t('lobby.joinRoom')}
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
  const t = useT();
  const { rooms } = useLobby();
  const navigate = useNavigate();
  return (
    <section className="lobby-section" aria-labelledby="room-list-title">
      <h2 id="room-list-title">{t('lobby.publicRooms')}</h2>
      {rooms.length === 0 ? (
        <p className="muted" data-testid="room-empty">
          {t('lobby.noRooms')}
        </p>
      ) : (
        <ul className="room-list" data-testid="room-list">
          {rooms.map((r) => {
            const playing = r.status === 'playing';
            // A game in progress lets a person take a CPU's place: such a room is open although every seat is taken.
            const takeover = playing && (r.takeoverSeats ?? 0) > 0;
            const full = r.seatsTaken >= r.seatsTotal;
            return (
              <li className="room-item" key={r.code} data-testid={`room-item-${r.code}`}>
                <div className="room-item-info">
                  <strong>{roomDisplayName(t, r.name)}</strong>
                  <span className="muted">
                    {t('lobby.roomMeta', { host: r.hostName, taken: r.seatsTaken, total: r.seatsTotal, status: takeover ? t('lobby.playingTakeover') : playing ? t('lobby.playing') : t('lobby.waiting') })}
                  </span>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  data-testid={`room-join-${r.code}`}
                  disabled={!takeover && (full || playing)}
                  onClick={() => void navigate(`/r/${r.code}`)}
                >
                  {t('lobby.join')}
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
  const t = useT();
  const { guest, signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  if (!guest) {
    return (
      <button type="button" className="ui-btn ui-btn--secondary" data-testid="signout" onClick={() => void signOut()}>
        {t('lobby.signOut')}
      </button>
    );
  }
  if (!confirming) {
    return (
      <button type="button" className="ui-btn ui-btn--secondary" data-testid="signout" onClick={() => setConfirming(true)}>
        {t('lobby.leave')}
      </button>
    );
  }
  return (
    <div className="signout-confirm" role="alertdialog" aria-labelledby="signout-confirm-text" data-testid="signout-confirm-box">
      <p id="signout-confirm-text">{t('lobby.leaveWarn')}</p>
      <div className="signout-confirm-actions">
        <button type="button" className="ui-btn ui-btn--danger" data-testid="signout-confirm" onClick={() => void signOut()}>
          {t('lobby.leave')}
        </button>
        <button type="button" className="ui-btn ui-btn--secondary" data-testid="signout-cancel" onClick={() => setConfirming(false)}>
          {t('lobby.stay')}
        </button>
      </div>
    </div>
  );
}

/** The lobby, as a glass panel over the board: create a room first, then join by code, then the public rooms. */
export function LobbyPage() {
  const t = useT();
  const { user, guest } = useSession();
  const { online } = useLobby();
  useMusic('lobby');
  return (
    <PanelHost>
      <main className="glass shell-glass lobby-panel" data-testid="lobby">
        <header className="lobby-header">
          <button type="button" className="ui-btn ui-btn--icon" aria-label={t('lobby.backHome')} data-testid="lobby-home" onClick={() => entered.set(false)}>
            <Icon name="back" />
          </button>
          <div className="lobby-who">
            <h1 className="ui-title" data-testid="greeting">
              {t('lobby.greeting', { name: user?.displayName ?? '' })}
            </h1>
            <p className="muted" data-testid="online-count">
              {t('lobby.online', { n: online.length })}
            </p>
          </div>
          <SignOutControl />
        </header>
        {guest && (
          <aside className="guest-notice" data-testid="guest-notice">
            <span>{t('lobby.guestNotice')}</span>
            <Link className="ui-btn ui-btn--secondary" to="/dang-ky?returnTo=/" data-testid="guest-save-link">
              {t('lobby.saveAccount')}
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
