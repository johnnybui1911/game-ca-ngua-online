import { Link } from 'react-router';
import { useT } from '../i18n';
import { Icon } from '../ui/Icon';

export function NotFoundPage() {
  const t = useT();
  return (
    <main className="auth-page">
      <section className="glass auth-card not-found" aria-labelledby="not-found-title">
        <p className="ui-eyebrow brand-name">{t('notFound.eyebrow')}</p>
        <h1 id="not-found-title" className="ui-title auth-title" data-testid="not-found">
          {t('notFound.title')}
        </h1>
        <p className="ui-muted">{t('notFound.body')}</p>
        <Link className="ui-btn ui-btn--primary" to="/">
          <Icon name="back" />
          {t('notFound.home')}
        </Link>
      </section>
    </main>
  );
}
