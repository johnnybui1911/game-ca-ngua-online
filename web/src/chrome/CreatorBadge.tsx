import './chrome.css';

const NAME = 'Johnny Bui';

/** The creator's mark: decorative-sized, not a link, and not something to drag or select. */
export function CreatorBadge() {
  return (
    <picture className="creator-badge" data-testid="creator-badge">
      <source srcSet="/brand/creator-logo-256.webp" type="image/webp" />
      <img
        src="/brand/creator-logo-256.png"
        alt={NAME}
        title={NAME}
        aria-label={NAME}
        width={256}
        height={256}
        draggable={false}
        decoding="async"
        onContextMenu={(e) => e.preventDefault()}
      />
    </picture>
  );
}
