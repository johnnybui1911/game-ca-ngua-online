import type { CSSProperties } from 'react';
import type { Color } from '../../../shared/game/types';
import type { RoomClientMessage, RoomSnapshot } from '../../../shared/protocol';
import { COLOR_NAMES, COLOR_VARS } from './colors';

/** Who holds `color` in the room, for a swatch that is not free. */
function holderOf(room: RoomSnapshot, color: Color): string {
  const occ = room.seats.find((s) => s.color === color)?.occupant;
  if (!occ) return '';
  return occ.kind === 'cpu' ? occ.name : occ.user.displayName;
}

/** Waiting room: the colours of the room as swatches; mine is checked, free ones can be taken, held ones are disabled. */
export function ColorPicker({
  room,
  myColor,
  offline,
  send,
}: {
  room: RoomSnapshot;
  myColor: Color;
  offline: boolean;
  send: (msg: RoomClientMessage) => void;
}) {
  return (
    <div className="color-picker" data-testid="color-picker">
      <span id="color-picker-title" className="ui-eyebrow">
        Màu của bạn
      </span>
      <div className="color-picker-swatches" role="radiogroup" aria-labelledby="color-picker-title">
        {room.seats.map((seat) => {
          const mine = seat.color === myColor;
          const free = seat.occupant === null;
          const holder = holderOf(room, seat.color);
          const label = mine ? `${COLOR_NAMES[seat.color]} (màu của bạn)` : free ? `Đổi sang màu ${COLOR_NAMES[seat.color]}` : `Màu ${COLOR_NAMES[seat.color]} đã có ${holder}`;
          return (
            <button
              key={seat.color}
              type="button"
              role="radio"
              aria-checked={mine}
              aria-label={label}
              title={label}
              className={`color-swatch${mine ? ' color-swatch-mine' : ''}`}
              data-testid={`color-${seat.color}`}
              style={{ '--swatch-color': COLOR_VARS[seat.color] } as CSSProperties}
              disabled={offline || (!mine && !free)}
              onClick={() => !mine && send({ t: 'color', color: seat.color })}
            >
              <span className="color-swatch-name">{COLOR_NAMES[seat.color]}</span>
            </button>
          );
        })}
      </div>
      <p className="ui-muted setting-help">Chỉ chọn được màu còn trống (chưa có người hoặc máy).</p>
    </div>
  );
}
