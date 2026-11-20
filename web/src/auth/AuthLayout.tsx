import type { ReactNode } from 'react';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="card auth-card">
        <div className="brand" aria-hidden="true">
          <span className="pawn pawn-red" />
          <span className="pawn pawn-blue" />
          <span className="pawn pawn-yellow" />
          <span className="pawn pawn-green" />
        </div>
        <p className="brand-name">Cờ Cá Ngựa 3D</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
