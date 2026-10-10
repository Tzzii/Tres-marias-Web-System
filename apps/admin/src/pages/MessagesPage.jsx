import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { ChatPanel, DashCard, DocumentDialog, ErrorState, FilterTabs, PageHeader, Spinner, messageApi, reservationApi, useDocumentTitle, useNotify, useResource } from '@tm/shared';
import { useAuth } from '../auth.js';

/**
 * Messages: the admin inbox, one conversation per customer (the same one they see in their Chat page).
 * Wide screens show two panes (conversations, then the open one); phones show the list, then the
 * conversation with a back button.
 * ?thread=ID opens that conversation: notifications, a reservation's Message button and the
 * Customers page link here that way.
 */
export default function MessagesPage() {
  useDocumentTitle('Messages', 'Tres Marias Admin');
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // The open conversation is kept in the URL (null = none), so links can open one and the browser's Back works
  const activeId = params.get('thread');
  // 'all' or 'unread' tab
  const [filter, setFilter] = useState('all');
  // List of every customer conversation
  const threads = useResource(() => messageApi.listThreads({ side: 'admin' }), []);
  // Messages of the open conversation; reloads whenever activeId changes
  const thread = useResource(() => (activeId ? messageApi.getThread(activeId, { side: 'admin' }) : Promise.resolve(null)), [activeId]);
  // Attachment (contract/receipt) currently shown in the document preview dialog
  const [doc, setDoc] = useState(null);

  // Open a conversation from the list. Opening one while none is open adds a history step marked
  // fromList (on phones the browser's Back then returns to the list); switching from one conversation
  // to another replaces the step and keeps its mark.
  const select = (id) => setParams({ thread: id }, activeId ? { replace: true, state: location.state } : { state: { fromList: true } });
  // The back arrow (phones): undo the step that opened the conversation, or, when the page was opened
  // straight on it (e.g. from a notification), show the list in its place.
  const back = () => (location.state && location.state.fromList ? navigate(-1) : setParams({}, { replace: true }));

  // Wide screens show both panes, so open the most recent conversation when the page opens on none.
  // Done once per visit: if that conversation fails to load, the list is shown instead of trying again.
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || !isDesktop || activeId || !threads.data) return;
    autoOpened.current = true;
    if (threads.data.length) setParams({ thread: threads.data[0].id }, { replace: true });
  }, [isDesktop, activeId, threads.data, setParams]);

  // Opening a conversation marks its messages as read for the admin. A failed mark (e.g. no connection
  // for a moment) is simply tried again the next time the conversation reloads with unread messages.
  useEffect(() => {
    if (thread.data && thread.data.unread > 0) messageApi.markThreadRead(thread.data.id, 'admin').catch(() => {});
  }, [thread.data]);

  // If the open conversation can't be shown, say why and go back to the list: NOT_FOUND means it no longer
  // exists, and any other error on its first load (no connection, too many requests) leaves
  // nothing to show. A background reload that fails for such a passing reason keeps the conversation
  // open with what was last loaded (useResource), until the next reload.
  // Skipped once no conversation is open: the old error stays in `thread` for one more render after the
  // URL changes, and reporting it again then would show the message twice.
  useEffect(() => {
    if (!thread.error || !activeId) return;
    if (thread.error.code === 'NOT_FOUND') notify('That conversation could not be found.', 'warning');
    else if (!thread.data) notify(thread.error.message, 'error');
    else return;
    setParams({}, { replace: true });
  }, [thread.error, thread.data, activeId, notify, setParams]);

  // Conversations shown in the list. The Unread tab keeps the open one visible even after it's been read.
  const list = useMemo(() => {
    const all = threads.data || [];
    return filter === 'unread' ? all.filter((x) => x.unread > 0 || x.id === activeId) : all;
  }, [threads.data, filter, activeId]);

  // Only use the loaded conversation if it matches the open one (avoids flashing the previous chat)
  const t = thread.data && thread.data.id === activeId ? thread.data : null;
  // Number of conversations with unread messages, shown on the Unread tab
  const unreadTotal = (threads.data || []).filter((x) => x.unread > 0).length;

  return (
    <>
      {/* The subtitle is hidden on phones to leave more room for the messages. The tabs sit on a white
          pill because the page background behind the header is dark. */}
      <PageHeader
        title="Messages"
        subtitle={
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
            Each customer has one conversation with you, the same one they see in their Chat page.
          </Box>
        }
        actions={
          <Box sx={{ backgroundColor: '#fff', borderRadius: 999, p: 0.25 }}>
            <FilterTabs value={filter} onChange={setFilter} ariaLabel="Filter conversations" options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unreadTotal }]} />
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
          headerAction={t && <Button size="small" variant="outlined" onClick={() => navigate(`/customers?open=${t.customerId}`)}>Customer</Button>}
          // Send a reply as the admin; the customer sees it in their Chat page
          onSend={(body) => messageApi.sendMessage(activeId, { side: 'admin', senderName: user.name, body })}
          // Edit or delete a reply the admin typed, within 60 minutes of sending (never an automatic message);
          // an edited or deleted message of either side has "View history"
          onEdit={(messageId, body) => messageApi.editMessage(activeId, messageId, { side: 'admin', body })}
          onDelete={(messageId) => messageApi.deleteMessage(activeId, messageId, { side: 'admin' })}
          // Clicking an attachment loads its reservation, then opens the document preview
          onOpenAttachment={async (attachment) => {
            try {
              const detail = await reservationApi.getReservation(attachment.ref);
              setDoc({ detail, doc: { kind: attachment.kind, name: attachment.name, paymentId: attachment.paymentId, available: true } });
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
