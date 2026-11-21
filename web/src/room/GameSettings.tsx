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

interface Props {
  room: RoomSnapshot;
  isHost: boolean;
  /** The socket is not open. */
  offline: boolean;
  /** The last error the server reported for an action, if any; it is shown by the parent. */
  actionError: string | null;
  send: (msg: RoomClientMessage) => void;
}

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

      {rulesOpen && <RulesSheet settings={settings} secondsLeft={null} onClose={() => setRulesOpen(false)} />}
    </section>
  );
}
