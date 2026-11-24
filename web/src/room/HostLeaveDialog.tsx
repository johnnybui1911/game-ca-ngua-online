import { useState } from 'react';
import type { PublicUser } from '../../../shared/protocol';
import { Icon } from '../ui/Icon';
import { Modal } from './Modal';

interface Props {
  /** The other people seated in the room; at least one. */
  others: PublicUser[];
  /** What happens to the host's own seat, said under the title. */
  seatNote: string;
  onHandover: (newHostId: string) => void;
  onCloseRoom: () => void;
  onCancel: () => void;
}

/** A host leaving a room that still has people in it: hand the room to one of them, or end it for everyone. */
export function HostLeaveDialog({ others, seatNote, onHandover, onCloseRoom, onCancel }: Props) {
  const [heir, setHeir] = useState(others[0]?.id ?? '');
  return (
    <Modal labelledBy="host-leave-title" testId="host-leave-dialog" onClose={onCancel}>
      <h2 id="host-leave-title" className="ui-title dialog-title">
        Rời phòng?
      </h2>
      <p className="ui-muted">{seatNote} Chọn người làm chủ phòng thay bạn, hoặc kết thúc phòng cho tất cả.</p>
      <fieldset className="host-leave-list">
        <legend className="ui-eyebrow">Giao chủ phòng cho</legend>
        {others.map((u) => (
          <label key={u.id} className="ui-pill">
            <input
              type="radio"
              name="new-host"
              data-testid={`host-leave-heir-${u.id}`}
              checked={heir === u.id}
              onChange={() => setHeir(u.id)}
            />
            {u.displayName}
          </label>
        ))}
      </fieldset>
      <div className="dialog-actions">
        <button type="button" className="ui-btn ui-btn--primary" data-testid="host-leave-handover" disabled={!heir} onClick={() => onHandover(heir)}>
          <Icon name="leave" />
          Giao chủ phòng và rời
        </button>
        <button type="button" className="ui-btn ui-btn--danger" data-testid="host-leave-close" onClick={onCloseRoom}>
          <Icon name="close" />
          Kết thúc phòng
        </button>
        <button type="button" className="ui-btn ui-btn--secondary" data-testid="host-leave-cancel" data-autofocus onClick={onCancel}>
          Ở lại
        </button>
      </div>
    </Modal>
  );
}
