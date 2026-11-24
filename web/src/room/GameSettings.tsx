import { useState } from 'react';
import { DICE_SHAPING } from '../../../shared/experiments';
import { TRIPLE_BONUS_FORFEIT_LABEL, TRIPLE_BONUS_FORFEIT_RULE } from '../../../shared/rules-text';
import {
  TURN_SECONDS_OPTIONS,
  GAME_MINUTES_OPTIONS,
  type RoomClientMessage,
  type RoomSettings,
  type RoomSnapshot,
  type TurnSeconds,
} from '../../../shared/protocol';
import { Icon } from '../ui/Icon';
import { RulesSheet } from './RulesSheet';
import { nextSettings } from './settings';
import { MotionLevelControl } from './MotionLevelControl';
import { CpuLevelControl } from './CpuLevelControl';

const MODES = [
  { quick: false, label: 'Cơ Bản', testId: 'mode-basic' },
  { quick: true, label: 'Ván Nhanh', testId: 'mode-quick' },
] as const;

interface Props {
  room: RoomSnapshot;
  isHost: boolean;
  /** The socket is not open. */
  offline: boolean;
  /** The last error the server reported for an action, if any; it is shown by the parent. */
  actionError: string | null;
  send: (msg: RoomClientMessage) => void;
}

/**
 * Waiting room: the host picks game and turn times, Ván nhanh, house rules and auto-roll; everyone else
 * reads the choice. Each setting is one `.setting-row` or `.setting-block` in the list, so a new one is a new block.
 */
export function GameSettings({ room, isHost, offline, actionError, send }: Props) {
  const settings = room.settings;
  const [rulesOpen, setRulesOpen] = useState(false);
  // Every accepted change makes the room broadcast a new snapshot; a rejected one reports an error.
  const [sentAtSeq, setSentAtSeq] = useState<number | null>(null);
  const waiting = sentAtSeq === room.seq && !actionError;
  const locked = offline || waiting;

  const change = (patch: Partial<RoomSettings>) => {
    setSentAtSeq(room.seq);
    send({ t: 'settings', settings: nextSettings(settings, patch) });
  };

  return (
    <section className="game-settings" aria-labelledby="game-settings-title" data-testid="game-settings">
      <h2 id="game-settings-title" className="ui-eyebrow">
        <Icon name="settings" size="sm" />
        Cài đặt ván
      </h2>

      <CpuLevelControl room={room} isHost={isHost} offline={offline} send={send} />

      <div className="setting-block" data-testid="game-time">
        {isHost ? (
          <>
            <span className="setting-label pace-title">Thời gian</span>
            <div className="setting-pills" role="radiogroup" aria-label="Thời gian ván">
              {GAME_MINUTES_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={settings.gameMinutes === minutes}
                  className="ui-pill setting-pill"
                  data-testid={`game-time-${minutes}`}
                  aria-label={minutes === 0 ? 'Vô cực' : `${minutes} phút`}
                  disabled={locked}
                  onClick={() => settings.gameMinutes !== minutes && change({ gameMinutes: minutes })}
                >
                  {minutes === 0 ? '∞' : `${minutes}'`}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="setting-row">
            <span className="setting-label pace-title">Thời gian</span>
            <strong className="setting-value" data-testid="game-time-label">
              {settings.gameMinutes === 0 ? '∞' : `${settings.gameMinutes}'`}
            </strong>
          </p>
        )}
      </div>

      <div className="setting-row turn-time-row">
        <label htmlFor="turn-seconds" className="setting-label">
          <Icon name="timer" size="sm" />
          Thời gian mỗi lượt
        </label>
        {isHost ? (
          <select
            id="turn-seconds"
            className="glass-input glass-select"
            data-testid="turn-seconds"
            value={settings.turnSeconds}
            disabled={locked}
            onChange={(e) => change({ turnSeconds: Number(e.target.value) as TurnSeconds })}
          >
            {TURN_SECONDS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} giây
              </option>
            ))}
          </select>
        ) : (
          <strong className="setting-value" data-testid="turn-seconds">
            {settings.turnSeconds} giây
          </strong>
        )}
      </div>

      <div className="setting-block" data-testid="mode">
        {isHost ? (
          <>
            <span id="mode-title" className="setting-label pace-title">
              Mode
            </span>
            <div className="setting-pills" role="radiogroup" aria-labelledby="mode-title">
              {MODES.map(({ quick, label, testId }) => (
                <button
                  key={testId}
                  type="button"
                  role="radio"
                  aria-checked={settings.quick === quick}
                  className="ui-pill setting-pill"
                  data-testid={testId}
                  disabled={locked}
                  onClick={() => settings.quick !== quick && change({ quick })}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="setting-row">
            <span className="setting-label pace-title">Mode</span>
            <strong className="setting-value" data-testid="mode-label">
              {settings.quick ? 'Ván Nhanh' : 'Cơ Bản'}
            </strong>
          </p>
        )}
        <button type="button" className="link-button mode-rules" data-testid="mode-rules" onClick={() => setRulesOpen(true)}>
          Xem luật
        </button>
      </div>

      {/* Hidden while the dice experiment replaces this rule (shared/experiments.ts). */}
      {!DICE_SHAPING && (
        <div className="setting-block" data-testid="house-rules">
          <span className="setting-label pace-title">Luật</span>
          <label className="room-switch">
            <span>{TRIPLE_BONUS_FORFEIT_LABEL}</span>
            <input
              type="checkbox"
              role="switch"
              className="switch-input"
              data-testid="triple-bonus-forfeit-toggle"
              checked={settings.rules.tripleBonusForfeit}
              disabled={!isHost || locked}
              onChange={(e) => change({ rules: { ...settings.rules, tripleBonusForfeit: e.target.checked } })}
            />
          </label>
          <p className="ui-muted setting-help">{TRIPLE_BONUS_FORFEIT_RULE}</p>
        </div>
      )}

      <div className="setting-block">
        <label className="room-switch">
          <span>Tự đổ xúc xắc</span>
          <input
            type="checkbox"
            role="switch"
            className="switch-input"
            data-testid="auto-roll-toggle"
            checked={settings.autoRoll}
            disabled={!isHost || locked}
            onChange={(e) => change({ autoRoll: e.target.checked })}
          />
        </label>
        <p className="ui-muted setting-help">Máy đổ giúp sau 1,5 giây.</p>
      </div>

      <MotionLevelControl />

      {rulesOpen && <RulesSheet settings={settings} secondsLeft={null} onClose={() => setRulesOpen(false)} />}
    </section>
  );
}
