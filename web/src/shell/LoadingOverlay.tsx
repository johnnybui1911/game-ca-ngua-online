import type { SceneLoad } from './scene-host';

/** What the card says while the board is on its way; `percent` is how far its first picture is. */
function progressText(load: SceneLoad, percent: number): string {
  if (load === 'unavailable') return 'Thiết bị này không hiển thị được bàn cờ 3D.';
  // Reaching 100 is the card going away: the last step (drawing the first picture) ends there.
  return `Đang tải bàn cờ 3D… ${Math.min(percent, 99)}%`;
}

/** A still picture of the board, with the loading progress while a canvas is on its way; it stays when none is. */
export function LoadingOverlay({ load, progress }: { load: SceneLoad; progress: number }) {
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
          <strong className="shell-poster-name">Cờ Cá Ngựa 3D</strong>
          <span className="shell-poster-progress" data-testid="scene-progress">
            {progressText(load, progress)}
          </span>
        </div>
      )}
    </div>
  );
}
