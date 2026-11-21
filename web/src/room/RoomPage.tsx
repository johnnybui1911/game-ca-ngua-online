import { Link, useParams } from 'react-router';
import { useSession } from '../auth/session-context';
import { GlassPanel, PanelHost, PanelStatus } from '../shell/PanelHost';
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
      <PanelHost>
        <GlassPanel
          title={
            <span data-testid="room-error" data-code={conn.failure.code}>
              {conn.failure.message}
            </span>
          }
        >
          <Link className="ui-btn ui-btn--primary" to="/" data-testid="back-to-lobby">
            Về sảnh
          </Link>
        </GlassPanel>
      </PanelHost>
    );
  }

  if (!conn.room || !user) return <PanelStatus>Đang vào phòng {upper}…</PanelStatus>;

  return (
    <>
      {conn.room.status === 'waiting' ? (
        // The waiting room sits in the panel over the board; the match takes the whole board.
        <PanelHost>
          <WaitingView room={conn.room} myId={user.id} send={conn.send} actionError={conn.actionError} emotes={conn.emotes} offline={conn.status !== 'open'} />
        </PanelHost>
      ) : (
        <MatchView room={conn.room} batches={conn.batches} clockOffset={conn.clockOffset} myId={user.id} send={conn.send} actionError={conn.actionError} emotes={conn.emotes} offline={conn.status !== 'open'} />
      )}
      {conn.status === 'reconnecting' && (
        <div className="reconnect-banner" role="status" data-testid="reconnecting">
          Đang kết nối lại…
        </div>
      )}
    </>
  );
}
