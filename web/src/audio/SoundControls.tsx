import { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { sound, type Track } from './sound';
import './sound.css';

/** Loops `track` while the calling screen is shown; the next screen's track replaces it. */
export function useMusic(track: Track): void {
  useEffect(() => {
    sound.setTrack(track);
  }, [track]);
}

/** The two on/off switches (music, effects), stored in this browser. */
export function SoundSwitches() {
  const t = useT();
  const settings = useSyncExternalStore(sound.subscribe, sound.getSettings);
  return (
    <div className="sound-switches" data-testid="sound-switches">
      <label className="sound-switch">
        <Icon name="music" />
        <span>{t('sound.music')}</span>
        <input
          type="checkbox"
          role="switch"
          className="switch-input"
          data-testid="sound-music"
          checked={settings.music}
          onChange={(e) => sound.setSettings({ ...settings, music: e.target.checked })}
        />
      </label>
      <label className="sound-switch">
        <Icon name="sound-on" />
        <span>{t('sound.effects')}</span>
        <input
          type="checkbox"
          role="switch"
          className="switch-input"
          data-testid="sound-effects"
          checked={settings.effects}
          onChange={(e) => sound.setSettings({ ...settings, effects: e.target.checked })}
        />
      </label>
    </div>
  );
}

/** Speaker button that opens the switches; the app shell docks it in its top-right corner. */
export function SoundButton() {
  const t = useT();
  const settings = useSyncExternalStore(sound.subscribe, sound.getSettings);
  const [open, setOpen] = useState(false);
  const muted = !settings.music && !settings.effects;
  return (
    <div className="sound-button">
      {open && (
        <div className="glass sound-popover" role="dialog" aria-label={t('sound.title')}>
          <SoundSwitches />
        </div>
      )}
      <button
        type="button"
        className="ui-btn ui-btn--icon sound-toggle"
        data-testid="sound-button"
        aria-expanded={open}
        aria-label={t('sound.title')}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={muted ? 'sound-off' : 'sound-on'} />
      </button>
    </div>
  );
}
