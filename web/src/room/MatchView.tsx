import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { isLocked } from '../../../shared/game/engine';
import { HORSES_PER_COLOR, POS_GATE, type Color } from '../../../shared/game/types';
import { LOCKED_LABEL, NEED_KICK_HINT, QUICK_WIN_TEXT, UNLOCKED_LABEL } from '../../../shared/rules-text';
import { SaveAccountBlock } from '../auth/SaveAccountBlock';
import { useSession } from '../auth/session-context';
import type { RoomClientMessage, RoomSnapshot, Seat } from '../../../shared/protocol';
import { sound } from '../audio/sound';
import { SoundSwitches, useMusic } from '../audio/SoundControls';
import { unconsumed, type StateBatch } from './batches';
import { secondsLeft } from './countdown';
import { lastRollAfter, type LastRoll } from './last-roll';
import { needKickAfter } from './need-kick';
import { QuickIntroCard } from './QuickIntroCard';
import { quickIntro } from './quick-intro';
import { COLOR_NAMES, COLOR_VARS } from './colors';
import { CPU_LEVEL_LABELS, cpuLevelOf } from './cpu-levels';
import { EmoteBubble, EmoteLive } from './EmoteBubble';
import { EmotePicker } from './EmotePicker';
import type { EmoteBySeat } from './emote-feed';
import { HorseNamesDialog } from './HorseNamesDialog';
import { Modal } from './Modal';
import { RulesButton, RulesSheet } from './RulesSheet';
import { describeMove } from './move-text';
import { reportAfterExpiry, rollHeld, type BoardReport } from './board-wait';
import { useShakeToRoll } from './shake';
import { reserveInsets, type ReservedInsets } from '../scene/camera';
import { Icon } from '../ui/Icon';

/** Seconds left on the local player's action at which the reminder sounds. */
const REMINDER_SECONDS = 10;

/** Longest the roll waits for the board to finish animating; a slow device must not hold the player up. */
const MAX_BOARD_WAIT_MS = 1500;

/**
 * True while the roll waits for the board: from the first frame of the match until the board reports, then
 * while it animates what the server reported, for at most MAX_BOARD_WAIT_MS per state.
 */
function useBoardWait(seq: number): [boolean, (busy: boolean) => void] {
  const [report, setReport] = useState<BoardReport>(null);
  const [expiredAt, setExpiredAt] = useState<number | null>(null);
  const waiting = report ?? true;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setExpiredAt(seq);
      setReport(reportAfterExpiry);
    }, MAX_BOARD_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, seq]);
  return [rollHeld(report, seq, expiredAt), setReport];
}

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

/** Whether the local player's last roll was blocked only by their locked home column (quick match). */
function useNeedKick(batches: StateBatch[], color: Color | null): boolean {
  const [hint, setHint] = useState(false);
  const consumed = useRef<number | null>(null);
  useEffect(() => {
    const from = consumed.current;
    if (unconsumed(batches, from).length === 0) return;
    consumed.current = batches[batches.length - 1]?.room.seq ?? from;
    setHint((prev) => needKickAfter(prev, batches, from, color));
  }, [batches, color]);
  return hint;
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
  // Decided once per mount: the first quick match on a device explains itself, later ones do not.
  const [introOpen, setIntroOpen] = useState(
    () => room.settings.quick && room.game !== null && room.game.phase !== 'finished' && quickIntro.shouldShow(),
  );
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
  const needKick = useNeedKick(batches, myColor);
  const finished = game?.phase === 'finished';
  const paused = room.paused;
  const myTurn = game !== null && myColor !== null && game.turn === myColor && !finished;
  // The server reports a CPU's roll and move together with the turn passing to us; the roll button
  // and the chime wait until the board has shown that turn.
  const [boardBusy, setBoardBusy] = useBoardWait(room.seq);
  const canRoll = myTurn && !paused && game?.phase === 'roll' && !boardBusy;
  useMusic('game');
  useGameSounds(batches, myTurn && !paused && !boardBusy, seconds, room.turnDeadline);
  const dialogOpen = menuOpen || renaming || rulesOpen || confirmLeave || confirmClose || (introOpen && !finished);
  // Changes with every roll the server reports, so each roll chance allows one shake-roll.
  const lastRolledSeq = [...batches].reverse().find((b) => b.events.some((e) => e.type === 'rolled'))?.room.seq ?? null;
  const shake = useShakeToRoll(canRoll && !dialogOpen, lastRolledSeq, () => send({ t: 'roll' }));
  if (!game) return null;

  const turnSeat = room.seats.find((s) => s.color === game.turn);
  const isHost = room.hostId === myId;
  const winnerSeat = game.winner === null ? undefined : room.seats.find((s) => s.color === game.winner);
  const turnNames = turnSeat?.horseNames;
  const quickGame = game.variant === 'quick';
  const showKickHint = quickGame && needKick && myColor !== null && isLocked(game, myColor) && !finished;

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
  const lowTime = seconds !== null && seconds <= REMINDER_SECONDS && myTurn && !paused;
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
            const locked = quickGame && isLocked(game, s.color);
            return (
              <li
                key={s.color}
                className={`hud-player${active ? ' is-turn' : ''}${s === mySeat ? ' is-mine' : ''}`}
                style={{ '--seat-color': COLOR_VARS[s.color] } as CSSProperties}
                data-testid={`hud-player-${s.color}`}
                data-active={active}
              >
                <span className="seat-dot" title={COLOR_NAMES[s.color]}>
                  {occ?.kind === 'cpu' && <Icon name="bot" size="sm" />}
                </span>
                <span className="hud-player-main">
                  <span className="hud-name">{seatName(s)}</span>
                  <span className="hud-badges">
                    {occ?.kind === 'cpu' && <span className="badge">CPU · {CPU_LEVEL_LABELS[cpuLevelOf(room)]}</span>}
                    {occ?.kind === 'human' && !occ.connected && (
                      <span className="badge badge-warn">
                        <Icon name="wifi-off" size="sm" />
                        Offline
                      </span>
                    )}
                    {s.auto && s !== mySeat && (
                      <span className="badge" data-testid={`auto-tag-${s.color}`}>
                        (tự động)
                      </span>
                    )}
                    {quickGame && (
                      <span className={`badge lock-badge${locked ? ' is-locked' : ''}`} data-testid={`lock-${s.color}`} data-locked={locked}>
                        <Icon name={locked ? 'lock' : 'unlock'} size="sm" />
                        <span className="lock-label">{locked ? LOCKED_LABEL : UNLOCKED_LABEL}</span>
                      </span>
                    )}
                  </span>
                </span>
                <span className="hud-home" title="Quân đã về đích" aria-label={`${home}/${HORSES_PER_COLOR} quân đã về đích`}>
                  <span className="hud-home-pips" aria-hidden="true">
                    {Array.from({ length: HORSES_PER_COLOR }, (_, i) => (
                      <span key={i} className={i < home ? 'is-home' : undefined} />
                    ))}
                  </span>
                  <span aria-hidden="true">
                    {home}/{HORSES_PER_COLOR}
                  </span>
                </span>
                <EmoteBubble seat={room.seats.indexOf(s)} emote={emotes[room.seats.indexOf(s)]} mine={s === mySeat} />
              </li>
            );
          })}
      </ul>

      <EmoteLive emotes={emotes} mySeat={mySeat ? room.seats.indexOf(mySeat) : -1} nameOf={(i) => seatName(room.seats[i])} />

      <section className={`glass hud-bottom${myTurn && !paused ? ' is-my-turn' : ''}`} aria-label="Điều khiển" ref={hud.bottomRef}>
        <div className="hud-line">
          <span
            className="dice"
            data-testid="dice-value"
            aria-label="Xúc xắc"
            style={lastRoll ? ({ '--seat-color': COLOR_VARS[lastRoll.color] } as CSSProperties) : undefined}
          >
            {lastRoll?.dice ?? '–'}
          </span>
          <div className="turn-info">
            {room.settings.quick && (
              <span className="badge badge-quick" data-testid="quick-tag">
                Ván nhanh
              </span>
            )}
            <p
              className="turn-banner"
              data-testid="turn-banner"
              aria-live="polite"
              style={turnSeat && !finished ? ({ '--seat-color': COLOR_VARS[turnSeat.color] } as CSSProperties) : undefined}
            >
              {turnText}
            </p>
          </div>
          {seconds !== null && !finished && (
            <span className={`countdown${lowTime ? ' is-low' : ''}`} data-testid="countdown">
              <Icon name="timer" size="sm" />
              {seconds} giây
            </span>
          )}
          <RulesButton onClick={() => setRulesOpen(true)} />
        </div>

        {showKickHint && (
          <p className="need-kick" role="status" data-testid="need-kick-hint">
            <Icon name="lock" size="sm" />
            {NEED_KICK_HINT}
          </p>
        )}

        {mySeat?.auto && !finished && (
          <div className="autopilot-banner" role="status" data-testid="autopilot-banner">
            <span>Đang chơi tự động vì bạn không thao tác.</span>
            <button type="button" className="ui-btn ui-btn--primary" data-testid="autopilot-back" onClick={() => send({ t: 'back' })}>
              Tôi đã quay lại
            </button>
          </div>
        )}

        {actionError && (
          <p className="form-error" role="alert" data-testid="action-error">
            {actionError}
          </p>
        )}

        <div className="hud-actions">
          {canRoll && (
            <button type="button" className="ui-btn ui-btn--hero btn-roll" data-testid="roll-button" onClick={() => send({ t: 'roll' })}>
              <Icon name="dice" size="lg" />
              {shake.enabled ? 'Đổ xúc xắc (hoặc lắc máy)' : 'Đổ xúc xắc'}
            </button>
          )}
          {canRoll && shake.supported && !shake.enabled && (
            <button type="button" className="ui-btn ui-btn--secondary" data-testid="enable-shake" onClick={() => shake.setEnabled(true)}>
              <Icon name="shake" />
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
                className="ui-btn ui-btn--primary btn-move"
                data-testid={`move-button-${horse}`}
                onClick={() => send({ t: 'move', horse })}
              >
                {describeMove(game, horse, turnNames)}
              </button>
            ))}
          <span className="hud-tools">
            <EmotePicker send={send} offline={offline} />
            <button type="button" className="ui-btn ui-btn--icon" aria-label="Menu" data-testid="match-menu-button" onClick={() => setMenuOpen(true)}>
              <Icon name="menu" />
            </button>
            <button type="button" className="ui-btn ui-btn--icon btn-leave" aria-label="Rời phòng" data-testid="leave-room" onClick={() => setConfirmLeave(true)}>
              <Icon name="leave" />
            </button>
          </span>
        </div>
      </section>

      {paused && !finished && (
        <div className="glass pause-banner" role="status" data-testid="pause-banner">
          <Icon name="pause" size="xl" />
          <strong>Chủ phòng đã tạm dừng ván đấu</strong>
          {isHost && (
            <button type="button" className="ui-btn ui-btn--primary" data-testid="resume-button" onClick={() => send({ t: 'resume' })}>
              <Icon name="play" />
              Tiếp tục
            </button>
          )}
        </div>
      )}

      {menuOpen && (
        <Modal labelledBy="menu-title" testId="match-menu" className="match-menu" onClose={() => setMenuOpen(false)}>
          <h2 id="menu-title" className="ui-title dialog-title">
            Menu
          </h2>
          <div className="menu-settings">
            <SoundSwitches />
            {shake.supported && (
              <label className="sound-switch">
                <Icon name="shake" />
                <span>Lắc máy để đổ xúc xắc</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch-input"
                  data-testid="shake-toggle"
                  checked={shake.enabled}
                  onChange={(e) => shake.setEnabled(e.target.checked)}
                />
              </label>
            )}
          </div>
          <div className="dialog-actions">
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              data-testid="menu-rules"
              onClick={() => {
                setMenuOpen(false);
                setRulesOpen(true);
              }}
            >
              <Icon name="rules" />
              Luật chơi
            </button>
            {mySeat && (
              <button
                type="button"
                className="ui-btn ui-btn--secondary"
                data-testid="rename-horses"
                onClick={() => {
                  setMenuOpen(false);
                  setRenaming(true);
                }}
              >
                <Icon name="pencil" />
                Đặt tên quân
              </button>
            )}
            {isHost && !finished && (
              <button
                type="button"
                className="ui-btn ui-btn--secondary"
                data-testid={paused ? 'menu-resume' : 'pause-button'}
                onClick={() => {
                  send({ t: paused ? 'resume' : 'pause' });
                  setMenuOpen(false);
                }}
              >
                <Icon name={paused ? 'play' : 'pause'} />
                {paused ? 'Tiếp tục ván đấu' : 'Tạm dừng ván đấu'}
              </button>
            )}
            {isHost && !finished && (
              <button
                type="button"
                className="ui-btn ui-btn--danger"
                data-testid="close-room"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmClose(true);
                }}
              >
                <Icon name="close" />
                Đóng phòng
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--primary" data-testid="menu-close" data-autofocus onClick={() => setMenuOpen(false)}>
              Đóng
            </button>
          </div>
        </Modal>
      )}

      {rulesOpen && <RulesSheet settings={room.settings} secondsLeft={myTurn && !finished ? seconds : null} onClose={() => setRulesOpen(false)} />}

      {introOpen && !finished && (
        <QuickIntroCard
          onClose={() => {
            quickIntro.markSeen();
            setIntroOpen(false);
          }}
        />
      )}

      {renaming && mySeat && (
        <HorseNamesDialog color={mySeat.color} names={mySeat.horseNames} send={send} onClose={() => setRenaming(false)} />
      )}

      {confirmClose && !finished && (
        <Modal labelledBy="close-title" testId="close-dialog" onClose={() => setConfirmClose(false)}>
          <h2 id="close-title" className="ui-title dialog-title">
            Đóng phòng?
          </h2>
          <p className="ui-muted">Ván đấu sẽ bị huỷ và mọi người sẽ rời phòng.</p>
          <div className="dialog-actions">
            <button type="button" className="ui-btn ui-btn--danger" data-testid="close-confirm" onClick={closeRoom}>
              <Icon name="close" />
              Đóng phòng
            </button>
            <button type="button" className="ui-btn ui-btn--secondary" data-testid="close-cancel" data-autofocus onClick={() => setConfirmClose(false)}>
              Huỷ
            </button>
          </div>
        </Modal>
      )}

      {confirmLeave && !finished && (
        <Modal labelledBy="leave-title" testId="leave-dialog" onClose={() => setConfirmLeave(false)}>
          <h2 id="leave-title" className="ui-title dialog-title">
            Rời phòng?
          </h2>
          <p className="ui-muted">Máy sẽ chơi thay bạn đến hết ván.</p>
          <div className="dialog-actions">
            <button type="button" className="ui-btn ui-btn--primary" data-testid="leave-confirm" onClick={leave}>
              <Icon name="leave" />
              Rời phòng
            </button>
            <button type="button" className="ui-btn ui-btn--secondary" data-testid="leave-cancel" data-autofocus onClick={() => setConfirmLeave(false)}>
              Ở lại
            </button>
          </div>
        </Modal>
      )}

      {finished && (
        <Modal labelledBy="win-title" testId="win-dialog" className="win-dialog">
          <span
            className="win-emblem"
            style={winnerSeat ? ({ '--seat-color': COLOR_VARS[winnerSeat.color] } as CSSProperties) : undefined}
          >
            <Icon name="win" size="xl" />
          </span>
          <h2 id="win-title" className="ui-title dialog-title win-title" data-testid="win-title">
            {seatName(winnerSeat)} thắng!
          </h2>
          {quickGame && <p data-testid="win-condition">{QUICK_WIN_TEXT}</p>}
          <div className="dialog-actions">
            {isHost ? (
              <button type="button" className="ui-btn ui-btn--hero" data-testid="rematch-button" data-autofocus onClick={() => send({ t: 'rematch' })}>
                <Icon name="dice" size="lg" />
                Chơi lại
              </button>
            ) : (
              <p className="ui-muted await-host" data-testid="await-host">
                Chờ chủ phòng
              </p>
            )}
            <button type="button" className="ui-btn ui-btn--secondary" data-testid="to-lobby" onClick={leave}>
              <Icon name="back" />
              Về sảnh
            </button>
          </div>
          {offerSave && !saveDismissed && (
            <SaveAccountBlock returnTo={`/r/${room.code}`} onDismiss={() => setSaveDismissed(true)} />
          )}
        </Modal>
      )}
    </div>
  );
}
