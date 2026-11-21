import { Link } from 'react-router';
import { Icon } from '../ui/Icon';

export function NotFoundPage() {
  return (
    <main className="auth-page">
      <section className="glass auth-card not-found" aria-labelledby="not-found-title">
        <p className="ui-eyebrow brand-name">Lỗi 404</p>
        <h1 id="not-found-title" className="ui-title auth-title" data-testid="not-found">
          Không tìm thấy trang
        </h1>
        <p className="ui-muted">Đường dẫn này không còn hoặc chưa từng tồn tại.</p>
        <Link className="ui-btn ui-btn--primary" to="/">
          <Icon name="back" />
          Về trang chủ
        </Link>
      </section>
    </main>
  );
}
