import type { SceneLoad } from './scene-host';

const PROGRESS: Record<Exclude<SceneLoad, 'ready' | 'poster'>, string> = {
  loading: 'Đang tải bàn cờ 3D… (1/2)',
  building: 'Đang dựng bàn cờ… (2/2)',
  unavailable: 'Thiết bị này không hiển thị được bàn cờ 3D.',
};

/** A still picture of the board, with the loading progress while a canvas is on its way; it stays when none is. */
export function LoadingOverlay({ load }: { load: SceneLoad }) {
  return (
    <div className="shell-poster" data-testid="scene-loading" data-load={load} aria-hidden={load === 'ready'}>
      <picture>
        <source media="(max-aspect-ratio: 3/4)" srcSet="/landing/hero-mobile.jpg" width={780} height={1560} />
        <img className="shell-poster-image" src="/landing/hero-poster.jpg" alt="" width={1280} height={720} />
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
            {PROGRESS[load]}
          </span>
        </div>
      )}
    </div>
  );
}
