import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMusic } from '../audio/SoundControls';
import { useSession } from '../auth/session-context';
import { useDemoCalmZone } from '../demo/calm-zone';
import { JoinByCodeForm, LobbyPage } from '../lobby/LobbyPage';
import { Icon } from '../ui/Icon';
import { entered, useEntered } from './entered';
import { focusScreen, panelWasShown } from './PanelHost';
import { useSceneStage } from './scene-host';
import { useT } from '../i18n';

/** Up to this width the title lies across the top of the board, so the board is framed below it. */
const NARROW_PX = 720;

/** Heights of the title block and the bottom band, so the camera keeps the board between them. */
function useHeroInsets() {
  const titleRef = useRef<HTMLElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const title = titleRef.current;
    const band = bandRef.current;
    if (!title || !band) return;
    const measure = () => {
      const top = window.innerWidth <= NARROW_PX ? title.offsetHeight : 0;
      const bottom = band.offsetHeight;
      setInsets((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(title);
    observer.observe(band);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return { titleRef, bandRef, insets };
}

function Hero() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const [joining, setJoining] = useState(false);
  const { titleRef, bandRef, insets } = useHeroInsets();
  useSceneStage({ activity: 'full', orbit: true, insets });
  useDemoCalmZone(bandRef);
  const homeRef = useRef<HTMLElement>(null);
  // Back from a panel (the lobby's home button): the focused control left with it, the title takes over.
  useLayoutEffect(() => {
    if (homeRef.current && panelWasShown()) focusScreen(homeRef.current);
  }, []);
  // The lobby music is wanted from the first screen; browsers let it start on the visitor's first tap.
  useMusic('lobby');

  const play = () => {
    entered.set(true);
    // Signed in: this page turns into the lobby. Otherwise the name comes first.
    if (!user) void navigate('/bat-dau');
  };

  return (
    <main className="home" data-testid="home" ref={homeRef}>
      <header className="home-title" ref={titleRef}>
        <p className="ui-eyebrow">{t('home.eyebrow')}</p>
        <h1 className="ui-title">Cờ Cá Ngựa</h1>
      </header>
      <div className="home-band" ref={bandRef}>
        {joining ? (
          <div className="glass home-join" data-testid="home-join">
            <JoinByCodeForm autoFocus />
            <button type="button" className="ui-btn ui-btn--ghost" data-testid="home-join-cancel" onClick={() => setJoining(false)}>
              <Icon name="close" size="sm" />
              {t('home.close')}
            </button>
          </div>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn--hero" data-testid="play-now" onClick={play}>
              {t('home.play')}
            </button>
            <nav className="home-links" aria-label={t('home.shortcuts')}>
              <a className="ui-btn ui-btn--ghost home-link" href="/gioi-thieu" data-testid="home-rules">
                <Icon name="rules" size="sm" />
                {t('home.rules')}
              </a>
              <button type="button" className="ui-btn ui-btn--ghost home-link" data-testid="home-join-open" onClick={() => setJoining(true)}>
                {t('home.joinOpen')}
              </button>
            </nav>
          </>
        )}
      </div>
    </main>
  );
}

/** `/`: the board with "Chơi ngay" for a new visit; the lobby for a signed-in player who already entered. */
export function HomePage() {
  const { ready, user } = useSession();
  const inside = useEntered();
  if (user && inside) return <LobbyPage />;
  // A returning player's session is still being read: no hero flashing by before the lobby.
  if (!ready && inside) return null;
  return <Hero />;
}
