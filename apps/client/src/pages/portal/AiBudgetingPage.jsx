import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { DashCard, PageHeader, useDocumentTitle } from '@tm/shared';
import { useAuth } from '../../auth.js';
import { assistantApi } from '../../lib/assistantApi.js';
import CancelAiPlanButton from '../../components/assistant/CancelAiPlanButton.jsx';
import PackagePlanningPanel from '../../components/assistant/PackagePlanningPanel.jsx';
import '../../components/assistant/assistantPanel.css';

export default function AiBudgetingPage() {
  useDocumentTitle('AI Budgeting & Package');
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [conversation, setConversation] = useState(null);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [freshPlan, setFreshPlan] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');
    setConversation(null);
    async function load() {
      try {
        const config = await assistantApi.config(controller.signal);
        const session = freshPlan
          ? await assistantApi.newReservation(user.id, controller.signal)
          : await assistantApi.open(user.id, controller.signal);
        if (active) {
          setAvailable(Boolean(config.available));
          setConversation(session);
        }
      } catch (failure) {
        if (active && failure.name !== 'AbortError') setError(failure.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [user.id, attempt, freshPlan]);

  return (
    <Box>
      <PageHeader
        title="AI Budgeting & Package"
        subtitle="Plan your budget, build a package, and compare options based on current catalog prices."
      />
      <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto', mt: 3 }}>
        {loading && <CircularProgress aria-label="Loading your package plan" sx={{ alignSelf: 'center' }} />}
        {error && (
          <Alert severity="error" action={<Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}>
            {error}
          </Alert>
        )}
        {!loading && conversation && (
          <DashCard sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <CancelAiPlanButton
                conversation={conversation}
                disabled={busy || Boolean(conversation.allowance?.pending)}
                onChange={setConversation}
                onBusyChange={setBusy}
              />
            </Box>
            {conversation.submittedRef ? (
              <Alert severity="success">
                This plan has already been submitted.
                <Button
                  component={RouterLink}
                  to={`/portal/reservations/${encodeURIComponent(conversation.submittedRef)}`}
                >
                  View reservation
                </Button>
                <Button onClick={() => setFreshPlan(true)}>Start another package plan</Button>
              </Alert>
            ) : (
              <PackagePlanningPanel
                key={conversation.conversationId}
                conversation={conversation}
                disabled={busy || Boolean(conversation.allowance?.pending)}
                onChange={setConversation}
                onBusyChange={setBusy}
                requested
                proposalId={params.get('proposal') || ''}
                generationAvailable={available}
              />
            )}
            {!conversation.submittedRef && conversation.bookingDraft?.packageProposalRef && (
              <Button
                component={RouterLink}
                variant="contained"
                sx={{ mt: 2 }}
                to={`/portal/package-proposals/${encodeURIComponent(conversation.bookingDraft.packageProposalRef.proposalId)}?conversation=${encodeURIComponent(conversation.conversationId)}`}
              >
                Review package and continue to reservation
              </Button>
            )}
          </DashCard>
        )}
        <Alert severity="info">
          Package estimates use current catalog prices. Availability and final charges are confirmed by the team before
          your booking is finalized.
        </Alert>
      </Stack>
    </Box>
  );
}
