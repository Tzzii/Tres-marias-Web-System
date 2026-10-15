import { useEffect, useState } from 'react';
import {
  ChatPanel,
  DocumentDialog,
  ErrorState,
  Spinner,
  messageApi,
  reservationApi,
  useNotify,
  useResource
} from '@tm/shared';

// The full Chat page and floating window share the same conversation and actions.
export default function CustomerConversation({ user, active = true, embedded = false, topic, onClearTopic }) {
  const notify = useNotify();
  const threadId = useResource(async () => (await messageApi.openThread({ customerId: user.id })).id, [user.id], {
    live: false
  });
  const thread = useResource(
    () =>
      active && threadId.data
        ? messageApi.getThread(threadId.data, { customerId: user.id, side: 'customer' })
        : Promise.resolve(null),
    [threadId.data, user.id, active],
    { live: active }
  );
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    if (active && thread.data?.unread > 0)
      messageApi.markThreadRead(thread.data.id, 'customer', { customerId: user.id }).catch(() => {});
  }, [active, thread.data, user.id]);

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
  if (error) return <ErrorState error={error} onRetry={() => (threadId.error ? threadId.reload() : thread.reload())} />;

  return (
    <>
      {threadId.loading ? (
        <Spinner />
      ) : (
        <ChatPanel
          side="customer"
          single
          embedded={embedded}
          compact={embedded}
          hideHeader={embedded}
          threads={[]}
          activeId={threadId.data}
          thread={thread.data}
          loadingThread={thread.loading && !thread.data}
          threadTitle="Admin"
          threadSubtitle="Tres Marias Catering · usually replies within an hour"
          composeTag={topic ? { label: topic.label } : null}
          onClearComposeTag={onClearTopic}
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
