import { recordLandingVisit } from '../analytics';
import '../styles/tokens.css';
import './landing.css';

recordLandingVisit();

/**
 * The hero clip plays only on wide screens for visitors who allow motion and do not save data;
 * everyone else keeps the still poster, and the clip is never downloaded for them.
 */
const video = document.querySelector<HTMLVideoElement>('.lp-hero-video');
if (video) {
  const wide = window.matchMedia('(min-width: 768px)');
  const motionOk = window.matchMedia('(prefers-reduced-motion: no-preference)');
  // Asked as a positive query: browsers without the feature report false instead of failing `not (...)`.
  const reducedData = window.matchMedia('(prefers-reduced-data: reduce)');
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  const sync = () => {
    if (wide.matches && motionOk.matches && !reducedData.matches && !saveData) {
      video.play().catch(() => {
        // Autoplay refused (power saving, browser policy): the poster stays.
      });
    } else {
      video.pause();
      video.classList.remove('is-playing');
    }
  };
  video.addEventListener('playing', () => video.classList.add('is-playing'));
  for (const query of [wide, motionOk, reducedData]) query.addEventListener('change', sync);
  sync();
}
