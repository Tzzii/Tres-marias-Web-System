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

function websiteState(testimonial) {
  if (testimonial.archived || testimonial.flagged || testimonial.status !== 'published') {
    return { label: 'With the Tres Marias team', bg: tokens.surfaceMuted, fg: tokens.textSecondary };
  }
  if (testimonial.featured) return { label: 'Featured on our website', bg: tokens.goldChip, fg: tokens.goldDark };
  return { label: 'Published on our website', bg: 'rgba(16, 185, 129, 0.12)', fg: tokens.successText };
}

export default function TestimonialsPage() {
  useDocumentTitle('My Testimonials');
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, testimonials] = await Promise.all([
      reservationApi.listReservations({ customerId: user.id }),
      feedbackApi.listFeedbacks({ customerId: user.id })
    ]);
    return { reservations, testimonials };
  }, [user.id]);

  const [writing, setWriting] = useState(null);

  const reviewable = data
    ? data.reservations.filter((r) => r.status === 'completed' && !data.testimonials.some((t) => t.ref === r.ref))
    : [];

  const refParam = params.get('ref');
  useEffect(() => {
    if (!data || !refParam) return;
    const target = reviewable.find((r) => r.ref === refParam);
    if (target) setWriting(target);
    setParams({}, { replace: true });
  }, [data, refParam]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={reload} />
      </DashCard>
    );

  return (
    <>
      <PageHeader
        title="My Testimonials"
        subtitle="Share how your celebration went. Your review goes to the Tres Marias team, who may publish it on our website."
      />
      {loading ? (
        <DashCard>
          <ListSkeleton rows={3} height={80} />
        </DashCard>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {reviewable.length > 0 && (
            <DashCard>
              <CardTitle subtitle="Completed events you have not reviewed yet">Waiting for Your Review</CardTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {reviewable.map((r) => (
                  <Box
                    key={r.ref}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${tokens.cardLightBorder}`,
                      flexWrap: 'wrap'
                    }}
                  >
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
            <CardTitle>Your Reviews</CardTitle>
            {data.testimonials.length === 0 ? (
              <EmptyState
                compact
                icon={RateReviewOutlinedIcon}
                title="No testimonials yet"
                description="After your event is completed, you can rate it and leave a short review here."
              />
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                {data.testimonials.map((t) => {
                  const state = websiteState(t);
                  return (
                    <Box key={t.id} sx={{ p: 2, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          flexWrap: 'wrap'
                        }}
                      >
                        <StarRating value={t.rating} />
                        <Pill label={state.label} bg={state.bg} fg={state.fg} size="sm" />
                      </Box>
                      <Typography sx={{ mt: 1, fontSize: 13.5, lineHeight: 1.6, color: tokens.textPrimary }}>
                        “{t.body}”
                      </Typography>
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
                      {t.reply && (
                        <Box
                          sx={{
                            mt: 1.5,
                            p: 1.5,
                            borderRadius: 1.5,
                            backgroundColor: tokens.surfaceSubtle,
                            border: `1px solid ${tokens.cardLightBorder}`
                          }}
                        >
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary }}>
                            Reply from Admin · {formatDateTime(t.reply.at)}
                          </Typography>
                          <Typography sx={{ mt: 0.25, fontSize: 12.5, lineHeight: 1.6, color: tokens.textPrimary }}>
                            {t.reply.body}
                          </Typography>
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
        onSubmit={async (values) => {
          await feedbackApi.createFeedback(user.id, { ref: writing.ref, ...values });
          setWriting(null);
          notify('Thank you for your testimonial!');
        }}
      />
    </>
  );
}

const noCategories = () => Object.fromEntries(FEEDBACK_CATEGORIES.map(({ key }) => [key, 0]));

function WriteDialog({ reservation, onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [categories, setCategories] = useState(noCategories);
  const [touched, setTouched] = useState([]);
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (reservation) {
      setRating(0);
      setCategories(noCategories());
      setTouched([]);
      setBody('');
      setErrors({});
    }
  }, [reservation]);

  const chooseOverall = (value) => {
    const stars = value || 0;
    setRating(stars);
    setCategories((current) =>
      Object.fromEntries(Object.entries(current).map(([key, v]) => [key, touched.includes(key) ? v : stars]))
    );
    setErrors({});
  };

  const chooseCategory = (key, value) => {
    setCategories((current) => ({ ...current, [key]: value || 0 }));
    setTouched((current) => (current.includes(key) ? current : [...current, key]));
    setErrors({});
  };

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
      title="Write a Testimonial"
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
      <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Your Overall Rating</Typography>
      <Rating value={rating} onChange={(_, v) => chooseOverall(v)} size="large" sx={{ color: tokens.gold }} />
      {errors.rating && <Typography sx={{ fontSize: 12, color: tokens.redPress }}>{errors.rating}</Typography>}

      <Typography sx={{ mt: 2, fontSize: 13, fontWeight: 600, mb: 0.5 }}>How Was Each Part?</Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1,
          p: 1.5,
          borderRadius: 1.5,
          backgroundColor: tokens.surfaceSubtle,
          border: `1px solid ${tokens.cardLightBorder}`
        }}
      >
        {FEEDBACK_CATEGORIES.map(({ key, label }) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{label}</Typography>
            <Rating
              name={`rating-${key}`}
              aria-label={label}
              value={categories[key]}
              onChange={(_, v) => chooseCategory(key, v)}
              size="small"
              sx={{ color: tokens.gold, '@media (pointer: coarse)': { fontSize: '1.625rem' } }}
            />
          </Box>
        ))}
      </Box>
      {errors.categories && (
        <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.redPress }}>{errors.categories}</Typography>
      )}

      <FormField
        id="testimonial-body"
        label="Your review"
        multiline
        minRows={4}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setErrors({});
        }}
        error={errors.body}
        hint={`${body.trim().length}/600`}
        inputProps={{ maxLength: 600 }}
        placeholder="What did your guests love? How was the service?"
        sx={{ mt: 2 }}
      />
    </AppDialog>
  );
}
