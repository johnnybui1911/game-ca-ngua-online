import type { ReactNode } from 'react';
import { SoundButton, useMusic } from '../audio/SoundControls';

/** Glass panel for the account pages; reads over the board or the plain page background. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  useMusic('lobby');
  return (
    <main className="auth-page">
      <section className="glass auth-card" aria-labelledby="auth-title">
        <div className="brand" aria-hidden="true">
          <span className="pawn pawn-red" />
          <span className="pawn pawn-blue" />
          <span className="pawn pawn-yellow" />
          <span className="pawn pawn-green" />
        </div>
        <p className="ui-eyebrow brand-name">Cờ Cá Ngựa 3D</p>
        <h1 id="auth-title" className="ui-title auth-title">
          {title}
        </h1>
        {children}
      </section>
      <SoundButton />
    </main>
  );
}
