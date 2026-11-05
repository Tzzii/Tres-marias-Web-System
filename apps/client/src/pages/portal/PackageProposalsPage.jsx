import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader, packageProposalApi, useDocumentTitle } from '@tm/shared';
import { useAuth } from '../../auth.js';
import { readDraft, saveDraft } from '../../lib/booking.js';
import {
  applyProposalHandoff,
  proposalDraftConflicts,
  proposalExpired,
  proposalFormPatch,
  proposalConversationAnswers,
  proposalHandoffReviewKey
} from '../../lib/packageProposalDraft.js';
import PackageProposalOption from '../../components/assistant/PackageProposalOption.jsx';
import { assistantApi } from '../../lib/assistantApi.js';
import { carryAssistantPhotos } from '../../lib/assistantBookingHandoff.js';

export default function PackageProposalsPage() {
  useDocumentTitle('Your Package Options');
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [proposal, setProposal] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(null),
    [attempt, setAttempt] = useState(0);
  const lock = useRef(false),
    active = useRef(true),
    currentOwner = useRef(user.id);
  currentOwner.current = user.id;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setProposal(null);
    setError('');
    packageProposalApi
      .get(id)
      .then((value) => {
        if (live) setProposal(value);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id, user.id, attempt]);
  const submission = proposal?.submission;
  const expired = proposal && !submission && proposalExpired(proposal);
  const adjustPath = `/portal/assistant?mode=package&proposal=${encodeURIComponent(id)}`;
  async function choose(option, confirmedReviewKey = '') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const owner = user.id;
    try {
      const selected = await packageProposalApi.select(id, proposal.revision, option.id);
      if (!active.current || currentOwner.current !== owner) return;
      const patch = proposalFormPatch(proposal, selected);
      let selectedConversation = null,
        answers = {};
      if (params.get('conversation')) {
        const current = await assistantApi.read(params.get('conversation'));
        const updated = await assistantApi.selectPackageProposal(
          current.conversationId,
          patch.packageProposalRef,
          current.draftRevision
        );
        if (updated.packageProposalIssue) throw new Error(updated.packageProposalIssue);
        selectedConversation = updated;
        answers = proposalConversationAnswers(updated, patch.packageProposalRef);
      }
      if (!active.current || currentOwner.current !== owner) return;
      let latestForm = readDraft(owner)?.form || {};
      const review = (form) => {
        const conflicts = proposalDraftConflicts(form, patch, answers);
        const reviewKey = proposalHandoffReviewKey(form, patch, answers);
        if (conflicts.length && confirmedReviewKey !== reviewKey) {
          setPending({ option, conflicts, reviewKey, answers, manual: form });
          return false;
        }
        return true;
      };
      if (!review(latestForm)) return;
      if (selectedConversation) {
        await carryAssistantPhotos(selectedConversation, owner);
        // Even an attachment-free handoff must recheck revision and selection after async work.
        const current = await assistantApi.read(selectedConversation.conversationId);
        if (current.draftRevision !== selectedConversation.draftRevision)
          throw new Error('Your conversation changed. Review its latest answers before continuing.');
        proposalConversationAnswers(current, patch.packageProposalRef);
      }
      if (!active.current || currentOwner.current !== owner) return;
      latestForm = readDraft(owner)?.form || {};
      if (!review(latestForm)) return;
      const next = applyProposalHandoff(user.id, owner, latestForm, patch, { confirmed: true, answers });
      if (!saveDraft(owner, next))
        throw new Error(
          'Your browser could not save this package. Free some storage and try again. Your options remain available here.'
        );
      navigate('/portal/book');
    } catch (err) {
      if (active.current && currentOwner.current === owner) {
        setError(err.message);
        setPending(null);
      }
    } finally {
      if (active.current) setBusy(false);
      lock.current = false;
    }
  }
  return (
    <Box>
      <PageHeader
        title="Your package options"
        subtitle="Compare the complete setup, menu and budget before you choose."
      />
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Button component={RouterLink} to={adjustPath} variant="outlined" disabled={Boolean(submission)}>
          Adjust my answers
        </Button>
        <Button component={RouterLink} to="/portal/messages">
          Ask the team
        </Button>
      </Stack>
      {submission && (
        <Alert severity="success" sx={{ mb: 3 }}>
          This reviewed package was already submitted as {submission.reservationRef}. These options are now read-only.{' '}
          <Button component={RouterLink} to={`/portal/reservations/${encodeURIComponent(submission.reservationRef)}`}>
            View saved request
          </Button>
        </Alert>
      )}
      {loading && <CircularProgress aria-label="Loading your package options" />}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
          <Button onClick={() => setAttempt((n) => n + 1)}>Retry loading</Button>
        </Alert>
      )}
      {expired && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          These options have expired. Review your saved answers and generate current options.{' '}
          <RouterLink to={adjustPath}>Review answers</RouterLink>
        </Alert>
      )}
      {proposal?.status !== 'ready' && proposal && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography fontWeight={600}>
            {proposal.status === 'unavailable'
              ? 'Package generation is temporarily unavailable'
              : 'No approved package matches these answers yet'}
          </Typography>
          {proposal.noFitReasons?.map((reason) => (
            <Typography variant="body2" key={reason}>
              {reason}
            </Typography>
          ))}
          <Button component={RouterLink} to={adjustPath}>
            Review answers and try again
          </Button>
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2.5 }}>
        {proposal?.options?.slice(0, 3).map((option, index) => (
          <PackageProposalOption
            key={option.id}
            option={option}
            context={proposal.context}
            index={index}
            disabled={busy || expired || proposal.status !== 'ready'}
            onSelect={submission ? undefined : () => void choose(option)}
          />
        ))}
      </Box>
      <Dialog open={Boolean(pending)} onClose={() => !busy && setPending(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Review changes to your saved reservation</DialogTitle>
        <DialogContent>
          <Typography>
            This package changes your saved {pending?.conflicts.join(', ')}. Where answers differ below, continuing uses
            the saved conversation answer. Reference photos stay attached; differing manual food notes stay saved and
            require a fresh package review.
          </Typography>
          {pending?.conflicts
            .filter((key) => Object.hasOwn(pending.answers || {}, key))
            .map((key) => (
              <Box key={key} sx={{ mt: 2 }}>
                <Typography variant="subtitle2">{key}</Typography>
                <Typography variant="body2">Saved form: {pending.manual[key] || '(blank)'}</Typography>
                <Typography variant="body2">Conversation: {pending.answers[key] || '(blank)'}</Typography>
              </Box>
            ))}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setPending(null)}>
            Keep my saved form
          </Button>
          <Button variant="contained" disabled={busy} onClick={() => void choose(pending.option, pending.reviewKey)}>
            Use reviewed package
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
