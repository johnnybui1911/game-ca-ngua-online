import type { ReactNode } from 'react';
import { useMusic } from '../audio/SoundControls';
import { useT } from '../i18n';

/** Glass panel for the account pages; reads over the board or the plain page background. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  useMusic('lobby');
  const t = useT();
  return (
    <main className="auth-page">
      <section className="glass auth-card" aria-labelledby="auth-title">
        <div className="brand" aria-hidden="true">
          <span className="pawn pawn-red" />
          <span className="pawn pawn-blue" />
          <span className="pawn pawn-yellow" />
          <span className="pawn pawn-green" />
        </div>
        <p className="ui-eyebrow brand-name">{t('brand.name')}</p>
        <h1 id="auth-title" className="ui-title auth-title">
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}
