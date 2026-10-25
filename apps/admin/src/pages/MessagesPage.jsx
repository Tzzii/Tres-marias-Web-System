import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  DashCard,
  ErrorState,
  FilterTabs,
  PageHeader,
  Spinner,
  messageApi,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../auth.js';
import AdminConversation from '../components/AdminConversation.jsx';

export default function MessagesPage() {
  useDocumentTitle('Messages', 'Tres Marias Admin');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('thread');
  const [filter, setFilter] = useState('all');
  const threads = useResource(() => messageApi.listThreads({ side: 'admin' }), []);

  const select = (id) =>
    setParams({ thread: id }, activeId ? { replace: true, state: location.state } : { state: { fromList: true } });
  const back = useCallback(
    () => (location.state && location.state.fromList ? navigate(-1) : setParams({}, { replace: true })),
    [location.state, navigate, setParams]
  );
  const unavailable = useCallback(() => setParams({}, { replace: true }), [setParams]);

  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !isDesktop || activeId || !threads.data) return;
    autoOpened.current = true;
    if (threads.data.length) setParams({ thread: threads.data[0].id }, { replace: true });
  }, [isDesktop, activeId, threads.data, setParams]);

  const list = useMemo(() => {
    const all = threads.data || [];
    return filter === 'unread' ? all.filter((x) => x.unread > 0 || x.id === activeId) : all;
  }, [threads.data, filter, activeId]);

  const unreadTotal = (threads.data || []).filter((x) => x.unread > 0).length;

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
            Each customer has one conversation with you, the same one they see in their Chat page.
          </Box>
        }
        actions={
          <Box sx={{ backgroundColor: tokens.cardLight, borderRadius: 999, p: 0.25 }}>
            <FilterTabs
              value={filter}
              onChange={setFilter}
              ariaLabel="Filter conversations"
              options={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread', count: unreadTotal }
              ]}
            />
          </Box>
        }
      />
      {threads.error ? (
        <DashCard>
          <ErrorState error={threads.error} onRetry={threads.reload} />
        </DashCard>
      ) : threads.loading ? (
        <Spinner />
      ) : (
        <AdminConversation
          key={user.id}
          threads={list}
          activeId={activeId}
          onSelect={select}
          onBack={back}
          onUnavailable={unavailable}
          emptyText={filter === 'unread' ? 'No unread conversations.' : 'No conversations yet.'}
        />
      )}
    </>
  );
}
