import { useState } from 'react';
import { DICE_SHAPING } from '../../../shared/experiments';
import {
  TURN_SECONDS_OPTIONS,
  GAME_MINUTES_OPTIONS,
  type RoomClientMessage,
  type RoomSettings,
  type RoomSnapshot,
  type TurnSeconds,
} from '../../../shared/protocol';
import { useT, type TKey } from '../i18n';
import { Icon } from '../ui/Icon';
import { RulesSheet } from './RulesSheet';
import { nextSettings } from './settings';
import { MotionLevelControl } from './MotionLevelControl';
import { CpuLevelControl } from './CpuLevelControl';

const MODES: readonly { quick: boolean; label: TKey; testId: string }[] = [
  { quick: false, label: 'set.modeBasic', testId: 'mode-basic' },
  { quick: true, label: 'set.modeQuick', testId: 'mode-quick' },
];

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
  const t = useT();
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
        {t('set.title')}
      </h2>

      <CpuLevelControl room={room} isHost={isHost} offline={offline} send={send} />

      <div className="setting-block" data-testid="game-time">
        {isHost ? (
          <>
            <span className="setting-label pace-title">{t('time.title')}</span>
            <div className="setting-pills" role="radiogroup" aria-label={t('time.groupLabel')}>
              {GAME_MINUTES_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={settings.gameMinutes === minutes}
                  className="ui-pill setting-pill"
                  data-testid={`game-time-${minutes}`}
                  aria-label={minutes === 0 ? t('time.infinite') : t('time.minutes', { n: minutes })}
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
            <span className="setting-label pace-title">{t('time.title')}</span>
            <strong className="setting-value" data-testid="game-time-label">
              {settings.gameMinutes === 0 ? '∞' : `${settings.gameMinutes}'`}
            </strong>
          </p>
        )}
      </div>

      <div className="setting-row turn-time-row">
        <label htmlFor="turn-seconds" className="setting-label">
          <Icon name="timer" size="sm" />
          {t('set.turnTime')}
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
                {t('set.seconds', { n: s })}
              </option>
            ))}
          </select>
        ) : (
          <strong className="setting-value" data-testid="turn-seconds">
            {t('set.seconds', { n: settings.turnSeconds })}
          </strong>
        )}
      </div>

      <div className="setting-block" data-testid="mode">
        {isHost ? (
          <>
            <span id="mode-title" className="setting-label pace-title">
              {t('set.mode')}
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
                  {t(label)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="setting-row">
            <span className="setting-label pace-title">{t('set.mode')}</span>
            <strong className="setting-value" data-testid="mode-label">
              {settings.quick ? t('set.modeQuick') : t('set.modeBasic')}
            </strong>
          </p>
        )}
        <button type="button" className="link-button mode-rules" data-testid="mode-rules" onClick={() => setRulesOpen(true)}>
          {t('set.viewRules')}
        </button>
      </div>

      {/* Hidden while the dice experiment replaces this rule (shared/experiments.ts). */}
      {!DICE_SHAPING && (
        <div className="setting-block" data-testid="house-rules">
          <span className="setting-label pace-title">{t('set.houseRules')}</span>
          <label className="room-switch">
            <span>{t('rules.tripleForfeitLabel')}</span>
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
          <p className="ui-muted setting-help">{t('rules.tripleForfeit')}</p>
        </div>
      )}

      <div className="setting-block">
        <label className="room-switch">
          <span>{t('set.autoRoll')}</span>
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
        <p className="ui-muted setting-help">{t('set.autoRollHelp')}</p>
      </div>

      <MotionLevelControl />

      {rulesOpen && <RulesSheet settings={settings} secondsLeft={null} onClose={() => setRulesOpen(false)} />}
    </section>
  );
}
