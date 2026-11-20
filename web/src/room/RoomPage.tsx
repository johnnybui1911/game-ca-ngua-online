import { Link, useParams } from 'react-router';
import { useSession } from '../auth/session-context';
import { MatchView } from './MatchView';
import { WaitingView } from './WaitingView';
import { useRoomConnection } from './useRoomConnection';
import './room.css';

export function RoomPage() {
  const { code = '' } = useParams();
  const { user } = useSession();
  const upper = code.toUpperCase();
  const conn = useRoomConnection(upper);

  if (conn.failure) {
    return (
      <main className="room-page">
        <section className="card room-card">
          <h1 data-testid="room-error" data-code={conn.failure.code}>
            {conn.failure.message}
          </h1>
          <Link className="btn btn-primary" to="/" data-testid="back-to-lobby">
            Về sảnh
          </Link>
        </section>
      </main>
    );
  }

  if (!conn.room || !user) {
    return (
      <p className="page-status" role="status">
        Đang vào phòng…
      </p>
    );
  }

  return (
    <>
      {conn.room.status === 'waiting' ? (
        <WaitingView room={conn.room} myId={user.id} send={conn.send} actionError={conn.actionError} />
      ) : (
        <MatchView room={conn.room} events={conn.events} myId={user.id} send={conn.send} actionError={conn.actionError} />
      )}
      {conn.status === 'reconnecting' && (
        <div className="reconnect-banner" role="status" data-testid="reconnecting">
          Đang kết nối lại…
        </div>
      )}
    </>
  );
}
