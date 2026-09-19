import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ReplyRoundedIcon from '@mui/icons-material/ReplyRounded';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import {
  AppDialog,
  BusyButton,
  ConfirmDialog,
  DashCard,
  EmptyState,
  ErrorState,
  FEEDBACK_CATEGORIES,
  FeedbackStatusChip,
  FilterTabs,
  FormField,
  ListSkeleton,
  PageHeader,
  Pager,
  Pill,
  SearchField,
  SelectField,
  StarRating,
  StatCard,
  feedbackApi,
  formatDate,
  formatDateTime,
  formatMobile,
  formatRelative,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';

const PAGE_SIZE = 5;

// Filter tabs as [key, label, test function that decides if a feedback belongs in the tab].
// Archived feedback is kept out of the first three tabs; it has a tab of its own.
const FILTERS = [
  ['all', 'All reviews', (f) => !f.archived],
  ['unread', 'Unread', (f) => !f.readByAdmin && !f.archived],
  ['flagged', 'Flagged', (f) => f.flagged && !f.archived],
  ['archived', 'Archived', (f) => f.archived]
];

/**
 * Feedbacks: the reviews customers write after a completed event.
 *
 * The same record the customer wrote in their portal is the one shown here. The admin
 * decides whether it goes on the website (published, or featured on the homepage), sets a
 * flag on a review that needs checking, archives the old ones, and answers the customer —
 * a reply is saved under their review and arrives as a message in their portal.
 */
export default function FeedbacksPage() {
  useDocumentTitle('Feedbacks', 'Tres Marias Admin');
  const navigate = useNavigate();
  const notify = useNotify();
  // Every feedback, newest first. Reloads by itself whenever a review or a flag changes.
  const { data, loading, error, reload } = useResource(() => feedbackApi.listFeedbacks(), []);
  // The open tab lives in the URL (?tab=unread), so the notification bell can link straight to it
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const filter = FILTERS.some(([key]) => key === requested) ? requested : 'all';
  // A reservation links here with ?q=RES-... to show that event's review
  const [query, setQuery] = useState(params.get('q') || '');
  const setFilter = (value) => {
    const next = {};
    if (value !== 'all') next.tab = value;
    if (query.trim()) next.q = query.trim();
    setParams(next, { replace: true });
  };
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState(null); // feedback being answered in the dialog
  const [flagging, setFlagging] = useState(null); // feedback being flagged (needs a reason)
  const [deleting, setDeleting] = useState(null); // feedback about to be deleted
  const [busyId, setBusyId] = useState(''); // the card whose action is still running

  // Back to page 1 when the tab or the search changes
  useEffect(() => setPage(1), [filter, query]);

  const rows = data || [];
  // Number of feedbacks in each tab
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k, , test]) => [k, rows.filter(test).length])), [rows]);

  // Reports and analytics, counted over everything except the archive (the "All reviews" tab)
  const stats = useMemo(() => {
    const active = rows.filter((f) => !f.archived);
    const total = active.length;
    const share = (n) => (total ? `${Math.round((n / total) * 100)}%` : '—');
    const positive = active.filter((f) => f.rating >= 4).length;
    const critical = active.filter((f) => f.rating <= 2).length;
    return {
      total,
      archived: rows.length - total,
      average: total ? (active.reduce((sum, f) => sum + f.rating, 0) / total).toFixed(1) : '—',
      positive,
      critical,
      positiveShare: share(positive),
      criticalShare: share(critical)
    };
  }, [rows]);

  // Apply the tab and the search over the customer, the event and the review itself
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find(([k]) => k === filter)[2];
    return rows
      .filter(test)
      .filter((f) => !q || [f.customerName, f.customerEmail, f.eventName, f.ref, f.body].some((v) => String(v).toLowerCase().includes(q)));
  }, [rows, filter, query]);

  // Keep the page in range when reviews leave the list (deleted, archived, filtered out)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const unread = counts.unread || 0;

  // Run one card action: keep that card's buttons disabled while it runs, then report the result
  const act = async (id, run, message) => {
    setBusyId(id);
    try {
      await run();
      if (message) notify(message);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusyId('');
    }
  };

  return (
    <>
      <PageHeader
        title="Feedbacks"
        subtitle={loading ? 'Loading…' : `${stats.total} ${stats.total === 1 ? 'review' : 'reviews'} from completed events`}
        actions={
          unread > 0 ? (
            <Button variant="outlined" startIcon={<DoneAllRoundedIcon />} onClick={() => act('all', () => feedbackApi.markAllFeedbackRead(), 'All feedback marked as read.')} disabled={busyId === 'all'}>
              Mark all as read
            </Button>
          ) : null
        }
      />

      {/* ==================== Reports and analytics ==================== */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 2.5 }}>
        <StatCard icon={RateReviewOutlinedIcon} tone="gold" label="Total reviews" value={stats.total} meta={stats.archived ? `${stats.archived} archived` : 'From completed events'} loading={loading} />
        <StatCard icon={StarRoundedIcon} tone="amber" label="Average rating" value={stats.average} meta="out of 5 stars" loading={loading} />
        <StatCard icon={ThumbUpAltOutlinedIcon} tone="green" label="Positive (4–5)" value={stats.positiveShare} meta={`${stats.positive} of ${stats.total}`} loading={loading} />
        <StatCard icon={ReportProblemOutlinedIcon} tone="red" label="Critical (1–2)" value={stats.criticalShare} meta={`${stats.critical} of ${stats.total}`} loading={loading} />
      </Box>

      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1.5, justifyContent: 'space-between', mb: 2 }}>
              <FilterTabs value={filter} onChange={setFilter} ariaLabel="Filter feedback" options={FILTERS.map(([value, label]) => ({ value, label, count: loading ? undefined : counts[value] }))} />
              <SearchField id="feedback-search" value={query} onChange={setQuery} placeholder="Search customer, event or review" />
            </Box>

            {loading ? (
              <ListSkeleton rows={3} height={190} />
            ) : shown.length === 0 ? (
              <EmptyState
                compact
                icon={RateReviewOutlinedIcon}
                title={query ? 'No feedback matches' : 'Nothing here yet'}
                description={query ? 'Try another search or filter.' : 'Reviews appear here once customers rate their completed events.'}
              />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {shown.map((feedback) => (
                  <FeedbackCard
                    key={feedback.id}
                    feedback={feedback}
                    busy={busyId === feedback.id}
                    onOpenEvent={() => navigate(`/reservations/${feedback.ref}`)}
                    onRead={() => act(feedback.id, () => feedbackApi.markFeedbackRead(feedback.id))}
                    onStatus={(status) => act(feedback.id, () => feedbackApi.setFeedbackStatus(feedback.id, status), status === 'published' ? 'Published on the website.' : 'Taken off the website.')}
                    onFeature={() => act(feedback.id, () => feedbackApi.setFeedbackFeatured(feedback.id, !feedback.featured), feedback.featured ? 'Removed from the featured reviews.' : 'Featured on the website.')}
                    onFlag={() => (feedback.flagged ? act(feedback.id, () => feedbackApi.setFeedbackFlag(feedback.id, { flagged: false }), 'Flag removed.') : setFlagging(feedback))}
                    onArchive={() => act(feedback.id, () => feedbackApi.setFeedbackArchived(feedback.id, !feedback.archived), feedback.archived ? 'Restored from the archive.' : 'Moved to the archive.')}
                    onReply={() => setReplying(feedback)}
                    onDelete={() => setDeleting(feedback)}
                  />
                ))}
              </Box>
            )}

            {!loading && filtered.length > 0 && <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} noun="feedbacks" />}
          </>
        )}
      </DashCard>

      <ReplyDialog
        feedback={replying}
        onClose={() => setReplying(null)}
        // Save the answer under the review and send the same words to the customer's chat thread
        onSubmit={async (body) => {
          await feedbackApi.replyToFeedback(replying.id, body);
          setReplying(null);
          notify('Reply sent to the customer.');
        }}
      />

      <ConfirmDialog
        open={Boolean(flagging)}
        onClose={() => setFlagging(null)}
        title="Flag this feedback?"
        description="A flagged review is taken off the website until the flag is removed. The reason is only seen by the admin."
        confirmLabel="Flag feedback"
        tone="danger"
        reasonLabel="Reason for flagging"
        reasonPlaceholder="e.g. Checking the service report for this date before it goes on the website."
        onConfirm={async (reason) => {
          await feedbackApi.setFeedbackFlag(flagging.id, { flagged: true, reason });
          setFlagging(null);
          notify('Feedback flagged.');
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this feedback?"
        description={deleting ? `${deleting.customerName}'s review of ${deleting.eventName} will be removed for good, here and in their portal. They will be able to write a new one. Archive it instead if you only want it out of the list.` : ''}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await feedbackApi.deleteFeedback(deleting.id);
          setDeleting(null);
          notify('Feedback deleted.');
        }}
      />
    </>
  );
}

/** One review: who wrote it, which event it is about, what they said and what the admin can do with it. */
function FeedbackCard({ feedback, busy, onOpenEvent, onRead, onStatus, onFeature, onFlag, onArchive, onReply, onDelete }) {
  const unread = !feedback.readByAdmin;
  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1px solid ${feedback.flagged ? 'rgba(239, 68, 68, 0.35)' : tokens.cardLightBorder}`,
        // Unread reviews carry a gold edge so they stand out in the list
        borderLeft: `3px solid ${unread ? tokens.gold : feedback.flagged ? tokens.red : tokens.cardLightBorder}`,
        backgroundColor: feedback.archived ? tokens.surfaceSubtle : '#fff',
        p: { xs: 1.75, sm: 2.25 }
      }}
    >
      {/* Customer on the left, event and website status on the right */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 220, flex: '1 1 300px' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{feedback.customerName}</Typography>
            {unread && <Pill label="New" bg={tokens.goldChip} fg={tokens.goldDark} size="sm" />}
          </Box>
          <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
            {feedback.customerEmail}
            {feedback.customerMobile ? ` · ${formatMobile(feedback.customerMobile)}` : ''}
          </Typography>
          <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <StarRating value={feedback.rating} showValue />
            <Typography sx={{ fontSize: 12, color: tokens.textMuted }} title={formatDateTime(feedback.createdAt)}>
              Submitted · {formatRelative(feedback.createdAt)}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ minWidth: 220, flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 12.5, color: tokens.textMuted, minWidth: 92 }}>Event</Typography>
            <Button size="small" onClick={onOpenEvent} sx={{ p: 0, minWidth: 0, fontSize: 13, fontWeight: 700, textAlign: 'left', justifyContent: 'flex-start' }}>
              {feedback.eventName || feedback.ref}
            </Button>
            {feedback.packageName && <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>({feedback.packageName})</Typography>}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
            <Typography sx={{ fontSize: 12.5, color: tokens.textMuted, minWidth: 92 }}>Date of event</Typography>
            <Typography sx={{ fontSize: 13 }}>{formatDate(feedback.eventDate)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 12.5, color: tokens.textMuted, minWidth: 92 }}>Status</Typography>
            {/* Flagged and archived reviews are off the website until that is undone, so the picker waits */}
            {feedback.flagged || feedback.archived ? (
              <FeedbackStatusChip feedback={feedback} />
            ) : (
              <SelectField
                id={`status-${feedback.id}`}
                value={feedback.status}
                onChange={(e) => onStatus(e.target.value)}
                disabled={busy}
                options={[
                  { value: 'published', label: feedback.featured ? 'Published · Featured' : 'Published' },
                  { value: 'hidden', label: 'Not published' }
                ]}
                sx={{ minWidth: 190, '& .MuiInputBase-input': { py: 0.75, fontSize: 13 } }}
              />
            )}
          </Box>
        </Box>
      </Box>

      <Typography sx={{ mt: 1.75, fontSize: 13.5, lineHeight: 1.7, color: tokens.textPrimary }}>“{feedback.body}”</Typography>

      {/* What the customer rated part by part */}
      <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2.5 } }}>
        {FEEDBACK_CATEGORIES.map(({ key, label }) => (
          <Typography key={key} sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
            {label}: <b style={{ color: tokens.textPrimary }}>{feedback.categories[key] ? `${feedback.categories[key]}/5` : 'not rated'}</b>
          </Typography>
        ))}
      </Box>

      {/* The admin's own note on why this review was set aside */}
      {feedback.flagged && feedback.flagReason && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, backgroundColor: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>Flagged</Typography>
          <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{feedback.flagReason}</Typography>
        </Box>
      )}

      {/* The answer the customer already received */}
      {feedback.reply && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle, border: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary }}>
            Replied by {feedback.reply.by} · {formatDateTime(feedback.reply.at)}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12.5, color: tokens.textPrimary }}>{feedback.reply.body}</Typography>
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<ReplyRoundedIcon />} onClick={onReply} disabled={busy}>
          {feedback.reply ? 'Edit the reply' : 'Reply to the customer'}
        </Button>
        <Button size="small" startIcon={<StarRoundedIcon />} onClick={onFeature} disabled={busy} sx={{ color: feedback.featured ? tokens.goldDark : undefined }}>
          {feedback.featured ? 'Remove from featured' : 'Feature on the website'}
        </Button>
        <Button size="small" startIcon={<FlagOutlinedIcon />} onClick={onFlag} disabled={busy} sx={{ color: feedback.flagged ? tokens.redPress : undefined }}>
          {feedback.flagged ? 'Remove flag' : 'Flag'}
        </Button>
        <Button size="small" startIcon={feedback.archived ? <UnarchiveOutlinedIcon /> : <ArchiveOutlinedIcon />} onClick={onArchive} disabled={busy}>
          {feedback.archived ? 'Restore' : 'Archive'}
        </Button>
        {unread && (
          <Button size="small" startIcon={<DoneAllRoundedIcon />} onClick={onRead} disabled={busy}>
            Mark as read
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Delete this feedback">
          <span>
            <IconButton size="small" onClick={onDelete} disabled={busy} aria-label={`Delete the feedback from ${feedback.customerName}`} sx={{ color: tokens.red }}>
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}

/** Dialog for answering a review. The reply is saved under it and sent to the customer as a message. */
function ReplyDialog({ feedback, onClose, onSubmit }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Start with the reply already sent (if any), so the admin edits instead of retyping
  useEffect(() => {
    if (feedback) {
      setBody(feedback.reply ? feedback.reply.body : '');
      setError('');
    }
  }, [feedback]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(body);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={Boolean(feedback)}
      onClose={onClose}
      busy={busy}
      title="Reply to the customer"
      description={feedback ? `${feedback.customerName} · ${feedback.eventName} · ${formatDate(feedback.eventDate)}` : ''}
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={submit}>
            Send reply
          </BusyButton>
        </>
      }
    >
      {feedback && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle, border: `1px solid ${tokens.cardLightBorder}` }}>
          <StarRating value={feedback.rating} size={16} showValue />
          <Typography sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.6, color: tokens.textSecondary }}>“{feedback.body}”</Typography>
        </Box>
      )}
      <FormField
        id="feedback-reply"
        label="Your reply"
        required
        multiline
        minRows={4}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setError('');
        }}
        error={error}
        hint={`${body.trim().length}/1000 · Saved under the review and sent to the customer as a message.`}
        inputProps={{ maxLength: 1000 }}
        placeholder="Thank the customer and answer anything they raised."
      />
    </AppDialog>
  );
}
