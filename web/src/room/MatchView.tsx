import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { HORSES_PER_COLOR, POS_GATE } from '../../../shared/game/types';
import { SaveAccountBlock } from '../auth/SaveAccountBlock';
import { useSession } from '../auth/session-context';
import type { RoomClientMessage, RoomSnapshot, Seat } from '../../../shared/protocol';
import { sound } from '../audio/sound';
import { SoundSwitches, useMusic } from '../audio/SoundControls';
import { unconsumed, type StateBatch } from './batches';
import { secondsLeft } from './countdown';
import { lastRollAfter, type LastRoll } from './last-roll';
import { COLOR_NAMES, COLOR_VARS } from './colors';
import { CPU_LEVEL_LABELS, cpuLevelOf } from './cpu-levels';
import { EmoteBubble, EmoteLive } from './EmoteBubble';
import { EmotePicker } from './EmotePicker';
import type { EmoteBySeat } from './emote-feed';
import { HorseNamesDialog } from './HorseNamesDialog';
import { RulesButton, RulesSheet } from './RulesSheet';
import { describeMove } from './move-text';
import { useShakeToRoll } from './shake';
import { reserveInsets, type ReservedInsets } from '../scene/camera';

/** Seconds left on the local player's action at which the reminder sounds. */
const REMINDER_SECONDS = 10;

const GameScene = lazy(() => import('../scene/GameScene'));

interface Props {
  room: RoomSnapshot;
  batches: StateBatch[];
  /** Server clock minus local clock, in ms. */
  clockOffset: number;
  myId: string;
  send: (msg: RoomClientMessage) => void;
  actionError: string | null;
  emotes: EmoteBySeat;
  /** The socket is not open. */
  offline: boolean;
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

/**
 * Heights of the top player strip and bottom panel. The largest seen at the current viewport size are
 * kept, so the board does not move when panel content comes and goes during a match.
 */
function useHudInsets(active: boolean) {
  const topRef = useRef<HTMLUListElement>(null);
  const bottomRef = useRef<HTMLElement>(null);
  const [insets, setInsets] = useState<ReservedInsets | null>(null);
  useLayoutEffect(() => {
    const topEl = topRef.current;
    const bottomEl = bottomRef.current;
    const root = topEl?.parentElement;
    if (!active || !topEl || !bottomEl || !root) return;
    const measure = () => {
      const measured = { top: topEl.offsetHeight, bottom: bottomEl.offsetHeight };
      setInsets((prev) => reserveInsets(prev, measured, root.clientWidth, root.clientHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(topEl);
    observer.observe(bottomEl);
    observer.observe(root);
    return () => observer.disconnect();
  }, [active]);
  return { topRef, bottomRef, insets: insets ?? { top: 0, bottom: 0 } };
}

/**
 * Effects for what the server reports: a dice sound for every roll received after mount (a reload
 * does not replay old ones), a chime when the turn reaches the local player, and a reminder once per
 * action when its time is nearly up.
 */
function useGameSounds(batches: StateBatch[], myTurn: boolean, seconds: number | null, deadline: number | null) {
  const consumed = useRef<number | null>(null);
  useEffect(() => {
    const from = consumed.current;
    consumed.current = batches[batches.length - 1]?.room.seq ?? from;
    if (from === null) return;
    if (unconsumed(batches, from).some((b) => b.events.some((e) => e.type === 'rolled'))) sound.playDice();
  }, [batches]);

  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) sound.playTurn();
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  const remindedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!myTurn || seconds === null || deadline === null || seconds > REMINDER_SECONDS) return;
    if (remindedFor.current === deadline) return;
    remindedFor.current = deadline;
    sound.playReminder();
  }, [myTurn, seconds, deadline]);
}

export function MatchView({ room, batches, clockOffset, myId, send, actionError, emotes, offline }: Props) {
  const navigate = useNavigate();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const { guest } = useSession();
  // Decided once per visit: stays on screen as a confirmation after the guest registers.
  const [offerSave] = useState(guest);
  const [saveDismissed, setSaveDismissed] = useState(false);
  const game = room.game;
  const lastRoll = useLastRoll(batches);
  const seconds = useCountdown(room.turnDeadline, clockOffset);
  const hud = useHudInsets(room.game !== null);

  const mySeat = room.seats.find((s) => s.occupant?.kind === 'human' && s.occupant.user.id === myId);
  const myColor = mySeat?.color ?? null;
  const finished = game?.phase === 'finished';
  const paused = room.paused;
  const myTurn = game !== null && myColor !== null && game.turn === myColor && !finished;
  // The server reports a CPU's roll and move together with the turn passing to us; the roll button
  // and the chime wait until the board has shown that turn.
  const [boardBusy, setBoardBusy] = useState(false);
  const canRoll = myTurn && !paused && game?.phase === 'roll' && !boardBusy;
  useMusic('game');
  useGameSounds(batches, myTurn && !paused && !boardBusy, seconds, room.turnDeadline);
  const dialogOpen = menuOpen || renaming || rulesOpen || confirmLeave || confirmClose;
  // Changes with every roll the server reports, so each roll chance allows one shake-roll.
  const lastRolledSeq = [...batches].reverse().find((b) => b.events.some((e) => e.type === 'rolled'))?.room.seq ?? null;
  const shake = useShakeToRoll(canRoll && !dialogOpen, lastRolledSeq, () => send({ t: 'roll' }));
  if (!game) return null;

  const turnSeat = room.seats.find((s) => s.color === game.turn);
  const isHost = room.hostId === myId;
  const winnerSeat = game.winner === null ? undefined : room.seats.find((s) => s.color === game.winner);
  const turnNames = turnSeat?.horseNames;

  const leave = () => {
    send({ t: 'leave' });
    void navigate('/');
  };

  const closeRoom = () => {
    send({ t: 'closeRoom' });
    void navigate('/');
  };

  const turnText = finished
    ? 'Ván đấu đã kết thúc'
    : paused
      ? 'Ván đấu đang tạm dừng'
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
            onBusyChange={setBoardBusy}
            onPickHorse={(horse) => {
              if (myTurn && !paused && game.phase === 'move' && game.legalHorses.includes(horse)) send({ t: 'move', horse });
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
                {occ?.kind === 'cpu' && <span className="badge">CPU · {CPU_LEVEL_LABELS[cpuLevelOf(room)]}</span>}
                {occ?.kind === 'human' && !occ.connected && <span className="badge badge-warn">Offline</span>}
                <span className="hud-home" title="Quân đã về đích">
                  {home}/{HORSES_PER_COLOR}
                </span>
                <EmoteBubble seat={room.seats.indexOf(s)} emote={emotes[room.seats.indexOf(s)]} mine={s === mySeat} />
              </li>
            );
          })}
      </ul>

      <EmoteLive emotes={emotes} mySeat={mySeat ? room.seats.indexOf(mySeat) : -1} nameOf={(i) => seatName(room.seats[i])} />

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
          <RulesButton onClick={() => setRulesOpen(true)} />
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
          {canRoll && (
            <button type="button" className="btn btn-primary btn-roll" data-testid="roll-button" onClick={() => send({ t: 'roll' })}>
              {shake.enabled ? 'Đổ xúc xắc (hoặc lắc máy)' : 'Đổ xúc xắc'}
            </button>
          )}
          {canRoll && shake.supported && !shake.enabled && (
            <button type="button" className="btn btn-secondary" data-testid="enable-shake" onClick={() => shake.setEnabled(true)}>
              Bật lắc để đổ
            </button>
          )}
          {myTurn &&
            !paused &&
            game.phase === 'move' &&
            game.legalHorses.map((horse) => (
              <button
                type="button"
                key={horse}
                className="btn btn-primary btn-move"
                data-testid={`move-button-${horse}`}
                onClick={() => send({ t: 'move', horse })}
              >
                {describeMove(game, horse, turnNames)}
              </button>
            ))}
          <EmotePicker send={send} offline={offline} />
          <button type="button" className="btn btn-secondary" data-testid="match-menu-button" onClick={() => setMenuOpen(true)}>
            Menu
          </button>
          <button type="button" className="btn btn-secondary btn-leave" data-testid="leave-room" onClick={() => setConfirmLeave(true)}>
            Rời phòng
          </button>
        </div>
      </section>

      {paused && !finished && (
        <div className="pause-banner" role="status" data-testid="pause-banner">
          <strong>Chủ phòng đã tạm dừng ván đấu</strong>
          {isHost && (
            <button type="button" className="btn btn-primary" data-testid="resume-button" onClick={() => send({ t: 'resume' })}>
              Tiếp tục
            </button>
          )}
        </div>
      )}

      {menuOpen && (
        <div className="dialog-backdrop">
          <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="menu-title" data-testid="match-menu">
            <h2 id="menu-title">Menu</h2>
            <SoundSwitches />
            {shake.supported && (
              <label className="shake-switch">
                <input
                  type="checkbox"
                  data-testid="shake-toggle"
                  checked={shake.enabled}
                  onChange={(e) => shake.setEnabled(e.target.checked)}
                />
                Lắc máy để đổ xúc xắc
              </label>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="menu-rules"
                onClick={() => {
                  setMenuOpen(false);
                  setRulesOpen(true);
                }}
              >
                Luật chơi
              </button>
              {mySeat && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-testid="rename-horses"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenaming(true);
                  }}
                >
                  Đặt tên quân
                </button>
              )}
              {isHost && !finished && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-testid={paused ? 'menu-resume' : 'pause-button'}
                  onClick={() => {
                    send({ t: paused ? 'resume' : 'pause' });
                    setMenuOpen(false);
                  }}
                >
                  {paused ? 'Tiếp tục ván đấu' : 'Tạm dừng ván đấu'}
                </button>
              )}
              {isHost && !finished && (
                <button
                  type="button"
                  className="btn btn-danger"
                  data-testid="close-room"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmClose(true);
                  }}
                >
                  Đóng phòng
                </button>
              )}
              <button type="button" className="btn btn-primary" data-testid="menu-close" onClick={() => setMenuOpen(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {rulesOpen && <RulesSheet secondsLeft={myTurn && !finished ? seconds : null} onClose={() => setRulesOpen(false)} />}

      {renaming && mySeat && (
        <HorseNamesDialog color={mySeat.color} names={mySeat.horseNames} send={send} onClose={() => setRenaming(false)} />
      )}

      {confirmClose && !finished && (
        <div className="dialog-backdrop">
          <div className="card dialog" role="dialog" aria-modal="true" aria-labelledby="close-title" data-testid="close-dialog">
            <h2 id="close-title">Đóng phòng?</h2>
            <p>Ván đấu sẽ bị huỷ và mọi người sẽ rời phòng.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-danger" data-testid="close-confirm" onClick={closeRoom}>
                Đóng phòng
              </button>
              <button type="button" className="btn btn-secondary" data-testid="close-cancel" onClick={() => setConfirmClose(false)}>
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}

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
