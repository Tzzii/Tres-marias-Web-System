import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import {
  ChatPanel,
  DocumentDialog,
  ErrorState,
  DashCard,
  PageHeader,
  Spinner,
  messageApi,
  reservationApi,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

export default function MessagesPage() {
  useDocumentTitle('Chat');
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const threadId = useResource(async () => (await messageApi.openThread({ customerId: user.id })).id, [user.id], {
    live: false
  });
  const thread = useResource(
    () =>
      threadId.data
        ? messageApi.getThread(threadId.data, { customerId: user.id, side: 'customer' })
        : Promise.resolve(null),
    [threadId.data, user.id]
  );
  const [doc, setDoc] = useState(null);
  const [topic, setTopic] = useState(null);

  const refParam = params.get('ref');
  useEffect(() => {
    if (!refParam) return;
    reservationApi
      .getReservation(refParam, { customerId: user.id })
      .then((r) => setTopic({ ref: r.ref, label: r.eventName }))
      .catch(() => notify('That reservation could not be found.', 'warning'))
      .finally(() => setParams({}, { replace: true }));
  }, [refParam, user.id, setParams, notify]);

  useEffect(() => {
    if (thread.data && thread.data.unread > 0)
      messageApi.markThreadRead(thread.data.id, 'customer', { customerId: user.id }).catch(() => {});
  }, [thread.data]);

  const openAttachment = async (attachment) => {
    try {
      const detail = await reservationApi.getReservation(attachment.ref, { customerId: user.id });
      setDoc({
        detail,
        doc: { kind: attachment.kind, name: attachment.name, paymentId: attachment.paymentId, available: true }
      });
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const error = threadId.error || thread.error;
  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={() => (threadId.error ? threadId.reload() : thread.reload())} />
      </DashCard>
    );

  return (
    <>
      <PageHeader
        title="Chat"
        subtitle={
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
            Message the Tres Marias admin directly. We usually reply within an hour during office hours.
          </Box>
        }
      />
      {threadId.loading ? (
        <Spinner />
      ) : (
        <ChatPanel
          side="customer"
          single
          threads={[]}
          activeId={threadId.data}
          thread={thread.data}
          loadingThread={thread.loading && !thread.data}
          threadTitle="Admin"
          threadSubtitle="Tres Marias Catering · usually replies within an hour"
          composeTag={topic ? { label: topic.label } : null}
          onClearComposeTag={() => setTopic(null)}
          onSend={(body) =>
            messageApi.sendMessage(threadId.data, {
              side: 'customer',
              senderName: user.name,
              body,
              customerId: user.id,
              ref: topic ? topic.ref : null
            })
          }
          onEdit={(messageId, body) => messageApi.editMessage(threadId.data, messageId, { side: 'customer', body })}
          onDelete={(messageId) => messageApi.deleteMessage(threadId.data, messageId, { side: 'customer' })}
          onOpenAttachment={openAttachment}
        />
      )}
      {doc && <DocumentDialog open onClose={() => setDoc(null)} detail={doc.detail} doc={doc.doc} />}
    </>
  );
}
