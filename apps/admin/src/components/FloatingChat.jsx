import { lazy, Suspense, useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import { ErrorState, FloatingChat as FloatingChatWindow, Spinner, messageApi, useResource } from '@tm/shared';

const AdminConversation = lazy(() => import('./AdminConversation.jsx'));

function FloatingConversations({ active, activeId, onSelect }) {
  const threads = useResource(
    () => (active ? messageApi.listThreads({ side: 'admin' }) : Promise.resolve(null)),
    [active],
    { live: active }
  );
  const back = useCallback(() => onSelect(null), [onSelect]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {threads.error && <ErrorState error={threads.error} onRetry={threads.reload} sx={{ p: 2 }} />}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Suspense fallback={<Spinner label="Loading chat" />}>
          <AdminConversation
            embedded
            active={active}
            threads={threads.data || []}
            activeId={activeId}
            onSelect={onSelect}
            onBack={back}
            emptyText={threads.loading ? 'Loading conversations…' : 'No conversations yet.'}
          />
        </Suspense>
      </Box>
    </Box>
  );
}

export default function FloatingChat({ unread = 0 }) {
  const [activeId, setActiveId] = useState(null);

  return (
    <FloatingChatWindow
      id="admin-floating-chat"
      title="Customer messages"
      subtitle="Reply without leaving this page"
      fullChatPath={activeId ? `/messages?thread=${encodeURIComponent(activeId)}` : '/messages'}
      launcherTitle="Customer messages"
      unread={unread}
    >
      {({ active }) => <FloatingConversations active={active} activeId={activeId} onSelect={setActiveId} />}
    </FloatingChatWindow>
  );
}
