import { Icon } from '../ui/Icon';
import { motionSetting, useMotionLevel, type MotionLevel } from '../scene/motion/motion-setting';

const MOTION_LEVELS: [MotionLevel, string][] = [
  ['full', 'Đầy đủ'],
  ['reduced', 'Giảm'],
];

/**
 * "Hoạt cảnh: Đầy đủ / Giảm": each player's own choice, kept in this browser; not a room setting.
 * Toggle buttons, not a select or radios: the waiting room shows it next to the host's room
 * settings, and a guest's panel has none. `menu` lays it out like the match menu's sound switches.
 */
export function MotionLevelControl({ variant = 'settings' }: { variant?: 'settings' | 'menu' }) {
  const motion = useMotionLevel();
  const menu = variant === 'menu';
  return (
    <div
      className={menu ? 'sound-switch motion-switch' : 'setting-row'}
      style={menu ? undefined : { flexWrap: 'wrap' }}
      role="group"
      aria-labelledby={`motion-level-label-${variant}`}
      data-testid="motion-level"
      data-level={motion}
    >
      {menu && <Icon name="play" />}
      <span
        id={`motion-level-label-${variant}`}
        className={menu ? undefined : 'setting-label'}
        style={menu ? undefined : { whiteSpace: 'nowrap' }}
      >
        {!menu && <Icon name="play" size="sm" />}
        Hoạt cảnh
      </span>
      <span className="motion-level-pills" style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {MOTION_LEVELS.map(([level, text]) => (
          <button
            key={level}
            type="button"
            className="ui-pill"
            style={{ whiteSpace: 'nowrap' }}
            data-testid={`motion-level-${level}`}
            aria-pressed={motion === level}
            onClick={() => motionSetting.setLevel(level)}
          >
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}
