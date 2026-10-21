import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  ChatPanel,
  DashCard,
  DocumentDialog,
  ErrorState,
  FilterTabs,
  PageHeader,
  Spinner,
  messageApi,
  reservationApi,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../auth.js';

export default function MessagesPage() {
  useDocumentTitle('Messages', 'Tres Marias Admin');
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('thread');
  const [filter, setFilter] = useState('all');
  const threads = useResource(() => messageApi.listThreads({ side: 'admin' }), []);
  const thread = useResource(
    () => (activeId ? messageApi.getThread(activeId, { side: 'admin' }) : Promise.resolve(null)),
    [activeId]
  );
  const [doc, setDoc] = useState(null);

  const select = (id) =>
    setParams({ thread: id }, activeId ? { replace: true, state: location.state } : { state: { fromList: true } });
  const back = () => (location.state && location.state.fromList ? navigate(-1) : setParams({}, { replace: true }));

  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !isDesktop || activeId || !threads.data) return;
    autoOpened.current = true;
    if (threads.data.length) setParams({ thread: threads.data[0].id }, { replace: true });
  }, [isDesktop, activeId, threads.data, setParams]);

  useEffect(() => {
    if (thread.data && thread.data.unread > 0) messageApi.markThreadRead(thread.data.id, 'admin').catch(() => {});
  }, [thread.data]);

  useEffect(() => {
    if (!thread.error || !activeId) return;
    if (thread.error.code === 'NOT_FOUND') notify('That conversation could not be found.', 'warning');
    else if (!thread.data) notify(thread.error.message, 'error');
    else return;
    setParams({}, { replace: true });
  }, [thread.error, thread.data, activeId, notify, setParams]);

  const list = useMemo(() => {
    const all = threads.data || [];
    return filter === 'unread' ? all.filter((x) => x.unread > 0 || x.id === activeId) : all;
  }, [threads.data, filter, activeId]);

  const t = thread.data && thread.data.id === activeId ? thread.data : null;
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
        <ChatPanel
          side="admin"
          threads={list}
          activeId={activeId}
          onSelect={select}
          onBack={back}
          thread={t}
          loadingThread={thread.loading}
          threadTitle={t ? t.customerName : ''}
          threadSubtitle={t ? t.customerEmail : ''}
          headerAction={
            t && (
              <Button size="small" variant="outlined" onClick={() => navigate(`/customers?open=${t.customerId}`)}>
                Customer
              </Button>
            )
          }
          onSend={(body) => messageApi.sendMessage(activeId, { side: 'admin', senderName: user.name, body })}
          onEdit={(messageId, body) => messageApi.editMessage(activeId, messageId, { side: 'admin', body })}
          onDelete={(messageId) => messageApi.deleteMessage(activeId, messageId, { side: 'admin' })}
          onOpenAttachment={async (attachment) => {
            try {
              const detail = await reservationApi.getReservation(attachment.ref);
              setDoc({
                detail,
                doc: { kind: attachment.kind, name: attachment.name, paymentId: attachment.paymentId, available: true }
              });
            } catch (e) {
              notify(e.message, 'error');
            }
          }}
          emptyText={filter === 'unread' ? 'No unread conversations.' : 'No conversations yet.'}
        />
      )}
      {doc && <DocumentDialog open onClose={() => setDoc(null)} detail={doc.detail} doc={doc.doc} />}
    </>
  );
}
