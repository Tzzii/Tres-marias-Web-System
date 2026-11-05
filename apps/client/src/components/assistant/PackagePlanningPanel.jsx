import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import {
  catalogApi,
  packageProposalApi,
  RULES,
  SERVICE_TYPES,
  OCCASIONS,
  DISH_CATEGORIES,
  useResource
} from '@tm/shared';
import {
  packageContextFromDraft,
  packagePlanningValues,
  reconcilePackagePlanningValues
} from '../../lib/packageProposalDraft.js';
import { mergeAssistantBooking } from '@tm/shared/domain/assistantBooking.js';
import { earliestBookableDate, endTimeProblem, initialEndTime } from '@tm/shared/domain/availability.js';
import { stylingProblem } from '@tm/shared/domain/styling.js';
import { assistantApi } from '../../lib/assistantApi.js';
import PackageProposalOption from './PackageProposalOption.jsx';
import { ReservationThemes, ReservationColors, ReservationAddons } from './AssistantReservationChoices.jsx';
import AssistantReferencePhotos from './AssistantReferencePhotos.jsx';
import { menuCount } from '@tm/shared/domain/menu.js';

const stages = [
  'Service',
  'Guests and budget',
  'Occasion and priorities',
  'Date and time',
  'Theme and colors',
  'Menu and food notes',
  'Additional services',
  'Review'
];
// Override only the new guided surface, leaving the public landing assistant's fixed light styling intact.
const planningSurfaceSx = {
  '&&': { bgcolor: 'background.paper', color: 'text.primary', borderColor: 'divider' },
  '& .tm-assistant-item-choice, & .tm-assistant-package-choice': {
    bgcolor: 'background.paper',
    color: 'text.primary',
    borderColor: 'divider'
  },
  '& .tm-assistant-package-choice.is-selected': { borderColor: 'primary.main', boxShadow: 'none' }
};
const savedStage = (draft) => {
  if (!SERVICE_TYPES.includes(draft.serviceType)) return 0;
  if (!draft.guests || !draft.budget) return 1;
  if (!draft.occasion) return 2;
  if (!draft.date || !draft.startTime || !draft.endTime) return 3;
  if (!draft.discussed?.includes('styling')) return 4;
  if (!draft.discussed?.includes('menu')) return 5;
  if (!draft.discussed?.includes('addons')) return 6;
  return 7;
};

export default function PackagePlanningPanel({
  conversation,
  disabled,
  onChange,
  onBusyChange,
  requested,
  proposalId,
  generationAvailable = true
}) {
  const navigate = useNavigate();
  const draft = conversation.bookingDraft || {};
  const catalog = useResource(() => catalogApi.getCatalog(), [], { live: false });
  const [values, setValues] = useState(() => packagePlanningValues(draft));
  const [step, setStep] = useState(() => savedStage(draft));
  const [error, setError] = useState('');
  const [prior, setPrior] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const pending = useRef(false),
    active = useRef(true);
  const previousPlan = useRef(conversation);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const previous = previousPlan.current;
    setValues((local) => reconcilePackagePlanningValues(local, previous, conversation));
    if (previous.conversationId !== conversation.conversationId) {
      setStep(savedStage(draft));
      setReviewing(false);
      setError('');
    }
    previousPlan.current = conversation;
  }, [conversation.conversationId, conversation.draftRevision, conversation.bookingDraft]);
  useEffect(() => {
    let live = true;
    setPrior(null);
    if (proposalId)
      packageProposalApi
        .get(proposalId)
        .then((result) => {
          if (live) setPrior(result);
        })
        .catch((failure) => {
          if (live) setError(failure.message);
        });
    return () => {
      live = false;
    };
  }, [proposalId, conversation.conversationId]);
  const custom = draft.planningMode === 'custom';
  const incompatible = draft.planningStarted && (draft.planningMode !== 'custom' || Boolean(draft.packageSlug));
  async function run(operation) {
    if (disabled || pending.current) return;
    pending.current = true;
    onBusyChange(true);
    setError('');
    try {
      return await operation();
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
        if (['CATALOG_CHANGED', 'PROPOSAL_STALE'].includes(failure.code)) catalog.reload();
      }
    } finally {
      pending.current = false;
      if (active.current) onBusyChange(false);
    }
  }
  async function save(patch, { next = true } = {}) {
    return run(async () => {
      const cleared =
        draft.serviceType === 'Equipment rental'
          ? ['packageSlug', 'serviceType', 'rentalQty', 'fulfilment']
          : ['packageSlug'];
      const merged = mergeAssistantBooking(draft, { planningStarted: true, planningMode: 'custom', ...patch }, cleared);
      const updated = await assistantApi.validateBooking(
        conversation.conversationId,
        merged,
        conversation.draftRevision
      );
      if (active.current) {
        onChange(updated);
        if (next) setStep((n) => Math.min(7, n + 1));
      }
      return updated;
    });
  }
  const change = (patch) => {
    setValues((old) => ({ ...old, ...patch }));
    setError('');
  };
  async function next() {
    let patch;
    if (step === 0) {
      if (!SERVICE_TYPES.includes(values.serviceType)) return setError('Choose a catering service.');
      patch = { serviceType: values.serviceType };
    }
    if (step === 1) {
      const guests = Number(values.guests),
        budget = Number(values.budget);
      if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests)
        return setError(`Enter ${RULES.minGuests}–${RULES.maxGuests} guests.`);
      if (!Number.isInteger(budget) || budget < 1 || budget > 10000000)
        return setError('Enter a budget in whole pesos, up to ₱10,000,000.');
      patch = { guests, budget };
    }
    if (step === 2) {
      if (
        !OCCASIONS.includes(values.occasion) ||
        (values.occasion === 'Other' && (values.occasionOther || '').trim().length < 2)
      )
        return setError('Choose your occasion, or specify it under Other.');
      patch = {
        occasion: values.occasion,
        occasionOther: values.occasionOther || '',
        budgetNotes: values.budgetNotes || ''
      };
    }
    if (step === 3) {
      if (!values.date || values.date < earliestBookableDate())
        return setError('Choose a date with the required booking notice.');
      const issue = endTimeProblem(values.startTime, values.endTime);
      if (issue || !values.startTime) return setError(issue || 'Choose a start time.');
      patch = { date: values.date, startTime: values.startTime, endTime: values.endTime };
    }
    if (step === 4) {
      const issue = stylingProblem(values.styling);
      if (issue) return setError(issue.message);
      patch = {
        styling: values.styling,
        discussed: [...new Set([...(draft.discussed || []), 'styling', 'colors', 'design', 'photos'])]
      };
    }
    if (step === 5) {
      if (
        values.serviceType === 'Buffet and Catering' &&
        (menuCount(values.menu) > 4 || DISH_CATEGORIES.some(({ key }) => (values.menu[key] || []).length > 2))
      )
        return setError('Choose at most four dishes, with up to two in each category.');
      patch = {
        menu: values.menu,
        foodNotes: values.foodNotes || '',
        discussed: [...new Set([...(draft.discussed || []), 'menu', 'notes'])]
      };
    }
    if (step === 6)
      patch = {
        menu: values.menu,
        addonIds: values.addonIds,
        addonQty: values.addonQty,
        discussed: [...new Set([...(draft.discussed || []), 'addons', 'budget'])]
      };
    if (patch) await save(patch);
  }
  async function generate() {
    return run(async () => {
      if (!generationAvailable)
        throw new Error(
          'Package generation is temporarily unavailable. Your answers remain saved, and you can continue editing them.'
        );
      if (!catalog.data) throw new Error('Current catalog is still loading. Your answers remain saved.');
      const context = packageContextFromDraft(draft, catalog.data);
      const result = await packageProposalApi.generate({
        requestId: crypto.randomUUID(),
        conversationId: conversation.conversationId,
        context,
        reviewedCatalogFingerprint: catalog.data.packageProposalCatalogFingerprint
      });
      if (active.current)
        navigate(
          `/portal/package-proposals/${encodeURIComponent(result.id)}?conversation=${encodeURIComponent(conversation.conversationId)}`
        );
    });
  }
  if (!requested && !custom) return null;
  if (conversation.submittedRef) return null;
  if (!custom || incompatible)
    return (
      <Box className="tm-assistant-plan" sx={planningSurfaceSx}>
        <Typography variant="h6">Build a package around your event</Typography>
        <Typography variant="body2" sx={{ my: 1.5 }}>
          {incompatible
            ? 'You have a reservation plan in this conversation. Switching to a custom package replaces its package selection; your other event details and photos stay saved.'
            : 'I’ll ask about your service, guests and budget, then help you review complete options.'}
        </Typography>
        <Button
          disabled={disabled}
          variant="contained"
          onClick={() => {
            setStep(0);
            void save({ planningMode: 'custom' }, { next: false });
          }}
        >
          {incompatible ? 'Switch this plan to a custom package' : 'Start my package'}
        </Button>
        {error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  const selected = conversation.selectedPackageProposal;
  const rentalPackage = catalog.data?.packages?.find(
    (pkg) => pkg.kind === 'rental' && pkg.visible !== false && !pkg.archived
  );
  return (
    <Box className="tm-assistant-plan" sx={planningSurfaceSx}>
      <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Your custom package</Typography>
        <Chip label={selected && !reviewing ? 'Selected' : `${step + 1} of 8`} size="small" />
      </Stack>
      {conversation.packageProposalIssue && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {conversation.packageProposalIssue}
        </Alert>
      )}
      {error && (
        <Alert severity="warning" sx={{ my: 2 }}>
          {error}
        </Alert>
      )}
      {prior && (
        <Alert severity="info" sx={{ my: 2 }}>
          Review your previous answers before generating fresh options.
          <Button
            disabled={disabled}
            onClick={() => {
              const context = prior.context;
              void save(
                {
                  ...context,
                  budgetNotes: (context.preferences || '').slice(0, 500),
                  occasion: OCCASIONS.includes(context.occasion) ? context.occasion : 'Other',
                  occasionOther: OCCASIONS.includes(context.occasion) ? '' : (context.occasion || '').slice(0, 40),
                  addonIds: context.addonIds,
                  addonQty: context.addonQty
                },
                { next: false }
              );
              setReviewing(true);
              setStep(0);
              setPrior(null);
            }}
          >
            Load these reviewed answers
          </Button>
        </Alert>
      )}
      {selected && !reviewing ? (
        <>
          <PackageProposalOption option={selected} context={{ ...draft, budget: draft.budget }} index={0} />
          <Button
            sx={{ mt: 1 }}
            disabled={disabled}
            onClick={() => {
              setReviewing(true);
              setStep(0);
            }}
          >
            Adjust answers and regenerate
          </Button>
          <Typography variant="caption" component="p">
            Continue completing the reservation below. Changes to reviewed package details require new options.
          </Typography>
        </>
      ) : (
        <>
          <Typography variant="subtitle2" sx={{ my: 2 }}>
            {stages[step]}
          </Typography>
          <Box component="fieldset" disabled={disabled} sx={{ p: 0, m: 0, border: 0, minWidth: 0 }}>
            <Stack spacing={2}>
              {step === 0 && (
                <>
                  <Typography variant="body2">What service do you need?</Typography>
                  {SERVICE_TYPES.map((service) => (
                    <Button
                      key={service}
                      variant={values.serviceType === service ? 'contained' : 'outlined'}
                      aria-pressed={values.serviceType === service}
                      onClick={() => change({ serviceType: service })}
                    >
                      {service}
                    </Button>
                  ))}
                  <Button
                    component={RouterLink}
                    to={
                      rentalPackage ? `/portal/book?package=${encodeURIComponent(rentalPackage.slug)}` : '/portal/book'
                    }
                    disabled={disabled || !rentalPackage}
                  >
                    I need equipment rental
                  </Button>
                </>
              )}
              {step === 1 && (
                <>
                  <TextField
                    label="How many guests?"
                    type="number"
                    value={values.guests}
                    onChange={(e) => change({ guests: e.target.value })}
                    inputProps={{ min: RULES.minGuests, max: RULES.maxGuests }}
                  />
                  <TextField
                    label="Total event budget (₱)"
                    type="number"
                    value={values.budget}
                    onChange={(e) => change({ budget: e.target.value })}
                    inputProps={{ min: 1, max: 10000000, step: 1 }}
                    helperText="Include setup, food when applicable, and additional services."
                  />
                </>
              )}
              {step === 2 && (
                <>
                  <TextField
                    select
                    label="Occasion"
                    value={values.occasion || ''}
                    onChange={(e) => change({ occasion: e.target.value })}
                    SelectProps={{ native: true }}
                    InputLabelProps={{ shrink: true }}
                  >
                    <option value="">Choose an occasion</option>
                    {OCCASIONS.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </TextField>
                  {values.occasion === 'Other' && (
                    <TextField
                      label="Your occasion"
                      value={values.occasionOther || ''}
                      onChange={(e) => change({ occasionOther: e.target.value })}
                      inputProps={{ maxLength: 40 }}
                    />
                  )}
                  <TextField
                    label="What matters most to you?"
                    multiline
                    minRows={2}
                    value={values.budgetNotes}
                    onChange={(e) => change({ budgetNotes: e.target.value })}
                    inputProps={{ maxLength: 500 }}
                    helperText="For example: enough guest seating, a simple theme, or services you want to keep."
                  />
                </>
              )}
              {step === 3 && (
                <>
                  <TextField
                    label="Event date"
                    type="date"
                    value={values.date || ''}
                    onChange={(e) => change({ date: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: earliestBookableDate() }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    {['startTime', 'endTime'].map((key) => (
                      <TextField
                        key={key}
                        label={key === 'startTime' ? 'Start time' : 'End time'}
                        type="time"
                        value={values[key] || ''}
                        onChange={(e) =>
                          change({
                            [key]: e.target.value,
                            ...(key === 'startTime' ? { endTime: initialEndTime(e.target.value) } : {})
                          })
                        }
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 1800 }}
                        fullWidth
                      />
                    ))}
                  </Stack>
                </>
              )}
              {step === 4 && (
                <>
                  <ReservationThemes
                    value={values.styling}
                    occasion={values.occasion}
                    onChange={(styling) => change({ styling })}
                  />
                  <ReservationColors value={values.styling} onChange={(styling) => change({ styling })} />
                  <TextField
                    label="Design notes (optional)"
                    value={values.styling.notes || ''}
                    multiline
                    onChange={(e) => change({ styling: { ...values.styling, notes: e.target.value } })}
                    inputProps={{ maxLength: 1000 }}
                  />
                  <AssistantReferencePhotos
                    conversation={conversation}
                    disabled={disabled}
                    onUpload={(files) =>
                      run(async () => {
                        const updated = await assistantApi.uploadPhotos(
                          conversation.conversationId,
                          files,
                          conversation.draftRevision
                        );
                        if (active.current) onChange(updated);
                      })
                    }
                    onRemove={(index) =>
                      run(async () => {
                        const updated = await assistantApi.removePhoto(
                          conversation.conversationId,
                          index,
                          conversation.draftRevision
                        );
                        if (active.current) onChange(updated);
                      })
                    }
                  />
                </>
              )}
              {step === 5 && (
                <>
                  {values.serviceType === 'Buffet and Catering' ? (
                    <>
                      <Typography variant="body2">
                        Choose offered dishes you want to keep, or leave them blank so the package can complete four
                        dishes.
                      </Typography>
                      {DISH_CATEGORIES.map(({ key: category, label }) => {
                        const dishes =
                          catalog.data?.dishes?.filter(
                            (dish) => !dish.archived && [category, label].includes(dish.category)
                          ) || [];
                        return dishes.length ? (
                          <Box key={category}>
                            <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
                              {category}
                            </Typography>
                            {dishes.map((dish) => (
                              <FormControlLabel
                                key={dish.id || dish.name}
                                label={dish.name}
                                control={
                                  <Checkbox
                                    checked={values.menu[category]?.includes(dish.name) || false}
                                    onChange={(e) =>
                                      change({
                                        menu: {
                                          ...values.menu,
                                          [category]: e.target.checked
                                            ? [...(values.menu[category] || []), dish.name]
                                            : values.menu[category].filter((name) => name !== dish.name)
                                        }
                                      })
                                    }
                                  />
                                }
                              />
                            ))}
                          </Box>
                        ) : null;
                      })}
                    </>
                  ) : (
                    <Typography variant="body2">Catering only provides the setup; buffet food is excluded.</Typography>
                  )}
                  <TextField
                    label="Food and dietary notes (optional)"
                    value={values.foodNotes || ''}
                    multiline
                    onChange={(e) => change({ foodNotes: e.target.value })}
                    inputProps={{ maxLength: 1000 }}
                    helperText="The catering team must confirm dietary requests."
                  />
                </>
              )}
              {step === 6 && catalog.data && (
                <>
                  <ReservationAddons value={values} catalog={catalog.data} onChange={change} />
                  <Typography variant="caption">
                    All services you select are kept. Remove one here before generating if you are willing to leave it
                    out.
                  </Typography>
                  {values.addonIds.includes('add-dessert') && (
                    <TextField
                      label="Dessert request"
                      value={values.menu.dessert?.name || ''}
                      onChange={(e) =>
                        change({ menu: { ...values.menu, dessert: { name: e.target.value, description: '' } } })
                      }
                      inputProps={{ maxLength: 120 }}
                    />
                  )}
                </>
              )}
              {step === 7 && (
                <>
                  <Typography variant="body2">
                    {draft.serviceType} · {draft.guests} guests · Budget ₱
                    {Number(draft.budget || 0).toLocaleString('en-PH')}
                  </Typography>
                  <Typography variant="body2">
                    {draft.date} · {draft.startTime}–{draft.endTime}
                  </Typography>
                  <Typography variant="body2">{draft.budgetNotes || 'No additional priorities saved.'}</Typography>
                  <Typography variant="caption">
                    The assistant uses approved setup recipes and current catalog prices. Pending charges are shown
                    separately. Your answers stay saved if generation is unavailable.
                  </Typography>
                  {catalog.error && (
                    <Alert severity="warning">
                      Current catalog could not be loaded.<Button onClick={catalog.reload}>Retry</Button>
                    </Alert>
                  )}
                  {catalog.data &&
                    (!catalog.data.packageProposalRules?.enabled ||
                      !catalog.data.packageProposalRules?.recipes?.length) && (
                      <Alert severity="info">
                        The team has not enabled approved package recipes yet. Your answers remain saved; browse
                        existing packages or contact the team.
                      </Alert>
                    )}
                  <Button
                    disabled={disabled || !generationAvailable || !catalog.data?.packageProposalCatalogFingerprint}
                    variant="contained"
                    onClick={() => void generate()}
                  >
                    Generate package options
                  </Button>
                  {!generationAvailable && (
                    <Alert severity="info">
                      Package generation is temporarily unavailable. Your answers stay saved. You can adjust the
                      controls, browse existing packages, or ask the team for help.
                    </Alert>
                  )}
                </>
              )}
            </Stack>
          </Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
            <Button disabled={disabled || step === 0} onClick={() => setStep((n) => n - 1)}>
              Back
            </Button>
            {step < 7 && (
              <Button variant="contained" disabled={disabled} onClick={() => void next()}>
                Save and continue
              </Button>
            )}
          </Stack>
        </>
      )}
    </Box>
  );
}
