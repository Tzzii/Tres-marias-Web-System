import { useState } from 'react';
import { PesoInput } from '@tm/shared';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { OCCASIONS, RULES, SERVICE_TYPES, RENTAL_SERVICE, isRental, includesFood } from '@tm/shared/services/config.js';
import {
  endTimeOptions,
  endTimeProblem,
  earliestBookableDate,
  initialEndTime,
  shiftEndTime
} from '@tm/shared/domain/availability.js';
import { stylingProblem, THEME_OTHER, THEME_UNDECIDED } from '@tm/shared/domain/styling.js';
import { menuProblem, DESSERT_ADDON_ID } from '@tm/shared/domain/menu.js';
import { bookableAddons, packagePickProblem } from '@tm/shared/domain/catalog.js';
import {
  ReservationPackages,
  ReservationThemes,
  ReservationColors,
  ReservationMenu,
  ReservationAddons,
  ReservationRentals
} from './AssistantReservationChoices.jsx';

const textFields = {
  eventName: ['Event name', 120],
  venueName: ['Venue name', 160],
  venueAddress: ['Venue address', 255],
  city: ['City or municipality', 120],
  access: ['Access notes', 2000],
  foodNotes: ['Food and dietary requests', 2000],
  design: ['Design details', 1000]
};
const optionalTopics = { colors: 'colors', design: 'design', access: 'access', foodNotes: 'notes', budget: 'budget' };

export default function AssistantReservationFields({ step, draft, catalog, disabled, onSave }) {
  const [value, setValue] = useState(() => ({
    ...draft,
    styling: { theme: '', themeOther: '', colors: [], notes: '', ...draft.styling },
    addonIds: draft.addonIds || [],
    addonQty: draft.addonQty || {},
    rentalQty: draft.rentalQty || {},
    budget: draft.budget || '',
    budgetNotes: draft.budgetNotes || ''
  }));
  const [problem, setProblem] = useState('');
  const change = (patch) => {
    setValue((v) => ({ ...v, ...patch }));
    setProblem('');
  };
  const topic = (name) => ({ discussed: [...new Set([...(draft.discussed || []), name])] });
  const submit = (event) => {
    event.preventDefault();
    let patch,
      error,
      clearFields = [];
    if (textFields[step]) {
      const key = step === 'access' ? 'accessNotes' : step;
      const text = (step === 'design' ? value.styling.notes : value[key] || '').trim();
      if (!optionalTopics[step] && !text) error = `Please enter ${textFields[step][0].toLowerCase()}.`;
      patch =
        step === 'design'
          ? { styling: { ...value.styling, notes: text }, ...topic('design') }
          : { [key]: text, ...(optionalTopics[step] ? topic(optionalTopics[step]) : {}) };
    } else if (step === 'occasion') {
      if (!value.occasion || (value.occasion === 'Other' && (value.occasionOther || '').trim().length < 2))
        error = 'Choose an occasion and specify it when selecting Other.';
      patch = { occasion: value.occasion, occasionOther: value.occasion === 'Other' ? value.occasionOther.trim() : '' };
    } else if (step === 'service') {
      if (!value.serviceType) error = 'Choose a service.';
      const rentalPackage = catalog.packages?.find((p) => p.kind === 'rental' && p.visible !== false && !p.archived);
      if (isRental(value.serviceType) && !rentalPackage)
        error = 'Equipment rental is not currently published. Please contact the team.';
      patch = {
        serviceType: value.serviceType,
        ...(isRental(value.serviceType) ? { packageSlug: rentalPackage?.slug } : {})
      };
    } else if (step === 'date') {
      if (!value.date || value.date < earliestBookableDate())
        error = `Choose a date with at least ${RULES.leadDays} days' notice.`;
      patch = { date: value.date };
    } else if (step === 'schedule') {
      if (
        !value.startTime ||
        (!isRental(value.serviceType) && (!value.endTime || endTimeProblem(value.startTime, value.endTime)))
      )
        error = 'Choose valid start and end times. Catering events last two to six hours.';
      patch = {
        date: value.date,
        startTime: value.startTime,
        ...(!isRental(value.serviceType) ? { endTime: value.endTime } : {})
      };
    } else if (step === 'guests') {
      const guests = Number(value.guests);
      if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests)
        error = `Enter ${RULES.minGuests}–${RULES.maxGuests} guests.`;
      patch = { guests };
    } else if (step === 'package') {
      if (!value.packageSlug) error = 'Choose a package.';
      patch = { packageSlug: value.packageSlug };
    } else if (step === 'theme') {
      if (
        !value.styling.theme ||
        (value.styling.theme === THEME_OTHER && (value.styling.themeOther || '').trim().length < 2)
      )
        error = 'Choose a theme, specify your own, or select Not decided yet.';
      patch = { styling: value.styling, ...topic('styling') };
    } else if (step === 'colors') {
      error = stylingProblem(value.styling)?.message;
      patch = { styling: value.styling, ...topic('colors') };
    } else if (step === 'menu') {
      error = menuProblem(value.menu, {
        buffet: includesFood(value.serviceType),
        dessert: value.addonIds.includes(DESSERT_ADDON_ID)
      })?.message;
      patch = { menu: value.menu, ...topic('menu') };
    } else if (step === 'addons') {
      const picks = bookableAddons(catalog.addons || []).filter((a) => value.addonIds.includes(a.id));
      error = packagePickProblem(picks)?.message;
      if (
        picks.some(
          (a) =>
            a.hasQuantity &&
            (!Number.isInteger(value.addonQty[a.id]) || value.addonQty[a.id] < 1 || value.addonQty[a.id] > 99)
        )
      )
        error = 'Enter a quantity from 1 to 99 for each selected service.';
      patch = { addonIds: value.addonIds, addonQty: value.addonQty, ...topic('addons') };
    } else if (step === 'rentalItems') {
      if (
        !Object.keys(value.rentalQty).length ||
        Object.values(value.rentalQty).some((n) => !Number.isInteger(n) || n < 1 || n > 2000)
      )
        error = 'Choose equipment and enter valid quantities from 1 to 2,000.';
      patch = { rentalQty: value.rentalQty };
    } else if (step === 'fulfilment') {
      if (!value.fulfilment) error = 'Choose pickup or delivery.';
      patch = { fulfilment: value.fulfilment };
    } else if (step === 'budget') {
      const budget = Number(value.budget);
      if (value.budget !== '' && (!Number.isInteger(budget) || budget < 1 || budget > 10000000))
        error = 'Enter a whole-peso budget from ₱1 to ₱10,000,000, or leave it empty.';
      patch = { ...(budget ? { budget } : {}), budgetNotes: value.budgetNotes.trim(), ...topic('budget') };
      if (!budget) clearFields = ['budget'];
    }
    if (error) {
      setProblem(error);
      return;
    }
    if (patch) void onSave(patch, clearFields);
  };
  const skip = () => {
    const key = optionalTopics[step];
    if (step === 'colors') return onSave({ styling: { ...value.styling, colors: [] }, ...topic(key) });
    if (step === 'design') return onSave({ styling: { ...value.styling, notes: '' }, ...topic(key) });
    if (step === 'budget') return onSave({ ...topic(key) }, ['budget', 'budgetNotes']);
    return onSave({ [step === 'access' ? 'accessNotes' : step]: '', ...topic(key) });
  };
  const startTimes = Array.from(
    { length: 48 },
    (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
  );
  return (
    <Box component="form" onSubmit={submit}>
      <Box component="fieldset" disabled={disabled} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <Stack spacing={2}>
          {textFields[step] && (
            <TextField
              label={textFields[step][0]}
              value={step === 'design' ? value.styling.notes : value[step === 'access' ? 'accessNotes' : step] || ''}
              onChange={(e) =>
                change(
                  step === 'design'
                    ? { styling: { ...value.styling, notes: e.target.value } }
                    : { [step === 'access' ? 'accessNotes' : step]: e.target.value }
                )
              }
              multiline={Boolean(optionalTopics[step]) || step === 'venueAddress'}
              minRows={optionalTopics[step] ? 3 : 1}
              inputProps={{ maxLength: textFields[step][1] }}
              size="small"
              fullWidth
            />
          )}
          {step === 'occasion' && (
            <>
              <TextField
                select
                label="Occasion"
                value={value.occasion || ''}
                onChange={(e) => change({ occasion: e.target.value })}
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
                size="small"
              >
                <option value="">Choose an occasion</option>
                {OCCASIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </TextField>
              {value.occasion === 'Other' && (
                <TextField
                  label="Your occasion"
                  value={value.occasionOther || ''}
                  onChange={(e) => change({ occasionOther: e.target.value })}
                  inputProps={{ maxLength: 40 }}
                  size="small"
                />
              )}
            </>
          )}
          {step === 'service' && (
            <Stack spacing={1}>
              {[...SERVICE_TYPES, RENTAL_SERVICE].map((service) => (
                <Button
                  key={service}
                  type="button"
                  variant={value.serviceType === service ? 'contained' : 'outlined'}
                  aria-pressed={value.serviceType === service}
                  onClick={() => change({ serviceType: service })}
                >
                  {service}
                </Button>
              ))}
            </Stack>
          )}
          {(step === 'date' || step === 'schedule') && (
            <TextField
              label="Event date"
              type="date"
              value={value.date || ''}
              onChange={(e) => change({ date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: earliestBookableDate() }}
              size="small"
            />
          )}
          {step === 'schedule' && (
            <>
              <TextField
                select
                label={isRental(value.serviceType) ? 'Pickup or delivery time' : 'Start time'}
                value={value.startTime || ''}
                onChange={(e) =>
                  change({
                    startTime: e.target.value,
                    endTime:
                      value.startTime && value.endTime
                        ? shiftEndTime(value.startTime, value.endTime, e.target.value)
                        : initialEndTime(e.target.value)
                  })
                }
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
                size="small"
              >
                <option value="">Choose a time</option>
                {startTimes.map((time) => (
                  <option key={time}>{time}</option>
                ))}
              </TextField>
              {!isRental(value.serviceType) && (
                <TextField
                  select
                  label="End time"
                  value={value.endTime || ''}
                  onChange={(e) => change({ endTime: e.target.value })}
                  SelectProps={{ native: true }}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                >
                  <option value="">Choose an end time</option>
                  {endTimeOptions(value.startTime).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                      {o.nextDay ? ' (next day)' : ''} · {o.hours} hours
                    </option>
                  ))}
                </TextField>
              )}
              <Typography sx={{ fontSize: 11 }}>
                All dates and times use Philippine time. A calendar check does not reserve a slot.
              </Typography>
            </>
          )}
          {step === 'guests' && (
            <TextField
              label="Guest count"
              type="number"
              value={value.guests ?? ''}
              onChange={(e) => change({ guests: e.target.value })}
              inputProps={{ min: RULES.minGuests, max: RULES.maxGuests, step: 1 }}
              size="small"
            />
          )}
          {step === 'package' && (
            <ReservationPackages
              catalog={catalog}
              value={value.packageSlug}
              onChange={(packageSlug) => change({ packageSlug })}
              disabled={disabled}
            />
          )}
          {step === 'theme' && (
            <ReservationThemes
              value={value.styling}
              occasion={value.occasion}
              onChange={(styling) => change({ styling })}
            />
          )}
          {step === 'colors' && (
            <ReservationColors
              occasion={draft.occasion}
              value={value.styling}
              onChange={(styling) => change({ styling })}
            />
          )}
          {step === 'menu' && (
            <ReservationMenu
              value={value.menu || {}}
              catalog={catalog}
              onChange={(menu) => change({ menu })}
              buffet={includesFood(value.serviceType)}
              dessert={value.addonIds.includes(DESSERT_ADDON_ID)}
            />
          )}
          {step === 'addons' && <ReservationAddons value={value} catalog={catalog} onChange={change} />}
          {step === 'rentalItems' && (
            <ReservationRentals
              value={value.rentalQty}
              catalog={catalog}
              onChange={(rentalQty) => change({ rentalQty })}
            />
          )}
          {step === 'fulfilment' && (
            <Stack direction="row" spacing={1}>
              {['pickup', 'delivery'].map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant={value.fulfilment === v ? 'contained' : 'outlined'}
                  aria-pressed={value.fulfilment === v}
                  onClick={() => change({ fulfilment: v })}
                >
                  {v === 'pickup' ? 'Pick up' : 'Delivery'}
                </Button>
              ))}
            </Stack>
          )}
          {step === 'budget' && (
            <>
              <PesoInput
                label="Target budget"
                value={value.budget}
                onChange={(e) => change({ budget: e.target.value })}
                size="small"
              />
              <TextField
                label="Budget preferences"
                value={value.budgetNotes}
                onChange={(e) => change({ budgetNotes: e.target.value })}
                multiline
                minRows={2}
                inputProps={{ maxLength: 500 }}
                size="small"
              />
            </>
          )}
          {problem && <Alert severity="warning">{problem}</Alert>}
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button type="submit" variant="contained" size="small">
              {step === 'date' ? 'Check date' : step === 'schedule' ? 'Check schedule' : 'Continue'}
            </Button>
            {optionalTopics[step] && (
              <Button type="button" size="small" onClick={skip}>
                Skip for now
              </Button>
            )}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
