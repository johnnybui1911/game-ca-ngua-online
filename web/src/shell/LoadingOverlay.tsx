import { useT, type TFunction } from '../i18n';
import type { SceneLoad } from './scene-host';

/** What the card says while the board is on its way; `percent` is how far its first picture is. */
function progressText(t: TFunction, load: SceneLoad, percent: number): string {
  if (load === 'unavailable') return t('loading.unavailable');
  // Reaching 100 is the card going away: the last step (drawing the first picture) ends there.
  return t('loading.progress', { percent: Math.min(percent, 99) });
}

/** A still picture of the board, with the loading progress while a canvas is on its way; it stays when none is. */
export function LoadingOverlay({ load, progress }: { load: SceneLoad; progress: number }) {
  const t = useT();
  return (
    <div className="shell-poster" data-testid="scene-loading" data-load={load} aria-hidden={load === 'ready'}>
      <picture>
        <source media="(max-aspect-ratio: 3/4)" srcSet="/landing/hero-mobile.jpg" width={780} height={1560} />
        <img className="shell-poster-image" src="/landing/hero-poster.jpg" alt="" width={1920} height={1080} />
      </picture>
      {load !== 'ready' && load !== 'poster' && (
        <div className="shell-poster-card" role="status">
          <span className="brand" aria-hidden="true">
            <span className="pawn pawn-red" />
            <span className="pawn pawn-blue" />
            <span className="pawn pawn-yellow" />
            <span className="pawn pawn-green" />
          </span>
          <strong className="shell-poster-name">{t('brand.name')}</strong>
          <span className="shell-poster-progress" data-testid="scene-progress">
            {progressText(t, load, progress)}
          </span>
        </div>
      )}
    </div>
  );
}
