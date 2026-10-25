import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@mui/material/Button';
import { ChatPanel, DocumentDialog, messageApi, reservationApi, useNotify, useResource } from '@tm/shared';

// The Messages page and floating window use the same authenticated conversation and actions.
export default function AdminConversation({
  threads,
  activeId,
  onSelect,
  onBack,
  onUnavailable = onBack,
  active = true,
  embedded = false,
  emptyText
}) {
  const navigate = useNavigate();
  const notify = useNotify();
  const thread = useResource(
    () => (active && activeId ? messageApi.getThread(activeId, { side: 'admin' }) : Promise.resolve(null)),
    [activeId, active],
    { live: active }
  );
  const [doc, setDoc] = useState(null);
  const t = active && thread.data?.id === activeId ? thread.data : null;

  useEffect(() => {
    if (t?.unread > 0) messageApi.markThreadRead(t.id, 'admin').catch(() => {});
  }, [t]);

  useEffect(() => {
    if (!active || !thread.error || !activeId) return;
    if (thread.error.code === 'NOT_FOUND') notify('That conversation could not be found.', 'warning');
    else if (!thread.data) notify(thread.error.message, 'error');
    else return;
    onUnavailable();
  }, [active, thread.error, thread.data, activeId, notify, onUnavailable]);

  const openAttachment = async (attachment) => {
    try {
      const detail = await reservationApi.getReservation(attachment.ref);
      setDoc({
        detail,
        doc: { kind: attachment.kind, name: attachment.name, paymentId: attachment.paymentId, available: true }
      });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  return (
    <>
      <ChatPanel
        side="admin"
        embedded={embedded}
        compact={embedded}
        threads={threads}
        activeId={activeId}
        onSelect={onSelect}
        onBack={onBack}
        thread={t}
        loadingThread={thread.loading}
        threadTitle={t?.customerName || ''}
        threadSubtitle={t?.customerEmail || ''}
        headerAction={
          !embedded &&
          t && (
            <Button size="small" variant="outlined" onClick={() => navigate(`/customers?open=${t.customerId}`)}>
              Customer
            </Button>
          )
        }
        onSend={(body) => messageApi.sendMessage(activeId, { side: 'admin', body })}
        onEdit={(messageId, body) => messageApi.editMessage(activeId, messageId, { side: 'admin', body })}
        onDelete={(messageId) => messageApi.deleteMessage(activeId, messageId, { side: 'admin' })}
        onOpenAttachment={openAttachment}
        emptyText={emptyText}
      />
      {doc && <DocumentDialog open onClose={() => setDoc(null)} detail={doc.detail} doc={doc.doc} />}
    </>
  );
}
