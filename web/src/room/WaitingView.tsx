import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { horseLabel, type RoomClientMessage, type RoomSnapshot } from '../../../shared/protocol';
import { useMusic } from '../audio/SoundControls';
import { inviteLink, reportInviteShared } from '../analytics';
import { useLobby } from '../lobby/LobbyProvider';
import { Icon } from '../ui/Icon';
import { COLOR_NAMES, COLOR_VARS } from './colors';
import { CPU_LEVEL_LABELS, cpuLevelOf } from './cpu-levels';
import { EmoteBubble, EmoteLive } from './EmoteBubble';
import { EmotePicker } from './EmotePicker';
import type { EmoteBySeat } from './emote-feed';
import { GameSettings } from './GameSettings';
import { HorseNamesDialog } from './HorseNamesDialog';
import { HostLeaveDialog } from './HostLeaveDialog';
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

function seatLabel(seat: RoomSnapshot['seats'][number] | undefined): string {
  const occ = seat?.occupant;
  if (!occ) return '';
  return occ.kind === 'cpu' ? occ.name : occ.user.displayName;
}

export function WaitingView({ room, myId, send, actionError, emotes, offline }: Props) {
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
      await navigator.share({ title: room.name, text: `Vào phòng ${room.name} chơi cờ cá ngựa nhé!`, url: link });
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

  const startReason = occupied < 2 ? 'Cần ít nhất 2 người chơi để bắt đầu.' : null;

  return (
    <main className="room-page">
      <section className="glass room-panel" aria-labelledby="room-name">
        <header className="room-head">
          <p className="ui-eyebrow">
            Phòng chờ · {room.visibility === 'public' ? 'Công khai' : 'Riêng tư'}
            {room.allowTakeover && <span data-testid="allow-takeover-tag"> · Cho vào thay máy</span>}
          </p>
          <h1 id="room-name" className="ui-title room-title" data-testid="room-name">
            {room.name}
          </h1>
          <div className="room-code-row">
            <span className="room-code-chip">
              <span className="ui-muted">Mã phòng</span>
              <strong className="room-code" data-testid="room-code">
                {room.code}
              </strong>
            </span>
            <button type="button" className="ui-btn ui-btn--secondary" data-testid="copy-link" onClick={() => void copy()}>
              <Icon name={copied === 'done' ? 'check' : 'copy-link'} />
              Sao chép link
            </button>
            {canShare && (
              <button type="button" className="ui-btn ui-btn--secondary" data-testid="share-button" onClick={() => void share()}>
                <Icon name="share" />
                Chia sẻ
              </button>
            )}
          </div>
          <p className="ui-muted copy-status" role="status" data-testid="copy-status">
            {copied === 'done' && 'Đã sao chép link phòng.'}
            {copied === 'failed' && 'Không sao chép được, hãy chép link thủ công: ' + link}
          </p>
        </header>

        <div className="room-columns">
          <div className="room-col">
            <h2 className="ui-eyebrow">
              <Icon name="user" size="sm" />
              Người chơi · {occupied}/{room.seats.length}
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
                    <span className="seat-dot" title={COLOR_NAMES[seat.color]}>
                      {host && <Icon name="crown" size="sm" label="Chủ phòng" />}
                      {occ?.kind === 'cpu' && <Icon name="bot" size="sm" />}
                    </span>
                    <div className="seat-info">
                      <strong data-testid={`seat-${i}-name`}>
                        {occ === null ? 'Chỗ trống' : occ.kind === 'cpu' ? occ.name : occ.user.displayName}
                        {mine ? ' (bạn)' : ''}
                      </strong>
                      <span
                        className={`seat-state${occ?.kind === 'human' && !occ.connected ? ' seat-state-off' : ''}`}
                        data-testid={`seat-${i}-state`}
                      >
                        {occ === null && 'Chờ người chơi'}
                        {occ?.kind === 'cpu' && `Máy · ${CPU_LEVEL_LABELS[cpuLevelOf(room)]}`}
                        {occ?.kind === 'human' && (occ.connected ? 'Đang kết nối' : 'Mất kết nối')}
                        {host && ' · Chủ phòng'}
                      </span>
                      {seat.horseNames.some((n) => n !== '') && (
                        <span className="ui-muted seat-horses" data-testid={`seat-${i}-horses`}>
                          Quân: {seat.horseNames.map((_, h) => horseLabel(seat.horseNames, h)).join(' · ')}
                        </span>
                      )}
                      <EmoteBubble seat={i} emote={emotes[i]} mine={mine} />
                    </div>
                    {mine && (
                      <button type="button" className="ui-btn ui-btn--ghost seat-action" aria-label="Đặt tên quân" data-testid="rename-horses" onClick={() => setRenaming(true)}>
                        <Icon name="pencil" size="sm" />
                        <span className="seat-action-label">Đặt tên quân</span>
                      </button>
                    )}
                    {isHost && occ === null && (
                      <button type="button" className="ui-btn ui-btn--secondary seat-action" aria-label="Thêm máy" data-testid={`add-cpu-${i}`} onClick={() => send({ t: 'addCpu', seat: i })}>
                        <Icon name="user-plus" size="sm" />
                        <span className="seat-action-label">Thêm máy</span>
                      </button>
                    )}
                    {isHost && occ?.kind === 'cpu' && (
                      <button type="button" className="ui-btn ui-btn--ghost seat-action" aria-label="Bỏ máy" data-testid={`remove-cpu-${i}`} onClick={() => send({ t: 'removeCpu', seat: i })}>
                        <Icon name="user-minus" size="sm" />
                        <span className="seat-action-label">Bỏ máy</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {actionError && (
              <p className="form-error" role="alert" data-testid="action-error">
                {actionError}
              </p>
            )}

            {isHost ? (
              <div className="start-row">
                <button type="button" className="ui-btn ui-btn--hero" data-testid="start-button" disabled={startReason !== null} onClick={() => send({ t: 'start' })}>
                  <Icon name="dice" size="lg" />
                  Bắt đầu
                </button>
                {startReason && (
                  <p className="ui-muted" data-testid="start-reason">
                    {startReason}
                  </p>
                )}
              </div>
            ) : (
              <p className="await-host" data-testid="await-host">
                Chờ chủ phòng bắt đầu…
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
                Mời người đang online
              </h2>
              {invitable.length === 0 ? (
                <p className="ui-muted" data-testid="invite-empty">
                  Chưa có ai khác đang online.
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
                        {sent.has(u.id) ? 'Đã mời' : 'Mời'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <EmoteLive emotes={emotes} mySeat={room.seats.indexOf(mySeat!)} nameOf={(i) => seatLabel(room.seats[i])} />

        <footer className="room-footer">
          <button type="button" className="ui-btn ui-btn--secondary" data-testid="waiting-rules" onClick={() => setRulesOpen(true)}>
            <Icon name="rules" />
            Luật chơi
          </button>
          <EmotePicker send={send} offline={offline} />
          <button type="button" className="ui-btn ui-btn--ghost room-leave" data-testid="leave-room" onClick={startLeave}>
            <Icon name="leave" />
            Rời phòng
          </button>
        </footer>
      </section>
      {rulesOpen && <RulesSheet settings={room.settings} secondsLeft={null} onClose={() => setRulesOpen(false)} />}
      {hostLeave && (
        <HostLeaveDialog
          others={others}
          seatNote="Chỗ của bạn sẽ thành chỗ trống."
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
