import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { RoomSummary } from '../../../shared/protocol';
import { api, ApiRequestError } from '../api';
import { useT } from '../i18n';
import { errorText } from '../i18n/error-text';
import { useMusic } from '../audio/SoundControls';
import { parseRoomCode } from '../lobby/room-code';
import { GlassPanel, PanelHost } from '../shell/PanelHost';
import { Icon } from '../ui/Icon';
import { sanitizeReturnTo } from './return-to';
import { useSession } from './session-context';

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 24;
/** The name this browser last played under, offered again to a returning visitor. */
const NAME_KEY = 'ca-ngua:guest-name';

function rememberedName(): string {
  try {
    return (localStorage.getItem(NAME_KEY) ?? '').slice(0, MAX_NAME_LENGTH);
  } catch {
    return '';
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // private mode: nothing to remember
  }
}

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

/** The name panel for a visitor without a session: a name and one button, over the board. */
export function GuestEntryPage() {
  const t = useT();
  const { ready, user, playAsGuest } = useSession();
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const code = roomCodeOf(returnTo);
  const room = useRoomSummary(code);

  const [name, setName] = useState(rememberedName);
  useMusic('lobby');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const missing = room.kind === 'missing';
  // A missing room cannot be entered, so the visitor continues to the lobby instead.
  const target = missing ? '/' : returnTo;
  const entering = code !== null && !missing;

  // The board (or its poster) is already on screen; nothing to add until the session is known.
  if (!ready) return null;
  if (user) return <Navigate to={target} replace />;

  const signInLink = `/dang-nhap${returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const length = [...name.trim().replace(/\s+/g, ' ')].length;
    if (length < MIN_NAME_LENGTH || length > MAX_NAME_LENGTH) {
      setError(t('auth.nameRange', { min: MIN_NAME_LENGTH, max: MAX_NAME_LENGTH }));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // The session change re-renders this page, which then navigates to the target.
      await playAsGuest(name);
      rememberName(name.trim().replace(/\s+/g, ' '));
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorText(t, err.message) : t('auth.genericError'));
      setBusy(false);
    }
  }

  return (
    <PanelHost>
      <GlassPanel title={entering ? t('guest.titleEntering') : t('guest.titlePlay')} className="entry-panel">
        {room.kind === 'found' && (
          <p className="entry-room" data-testid="entry-room">
            {t('guest.enterRoomPre')}<strong data-testid="entry-room-name">{room.room.name}</strong>{t('guest.enterRoomMid')}
            <strong data-testid="entry-room-host">{room.room.hostName}</strong>
          </p>
        )}
        {missing && (
          <p className="entry-room entry-room-missing" role="status" data-testid="entry-room-missing">
            {t('guest.roomMissing')}
          </p>
        )}
        {room.kind === 'limited' && (
          <p className="entry-room" role="status" data-testid="entry-room-limited">
            {errorText(t, room.message)}
          </p>
        )}
        {code === null && (
          <p className="entry-lead" data-testid="entry-pitch">
            {t('guest.pitch')}
          </p>
        )}
        <form className="form" onSubmit={(e) => void submit(e)} noValidate>
          <div className="field">
            <label htmlFor="guest-name">{t('guest.yourName')}</label>
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
          <button type="submit" className="ui-btn ui-btn--primary" data-testid="guest-submit" disabled={busy || room.kind === 'loading'}>
            {busy ? t('guest.entering') : entering ? t('guest.enterRoom') : t('guest.play')}
          </button>
        </form>
        <p className="switch-link">
          {t('auth.haveAccount')}{' '}
          <Link to={signInLink} data-testid="to-signin">
            {t('auth.signIn')}
          </Link>
        </p>
        <Link className="ui-btn ui-btn--ghost entry-home" to="/" data-testid="entry-home">
          <Icon name="back" size="sm" />
          {t('guest.home')}
        </Link>
      </GlassPanel>
    </PanelHost>
  );
}
