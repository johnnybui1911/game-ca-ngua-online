import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { isLocked } from '../../../shared/game/engine';
import { longestBatchSeconds, paceTimings } from '../../../shared/game/pace';
import { HORSES_PER_COLOR, POS_GATE, type Color, type GameState } from '../../../shared/game/types';
import { LOCKED_LABEL, NEED_KICK_HINT, QUICK_WIN_TEXT, UNLOCKED_LABEL } from '../../../shared/rules-text';
import { inviteLink, reportInviteShared } from '../analytics';
import { SaveAccountBlock } from '../auth/SaveAccountBlock';
import { useSession } from '../auth/session-context';
import type { RoomClientMessage, RoomSnapshot, Seat } from '../../../shared/protocol';
import { sound } from '../audio/sound';
import { CreatorBadge } from '../chrome/CreatorBadge';
import { FeedbackModal } from '../chrome/FeedbackModal';
import { SoundSwitches, useMusic } from '../audio/SoundControls';
import { useLobby } from '../lobby/LobbyProvider';
import { unconsumed, type StateBatch } from './batches';
import { secondsLeft } from './countdown';
import { lastRollAfter, type LastRoll } from './last-roll';
import { needKickAfter } from './need-kick';
import { FORFEIT_TOAST_MS, FORFEIT_TOAST_TEXT, forfeitsAfter } from './forfeit-toast';
import { takeoversAfter } from './takeover-notice';
import { QuickIntroCard } from './QuickIntroCard';
import { quickIntro } from './quick-intro';
import { COLOR_NAMES, COLOR_VARS } from './colors';
import { CPU_LEVEL_LABELS, cpuLevelOf } from './cpu-levels';
import { EmoteBubble, EmoteLive } from './EmoteBubble';
import { EmotePicker } from './EmotePicker';
import type { EmoteBySeat } from './emote-feed';
import { HorseNamesDialog } from './HorseNamesDialog';
import { HostLeaveDialog } from './HostLeaveDialog';
import { Modal } from './Modal';
import { MotionLevelControl } from './MotionLevelControl';
import { RulesButton, RulesSheet } from './RulesSheet';
import { DieFace } from './DieFace';
import { describeMove } from './move-text';
import { pendingAfterArrival, pendingAfterExpiry, pendingAfterReport, playsOnBoard, reportAfterExpiry, rollHeld, type BoardReport, type Pending } from './board-wait';
import { useShakeToRoll } from './shake';
import { reserveInsets, type ReservedInsets } from '../scene/camera';
import { CELEBRATION_SECONDS } from '../scene/director';
import { Icon } from '../ui/Icon';

/** Seconds left on the local player's action at which the reminder sounds. */
const REMINDER_SECONDS = 10;
/** Added to the longest batch of the room's pace for how long a roll waits for the board, for a slow device. */
const BOARD_WAIT_MARGIN_SECONDS = 0.5;
/** Pause after the fireworks end before the win dialog appears. */
const WIN_DIALOG_HOLD_SECONDS = 1.5;
const WIN_DIALOG_DELAY_MS = Math.ceil((CELEBRATION_SECONDS + WIN_DIALOG_HOLD_SECONDS) * 1000);

/** The match page's view of the board: what the roll waits for, and the state the HUD may show. */
interface BoardView {
  /**
   * True while the roll waits for the board: from the first frame of the match until the board reports, then
   * while it animates what the server reported, for at most `maxWaitMs` per state: a slow device must not hold
   * the player up.
   */
  held: boolean;
  /**
   * The newest state the board has finished showing. A roll or move the server reports plays on the board
   * first, so the turn text, the roll button and the die read this, not the newest state, until it has played.
   */
  shown: { game: GameState | null; seq: number };
  /** The board is throwing a die whose result `shown` does not have yet. */
  rolling: boolean;
  /** The board's report of whether it is animating. */
  onBusyChange: (busy: boolean) => void;
}

function useBoardView(room: RoomSnapshot, batches: StateBatch[], maxWaitMs: number): BoardView {
  const seq = room.seq;
  const [report, setReport] = useState<BoardReport>(null);
  const [expiredAt, setExpiredAt] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  // A board that has never reported (no WebGL) has nothing to wait for.
  const [reported, setReported] = useState(false);
  const [arrivedSeq, setArrivedSeq] = useState(seq);
  const [shown, setShown] = useState({ game: room.game, seq });
  const waiting = report ?? true;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setExpiredAt(seq);
      setReport(reportAfterExpiry);
    }, maxWaitMs);
    return () => clearTimeout(timer);
  }, [waiting, seq, maxWaitMs]);
  const pendingSeq = pending?.seq;
  useEffect(() => {
    if (pendingSeq === undefined) return;
    const timer = setTimeout(() => setPending((p) => pendingAfterExpiry(p, pendingSeq)), maxWaitMs);
    return () => clearTimeout(timer);
  }, [pendingSeq, maxWaitMs]);
  const onBusyChange = useCallback((busy: boolean) => {
    setReported(true);
    setReport(busy);
    setPending((p) => pendingAfterReport(p, busy));
  }, []);

  // Decided while rendering, not in an effect: the board's report comes a render after the state, and a
  // frame of the new turn would show before it.
  let hold = pending !== null;
  if (seq !== arrivedSeq) {
    setArrivedSeq(seq);
    if (reported && unconsumed(batches, arrivedSeq).some((b) => playsOnBoard(b.events))) {
      setPending((p) => pendingAfterArrival(p, seq, report));
      hold = true;
    }
  }
  if (!hold && shown.seq !== seq) setShown({ game: room.game, seq });

  const rolling =
    pending !== null && batches.some((b) => b.room.seq > shown.seq && b.room.seq <= pending.seq && b.events.some((e) => e.type === 'rolled'));
  return { held: rollHeld(report, seq, expiredAt), shown, rolling, onBusyChange };
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

/**
 * Most recent die shown on screen, folded over every batch received, in order. Folded while rendering, so
 * the die changes in the same frame as the turn text beside it.
 */
function useLastRoll(batches: StateBatch[]): LastRoll | null {
  const [folded, setFolded] = useState<{ last: LastRoll | null; seq: number | null }>({ last: null, seq: null });
  if (unconsumed(batches, folded.seq).length > 0) {
    setFolded({ last: lastRollAfter(folded.last, batches, folded.seq), seq: batches[batches.length - 1]?.room.seq ?? folded.seq });
  }
  return folded.last;
}

/** Whether the local player's last roll was blocked only by their locked home column (quick match). */
function useNeedKick(batches: StateBatch[], color: Color | null): boolean {
  const [folded, setFolded] = useState<{ hint: boolean; seq: number | null }>({ hint: false, seq: null });
  if (unconsumed(batches, folded.seq).length > 0) {
    setFolded({ hint: needKickAfter(folded.hint, batches, folded.seq, color), seq: batches[batches.length - 1]?.room.seq ?? folded.seq });
  }
  return folded.hint;
}

/** Count of the local player's lost turns (three 1s or 6s in a row) while the toast announcing the newest one is up; null otherwise. */
function useForfeitToast(batches: StateBatch[], color: Color | null): number | null {
  const [folded, setFolded] = useState<{ count: number; seq: number | null }>({ count: 0, seq: null });
  if (unconsumed(batches, folded.seq).length > 0) {
    setFolded({ count: folded.count + forfeitsAfter(batches, folded.seq, color), seq: batches[batches.length - 1]?.room.seq ?? folded.seq });
  }
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (folded.count === 0) return;
    setShown(folded.count);
    const timer = window.setTimeout(() => setShown(null), FORFEIT_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [folded.count]);
  return shown;
}

/** A notice for every person who takes a CPU's seat while this page is open (not for the local player's own). */
function useTakeoverNotices(batches: StateBatch[], myId: string, notify: (text: string) => void) {
  const consumed = useRef<number | null>(null);
  useEffect(() => {
    const from = consumed.current;
    consumed.current = batches[batches.length - 1]?.room.seq ?? from;
    for (const text of takeoversAfter(batches, from, myId)) notify(text);
  }, [batches, myId, notify]);
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
  const [hostLeave, setHostLeave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Decided once per mount: the first quick match on a device explains itself, later ones do not.
  const [introOpen, setIntroOpen] = useState(
    () => room.settings.quick && room.game !== null && room.game.phase !== 'finished' && quickIntro.shouldShow(),
  );
  const { guest } = useSession();
  const { notify } = useLobby();
  useTakeoverNotices(batches, myId, notify);
  // Decided once per visit: stays on screen as a confirmation after the guest registers.
  const [offerSave] = useState(guest);
  const [saveDismissed, setSaveDismissed] = useState(false);
  // The server reports a CPU's roll and move together with the turn passing to us, and our own roll with
  // its result: the HUD, the roll button and the chime wait until the board has shown that.
  const { pace, quick } = room.settings;
  const maxBoardWaitMs = useMemo(() => Math.ceil((longestBatchSeconds(paceTimings(pace, quick)) + BOARD_WAIT_MARGIN_SECONDS) * 1000), [pace, quick]);
  const board = useBoardView(room, batches, maxBoardWaitMs);
  const game = board.shown.game ?? room.game;
  const shownBatches = useMemo(() => batches.filter((b) => b.room.seq <= board.shown.seq), [batches, board.shown.seq]);
  const lastRoll = useLastRoll(shownBatches);
  // The clock of an action starts once the board has shown what led to it; until then it reads the full time.
  const left = useCountdown(room.turnDeadline, clockOffset);
  const seconds = left === null ? null : Math.min(left, room.settings.turnSeconds);
  const hud = useHudInsets(room.game !== null);

  const mySeat = room.seats.find((s) => s.occupant?.kind === 'human' && s.occupant.user.id === myId);
  const myColor = mySeat?.color ?? null;
  const needKick = useNeedKick(shownBatches, myColor);
  const forfeitToast = useForfeitToast(shownBatches, myColor);
  const finished = game?.phase === 'finished';
  // The win dialog covers the board, so a win reached while watching waits out the celebration (plus a
  // beat to admire it). A match opened on an already finished game has no celebration: dialog at once.
  const [winDialogOpen, setWinDialogOpen] = useState(() => room.game?.phase === 'finished');
  useEffect(() => {
    if (!finished) {
      setWinDialogOpen(false);
      return;
    }
    const timer = window.setTimeout(() => setWinDialogOpen(true), WIN_DIALOG_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [finished]);
  const showWinDialog = finished && winDialogOpen;
  const paused = room.paused;
  const myTurn = game !== null && myColor !== null && game.turn === myColor && !finished;
  const canRoll = myTurn && !paused && game?.phase === 'roll' && !board.held;
  useMusic('game');
  useGameSounds(batches, myTurn && !paused && !board.held, seconds, room.turnDeadline);
  const dialogOpen = menuOpen || renaming || rulesOpen || confirmLeave || hostLeave || confirmClose || (introOpen && !finished);
  // Changes with every roll the server reports, so each roll chance allows one shake-roll.
  const lastRolledSeq = [...batches].reverse().find((b) => b.events.some((e) => e.type === 'rolled'))?.room.seq ?? null;
  const shake = useShakeToRoll(canRoll && !dialogOpen, lastRolledSeq, () => send({ t: 'roll' }));
  if (!game) return null;

  const turnSeat = room.seats.find((s) => s.color === game.turn);
  const isHost = room.hostId === myId;
  // In a room that allows it, a person who opens the link asks the host for a CPU seat.
  const canInvite = room.allowTakeover && !finished && room.seats.some((s) => s.occupant?.kind === 'cpu');
  const others = room.seats.flatMap((s) => (s.occupant?.kind === 'human' && s.occupant.user.id !== myId ? [s.occupant.user] : []));
  const startLeave = () => (isHost && others.length > 0 ? setHostLeave(true) : setConfirmLeave(true));
  const handover = (newHost: string) => {
    send({ t: 'leave', newHost });
    void navigate('/');
  };
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(room.code));
      notify('Đã sao chép link mời. Người vào sẽ chơi thay máy.');
      reportInviteShared();
    } catch {
      notify('Không sao chép được link mời.');
    }
  };
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
  // Whoever throws the die on the board now; else whoever threw the one the HUD shows.
  const dieColor = board.rolling ? game.turn : lastRoll?.color;
  const lowTime = seconds !== null && seconds <= REMINDER_SECONDS && myTurn && !paused;
  return (
    <div
      className="match"
      data-testid="hud"
      data-seq={board.shown.seq}
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
            onBusyChange={board.onBusyChange}
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
                  <Icon name={occ?.kind === 'cpu' ? 'bot' : 'knight'} size="sm" />
                  {occ?.kind === 'human' && occ.user.id === room.hostId && (
                    <span className="seat-crown" role="img" aria-label="Chủ phòng">
                      <Icon name="crown" size="sm" />
                    </span>
                  )}
                </span>
                <span className="hud-player-main">
                  <span className="hud-name">{seatName(s)}</span>
                  <span className="hud-badges">
                    {occ?.kind === 'cpu' && <span className="badge">Máy · {CPU_LEVEL_LABELS[cpuLevelOf(room)]}</span>}
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
        <CreatorBadge />
        {isHost && !finished && room.joinRequests.length > 0 && (
          <ul className="join-requests" aria-label="Người xin vào thay máy" data-testid="join-requests">
            {room.joinRequests.map((r) => (
              <li
                key={r.user.id}
                className="join-request"
                style={{ '--seat-color': COLOR_VARS[r.color] } as CSSProperties}
                data-testid={`join-request-${r.color}`}
              >
                <span className="seat-dot" aria-hidden="true">
                  <Icon name="knight" size="sm" />
                </span>
                <span className="join-request-text">
                  <strong>{r.user.displayName}</strong>
                  <span>xin vào thay {seatName(room.seats.find((s) => s.color === r.color))}</span>
                </span>
                <span className="join-request-actions">
                  <button type="button" className="ui-btn ui-btn--primary" data-testid={`join-approve-${r.color}`} onClick={() => send({ t: 'approveJoin', userId: r.user.id })}>
                    Duyệt
                  </button>
                  <button type="button" className="ui-btn ui-btn--secondary" data-testid={`join-reject-${r.color}`} onClick={() => send({ t: 'rejectJoin', userId: r.user.id })}>
                    Từ chối
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {forfeitToast !== null && !finished && (
          <p key={forfeitToast} className="forfeit-toast" role="status" data-testid="forfeit-toast">
            {FORFEIT_TOAST_TEXT}
          </p>
        )}
        <div className="hud-line">
          <DieFace value={board.rolling ? null : (lastRoll?.dice ?? null)} seatColor={dieColor === undefined ? undefined : COLOR_VARS[dieColor]} />
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
              <Icon name={shake.enabled ? 'shake' : 'dice'} size="lg" />
              {shake.enabled ? 'Lắc máy' : 'Đổ xúc xắc'}
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
            <button type="button" className="ui-btn ui-btn--icon btn-leave" aria-label="Rời phòng" data-testid="leave-room" onClick={startLeave}>
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
            <MotionLevelControl variant="menu" />
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
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              data-testid="menu-feedback"
              onClick={() => {
                setMenuOpen(false);
                setFeedbackOpen(true);
              }}
            >
              <Icon name="feedback" />
              Góp ý
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
            {canInvite && (
              <button
                type="button"
                className="ui-btn ui-btn--secondary"
                data-testid="menu-invite"
                onClick={() => {
                  setMenuOpen(false);
                  void copyInvite();
                }}
              >
                <Icon name="share" />
                Mời người vào thay máy
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

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}

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

      {hostLeave && !finished && (
        <HostLeaveDialog
          others={others}
          seatNote="Máy sẽ chơi thay bạn đến hết ván."
          onHandover={handover}
          onCloseRoom={closeRoom}
          onCancel={() => setHostLeave(false)}
        />
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

      {showWinDialog && (
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
