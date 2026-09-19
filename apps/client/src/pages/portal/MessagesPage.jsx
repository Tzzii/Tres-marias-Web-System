import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChatPanel, DocumentDialog, ErrorState, DashCard, PageHeader, Spinner, messageApi, reservationApi, useDocumentTitle, useNotify, useResource } from '@tm/shared';
import { useAuth } from '../../auth.js';

/**
 * 1l · Chat with the Tres Marias admin: one conversation per customer. Messages about a
 * reservation carry its event name as a tag; ?ref=RES-… (from a reservation or the dashboard)
 * tags the next messages with that event.
 */
export default function MessagesPage() {
  useDocumentTitle('Chat');
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // The customer's one conversation, created on first visit. live: false = the id never changes, so
  // don't look it up again on every data change (creating it is itself a change).
  const threadId = useResource(async () => (await messageApi.openThread({ customerId: user.id })).id, [user.id], { live: false });
  // Its messages, reloaded when data changes
  const thread = useResource(() => (threadId.data ? messageApi.getThread(threadId.data, { customerId: user.id, side: 'customer' }) : Promise.resolve(null)), [threadId.data, user.id]);
  const [doc, setDoc] = useState(null); // attachment shown in the document dialog
  const [topic, setTopic] = useState(null); // { ref, label }: the event the next messages are about

  // ?ref=RES-… sets the topic to that reservation's event, then leaves the URL clean
  const refParam = params.get('ref');
  useEffect(() => {
    if (!refParam) return;
    reservationApi
      .getReservation(refParam, { customerId: user.id })
      .then((r) => setTopic({ ref: r.ref, label: r.eventName }))
      .catch(() => notify('That reservation could not be found.', 'warning'))
      .finally(() => setParams({}, { replace: true }));
  }, [refParam, user.id, setParams, notify]);

  // Opening the chat marks the admin's messages as read
  useEffect(() => {
    if (thread.data && thread.data.unread > 0) messageApi.markThreadRead(thread.data.id, 'customer');
  }, [thread.data]);

  // Load the reservation an attachment belongs to, then open the document preview
  const openAttachment = async (attachment) => {
    try {
      const detail = await reservationApi.getReservation(attachment.ref, { customerId: user.id });
      setDoc({ detail, doc: { kind: attachment.kind, name: attachment.name, paymentId: attachment.paymentId, available: true } });
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const error = threadId.error || thread.error;
  if (error) return <DashCard><ErrorState error={error} onRetry={() => (threadId.error ? threadId.reload() : thread.reload())} /></DashCard>;

  return (
    <>
      <PageHeader title="Chat" subtitle="Message the Tres Marias admin directly. We usually reply within an hour during office hours." />
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
          // Send as the customer, tagged with the chosen event if any; the admin sees it in their inbox
          onSend={(body) => messageApi.sendMessage(threadId.data, { side: 'customer', senderName: user.name, body, customerId: user.id, ref: topic ? topic.ref : null })}
          onOpenAttachment={openAttachment}
        />
      )}
      {doc && <DocumentDialog open onClose={() => setDoc(null)} detail={doc.detail} doc={doc.doc} />}
    </>
  );
}
