import type { RoomClientMessage, RoomSnapshot } from '../../../shared/protocol';
import { CPU_LEVELS, CPU_LEVEL_LABELS, cpuLevelOf } from './cpu-levels';

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
  const level = cpuLevelOf(room);
  if (!isHost) {
    return (
      <p className="cpu-level" data-testid="cpu-level">
        Độ khó máy: <strong data-testid="cpu-level-label">{CPU_LEVEL_LABELS[level]}</strong>
      </p>
    );
  }
  return (
    <div className="cpu-level" data-testid="cpu-level">
      <span id="cpu-level-title">Độ khó máy</span>
      <div className="cpu-level-options" role="radiogroup" aria-label="Độ khó máy">
        {CPU_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={level === l}
            className={`btn cpu-level-option ${level === l ? 'btn-primary' : 'btn-secondary'}`}
            data-testid={`cpu-level-${l}`}
            disabled={offline}
            onClick={() => level !== l && send({ t: 'cpuLevel', level: l })}
          >
            {CPU_LEVEL_LABELS[l]}
          </button>
        ))}
      </div>
      <p className="muted cpu-level-help">Áp dụng cho mọi máy trong phòng, kể cả máy chơi thay người rời phòng.</p>
    </div>
  );
}
