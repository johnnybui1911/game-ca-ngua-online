import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { HORSES_PER_COLOR, POS_GATE } from '../../../shared/game/types';
import { SaveAccountBlock } from '../auth/SaveAccountBlock';
import { useSession } from '../auth/session-context';
import type { RoomClientMessage, RoomSnapshot, Seat } from '../../../shared/protocol';
import { unconsumed, type StateBatch } from './batches';
import { secondsLeft } from './countdown';
import { lastRollAfter, type LastRoll } from './last-roll';
import { COLOR_NAMES, COLOR_VARS } from './colors';
import { describeMove } from './move-text';
import type { HudInsets } from '../scene/camera';

const GameScene = lazy(() => import('../scene/GameScene'));

interface Props {
  room: RoomSnapshot;
  batches: StateBatch[];
  /** Server clock minus local clock, in ms. */
  clockOffset: number;
  myId: string;
  send: (msg: RoomClientMessage) => void;
  actionError: string | null;
}

function seatName(seat: Seat | undefined): string {
  const occ = seat?.occupant;
  if (!occ) return '';
  return occ.kind === 'cpu' ? occ.name : occ.user.displayName;
}

/** Most recent die shown on screen, folded over every batch received, in order. */
function useLastRoll(batches: StateBatch[]): LastRoll | null {
  const [last, setLast] = useState<LastRoll | null>(null);
  const consumed = useRef<number | null>(null);
  useEffect(() => {
    const from = consumed.current;
    if (unconsumed(batches, from).length === 0) return;
    consumed.current = batches[batches.length - 1]?.room.seq ?? from;
    setLast((prev) => lastRollAfter(prev, batches, from));
  }, [batches]);
  return last;
}

function useCountdown(deadline: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline === null ? null : secondsLeft(deadline, now, offset);
}

/** Heights of the top player strip and bottom panel, kept current as their content changes. */
function useHudInsets(active: boolean) {
  const topRef = useRef<HTMLUListElement>(null);
  const bottomRef = useRef<HTMLElement>(null);
  const [insets, setInsets] = useState<HudInsets>({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const topEl = topRef.current;
    const bottomEl = bottomRef.current;
    if (!active || !topEl || !bottomEl) return;
    const measure = () => {
      const top = topEl.offsetHeight;
      const bottom = bottomEl.offsetHeight;
      setInsets((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(topEl);
    observer.observe(bottomEl);
    return () => observer.disconnect();
  }, [active]);
  return { topRef, bottomRef, insets };
}

export function MatchView({ room, batches, clockOffset, myId, send, actionError }: Props) {
  const navigate = useNavigate();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { guest } = useSession();
  // Decided once per visit: stays on screen as a confirmation after the guest registers.
  const [offerSave] = useState(guest);
  const [saveDismissed, setSaveDismissed] = useState(false);
  const game = room.game;
  const lastRoll = useLastRoll(batches);
  const seconds = useCountdown(room.turnDeadline, clockOffset);
  const hud = useHudInsets(room.game !== null);
  if (!game) return null;

  const mySeat = room.seats.find((s) => s.occupant?.kind === 'human' && s.occupant.user.id === myId);
  const myColor = mySeat?.color ?? null;
  const turnSeat = room.seats.find((s) => s.color === game.turn);
  const myTurn = myColor !== null && game.turn === myColor && game.phase !== 'finished';
  const isHost = room.hostId === myId;
  const winnerSeat = game.winner === null ? undefined : room.seats.find((s) => s.color === game.winner);
  const finished = game.phase === 'finished';

  const leave = () => {
    send({ t: 'leave' });
    void navigate('/');
  };

  const turnText = finished
    ? 'Ván đấu đã kết thúc'
    : myTurn
      ? 'Lượt của bạn'
      : `Lượt của ${seatName(turnSeat)}`;

  return (
    <div
      className="match"
      data-testid="hud"
      data-seq={room.seq}
      data-horses={JSON.stringify(game.horses)}
      data-my-color={myColor ?? ''}
    >
      <div className="match-stage">
        <Suspense fallback={<div className="stage-loading">Đang tải bàn cờ…</div>}>
          <GameScene
            room={room}
            batches={batches}
            myColor={myColor}
            insets={hud.insets}
            onPickHorse={(horse) => {
              if (myTurn && game.phase === 'move' && game.legalHorses.includes(horse)) send({ t: 'move', horse });
            }}
          />
        </Suspense>
      </div>

      <ul className="hud-players" ref={hud.topRef}>
        {room.seats
          .filter((s) => s.occupant !== null && game.colors.includes(s.color))
          .map((s) => {
            const occ = s.occupant;
            const home = (game.horses[s.color] ?? []).filter((p) => p > POS_GATE).length;
            const active = !finished && game.turn === s.color;
            return (
              <li
                key={s.color}
                className={`hud-player${active ? ' is-turn' : ''}`}
                style={{ borderColor: COLOR_VARS[s.color] }}
                data-testid={`hud-player-${s.color}`}
                data-active={active}
              >
                <span className="seat-dot" style={{ background: COLOR_VARS[s.color] }} title={COLOR_NAMES[s.color]} />
                <span className="hud-name">{seatName(s)}</span>
                {occ?.kind === 'cpu' && <span className="badge">CPU</span>}
                {occ?.kind === 'human' && !occ.connected && <span className="badge badge-warn">Offline</span>}
                <span className="hud-home" title="Quân đã về đích">
                  {home}/{HORSES_PER_COLOR}
                </span>
              </li>
            );
          })}
      </ul>

      <section className="hud-bottom" aria-label="Điều khiển" ref={hud.bottomRef}>
        <div className="hud-line">
          <p className="turn-banner" data-testid="turn-banner" aria-live="polite">
            {turnText}
          </p>
          {seconds !== null && !finished && (
            <span className="countdown" data-testid="countdown">
              {seconds} giây
            </span>
          )}
          <span className="dice" data-testid="dice-value" aria-label="Xúc xắc" style={lastRoll ? { borderColor: COLOR_VARS[lastRoll.color] } : undefined}>
            {lastRoll?.dice ?? '–'}
          </span>
        </div>

        {actionError && (
          <p className="form-error" role="alert" data-testid="action-error">
            {actionError}
          </p>
        )}

        <div className="hud-actions">
          {myTurn && game.phase === 'roll' && (
            <button type="button" className="btn btn-primary btn-roll" data-testid="roll-button" onClick={() => send({ t: 'roll' })}>
              Đổ xúc xắc
            </button>
          )}
          {myTurn &&
            game.phase === 'move' &&
            game.legalHorses.map((horse) => (
              <button
                type="button"
                key={horse}
                className="btn btn-primary btn-move"
                data-testid={`move-button-${horse}`}
                onClick={() => send({ t: 'move', horse })}
              >
                {describeMove(game, horse)}
              </button>
            ))}
          <button type="button" className="btn btn-secondary btn-leave" data-testid="leave-room" onClick={() => setConfirmLeave(true)}>
            Rời phòng
          </button>
        </div>
      </section>

      {confirmLeave && !finished && (
        <div className="dialog-backdrop">
          <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title" data-testid="leave-dialog">
            <h2 id="leave-title">Rời phòng?</h2>
            <p>Máy sẽ chơi thay bạn đến hết ván.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" data-testid="leave-confirm" onClick={leave}>
                Rời phòng
              </button>
              <button type="button" className="btn btn-secondary" data-testid="leave-cancel" onClick={() => setConfirmLeave(false)}>
                Ở lại
              </button>
            </div>
          </div>
        </div>
      )}

      {finished && (
        <div className="dialog-backdrop">
          <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="win-title" data-testid="win-dialog">
            <h2 id="win-title" data-testid="win-title">
              {seatName(winnerSeat)} thắng!
            </h2>
            <div className="dialog-actions">
              {isHost ? (
                <button type="button" className="btn btn-primary" data-testid="rematch-button" onClick={() => send({ t: 'rematch' })}>
                  Chơi lại
                </button>
              ) : (
                <p className="muted" data-testid="await-host">
                  Chờ chủ phòng
                </p>
              )}
              <button type="button" className="btn btn-secondary" data-testid="to-lobby" onClick={leave}>
                Về sảnh
              </button>
            </div>
            {offerSave && !saveDismissed && (
              <SaveAccountBlock returnTo={`/r/${room.code}`} onDismiss={() => setSaveDismissed(true)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
