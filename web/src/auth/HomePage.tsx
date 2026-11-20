import { useSession } from './session-context';

export function HomePage() {
  const { user, signOut } = useSession();
  return (
    <main className="home-page">
      <section className="card home-card">
        <h1 data-testid="greeting">Xin chào, {user?.displayName}</h1>
        <button type="button" className="btn btn-secondary" data-testid="signout" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      </section>
    </main>
  );
}
