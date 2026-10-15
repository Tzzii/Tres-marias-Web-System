import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import { PageHeader, reservationApi, useDocumentTitle, useNotify } from '@tm/shared';
import { useAuth } from '../../auth.js';
import CustomerConversation from '../../components/CustomerConversation.jsx';

export default function MessagesPage() {
  useDocumentTitle('Chat');
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
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
      <CustomerConversation key={user.id} user={user} topic={topic} onClearTopic={() => setTopic(null)} />
    </>
  );
}
