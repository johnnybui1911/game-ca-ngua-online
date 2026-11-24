import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { Color } from '../../../shared/game/types';
import type { RoomClientMessage, RoomSnapshot } from '../../../shared/protocol';
import { useT, type TFunction } from '../i18n';
import { errorText } from '../i18n/error-text';
import { GlassPanel } from '../shell/PanelHost';
import { COLOR_VARS, colorName } from './colors';
import { cpuDisplayName } from './names';

interface Props {
  room: RoomSnapshot;
  myId: string;
  send: (msg: RoomClientMessage) => void;
  actionError: string | null;
  joinNotice: string | null;
}

/**
 * What a person with no seat sees while the room's game runs: the CPU seats they may ask for (one colour button each;
 * a colour someone else already asked for is taken), then "waiting for the host" until the host answers.
 */
export function JoinRequestView({ room, myId, send, actionError, joinNotice }: Props) {
  const t = useT();
  const playing = room.status === 'playing' && room.game !== null;
  const cpuSeats = playing ? room.seats.filter((s) => s.occupant?.kind === 'cpu' && room.game?.colors.includes(s.color)) : [];
  const mine = room.joinRequests.find((r) => r.user.id === myId);
  const askedBy = (color: Color) => room.joinRequests.find((r) => r.color === color);
  const players = room.seats.flatMap((s) => (s.occupant?.kind === 'human' ? [s.occupant.user.displayName] : []));

  if (!playing) {
    return (
      <GlassPanel title={<span data-testid="join-ended">{t('join.ended')}</span>}>
        <p className="ui-muted">{t('join.endedHint')}</p>
        <div className="dialog-actions">
          <button type="button" className="ui-btn ui-btn--primary" data-testid="join-reload" onClick={() => location.reload()}>
            {t('join.reload')}
          </button>
          <Link className="ui-btn ui-btn--secondary" to="/" data-testid="back-to-lobby">
            {t('join.toLobby')}
          </Link>
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel title={<span data-testid="join-title">{room.name}</span>}>
      <p className="ui-muted" data-testid="join-players">
        {t('join.players', { players: players.join(', ') })}
      </p>
      {mine ? (
        <p className="join-wait" role="status" data-testid="join-waiting">
          {t('join.waiting', { cpu: cpuName(t, room, mine.color) })}
        </p>
      ) : (
        <p data-testid="join-pick">
          {cpuSeats.length > 1 ? t('join.pickMany') : t('join.pickOne')}
        </p>
      )}
      {cpuSeats.length === 0 && <p className="ui-muted">{t('join.noSeats')}</p>}
      <div className="join-colors">
        {cpuSeats.map((s) => {
          const other = askedBy(s.color);
          const taken = other !== undefined && other.user.id !== myId;
          const chosen = mine?.color === s.color;
          return (
            <button
              key={s.color}
              type="button"
              className={`ui-btn ${chosen ? 'ui-btn--primary' : 'ui-btn--secondary'} join-color`}
              style={{ '--seat-color': COLOR_VARS[s.color] } as CSSProperties}
              data-testid={`join-color-${s.color}`}
              aria-pressed={chosen}
              aria-label={t('join.colorLabel', { cpu: cpuName(t, room, s.color), color: colorName(t, s.color) })}
              disabled={taken || chosen}
              onClick={() => send({ t: 'requestSeat', color: s.color })}
            >
              <span className="seat-dot" aria-hidden="true" />
              {cpuName(t, room, s.color)}
              {taken && <small>{t('join.taken')}</small>}
            </button>
          );
        })}
      </div>
      {(joinNotice || actionError) && (
        <p className="form-error" role="alert" data-testid="join-notice">
          {errorText(t, actionError ?? joinNotice ?? '')}
        </p>
      )}
      <div className="dialog-actions">
        {mine && (
          <button type="button" className="ui-btn ui-btn--secondary" data-testid="join-cancel" onClick={() => send({ t: 'cancelRequest' })}>
            {t('join.cancel')}
          </button>
        )}
        <Link className="ui-btn ui-btn--secondary" to="/" data-testid="back-to-lobby">
          {t('join.toLobby')}
        </Link>
      </div>
    </GlassPanel>
  );
}

function cpuName(t: TFunction, room: RoomSnapshot, color: Color): string {
  const occ = room.seats.find((s) => s.color === color)?.occupant;
  return occ?.kind === 'cpu' ? cpuDisplayName(t, occ.name) : t('join.cpuFallback');
}
