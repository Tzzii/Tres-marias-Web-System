import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  assistantReservationStep,
  assistantUnavailableSelections,
  ASSISTANT_RESERVATION_STEPS
} from '@tm/shared/domain/assistantReservation.js';
import { mergeAssistantBooking } from '@tm/shared/domain/assistantBooking.js';
import { isRental, includesFood } from '@tm/shared/services/config.js';
import { emitChange } from '@tm/shared/services/events.js';
import { assistantApi } from '../../lib/assistantApi.js';
import AssistantReservationFields from './AssistantReservationFields.jsx';
import AssistantReferencePhotos from './AssistantReferencePhotos.jsx';
import { reservationPeso } from './AssistantReservationChoices.jsx';

const labels = {
  eventName: 'Event name',
  occasion: 'Occasion',
  service: 'Service',
  date: 'Date',
  schedule: 'Schedule',
  guests: 'Guest count',
  package: 'Package',
  menu: 'Menu',
  theme: 'Theme',
  colors: 'Colors',
  photos: 'Reference photos',
  design: 'Design details',
  venueName: 'Venue name',
  venueAddress: 'Venue address',
  city: 'City / municipality',
  access: 'Access notes',
  addons: 'Additional services',
  foodNotes: 'Food requests',
  budget: 'Budget',
  rentalItems: 'Rental items',
  fulfilment: 'Pickup / delivery'
};

export default function AssistantReservationFlow({
  conversation,
  user,
  disabled,
  onChange,
  onBusyChange,
  onFormReview
}) {
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [options, setOptions] = useState(null);
  const [weekendsOnly, setWeekendsOnly] = useState(false);
  const pending = useRef(false);
  const request = useRef(null);
  const active = useRef(true);
  const container = useRef(null);
  const draft = conversation.bookingDraft || {};
  const catalog = conversation.bookingCatalog
    ? {
        ...conversation.bookingCatalog,
        selectedPackageProposal: conversation.selectedPackageProposal,
        packageProposalIssue: conversation.packageProposalIssue
      }
    : undefined;
  const rental = isRental(draft.serviceType);
  const naturalStep = assistantReservationStep(draft, {
    catalog,
    schedule: conversation.bookingSchedule,
    photos: conversation.referencePhotos
  });
  const step = editing || naturalStep.key;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    setAgreed(false);
    setOptions(null);
  }, [conversation.draftRevision, conversation.conversationId]);
  useEffect(() => {
    container.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [step]);

  const run = useCallback(
    async (operation, { keepStep = false, update = true } = {}) => {
      if (pending.current || disabled) return;
      pending.current = true;
      setError('');
      onBusyChange(true);
      const abort = new AbortController();
      request.current = abort;
      try {
        const result = await operation(abort.signal);
        if (active.current) {
          if (update) onChange(result);
          if (!keepStep) setEditing('');
        }
        return result;
      } catch (failure) {
        if (active.current && failure.name !== 'AbortError') {
          setError(failure.message);
          // A submission may have committed before a connection failed. Read before offering another attempt.
          if (failure.code !== 'NOT_FOUND') {
            try {
              const latest = await assistantApi.read(conversation.conversationId, abort.signal);
              if (active.current) onChange(latest);
            } catch {
              /* Keep the original error and user's data. */
            }
          }
          if (['DATE_UNAVAILABLE', 'TIME_UNAVAILABLE'].includes(failure.code)) setEditing('schedule');
          else if (failure.code === 'OUT_OF_STOCK') setEditing(rental ? 'rentalItems' : 'addons');
        }
      } finally {
        pending.current = false;
        if (active.current) onBusyChange(false);
      }
    },
    [disabled, conversation.conversationId, onChange, onBusyChange, rental]
  );

  const save = (patch, clearFields = []) =>
    run((signal) =>
      assistantApi.validateBooking(
        conversation.conversationId,
        mergeAssistantBooking(draft, { planningStarted: true, ...patch }, clearFields),
        conversation.draftRevision,
        signal
      )
    );
  const finishPhotos = () => save({ discussed: [...new Set([...(draft.discussed || []), 'photos'])] });
  const chooseSchedule = (choice) =>
    save({
      date: choice.date,
      ...(choice.startTime ? { startTime: choice.startTime } : {}),
      ...(choice.endTime && !rental ? { endTime: choice.endTime } : {})
    });
  const submit = () => {
    if (!user || !agreed || naturalStep.key !== 'review') return;
    void run(async (signal) => {
      const result = await assistantApi.submitBooking(
        conversation.conversationId,
        { revision: conversation.draftRevision, agreeTerms: true, confirmSubmission: true },
        signal
      );
      emitChange();
      return result;
    });
  };
  if (!catalog) return null;
  const unavailable = assistantUnavailableSelections(draft, catalog);
  if (conversation.submittedRef)
    return (
      <Box className="tm-assistant-reservation" data-assistant-reservation ref={container}>
        <Alert severity="success">
          <strong>Reservation request sent</strong>
          <br />
          {conversation.submittedRef}
        </Alert>
        <Typography sx={{ fontSize: 12, my: 1.5 }}>
          Submitted under your customer account. The team will review your request and prepare your quotation. This is
          not a confirmed booking or a slot hold.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button
            component={RouterLink}
            to={`/portal/reservations/${encodeURIComponent(conversation.submittedRef)}`}
            variant="contained"
            size="small"
          >
            View reservation
          </Button>
          <Button
            type="button"
            disabled={disabled}
            size="small"
            onClick={() => void run((signal) => assistantApi.newReservation(user?.id, signal))}
          >
            Plan another reservation
          </Button>
        </Stack>
        {error && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  if (!draft.planningStarted)
    return (
      <Box className="tm-assistant-reservation tm-assistant-reservation--intro" data-assistant-reservation>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Let me help you make a reservation</Typography>
        <Typography sx={{ fontSize: 12, my: 1 }}>
          I will ask for your details, show your choices, and help you send a request when you are ready.
        </Typography>
        <Button
          type="button"
          variant="contained"
          size="small"
          disabled={disabled}
          onClick={() => void save({ planningStarted: true })}
        >
          Start reservation
        </Button>
        {error && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  const editable = Object.entries(labels).filter(([key]) => {
    if (['guests', 'package', 'theme', 'colors', 'photos', 'design', 'addons'].includes(key)) return !rental;
    if (['rentalItems', 'fulfilment'].includes(key)) return rental;
    if (['menu', 'foodNotes'].includes(key))
      return (
        !rental && (includesFood(draft.serviceType) || (key === 'menu' && draft.addonIds?.includes('add-dessert')))
      );
    if (['venueName', 'venueAddress', 'city', 'access'].includes(key))
      return !rental || draft.fulfilment === 'delivery';
    return true;
  });
  return (
    <Box className="tm-assistant-reservation" data-assistant-reservation ref={container}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Your guided reservation</Typography>
        <Chip size="small" label={step === 'review' ? 'Review' : labels[step] || 'Details'} />
      </Stack>
      <Typography component="p" aria-live="polite" sx={{ fontSize: 13, lineHeight: 1.7, mb: 2, fontWeight: 500 }}>
        {ASSISTANT_RESERVATION_STEPS[step]}
      </Typography>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {unavailable.removed.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Some saved selections are no longer available. Remove them to continue choosing current items.
          <Button disabled={disabled} onClick={() => void save(unavailable.patch, unavailable.clearFields)}>
            {rental ? 'Remove unavailable items' : 'Remove unavailable services'}
          </Button>
        </Alert>
      )}
      {editing && (
        <Button size="small" disabled={disabled} onClick={() => setEditing('')} sx={{ mb: 1 }}>
          Back to current step
        </Button>
      )}
      {step === 'photos' ? (
        <>
          <AssistantReferencePhotos
            conversation={conversation}
            disabled={disabled}
            onUpload={(files) =>
              run(
                (signal) =>
                  assistantApi.uploadPhotos(conversation.conversationId, files, conversation.draftRevision, signal),
                { keepStep: true }
              )
            }
            onRemove={(index) =>
              run(
                (signal) =>
                  assistantApi.removePhoto(conversation.conversationId, index, conversation.draftRevision, signal),
                { keepStep: true }
              )
            }
          />
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" size="small" disabled={disabled} onClick={() => void finishPhotos()}>
              {conversation.referencePhotos?.length ? 'Continue' : 'Skip for now'}
            </Button>
          </Stack>
        </>
      ) : step === 'customPackage' ? (
        <Alert severity="info">
          Review fresh package options in the package planner above before continuing with this reservation.
        </Alert>
      ) : step === 'review' ? (
        <>
          <ReservationSummary conversation={conversation} />
          {!user ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Your plan is saved. <RouterLink to="/signup?continue=assistant">Create an account</RouterLink> or{' '}
              <RouterLink to="/login?next=%2Fportal%2Fassistant">log in</RouterLink> to review and submit under your
              name.
            </Alert>
          ) : (
            <>
              <Typography sx={{ fontSize: 12, mt: 2 }}>
                This request will be sent as <strong>{user.name || user.email}</strong>.
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={agreed}
                    disabled={disabled || naturalStep.key !== 'review'}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                }
                label={
                  <Typography sx={{ fontSize: 12 }}>
                    I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noreferrer">
                      Terms of Service
                    </a>
                  </Typography>
                }
              />
              <Button
                type="button"
                variant="contained"
                fullWidth
                disabled={disabled || !agreed || naturalStep.key !== 'review'}
                onClick={submit}
              >
                Submit reservation request
              </Button>
            </>
          )}
        </>
      ) : (
        <AssistantReservationFields
          key={`${step}:${conversation.draftRevision}`}
          step={step}
          draft={draft}
          catalog={catalog}
          disabled={disabled}
          onSave={save}
        />
      )}
      {(step === 'schedule' || step === 'date') && (
        <Box sx={{ mt: 2 }}>
          {conversation.bookingSchedule && (
            <Alert severity={conversation.bookingSchedule.available ? 'success' : 'warning'} sx={{ mb: 1 }}>
              {conversation.bookingSchedule.available
                ? conversation.bookingSchedule.dateOnly
                  ? 'The date is open. Choose your times so I can check the exact schedule.'
                  : 'Your preferred schedule is currently available.'
                : conversation.bookingSchedule.reason || 'That schedule is unavailable. Please choose another.'}
            </Alert>
          )}
          {draft.date && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={weekendsOnly}
                    disabled={disabled}
                    onChange={(e) => setWeekendsOnly(e.target.checked)}
                  />
                }
                label={<Typography sx={{ fontSize: 11 }}>Weekend dates only</Typography>}
              />
              <Button
                type="button"
                variant="outlined"
                size="small"
                disabled={disabled}
                onClick={() =>
                  void run(
                    async (signal) => {
                      const result = await assistantApi.scheduleOptions(
                        conversation.conversationId,
                        { weekendsOnly },
                        signal
                      );
                      if (active.current) setOptions(result);
                      return result;
                    },
                    { update: false, keepStep: true }
                  )
                }
              >
                Find other schedules
              </Button>
              {options && (
                <Stack spacing={1} sx={{ mt: 1.5 }}>
                  {options.error && <Alert severity="info">{options.error}</Alert>}
                  {options.times?.length > 0 && (
                    <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Other times on the same day</Typography>
                  )}
                  {(options.times || []).map((choice) => (
                    <Button
                      key={choice.startTime}
                      type="button"
                      size="small"
                      variant="outlined"
                      disabled={disabled}
                      onClick={() => void chooseSchedule(choice)}
                    >
                      {choice.startTime}
                      {choice.endTime ? `–${choice.endTime}` : ''} · {choice.date}
                    </Button>
                  ))}
                  {options.dates?.length > 0 && (
                    <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Nearby available dates</Typography>
                  )}
                  {(options.dates || []).map((choice) => (
                    <Button
                      key={choice.date}
                      type="button"
                      size="small"
                      variant="outlined"
                      disabled={disabled}
                      onClick={() => void chooseSchedule(choice)}
                    >
                      {choice.date}
                      {choice.startTime ? ` · ${choice.startTime}${choice.endTime ? `–${choice.endTime}` : ''}` : ''}
                    </Button>
                  ))}
                  {!options.error && !options.times?.length && !options.dates?.length && (
                    <Typography sx={{ fontSize: 12 }}>
                      No matching schedules were found within the next 14 days. Try another date or contact the team.
                    </Typography>
                  )}
                </Stack>
              )}
            </>
          )}
        </Box>
      )}
      <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #e2d2b6' }}>
        <TextField
          select
          label="Change a detail"
          value={editing}
          disabled={disabled}
          onChange={(e) => {
            setEditing(e.target.value);
            setError('');
            setAgreed(false);
          }}
          SelectProps={{ native: true }}
          InputLabelProps={{ shrink: true }}
          size="small"
          fullWidth
        >
          <option value="">Choose a detail to edit</option>
          {editable.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </TextField>
        {step !== 'review' && (
          <>
            <Button
              type="button"
              size="small"
              onClick={() => setShowSummary((v) => !v)}
              aria-expanded={showSummary}
              sx={{ mt: 1 }}
            >
              Review saved details
            </Button>
            <Collapse in={showSummary}>
              <ReservationSummary conversation={conversation} />
            </Collapse>
          </>
        )}
        {onFormReview && (
          <Button type="button" size="small" disabled={disabled} onClick={onFormReview} sx={{ mt: 1 }}>
            Continue in booking form
          </Button>
        )}
        <Typography sx={{ fontSize: 10.5, color: 'text.secondary', mt: 1 }}>
          Your choices are saved with this conversation for up to 24 hours. Selection controls do not use an AI
          question. You can also type or speak a change.
        </Typography>
      </Box>
    </Box>
  );
}

function ReservationSummary({ conversation }) {
  const estimate = conversation.bookingEstimate;
  return (
    <Box className="tm-assistant-review-summary">
      {(conversation.bookingPlan?.summary || []).map((row) => (
        <Typography key={row.label} sx={{ fontSize: 12, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
          <strong>{row.label}:</strong> {row.value}
        </Typography>
      ))}
      <Typography sx={{ fontSize: 12, mt: 1 }}>
        <strong>Reference photos:</strong> {conversation.referencePhotos?.length || 0}
      </Typography>
      {conversation.referencePhotos?.map((p) => (
        <Typography key={p.index} sx={{ fontSize: 11, overflowWrap: 'anywhere' }}>
          {p.name}
        </Typography>
      ))}
      {estimate && (
        <Box sx={{ mt: 1.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Current estimate</Typography>
          {estimate.lines?.map((line, i) => (
            <Typography key={i} sx={{ fontSize: 12 }}>
              {line.name}: {reservationPeso(line.amount)}
            </Typography>
          ))}
          <Typography sx={{ fontSize: 13, fontWeight: 700, mt: 0.5 }}>
            Known subtotal: {reservationPeso(estimate.knownSubtotal)}
          </Typography>
          {estimate.pendingQuotation?.length > 0 && (
            <Typography sx={{ fontSize: 11, mt: 0.5 }}>
              Still to be reviewed or quoted: {estimate.pendingQuotation.join('; ')}.
            </Typography>
          )}
        </Box>
      )}
      {conversation.bookingPlan?.warnings?.map((warning) => (
        <Alert severity="warning" key={warning} sx={{ mt: 1 }}>
          {warning}
        </Alert>
      ))}
      <Typography sx={{ fontSize: 11, mt: 1.5 }}>
        The team prepares your final quotation. Sending this request does not hold a slot or confirm the booking.
      </Typography>
    </Box>
  );
}
