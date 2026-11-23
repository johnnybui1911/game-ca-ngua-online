import { useState } from 'react';
import { PACE_NAMES } from '../../../shared/game/pace';
import { CLASSIC_MODE_SUMMARY, QUICK_MODE_SUMMARY, TRIPLE_BONUS_FORFEIT_LABEL, TRIPLE_BONUS_FORFEIT_RULE } from '../../../shared/rules-text';
import {
  TURN_SECONDS_OPTIONS,
  type RoomClientMessage,
  type RoomSettings,
  type RoomSnapshot,
  type TurnSeconds,
} from '../../../shared/protocol';
import { Icon } from '../ui/Icon';
import { RulesSheet } from './RulesSheet';
import { PACE_LABELS, paceEstimateText } from './paces';
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
 * Waiting room: the host picks turn time, Ván nhanh, the house rules (Luật), Nhịp ván and auto-roll; everyone else
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

  const summary = settings.quick ? QUICK_MODE_SUMMARY : CLASSIC_MODE_SUMMARY;

  return (
    <section className="game-settings" aria-labelledby="game-settings-title" data-testid="game-settings">
      <h2 id="game-settings-title" className="ui-eyebrow">
        <Icon name="settings" size="sm" />
        Cài đặt ván
      </h2>

      <CpuLevelControl room={room} isHost={isHost} offline={offline} send={send} />

      <div className="setting-block" data-testid="pace">
        {isHost ? (
          <>
            <span className="setting-label pace-title">Nhịp ván</span>
            <div className="setting-pills" role="radiogroup" aria-label="Nhịp ván">
              {PACE_NAMES.map((pace) => (
                <button
                  key={pace}
                  type="button"
                  role="radio"
                  aria-checked={settings.pace === pace}
                  className="ui-pill setting-pill"
                  data-testid={`pace-${pace}`}
                  disabled={locked}
                  onClick={() => settings.pace !== pace && change({ pace })}
                >
                  {PACE_LABELS[pace]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="setting-row">
            <span className="setting-label pace-title">Nhịp ván</span>
            <strong className="setting-value" data-testid="pace-label">
              {PACE_LABELS[settings.pace]}
            </strong>
          </p>
        )}
        <p className="ui-muted setting-help" data-testid="pace-estimate">
          {paceEstimateText(settings.pace, room.seats.length, settings.quick)}
        </p>
      </div>

      <div className="setting-row">
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
        <p className="ui-muted setting-help" data-testid="mode-summary">
          {summary}{' '}
          <button type="button" className="link-button" data-testid="mode-rules" onClick={() => setRulesOpen(true)}>
            Xem luật
          </button>
        </p>
      </div>

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
