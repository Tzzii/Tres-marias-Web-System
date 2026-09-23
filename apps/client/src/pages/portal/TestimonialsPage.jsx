import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Rating from '@mui/material/Rating';
import Typography from '@mui/material/Typography';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import {
  AppDialog,
  BusyButton,
  CardTitle,
  DashCard,
  EmptyState,
  ErrorState,
  FEEDBACK_CATEGORIES,
  FormField,
  ListSkeleton,
  PageHeader,
  Pill,
  StarRating,
  feedbackApi,
  formatDate,
  formatDateTime,
  reservationApi,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

/**
 * Where a review stands for the customer. The team's own working states (flagged, archived)
 * are not shown here: to the customer the review is either on the website or still with the team.
 */
function websiteState(testimonial) {
  if (testimonial.archived || testimonial.flagged || testimonial.status !== 'published') {
    return { label: 'With the Tres Marias team', bg: tokens.surfaceMuted, fg: tokens.textSecondary };
  }
  if (testimonial.featured) return { label: 'Featured on our website', bg: tokens.goldChip, fg: tokens.goldDark };
  return { label: 'Published on our website', bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857' };
}

/** My testimonials: reviews for completed events, and the events still waiting for one. */
export default function TestimonialsPage() {
  useDocumentTitle('My testimonials');
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // Load the customer's reservations and the reviews they've written
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, testimonials] = await Promise.all([reservationApi.listReservations({ customerId: user.id }), feedbackApi.listFeedbacks({ customerId: user.id })]);
    return { reservations, testimonials };
  }, [user.id]);

  const [writing, setWriting] = useState(null); // reservation being reviewed in the dialog

  // Completed events that don't have a review yet
  const reviewable = data ? data.reservations.filter((r) => r.status === 'completed' && !data.testimonials.some((t) => t.ref === r.ref)) : [];

  // Arriving from a reservation's "Write a testimonial" opens the form for it
  const refParam = params.get('ref');
  useEffect(() => {
    if (!data || !refParam) return;
    const target = reviewable.find((r) => r.ref === refParam);
    if (target) setWriting(target);
    setParams({}, { replace: true });
  }, [data, refParam]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  return (
    <>
      <PageHeader title="My testimonials" subtitle="Share how your celebration went. Your review goes to the Tres Marias team, who may publish it on our website." />
      {loading ? (
        <DashCard>
          <ListSkeleton rows={3} height={80} />
        </DashCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {reviewable.length > 0 && (
            <DashCard>
              <CardTitle subtitle="Completed events you have not reviewed yet">Waiting for your review</CardTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {reviewable.map((r) => (
                  <Box key={r.ref} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 180 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{r.eventName}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                        {formatDate(r.date)} · {r.packageName} · {r.guests} guests
                      </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<RateReviewOutlinedIcon />} onClick={() => setWriting(r)}>
                      Write a testimonial
                    </Button>
                  </Box>
                ))}
              </Box>
            </DashCard>
          )}

          <DashCard>
            <CardTitle>Your reviews</CardTitle>
            {data.testimonials.length === 0 ? (
              <EmptyState compact icon={RateReviewOutlinedIcon} title="No testimonials yet" description="After your event is completed, you can rate it and leave a short review here." />
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                {data.testimonials.map((t) => {
                  const state = websiteState(t);
                  return (
                    <Box key={t.id} sx={{ p: 2, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                        <StarRating value={t.rating} />
                        <Pill label={state.label} bg={state.bg} fg={state.fg} size="sm" />
                      </Box>
                      <Typography sx={{ mt: 1, fontSize: 13.5, lineHeight: 1.6, color: tokens.textPrimary }}>“{t.body}”</Typography>
                      {/* What they rated part by part */}
                      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                        {FEEDBACK_CATEGORIES.filter(({ key }) => t.categories[key]).map(({ key, label }) => (
                          <Typography key={key} sx={{ fontSize: 12, color: tokens.textSecondary }}>
                            {label}: <b>{t.categories[key]}/5</b>
                          </Typography>
                        ))}
                      </Box>
                      <Typography sx={{ mt: 1, fontSize: 12, color: tokens.textMuted }}>
                        {t.eventName} · {formatDate(t.eventDate)}
                      </Typography>
                      {/* The admin's answer, the same one sent to the customer's chat */}
                      {t.reply && (
                        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle, border: `1px solid ${tokens.cardLightBorder}` }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary }}>
                            Reply from Admin · {formatDateTime(t.reply.at)}
                          </Typography>
                          <Typography sx={{ mt: 0.25, fontSize: 12.5, lineHeight: 1.6, color: tokens.textPrimary }}>{t.reply.body}</Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </DashCard>
        </Box>
      )}

      <WriteDialog
        reservation={writing}
        onClose={() => setWriting(null)}
        // Save the review for the selected reservation, close the dialog and thank the customer
        onSubmit={async (values) => {
          await feedbackApi.createFeedback(user.id, { ref: writing.ref, ...values });
          setWriting(null);
          notify('Thank you for your testimonial!');
        }}
      />
    </>
  );
}

// A blank category sheet: every part of the service starts unrated
const noCategories = () => Object.fromEntries(FEEDBACK_CATEGORIES.map(({ key }) => [key, 0]));

/** Dialog with the overall rating, a rating for each part of the service and the review text. */
function WriteDialog({ reservation, onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [categories, setCategories] = useState(noCategories);
  const [touched, setTouched] = useState([]); // categories the customer set themselves
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Start with a blank review each time the dialog opens
  useEffect(() => {
    if (reservation) {
      setRating(0);
      setCategories(noCategories());
      setTouched([]);
      setBody('');
      setErrors({});
    }
  }, [reservation]);

  // The overall rating fills in the parts the customer has not rated on their own, so the
  // usual "everything went well" review is one click; changing a part keeps that choice.
  const chooseOverall = (value) => {
    const stars = value || 0;
    setRating(stars);
    setCategories((current) => Object.fromEntries(Object.entries(current).map(([key, v]) => [key, touched.includes(key) ? v : stars])));
    setErrors({});
  };

  const chooseCategory = (key, value) => {
    setCategories((current) => ({ ...current, [key]: value || 0 }));
    setTouched((current) => (current.includes(key) ? current : [...current, key]));
    setErrors({});
  };

  // Require an overall rating, a rating for every part and at least 20 characters, then submit
  const submit = async () => {
    const found = {};
    if (!rating) found.rating = 'Choose an overall rating.';
    const missing = FEEDBACK_CATEGORIES.filter(({ key }) => !categories[key]);
    if (missing.length) found.categories = `Please rate ${missing.map((c) => c.label.toLowerCase()).join(', ')}.`;
    if (body.trim().length < 20) found.body = 'Tell us a little more (at least 20 characters).';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onSubmit({ rating, categories, body });
    } catch (e) {
      // Show the error under the field it refers to (the review box by default)
      setErrors({ [(e.meta && e.meta.field) || 'body']: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={Boolean(reservation)}
      onClose={onClose}
      busy={busy}
      title="Write a testimonial"
      description={reservation ? `${reservation.eventName} · ${formatDate(reservation.date)}` : ''}
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={submit}>
            Submit testimonial
          </BusyButton>
        </>
      }
    >
      <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Your overall rating</Typography>
      <Rating value={rating} onChange={(_, v) => chooseOverall(v)} size="large" sx={{ color: tokens.gold }} />
      {errors.rating && <Typography sx={{ fontSize: 12, color: tokens.redPress }}>{errors.rating}</Typography>}

      <Typography sx={{ mt: 2, fontSize: 13, fontWeight: 600, mb: 0.5 }}>How was each part?</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle, border: `1px solid ${tokens.cardLightBorder}` }}>
        {FEEDBACK_CATEGORIES.map(({ key, label }) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{label}</Typography>
            {/* Each part is its own radio group, so MUI needs a name of its own.
                Touch screens get bigger stars (26px instead of 18px) so the right one is easy to tap. */}
            <Rating name={`rating-${key}`} aria-label={label} value={categories[key]} onChange={(_, v) => chooseCategory(key, v)} size="small" sx={{ color: tokens.gold, '@media (pointer: coarse)': { fontSize: '1.625rem' } }} />
          </Box>
        ))}
      </Box>
      {errors.categories && <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.redPress }}>{errors.categories}</Typography>}

      <FormField id="testimonial-body" label="Your review" multiline minRows={4} value={body} onChange={(e) => { setBody(e.target.value); setErrors({}); }} error={errors.body} hint={`${body.trim().length}/600`} inputProps={{ maxLength: 600 }} placeholder="What did your guests love? How was the service?" sx={{ mt: 2 }} />
    </AppDialog>
  );
}
