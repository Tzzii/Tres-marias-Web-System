import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import {
  AlertBanner,
  BusyButton,
  CardTitle,
  DashCard,
  DateField,
  ErrorState,
  FormField,
  ListSkeleton,
  OCCASIONS,
  PageHeader,
  RULES,
  SelectField,
  TimeField,
  calendarApi,
  catalogApi,
  extraGuests,
  formatClock,
  formatDate,
  formatPackageItem,
  peso,
  reservationApi,
  setupsFor,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { clearDraft, clearIntent, readDraft, readIntent, saveDraft } from '../../lib/booking.js';

// Form sections as [key, title], in page order
const SECTIONS = [
  ['details', 'Event details'],
  ['package', 'Package'],
  ['food', 'Food request'],
  ['venue', 'Venue and logistics'],
  ['addons', 'Additional charges'],
  ['review', 'Review and submit']
];

// Which section each field lives in (used to scroll to the first error)
const FIELD_SECTION = { eventName: 'details', occasion: 'details', date: 'details', startTime: 'details', guests: 'details', packageId: 'package', foodRequest: 'food', venueName: 'venue', venueAddress: 'venue', city: 'venue', setup: 'venue' };

// Blank form values. The setup style starts at Buffet and is switched to one the chosen package offers.
const EMPTY = { eventName: '', occasion: '', date: '', startTime: '18:00', guests: '', packageId: '', foodRequest: '', venueName: '', venueAddress: '', city: '', setup: 'Buffet', accessNotes: '', addonIds: [] };

/**
 * 1f / 1o · Reservation form: one long page, sections on the left, live summary on the right.
 * The customer picks any package for any occasion, writes the food they want cooked and ticks
 * additional charges. Only the package price is known here; the admin prices the food and the
 * additional charges in the quotation.
 */
export default function BookEventPage() {
  useDocumentTitle('Book an event');
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const [params] = useSearchParams();
  // Packages and additional charges. live: false = don't reload while the customer is filling the form.
  const catalog = useResource(() => catalogApi.getCatalog(), [], { live: false });

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null); // time of the last draft autosave
  const [active, setActive] = useState('details'); // section currently on screen
  const touched = useRef(false); // true once the customer changes something (don't autosave before that)
  const initialised = useRef(false); // true once the form has been pre-filled

  // Start from the saved draft and/or what was picked while browsing (package, date, start time,
  // guests, occasion). Picks made after the draft was saved (e.g. "Reserve this date" on another
  // package) win over the draft's values; the draft's other fields (food, venue, …) are kept.
  // ?package= / ?date= in the URL win over both.
  useEffect(() => {
    if (!catalog.data || initialised.current) return;
    initialised.current = true;
    const draft = readDraft(user.id);
    const hasDraft = Boolean(draft && draft.form);
    const intent = readIntent();
    const intentIsNewer = Boolean(intent && (!hasDraft || !draft.savedAt || intent.savedAt > draft.savedAt));

    // Only known fields are kept, so a draft saved before the form changed still loads
    const base = hasDraft ? { ...EMPTY, ...Object.fromEntries(Object.entries(draft.form).filter(([key]) => key in EMPTY)) } : { ...EMPTY };
    const picks = intentIsNewer ? intent : {};
    const pkg = catalog.data.packages.find((p) => p.slug === (params.get('package') || picks.packageSlug));
    setForm({
      ...base,
      ...(picks.occasion ? { occasion: picks.occasion } : {}),
      ...(picks.startTime ? { startTime: picks.startTime } : {}),
      ...(picks.guests ? { guests: String(picks.guests) } : {}),
      ...(pkg ? { packageId: pkg.id } : {}),
      ...(params.get('date') || picks.date ? { date: params.get('date') || picks.date } : {})
    });
    if (hasDraft) setSavedAt(draft.savedAt);
  }, [catalog.data, user.id, params]);

  // Autosave the draft shortly after each change
  useEffect(() => {
    if (!touched.current) return undefined;
    const timer = setTimeout(() => {
      if (saveDraft(user.id, form)) setSavedAt(Date.now());
    }, 700);
    return () => clearTimeout(timer);
  }, [form, user.id]);

  // Highlight the section in view
  useEffect(() => {
    if (!catalog.data) return undefined;
    // IntersectionObserver tells us which sections are visible; the top-most visible one is marked active
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('sec-', ''));
      },
      { rootMargin: '-90px 0px -55% 0px' }
    );
    SECTIONS.forEach(([key]) => {
      const el = document.getElementById(`sec-${key}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [catalog.data]);

  const data = catalog.data;
  // The chosen package object
  const pkg = data ? data.packages.find((p) => p.id === form.packageId) : null;
  // Setup styles the chosen package offers (empty until a package is picked)
  const setups = pkg ? setupsFor(pkg) : [];
  // Guests above what the chosen package covers (0 when they fit); allowed, but the admin may add charges
  const overBy = extraGuests(pkg, form.guests);

  // If the chosen package doesn't offer the current setup style, switch to its first one
  useEffect(() => {
    if (pkg && !setupsFor(pkg).includes(form.setup)) setForm((f) => ({ ...f, setup: setupsFor(pkg)[0] }));
  }, [pkg, form.setup]);
  // The additional charges the customer ticked
  const chosenAddons = data ? data.addons.filter((a) => form.addonIds.includes(a.id)) : [];

  // Change one or more fields, mark the form as touched, and clear those fields' errors
  const update = (patch) => {
    touched.current = true;
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  // Guest count: digits only, and never above the largest count the venue takes
  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return; // typing past the cap is ignored
    update({ guests: digits });
  };

  // Add or remove an additional charge
  const toggleAddon = (id) => update({ addonIds: form.addonIds.includes(id) ? form.addonIds.filter((a) => a !== id) : [...form.addonIds, id] });

  // Smooth-scroll to a form section
  const scrollTo = (key) => {
    const el = document.getElementById(`sec-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Check every required field and return error messages by field name
  const validate = () => {
    const e = {};
    if (form.eventName.trim().length < 3) e.eventName = 'Give your event a name (at least 3 characters).';
    if (!form.occasion) e.occasion = 'Choose the occasion.';
    if (!form.date) e.date = 'Choose your event date.';
    else {
      // Re-check the date in case it was blocked or filled up since it was picked
      const reason = calendarApi.dateUnavailableReason(form.date, calendarApi.availabilitySnapshot());
      if (reason) e.date = `This date is not available (${reason.toLowerCase()}).`;
    }
    if (!form.startTime) e.startTime = 'Choose a start time.';
    else if (form.date && !e.date) {
      // Same check as the server: on the hour or half hour, within hours, and not clashing with another event that day
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, calendarApi.availabilitySnapshot());
      if (reason) e.startTime = `${reason}.`;
    }
    const guests = Number(form.guests);
    if (!form.guests) e.guests = 'Enter your guest count.';
    else if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests) e.guests = `Between ${RULES.minGuests} and ${RULES.maxGuests} guests.`;
    if (!pkg) e.packageId = 'Choose a package.';
    if (form.foodRequest.trim().length < 5) e.foodRequest = 'Tell us the food you would like us to cook.';
    if (!form.venueName.trim()) e.venueName = 'Enter the venue name.';
    if (!form.venueAddress.trim()) e.venueAddress = 'Enter the venue address.';
    if (!form.city.trim()) e.city = 'Enter the city.';
    if (!form.setup) e.setup = 'Choose a setup style.';
    else if (pkg && !setups.includes(form.setup)) e.setup = `${pkg.name} is not available as ${form.setup}.`;
    return e;
  };

  // Validate; if there are errors, scroll to the first one. Otherwise create the reservation,
  // clear the draft and saved picks, and go back to the dashboard.
  const submit = async () => {
    const found = validate();
    setErrors(found);
    setFormError('');
    const firstField = Object.keys(found)[0];
    if (firstField) {
      scrollTo(FIELD_SECTION[firstField]);
      setFormError(`Please fix ${Object.keys(found).length === 1 ? 'the highlighted field' : `the ${Object.keys(found).length} highlighted fields`} before submitting.`);
      return;
    }
    setBusy(true);
    try {
      const created = await reservationApi.createReservation(user.id, { ...form, guests: Number(form.guests) });
      clearDraft(user.id);
      clearIntent();
      notify(`Reservation ${created.ref} sent. We will reply with your quotation within 24 hours.`);
      navigate('/portal', { replace: true });
    } catch (error) {
      setBusy(false);
      if (error.meta && error.meta.field) {
        setErrors((e) => ({ ...e, [error.meta.field]: error.message }));
        scrollTo(FIELD_SECTION[error.meta.field] || 'details');
      }
      setFormError(error.message);
    }
  };

  // Save the draft now and leave the form
  const saveAndExit = () => {
    saveDraft(user.id, form);
    notify('Draft saved. You can finish it any time from your dashboard.', 'info');
    navigate('/portal');
  };

  // "Start over": delete the draft and saved picks, empty the form, and reload the catalog to pre-fill again
  const discard = () => {
    clearDraft(user.id);
    clearIntent();
    initialised.current = false;
    touched.current = false;
    setSavedAt(null);
    setErrors({});
    setForm(EMPTY);
    catalog.reload();
  };

  if (catalog.error) return <DashCard><ErrorState error={catalog.error} onRetry={catalog.reload} /></DashCard>;

  // Does any field in this section have an error? (turns its nav link red)
  const sectionHasError = (key) => Object.keys(errors).some((f) => FIELD_SECTION[f] === key);
  // Which sections are complete (shows a green tick in the section nav).
  // Additional charges are optional, so that section is ticked only once at least one is chosen.
  const sectionDone = {
    details: form.eventName && form.occasion && form.date && form.startTime && form.guests,
    package: Boolean(pkg),
    food: form.foodRequest.trim().length >= 5,
    venue: form.venueName && form.venueAddress && form.city && form.setup,
    addons: chosenAddons.length > 0,
    review: false
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'My Reservations', to: '/portal/reservations' }, { label: 'Book an event' }]}
        title="Book an event"
        chip={
          savedAt && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12.5, color: tokens.textOnDarkSoft }}>
              <CloudDoneOutlinedIcon sx={{ fontSize: 17, color: tokens.green }} />
              Draft saved {formatClock(savedAt)}
            </Box>
          )
        }
        actions={
          savedAt && (
            <Button onClick={discard} sx={{ color: tokens.textOnDarkSoft }}>
              Start over
            </Button>
          )
        }
      />

      {/* Phone / tablet: section chips (1o) */}
      <Box className="tm-scroll" sx={{ display: { xs: 'flex', lg: 'none' }, position: 'sticky', top: tokens.headerHeight, zIndex: 5, gap: 0.75, overflowX: 'auto', mx: { xs: -1.5, sm: -2.5, md: -3 }, px: { xs: 1.5, sm: 2.5, md: 3 }, py: 1, mb: 2, backgroundColor: 'rgba(11, 15, 25, 0.95)', backdropFilter: 'blur(10px)' }}>
        {SECTIONS.map(([key, label], i) => (
          <ButtonBase key={key} onClick={() => scrollTo(key)} sx={{ flexShrink: 0, px: 1.5, py: 0.75, borderRadius: 999, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: active === key ? tokens.onGold : sectionHasError(key) ? '#fca5a5' : tokens.textOnDarkSoft, backgroundColor: active === key ? tokens.gold : 'rgba(255,255,255,0.06)', border: `1px solid ${sectionHasError(key) ? 'rgba(239,68,68,0.5)' : 'transparent'}` }}>
            {i + 1} {label.split(' ')[0]}
          </ButtonBase>
        ))}
      </Box>

      {!data ? (
        <DashCard>
          <ListSkeleton rows={8} height={52} />
        </DashCard>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '200px minmax(0, 1fr) 300px' }, gap: 2.5, alignItems: 'start', pb: { xs: 10, lg: 0 } }}>
          {/* ============ Left: on this page ============ */}
          <Box component="nav" aria-label="Form sections" sx={{ display: { xs: 'none', lg: 'block' }, position: 'sticky', top: tokens.headerHeight + 24 }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: tokens.textOnDarkMuted, mb: 1, px: 1.5 }}>On this page</Typography>
            {SECTIONS.map(([key, label], i) => (
              <ButtonBase key={key} onClick={() => scrollTo(key)} aria-current={active === key ? 'true' : undefined} sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 1.25, fontFamily: 'inherit', fontSize: 13.5, fontWeight: active === key ? 700 : 500, textAlign: 'left', color: active === key ? tokens.goldLight : sectionHasError(key) ? '#fca5a5' : tokens.textOnDarkSoft, backgroundColor: active === key ? 'rgba(197,160,89,0.14)' : 'transparent', borderLeft: `3px solid ${active === key ? tokens.gold : 'transparent'}` }}>
                {sectionDone[key] ? <CheckCircleRoundedIcon sx={{ fontSize: 16, color: tokens.green }} /> : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, opacity: 0.5 }} />}
                {i + 1} · {label}
              </ButtonBase>
            ))}
          </Box>

          {/* ============ Middle: the form ============ */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

            <Section id="details" index={1} title="Event details" subtitle="Tell us about the celebration">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormField id="f-eventName" label="Event name" required value={form.eventName} onChange={(e) => update({ eventName: e.target.value })} error={errors.eventName} placeholder="e.g. Santos–Reyes Wedding Reception" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 80 }} />
                <SelectField id="f-occasion" label="Occasion" required value={form.occasion} onChange={(e) => update({ occasion: e.target.value })} options={OCCASIONS} placeholder="Select an occasion" error={errors.occasion} sx={{ gridColumn: { sm: '1 / -1' } }} />
                {/* Calendar always open across the full row; tapping a date picks it and lists the times already booked */}
                <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                  <DateField id="f-date" label="Event date" required inline value={form.date} onChange={(v) => update({ date: v })} error={errors.date} />
                </Box>
                <TimeField id="f-startTime" label="Start time" required value={form.startTime} onChange={(v) => update({ startTime: v })} error={errors.startTime} min={RULES.earliestStart} max={RULES.latestStart} step={30} />
                <FormField id="f-guests" label="Guest count" required value={form.guests} onChange={(e) => updateGuests(e.target.value)} error={errors.guests} hint={pkg ? `${pkg.name} covers ${pkg.guests} guests` : `Between ${RULES.minGuests} and ${RULES.maxGuests} guests`} inputProps={{ inputMode: 'numeric', maxLength: String(RULES.maxGuests).length }} />
              </Box>
            </Section>

            <Section id="package" index={2} title="Package" subtitle="Any package works for any occasion. Pick the one that covers your guest count." error={errors.packageId}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                {data.packages.map((p) => {
                  const selected = p.id === form.packageId;
                  // Guest count turns red when it is above what this package covers
                  const fits = !form.guests || Number(form.guests) <= p.guests;
                  return (
                    <ButtonBase key={p.id} onClick={() => update({ packageId: p.id })} aria-pressed={selected} sx={{ display: 'block', p: 2, textAlign: 'left', borderRadius: 2, fontFamily: 'inherit', border: `2px solid ${selected ? tokens.headerBg : tokens.cardLightBorder}`, backgroundColor: selected ? tokens.surfaceSubtle : '#fff', transition: 'border-color 0.15s ease', '&:hover': { borderColor: selected ? tokens.headerBg : '#94a3b8' } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{p.name}</Typography>
                        {selected ? <CheckCircleRoundedIcon sx={{ color: tokens.headerBg }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
                      </Box>
                      <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{p.description}</Typography>
                      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Typography sx={{ fontSize: 12.5, color: fits ? tokens.textMuted : tokens.redPress, fontWeight: fits ? 400 : 600 }}>Covers {p.guests} guests</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>{peso(p.price)}</Typography>
                      </Box>
                    </ButtonBase>
                  );
                })}
              </Box>
              {/* What the chosen package includes */}
              {pkg && (
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>{pkg.name} includes</Typography>
                  <Typography sx={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.textSecondary }}>{pkg.items.map(formatPackageItem).join(' · ')}</Typography>
                  <Typography sx={{ mt: 0.75, fontSize: 12.5, color: tokens.textSecondary }}>
                    <b>Setup styles:</b> {setups.join(' · ')}
                  </Typography>
                </Box>
              )}
              {overBy > 0 && (
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Your {form.guests} guests are {overBy} more than {pkg.name} covers. You can still book it; our team may add charges for the extra guests in your quotation.
                </AlertBanner>
              )}
            </Section>

            <Section id="food" index={3} title="Food request" subtitle="Food is not part of the package. Tell us what you would like served and our kitchen cooks it for your buffet." error={errors.foodRequest}>
              <FormField id="f-foodRequest" label="Food you would like us to cook" required multiline minRows={4} value={form.foodRequest} onChange={(e) => update({ foodRequest: e.target.value })} error={errors.foodRequest} placeholder="e.g. Lechon kawali, chicken relleno, pancit bihon, steamed rice, leche flan and iced tea. One vegetarian dish for 10 guests." hint="The food price is added to your quotation." inputProps={{ maxLength: 1000 }} />
            </Section>

            <Section id="venue" index={4} title="Venue and logistics">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormField id="f-venueName" label="Venue name" required value={form.venueName} onChange={(e) => update({ venueName: e.target.value })} error={errors.venueName} placeholder="e.g. The Glass Garden" />
                {/* Only the setup styles the chosen package offers; locked until a package is picked */}
                <SelectField id="f-setup" label="Setup style" required value={pkg ? form.setup : ''} onChange={(e) => update({ setup: e.target.value })} options={setups} placeholder={pkg ? 'Select a setup' : 'Choose a package first'} disabled={!pkg} hint={pkg ? `Setups offered with ${pkg.name}` : undefined} error={errors.setup} />
                <FormField id="f-venueAddress" label="Venue address" required value={form.venueAddress} onChange={(e) => update({ venueAddress: e.target.value })} error={errors.venueAddress} placeholder="Street, barangay" />
                <FormField id="f-city" label="City" required value={form.city} onChange={(e) => update({ city: e.target.value })} error={errors.city} placeholder="e.g. Pasig City" />
                <FormField id="f-accessNotes" label="Access notes" optional multiline minRows={3} value={form.accessNotes} onChange={(e) => update({ accessNotes: e.target.value })} placeholder="Gate, parking, elevator, loading area, setup time restrictions…" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 500 }} />
              </Box>
            </Section>

            <Section id="addons" index={5} title="Additional charges" subtitle="Optional. Tick what you need and we price it in your quotation.">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                {data.addons.map((a) => {
                  const on = form.addonIds.includes(a.id);
                  return (
                    <Box key={a.id} component="label" sx={{ display: 'flex', gap: 1, p: 1.5, borderRadius: 1.5, cursor: 'pointer', border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`, backgroundColor: on ? 'rgba(197,160,89,0.08)' : '#fff' }}>
                      <Checkbox checked={on} onChange={() => toggleAddon(a.id)} size="small" sx={{ p: 0.25, alignSelf: 'flex-start' }} />
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{a.name}</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: tokens.textMuted }}>Quoted</Typography>
                        </Box>
                        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{a.description}</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Section>

            <Section id="review" index={6} title="Review and submit">
              <QuoteLines pkg={pkg} guests={form.guests} addons={chosenAddons} />
              <AlertBanner tone="info" sx={{ mt: 2 }}>
                This is a request, not a confirmed booking. We review it and send the quotation with the food and additional charges priced within 24 hours.
              </AlertBanner>
              <Box sx={{ mt: 2.5, display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                <BusyButton size="large" busy={busy} onClick={submit}>
                  Submit reservation request
                </BusyButton>
                <Button size="large" variant="outlined" onClick={saveAndExit} disabled={busy}>
                  Save as draft
                </Button>
              </Box>
            </Section>
          </Box>

          {/* ============ Right: live summary ============ */}
          <Box sx={{ display: { xs: 'none', lg: 'block' }, position: 'sticky', top: tokens.headerHeight + 24 }}>
            <DashCard>
              <CardTitle>Your reservation</CardTitle>
              {[
                ['Date', form.date ? formatDate(form.date) : '—'],
                ['Guests', form.guests || '—'],
                ['Package', pkg ? pkg.name : '—'],
                ['Food request', sectionDone.food ? 'Written' : '—'],
                ['Additional charges', chosenAddons.length || 'None']
              ].map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{value}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: tokens.textMuted }}>Package price</Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 800 }}>{pkg ? peso(pkg.price) : '—'}</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{pkg ? 'Food and additional charges are added in your quotation' : 'Choose a package to see its price'}</Typography>
              <BusyButton fullWidth size="large" busy={busy} onClick={submit} sx={{ mt: 2 }}>
                Submit request
              </BusyButton>
            </DashCard>
          </Box>
        </Box>
      )}

      {/* Phone / tablet sticky price bar (1o) */}
      {data && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: { xs: 64, md: 0 }, zIndex: 1090, display: { xs: 'flex', lg: 'none' }, alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, backgroundColor: '#fff', borderTop: `1px solid ${tokens.cardLightBorder}`, boxShadow: '0 -10px 30px -12px rgba(0,0,0,0.4)' }}>
          <Box>
            <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>Package price</Typography>
            <Typography sx={{ fontSize: 19, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1 }}>{pkg ? peso(pkg.price) : 'Pick a package'}</Typography>
          </Box>
          <BusyButton busy={busy} onClick={submit} sx={{ px: 3, bgcolor: tokens.headerBg, color: '#fff', '&:hover': { bgcolor: tokens.slate700 } }}>
            Submit request
          </BusyButton>
        </Box>
      )}
    </>
  );
}

/** A numbered form section card. Gets a red border and message when it has an error. */
function Section({ id, index, title, subtitle, error, children }) {
  return (
    <DashCard component="section" id={`sec-${id}`} aria-labelledby={`sec-${id}-title`} sx={{ scrollMarginTop: `${tokens.headerHeight + 64}px`, ...(error && { borderColor: tokens.red }) }}>
      <Box sx={{ mb: 2 }}>
        <Typography id={`sec-${id}-title`} component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>
          {index} · {title}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.25, fontSize: 13, color: tokens.textSecondary }}>{subtitle}</Typography>}
        {error && <Typography role="alert" sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>{error}</Typography>}
      </Box>
      {children}
    </DashCard>
  );
}

/** Price breakdown before the quotation: the package price is known; food and each additional charge are "To be quoted". */
function QuoteLines({ pkg, guests, addons }) {
  const rows = [
    [pkg ? `Package · ${pkg.name} · ${guests || 0} guests` : 'Package', pkg ? peso(pkg.price) : '—'],
    ['Food', 'To be quoted'],
    ...addons.map((a) => [a.name, 'To be quoted'])
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{label}</Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{value}</Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.5, backgroundColor: tokens.surfaceSubtle }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Starting total</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{pkg ? peso(pkg.price) : '—'}</Typography>
      </Box>
    </Box>
  );
}
