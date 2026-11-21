import { useState } from 'react';
import { useNavigate } from 'react-router';
import { horseLabel, type RoomClientMessage, type RoomSnapshot } from '../../../shared/protocol';
import { SoundButton, useMusic } from '../audio/SoundControls';
import { inviteLink, reportInviteShared } from '../analytics';
import { useLobby } from '../lobby/LobbyProvider';
import { COLOR_NAMES, COLOR_VARS } from './colors';
import { EmoteBubble, EmoteLive } from './EmoteBubble';
import { EmotePicker } from './EmotePicker';
import type { EmoteBySeat } from './emote-feed';
import { HorseNamesDialog } from './HorseNamesDialog';
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

  const leave = () => {
    send({ t: 'leave' });
    void navigate('/');
  };

  const startReason = occupied < 2 ? 'Cần ít nhất 2 người chơi để bắt đầu.' : null;

  return (
    <main className="room-page">
      <section className="card room-card">
        <header className="room-head">
          <h1 data-testid="room-name">{room.name}</h1>
          <p className="muted">
            Mã phòng: <strong className="room-code" data-testid="room-code">{room.code}</strong>
            {' · '}
            {room.visibility === 'public' ? 'Công khai' : 'Riêng tư'}
          </p>
        </header>

        <ul className="seat-list" data-testid="seat-list">
          {room.seats.map((seat, i) => {
            const occ = seat.occupant;
            const mine = occ?.kind === 'human' && occ.user.id === myId;
            return (
              <li className="seat" key={i} data-testid={`seat-${i}`}>
                <span className="seat-dot" style={{ background: COLOR_VARS[seat.color] }} title={COLOR_NAMES[seat.color]} />
                <div className="seat-info">
                  <strong data-testid={`seat-${i}-name`}>
                    {occ === null ? 'Chỗ trống' : occ.kind === 'cpu' ? occ.name : occ.user.displayName}
                    {mine ? ' (bạn)' : ''}
                  </strong>
                  <span className="muted" data-testid={`seat-${i}-state`}>
                    {occ === null && 'Chờ người chơi'}
                    {occ?.kind === 'cpu' && 'Máy'}
                    {occ?.kind === 'human' && (occ.connected ? 'Đang kết nối' : 'Mất kết nối')}
                    {occ?.kind === 'human' && occ.user.id === room.hostId && ' · Chủ phòng'}
                  </span>
                  {seat.horseNames.some((n) => n !== '') && (
                    <span className="muted" data-testid={`seat-${i}-horses`}>
                      Quân: {seat.horseNames.map((_, h) => horseLabel(seat.horseNames, h)).join(' · ')}
                    </span>
                  )}
                  <EmoteBubble seat={i} emote={emotes[i]} mine={mine} />
                </div>
                {mine && (
                  <button type="button" className="btn btn-secondary seat-action" data-testid="rename-horses" onClick={() => setRenaming(true)}>
                    Đặt tên quân
                  </button>
                )}
                {isHost && occ === null && (
                  <button type="button" className="btn btn-secondary seat-action" data-testid={`add-cpu-${i}`} onClick={() => send({ t: 'addCpu', seat: i })}>
                    Thêm CPU
                  </button>
                )}
                {isHost && occ?.kind === 'cpu' && (
                  <button type="button" className="btn btn-secondary seat-action" data-testid={`remove-cpu-${i}`} onClick={() => send({ t: 'removeCpu', seat: i })}>
                    Bỏ CPU
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="leave-row">
          <button type="button" className="btn btn-secondary" data-testid="waiting-rules" onClick={() => setRulesOpen(true)}>
            Luật chơi
          </button>
        </div>

        <EmoteLive emotes={emotes} mySeat={room.seats.indexOf(mySeat!)} nameOf={(i) => seatLabel(room.seats[i])} />
        <EmotePicker send={send} offline={offline} />

        {actionError && (
          <p className="form-error" role="alert" data-testid="action-error">
            {actionError}
          </p>
        )}

        {isHost ? (
          <div className="start-row">
            <button type="button" className="btn btn-primary" data-testid="start-button" disabled={startReason !== null} onClick={() => send({ t: 'start' })}>
              Bắt đầu
            </button>
            {startReason && (
              <p className="muted" data-testid="start-reason">
                {startReason}
              </p>
            )}
          </div>
        ) : (
          <p className="muted" data-testid="await-host">
            Chờ chủ phòng bắt đầu…
          </p>
        )}

        <div className="share-row">
          <button type="button" className="btn btn-secondary" data-testid="copy-link" onClick={() => void copy()}>
            Sao chép link
          </button>
          {canShare && (
            <button type="button" className="btn btn-secondary" data-testid="share-button" onClick={() => void share()}>
              Chia sẻ
            </button>
          )}
        </div>
        <p className="muted" role="status" data-testid="copy-status">
          {copied === 'done' && 'Đã sao chép link phòng.'}
          {copied === 'failed' && 'Không sao chép được, hãy chép link thủ công: ' + link}
        </p>

        <section aria-labelledby="invite-title" className="invite-box">
          <h2 id="invite-title">Mời người đang online</h2>
          {invitable.length === 0 ? (
            <p className="muted" data-testid="invite-empty">
              Chưa có ai khác đang online.
            </p>
          ) : (
            <ul className="invite-list" data-testid="invite-list">
              {invitable.map((u) => (
                <li className="invite-item" key={u.id} data-testid={`online-${u.id}`}>
                  <span>{u.displayName}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    data-testid={`invite-${u.id}`}
                    disabled={sent.has(u.id)}
                    onClick={() => sendInvite(u.id)}
                  >
                    {sent.has(u.id) ? 'Đã mời' : 'Mời'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="leave-row">
          <button type="button" className="btn btn-secondary" data-testid="leave-room" onClick={leave}>
            Rời phòng
          </button>
        </div>
      </section>
      {rulesOpen && <RulesSheet secondsLeft={null} onClose={() => setRulesOpen(false)} />}
      {renaming && mySeat && (
        <HorseNamesDialog color={mySeat.color} names={mySeat.horseNames} send={send} onClose={() => setRenaming(false)} />
      )}
      <SoundButton />
    </main>
  );
}
