import { useEffect, useState, useSyncExternalStore } from 'react';
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
  const settings = useSyncExternalStore(sound.subscribe, sound.getSettings);
  return (
    <div className="sound-switches" data-testid="sound-switches">
      <label>
        <input
          type="checkbox"
          data-testid="sound-music"
          checked={settings.music}
          onChange={(e) => sound.setSettings({ ...settings, music: e.target.checked })}
        />
        Nhạc nền
      </label>
      <label>
        <input
          type="checkbox"
          data-testid="sound-effects"
          checked={settings.effects}
          onChange={(e) => sound.setSettings({ ...settings, effects: e.target.checked })}
        />
        Hiệu ứng âm thanh
      </label>
    </div>
  );
}

/** Floating speaker button that opens the switches; for screens without their own menu. */
export function SoundButton() {
  const settings = useSyncExternalStore(sound.subscribe, sound.getSettings);
  const [open, setOpen] = useState(false);
  const muted = !settings.music && !settings.effects;
  return (
    <div className="sound-button">
      {open && (
        <div className="card sound-popover" role="dialog" aria-label="Âm thanh">
          <SoundSwitches />
        </div>
      )}
      <button
        type="button"
        className="btn btn-secondary sound-toggle"
        data-testid="sound-button"
        aria-expanded={open}
        aria-label="Âm thanh"
        onClick={() => setOpen((o) => !o)}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
