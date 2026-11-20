import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="home-page">
      <section className="card home-card">
        <h1 data-testid="not-found">Không tìm thấy trang</h1>
        <Link className="btn btn-secondary" to="/">Về trang chủ</Link>
      </section>
    </main>
  );
}
