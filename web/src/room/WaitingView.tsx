import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { horseLabel, type RoomClientMessage, type RoomSnapshot } from '../../../shared/protocol';
import { useMusic } from '../audio/SoundControls';
import { inviteLink, reportInviteShared } from '../analytics';
import { useT } from '../i18n';
import { errorText } from '../i18n/error-text';
import { useLobby } from '../lobby/LobbyProvider';
import { Icon } from '../ui/Icon';
import { COLOR_VARS, colorName } from './colors';
import { cpuLevelLabel, cpuLevelOf } from './cpu-levels';
import { EmoteBubble, EmoteLive } from './EmoteBubble';
import { EmotePicker } from './EmotePicker';
import type { EmoteBySeat } from './emote-feed';
import { GameSettings } from './GameSettings';
import { HorseNamesDialog } from './HorseNamesDialog';
import { HostLeaveDialog } from './HostLeaveDialog';
import { cpuDisplayName, seatName as seatLabel } from './names';
import { RulesSheet } from './RulesSheet';

const INVITE_SENT_MS = 10_000;

interface Props {
  room: RoomSnapshot;
  myId: string;
  send: (msg: RoomClientMessage) => void;
  actionError: string | null;
  emotes: EmoteBySeat;
  /** The socket is not open. */
  offline: boolean;
}

export function WaitingView({ room, myId, send, actionError, emotes, offline }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const { online, invite } = useLobby();
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [hostLeave, setHostLeave] = useState(false);
  useMusic('lobby');

  const isHost = room.hostId === myId;
  const mySeat = room.seats.find((s) => s.occupant?.kind === 'human' && s.occupant.user.id === myId);
  const link = inviteLink(room.code);
  const occupied = room.seats.filter((s) => s.occupant !== null).length;
  const seatedIds = new Set(
    room.seats.flatMap((s) => (s.occupant?.kind === 'human' ? [s.occupant.user.id] : [])),
  );
  const invitable = online.filter((u) => !seatedIds.has(u.id));
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('done');
      reportInviteShared();
    } catch {
      setCopied('failed');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: room.name, text: t('wait.shareText', { name: room.name }), url: link });
      reportInviteShared();
    } catch {
      // dismissed by the user
    }
  };

  const sendInvite = (userId: string) => {
    invite(userId, room.code);
    setSent((s) => new Set(s).add(userId));
    setTimeout(
      () =>
        setSent((s) => {
          const next = new Set(s);
          next.delete(userId);
          return next;
        }),
      INVITE_SENT_MS,
    );
  };

  const others = room.seats.flatMap((s) => (s.occupant?.kind === 'human' && s.occupant.user.id !== myId ? [s.occupant.user] : []));
  const leave = () => {
    send({ t: 'leave' });
    void navigate('/');
  };
  // A host with people still in the room hands it over or ends it; anyone else (or a host alone) just leaves.
  const startLeave = () => (isHost && others.length > 0 ? setHostLeave(true) : leave());
  const handover = (newHost: string) => {
    send({ t: 'leave', newHost });
    void navigate('/');
  };
  const closeRoom = () => {
    send({ t: 'closeRoom' });
    void navigate('/');
  };

  const startReason = occupied < 2 ? t('wait.needTwo') : null;

  return (
    <main className="room-page">
      <section className="glass room-panel" aria-labelledby="room-name">
        <header className="room-head">
          <p className="ui-eyebrow">
            {t('wait.eyebrow', { visibility: room.visibility === 'public' ? t('wait.public') : t('wait.private') })}
            {room.allowTakeover && <span data-testid="allow-takeover-tag">{t('wait.takeoverTag')}</span>}
          </p>
          <h1 id="room-name" className="ui-title room-title" data-testid="room-name">
            {room.name}
          </h1>
          <div className="room-code-row">
            <span className="room-code-chip">
              <span className="ui-muted">{t('wait.code')}</span>
              <strong className="room-code" data-testid="room-code">
                {room.code}
              </strong>
            </span>
            <button type="button" className="ui-btn ui-btn--secondary room-share-action" aria-label={t('wait.copyLink')} title={t('wait.copyLink')} data-testid="copy-link" onClick={() => void copy()}>
              <Icon name={copied === 'done' ? 'check' : 'copy-link'} />
              <span>{t('wait.copyLink')}</span>
            </button>
            {canShare && (
              <button type="button" className="ui-btn ui-btn--secondary room-share-action" aria-label={t('wait.share')} title={t('wait.share')} data-testid="share-button" onClick={() => void share()}>
                <Icon name="share" />
                <span>{t('wait.share')}</span>
              </button>
            )}
          </div>
          <p className="ui-muted copy-status" role="status" data-testid="copy-status">
            {copied === 'done' && t('wait.copied')}
            {copied === 'failed' && t('wait.copyFailed', { link })}
          </p>
          {isHost && (
            <div className="start-row">
              <button type="button" className="ui-btn ui-btn--hero" data-testid="start-button" disabled={startReason !== null} onClick={() => send({ t: 'start' })}>
                <Icon name="dice" size="lg" />
                {t('wait.start')}
              </button>
              {startReason && <p className="ui-muted" data-testid="start-reason">{startReason}</p>}
            </div>
          )}
        </header>

        <div className="room-columns">
          <div className="room-col">
            <h2 className="ui-eyebrow">
              <Icon name="user" size="sm" />
              {t('wait.players', { taken: occupied, total: room.seats.length })}
            </h2>
            <ul className="seat-list" data-testid="seat-list">
              {room.seats.map((seat, i) => {
                const occ = seat.occupant;
                const mine = occ?.kind === 'human' && occ.user.id === myId;
                const host = occ?.kind === 'human' && occ.user.id === room.hostId;
                return (
                  <li
                    className={`seat${occ === null ? ' seat-empty' : ''}${mine ? ' seat-mine' : ''}`}
                    key={i}
                    data-testid={`seat-${i}`}
                    style={{ '--seat-color': COLOR_VARS[seat.color] } as CSSProperties}
                  >
                    {occ === null && mySeat && (
                      <button
                        type="button"
                        className="seat-select"
                        aria-label={t('color.change', { color: colorName(t, seat.color) })}
                        title={t('color.change', { color: colorName(t, seat.color) })}
                        data-testid={`color-${seat.color}`}
                        disabled={offline}
                        onClick={() => send({ t: 'color', color: seat.color })}
                      />
                    )}
                    <span className="seat-dot" title={colorName(t, seat.color)}>
                      {occ !== null && <Icon name={occ.kind === 'cpu' ? 'bot' : host ? 'crown' : 'knight'} size="sm" label={host ? t('wait.host') : undefined} />}
                    </span>
                    <div className="seat-info">
                      <strong data-testid={`seat-${i}-name`}>
                        {occ === null ? t('wait.emptySeat') : occ.kind === 'cpu' ? cpuDisplayName(t, occ.name) : occ.user.displayName}
                        {mine ? t('wait.you') : ''}
                      </strong>
                      <span
                        className={`seat-state${occ?.kind === 'human' && !occ.connected ? ' seat-state-off' : ''}`}
                        data-testid={`seat-${i}-state`}
                      >
                        {occ === null && (mySeat && !offline ? t('wait.waitingChange') : t('wait.waitingPlayer'))}
                        {occ?.kind === 'cpu' && t('cpu.badge', { level: cpuLevelLabel(t, cpuLevelOf(room)) })}
                        {occ?.kind === 'human' && (occ.connected ? t('wait.connected') : t('wait.disconnected'))}
                        {host && t('wait.hostSuffix')}
                      </span>
                      {seat.horseNames.some((n) => n !== '') && (
                        <span className="ui-muted seat-horses" data-testid={`seat-${i}-horses`}>
                          {t('wait.horses', { names: seat.horseNames.map((_, h) => horseLabel(seat.horseNames, h)).join(' · ') })}
                        </span>
                      )}
                      <EmoteBubble seat={i} emote={emotes[i]} mine={mine} />
                    </div>
                    {mine && (
                      <button type="button" className="ui-btn ui-btn--ghost seat-action" aria-label={t('wait.renameHorses')} data-testid="rename-horses" onClick={() => setRenaming(true)}>
                        <Icon name="pencil" size="sm" />
                        <span className="seat-action-label">{t('wait.renameHorses')}</span>
                      </button>
                    )}
                    {isHost && occ === null && (
                      <button type="button" className="ui-btn ui-btn--secondary seat-action" aria-label={t('wait.addCpu')} data-testid={`add-cpu-${i}`} onClick={() => send({ t: 'addCpu', seat: i })}>
                        <span className="seat-cpu-icon" aria-hidden="true">
                          <Icon name="bot" size="sm" />
                          <Icon name="plus" size="sm" />
                        </span>
                        <span className="seat-action-label">{t('wait.addCpu')}</span>
                      </button>
                    )}
                    {isHost && occ?.kind === 'cpu' && (
                      <button type="button" className="ui-btn ui-btn--ghost seat-action" aria-label={t('wait.removeCpu')} data-testid={`remove-cpu-${i}`} onClick={() => send({ t: 'removeCpu', seat: i })}>
                        <span className="seat-cpu-icon" aria-hidden="true">
                          <Icon name="bot" size="sm" />
                          <Icon name="minus" size="sm" />
                        </span>
                        <span className="seat-action-label">{t('wait.removeCpu')}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {actionError && (
              <p className="form-error" role="alert" data-testid="action-error">
                {errorText(t, actionError)}
              </p>
            )}

            {!isHost && (
              <p className="await-host" data-testid="await-host">
                {t('wait.awaitHost')}
              </p>
            )}
          </div>

          <div className="room-col">
            <div className="room-box">
              <GameSettings room={room} isHost={isHost} offline={offline} actionError={actionError} send={send} />
            </div>

            <section aria-labelledby="invite-title" className="room-box invite-box">
              <h2 id="invite-title" className="ui-eyebrow">
                <Icon name="share" size="sm" />
                {t('wait.inviteTitle')}
              </h2>
              {invitable.length === 0 ? (
                <p className="ui-muted" data-testid="invite-empty">
                  {t('wait.inviteEmpty')}
                </p>
              ) : (
                <ul className="invite-list" data-testid="invite-list">
                  {invitable.map((u) => (
                    <li className="invite-item" key={u.id} data-testid={`online-${u.id}`}>
                      <span>{u.displayName}</span>
                      <button
                        type="button"
                        className="ui-btn ui-btn--secondary"
                        data-testid={`invite-${u.id}`}
                        disabled={sent.has(u.id)}
                        onClick={() => sendInvite(u.id)}
                      >
                        {sent.has(u.id) && <Icon name="check" size="sm" />}
                        {sent.has(u.id) ? t('wait.invited') : t('wait.invite')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <EmoteLive emotes={emotes} mySeat={room.seats.indexOf(mySeat!)} nameOf={(i) => seatLabel(t, room.seats[i])} />

        <footer className="room-footer">
          <button type="button" className="ui-btn ui-btn--secondary" data-testid="waiting-rules" onClick={() => setRulesOpen(true)}>
            <Icon name="rules" />
            {t('wait.rules')}
          </button>
          <EmotePicker send={send} offline={offline} />
          <button type="button" className="ui-btn ui-btn--ghost room-leave" data-testid="leave-room" onClick={startLeave}>
            <Icon name="leave" />
            {t('wait.leave')}
          </button>
        </footer>
      </section>
      {rulesOpen && <RulesSheet settings={room.settings} secondsLeft={null} onClose={() => setRulesOpen(false)} />}
      {hostLeave && (
        <HostLeaveDialog
          others={others}
          seatNote={t('wait.leaveSeatNote')}
          onHandover={handover}
          onCloseRoom={closeRoom}
          onCancel={() => setHostLeave(false)}
        />
      )}
      {renaming && mySeat && (
        <HorseNamesDialog color={mySeat.color} names={mySeat.horseNames} send={send} onClose={() => setRenaming(false)} />
      )}
    </main>
  );
}
