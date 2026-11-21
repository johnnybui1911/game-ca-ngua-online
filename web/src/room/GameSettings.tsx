import { useState } from 'react';
import { CLASSIC_MODE_SUMMARY, QUICK_MODE_SUMMARY } from '../../../shared/rules-text';
import {
  TURN_SECONDS_OPTIONS,
  type RoomClientMessage,
  type RoomSettings,
  type RoomSnapshot,
  type TurnSeconds,
} from '../../../shared/protocol';
import { RulesSheet } from './RulesSheet';
import { nextSettings } from './settings';
import { motionSetting, useMotionLevel, type MotionLevel } from '../scene/motion/motion-setting';

interface Props {
  room: RoomSnapshot;
  isHost: boolean;
  /** The socket is not open. */
  offline: boolean;
  /** The last error the server reported for an action, if any; it is shown by the parent. */
  actionError: string | null;
  send: (msg: RoomClientMessage) => void;
}

const MOTION_LEVELS: [MotionLevel, string][] = [
  ['full', 'Đầy đủ'],
  ['reduced', 'Giảm'],
];

/** Waiting room: the host picks turn time, Ván nhanh and auto-roll; everyone else reads the choice. */
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
  // Each player's own choice, kept in this browser; not a room setting.
  const motion = useMotionLevel();

  return (
    <section className="game-settings" aria-labelledby="game-settings-title" data-testid="game-settings">
      <h2 id="game-settings-title">Cài đặt ván</h2>

      <div className="setting-row">
        <label htmlFor="turn-seconds">Thời gian mỗi lượt</label>
        {isHost ? (
          <select
            id="turn-seconds"
            className="setting-select"
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
          <strong data-testid="turn-seconds">{settings.turnSeconds} giây</strong>
        )}
      </div>

      <div className="setting-block">
        <label className="setting-switch">
          <input
            type="checkbox"
            data-testid="quick-toggle"
            checked={settings.quick}
            disabled={!isHost || locked}
            onChange={(e) => change({ quick: e.target.checked })}
          />
          <span>Ván nhanh</span>
        </label>
        <p className="muted setting-help" data-testid="mode-summary">
          {summary}{' '}
          <button type="button" className="link-button" data-testid="mode-rules" onClick={() => setRulesOpen(true)}>
            Xem luật
          </button>
        </p>
      </div>

      <div className="setting-block">
        <label className="setting-switch">
          <input
            type="checkbox"
            data-testid="auto-roll-toggle"
            checked={settings.autoRoll}
            disabled={!isHost || locked}
            onChange={(e) => change({ autoRoll: e.target.checked })}
          />
          <span>Tự đổ xúc xắc</span>
        </label>
        <p className="muted setting-help">Máy đổ giúp sau 1,5 giây.</p>
      </div>

      {/* Buttons, not a select or radios: those are the host's room settings here, and a guest's panel has none. */}
      <div className="setting-row" role="group" aria-labelledby="motion-level-label" data-testid="motion-level" data-level={motion}>
        <span id="motion-level-label" style={{ whiteSpace: 'nowrap' }}>
          Hoạt cảnh
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          {MOTION_LEVELS.map(([level, text]) => (
            <button
              key={level}
              type="button"
              className={motion === level ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ minHeight: 48, padding: '0 14px', whiteSpace: 'nowrap' }}
              data-testid={`motion-level-${level}`}
              aria-pressed={motion === level}
              onClick={() => motionSetting.setLevel(level)}
            >
              {text}
            </button>
          ))}
        </span>
      </div>

      {rulesOpen && <RulesSheet settings={settings} secondsLeft={null} onClose={() => setRulesOpen(false)} />}
    </section>
  );
}
