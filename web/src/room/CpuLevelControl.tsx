import type { RoomClientMessage, RoomSnapshot } from '../../../shared/protocol';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { CPU_LEVELS, cpuLevelLabel, cpuLevelOf } from './cpu-levels';

/** Waiting room: the host picks how well the room's CPUs play; everyone else just reads it. */
export function CpuLevelControl({
  room,
  isHost,
  offline,
  send,
}: {
  room: RoomSnapshot;
  isHost: boolean;
  offline: boolean;
  send: (msg: RoomClientMessage) => void;
}) {
  const t = useT();
  const level = cpuLevelOf(room);
  if (!isHost) {
    return (
      <p className="cpu-level setting-row" data-testid="cpu-level">
        <span className="setting-label">
          <Icon name="bot" size="sm" />
          {t('cpu.levelTitle')}
        </span>
        <strong className="setting-value" data-testid="cpu-level-label">
          {cpuLevelLabel(t, level)}
        </strong>
      </p>
    );
  }
  return (
    <div className="cpu-level" data-testid="cpu-level">
      <span id="cpu-level-title" className="setting-label">
        <Icon name="bot" size="sm" />
        {t('cpu.levelTitle')}
      </span>
      <div className="setting-pills" role="radiogroup" aria-label={t('cpu.levelTitle')}>
        {CPU_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={level === l}
            className="ui-pill setting-pill"
            data-testid={`cpu-level-${l}`}
            disabled={offline}
            onClick={() => level !== l && send({ t: 'cpuLevel', level: l })}
          >
            {cpuLevelLabel(t, l)}
          </button>
        ))}
      </div>
      <p className="ui-muted setting-help">{t('cpu.levelHelp')}</p>
    </div>
  );
}
