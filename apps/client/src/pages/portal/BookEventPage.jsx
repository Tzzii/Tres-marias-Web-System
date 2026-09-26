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
  BUFFET_DRINKS,
  BusyButton,
  CardTitle,
  DISH_CATEGORIES,
  DashCard,
  DateField,
  ErrorState,
  FormField,
  INVENTORY_CATEGORIES,
  ListSkeleton,
  MENU_LINE_MAX,
  OCCASIONS,
  PageHeader,
  RENTAL,
  RENTAL_SERVICE,
  RULES,
  SERVICE_TYPES,
  SelectField,
  TimeField,
  calendarApi,
  catalogApi,
  computeQuote,
  extraGuests,
  formatClock,
  formatDate,
  formatPackageItem,
  includesFood,
  isRental,
  isRentalPackage,
  peso,
  reservationApi,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { clearDraft, clearIntent, readDraft, readIntent, saveDraft } from '../../lib/booking.js';

// Form sections as [key, title, short name], in page order. The short name labels the section chips
// on phones and tablets. The menu section is skipped for Catering only.
// An equipment rental has no package, menu or additional charges: it shows "Items to rent" instead,
// and its venue section becomes "Pick up or delivery".
const SECTIONS = [
  ['details', 'Event details', 'Event'],
  ['service', 'What you are booking', 'Service'],
  ['package', 'Package', 'Package'],
  ['items', 'Items to rent', 'Items'],
  ['food', 'Your menu', 'Menu'],
  ['venue', 'Venue and logistics', 'Venue'],
  ['addons', 'Additional charges', 'Add-ons'],
  ['review', 'Review and submit', 'Review']
];

// Which section each field lives in (used to scroll to the first error)
const FIELD_SECTION = { eventName: 'details', occasion: 'details', date: 'details', startTime: 'details', guests: 'details', serviceType: 'service', packageId: 'package', rentalItems: 'items', foodNotes: 'food', fulfilment: 'venue', venueName: 'venue', venueAddress: 'venue', city: 'venue' };

/** The section an error belongs to. Menu dishes, add-on quantities and rented items have one field per id. */
const sectionForField = (field) => {
  if (field.startsWith('menu.')) return 'food';
  if (field.startsWith('addonQty.')) return 'addons';
  if (field.startsWith('rental.')) return 'items';
  return FIELD_SECTION[field] || 'details';
};

// Blank form values. A booking starts as a Buffet, the option most customers want.
// `fulfilment` and `rentalQty` ({ itemId: how many, as typed }) are only used by an equipment rental.
const EMPTY = { eventName: '', occasion: '', date: '', startTime: '18:00', guests: '', serviceType: 'Buffet and Catering', packageId: '', menu: {}, foodNotes: '', venueName: '', venueAddress: '', city: '', accessNotes: '', addonIds: [], addonQty: {}, fulfilment: 'pickup', rentalQty: {} };

// Date error while the availability map is still on its way from the API (the date cannot be checked yet)
const DATES_LOADING = 'The available dates are still loading. Please try again in a moment.';

// Colour and label of a rental item's availability on the chosen date
const AVAILABILITY = {
  available: { label: 'Available', color: '#047857' },
  limited: { label: 'Limited', color: '#b45309' },
  out: { label: 'Not available', color: '#b91c1c' }
};

/**
 * 1f / 1o · Reservation form: one long page, sections on the left, live summary on the right.
 *
 * The customer first says what they are booking - a Buffet (our food, one dish from each of the
 * four categories, charged per person) or Catering only (the package's equipment on its own).
 * A buffet has a fixed price per person, so the running total on this page is a real figure, not
 * a placeholder; only the additional charges are still priced by the admin in the quotation.
 *
 * The third choice, Equipment rental, books the Equipment Rental package: the customer types how
 * many of each rentable item they need, sees each item's availability on their date, and chooses
 * pick up (free) or delivery (standard fee). Every price is known, so its total is exact.
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
  const chipBar = useRef(null); // phone / tablet row of section chips
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
    // Picking the Equipment Rental package makes the booking a rental; any other package leaves a rental
    const serviceFor = pkg && isRentalPackage(pkg) ? { serviceType: RENTAL_SERVICE } : pkg && isRental(base.serviceType) ? { serviceType: EMPTY.serviceType } : {};
    setForm({
      ...base,
      ...(picks.occasion ? { occasion: picks.occasion } : {}),
      ...(picks.startTime ? { startTime: picks.startTime } : {}),
      ...(picks.guests ? { guests: String(picks.guests) } : {}),
      ...(pkg ? { packageId: pkg.id, ...serviceFor } : {}),
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
    // Re-run when the booking type changes (the menu, package, items and additional charges sections
    // appear or disappear), so the new set of sections is watched
  }, [catalog.data, form.serviceType]);

  // Phones / tablets: slide the chip row sideways so the chip of the section in view sits in the middle,
  // instead of staying hidden off the edge of the screen
  useEffect(() => {
    const bar = chipBar.current;
    const chip = bar && bar.querySelector(`[data-section="${active}"]`);
    if (!chip || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  const data = catalog.data;
  // The chosen package object
  const pkg = data ? data.packages.find((p) => p.id === form.packageId) : null;
  // The Equipment Rental package, when the admin shows it; the rental choice only appears if it exists
  const rentalPkg = data ? data.packages.find(isRentalPackage) || null : null;
  // The ordinary packages for the package cards (the rental one is chosen under "What you are booking")
  const packages = data ? data.packages.filter((p) => !isRentalPackage(p)) : [];
  // True when this booking is an equipment rental
  const rental = isRental(form.serviceType);
  // Guests above what the chosen package covers (0 when they fit); allowed, but the admin may add charges
  const overBy = extraGuests(pkg, form.guests);
  // True when the booking includes our food, and so a menu and a per-person charge
  const buffet = includesFood(form.serviceType);
  // The dishes still offered in one menu category
  const dishesIn = (category) => (data ? data.dishes.filter((d) => d.category === category) : []);
  // The additional charges the customer ticked (a rental has none)
  const chosenAddons = data && !rental ? data.addons.filter((a) => form.addonIds.includes(a.id)) : [];
  // The items a rental asks for, with today's price per piece: [{ itemId, name, qty, price }]
  const rentalChosen = data && rental ? data.rentals.filter((i) => Number(form.rentalQty[i.id]) > 0).map((i) => ({ itemId: i.id, name: i.name, qty: Number(form.rentalQty[i.id]), price: i.price })) : [];
  const delivered = rental && form.fulfilment === 'delivery';
  // The running total, worked out exactly as the admin's quotation will be. The add-on prices are
  // not known yet, so they come out as 0 here and are shown as "To be quoted" instead.
  const quote = computeQuote({
    pkg,
    serviceType: form.serviceType,
    guests: rental ? 0 : Number(form.guests) || 0,
    pricePerPlate: data ? data.pricePerPlate : 0,
    rentalItems: rentalChosen,
    deliveryFee: delivered ? RENTAL.deliveryFee : 0,
    addonIds: rental ? [] : form.addonIds,
    addonQty: form.addonQty
  });
  // What is known now: the package plus, for a buffet, the food. The rest is quoted later.
  // A rental is fully priced already: its items plus the delivery fee.
  const knownTotal = rental ? quote.net : quote.packageTotal + quote.food;

  // A rental's items: how many of each are free on the chosen date, { itemId: { left, status } }
  const [avail, setAvail] = useState({});
  useEffect(() => {
    if (!rental || !form.date) {
      setAvail({});
      return undefined;
    }
    let live = true; // ignore an answer that arrives after the date changed again
    reservationApi
      .getRentalAvailability(form.date)
      .then((next) => live && setAvail(next))
      .catch(() => live && setAvail({}));
    return () => {
      live = false;
    };
  }, [rental, form.date]);

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

  // Buffet, Catering only or Equipment rental. A rental books the Equipment Rental package; leaving
  // it clears that package so the customer picks a real one.
  const chooseService = (value) => {
    if (isRental(value)) update({ serviceType: value, packageId: rentalPkg.id });
    else update({ serviceType: value, packageId: pkg && isRentalPackage(pkg) ? '' : form.packageId });
  };

  // How many of a rental item: digits only, never above the most one line can ask for
  const updateRentalQty = (id, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RENTAL.maxQty) return; // typing past the cap is ignored
    update({ rentalQty: { ...form.rentalQty, [id]: digits } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`rental.${id}`];
      delete next.rentalItems;
      return next;
    });
  };

  // Guest count: digits only, and never above the largest count the venue takes
  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return; // typing past the cap is ignored
    update({ guests: digits });
  };

  // Add or remove an additional charge. One counted by the piece starts at 1 when it is ticked
  // and drops its count when it is unticked, so an untouched charge never keeps an old number.
  const toggleAddon = (id) => {
    const on = form.addonIds.includes(id);
    const qty = { ...form.addonQty };
    if (on) delete qty[id];
    else qty[id] = '1';
    update({ addonIds: on ? form.addonIds.filter((a) => a !== id) : [...form.addonIds, id], addonQty: qty });
  };

  // How many of a by-the-piece charge: digits only, at most two (1-99)
  const updateAddonQty = (id, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    update({ addonQty: { ...form.addonQty, [id]: digits } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`addonQty.${id}`];
      return next;
    });
  };

  // Write the menu line for one category. It is the customer's own words, so it may name
  // more than one dish, e.g. "Lechon kawali and pork barbecue".
  const setDish = (category, text) => {
    update({ menu: { ...form.menu, [category]: text } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`menu.${category}`];
      return next;
    });
  };

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
    if (rental) return { ...e, ...validateRental() };
    if (!form.date) e.date = 'Choose your event date.';
    else if (calendarApi.availabilitySnapshot().loading) e.date = DATES_LOADING;
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
    if (!SERVICE_TYPES.includes(form.serviceType)) e.serviceType = 'Choose a buffet or catering only.';
    if (!pkg) e.packageId = 'Choose a package.';
    // A buffet needs something written on every line; catering only has no menu at all
    if (buffet) {
      DISH_CATEGORIES.forEach(({ key, label }) => {
        if ((form.menu[key] || '').trim().length < 2) e[`menu.${key}`] = `Tell us what you would like for your ${label.toLowerCase()}.`;
      });
    }
    // Every by-the-piece charge that was ticked needs a count
    chosenAddons.forEach((a) => {
      if (!a.hasQuantity) return;
      const many = Number(form.addonQty[a.id]);
      if (!Number.isInteger(many) || many < 1 || many > 99) e[`addonQty.${a.id}`] = 'Enter 1 to 99.';
    });
    if (!form.venueName.trim()) e.venueName = 'Enter the venue name.';
    if (!form.venueAddress.trim()) e.venueAddress = 'Enter the venue address.';
    if (!form.city.trim()) e.city = 'Enter the city.';
    return e;
  };

  // The rental part of validate(): an open date, a pick-up or delivery time, at least one item with
  // no more than is free that day, and an address when it is delivered
  const validateRental = () => {
    const e = {};
    if (!form.date) e.date = 'Choose the date you need the items.';
    else if (calendarApi.availabilitySnapshot().loading) e.date = DATES_LOADING;
    else {
      const reason = calendarApi.dateUnavailableReason(form.date, calendarApi.availabilitySnapshot(), { rental: true });
      if (reason) e.date = `This date is not available (${reason.toLowerCase()}).`;
    }
    if (!form.startTime) e.startTime = 'Choose a time.';
    else {
      // A rental never clashes with events, so only the hours and the half-hour steps are checked
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, { ...calendarApi.availabilitySnapshot(), events: [] });
      if (reason) e.startTime = `${reason}.`;
    }
    if (!rentalChosen.length) e.rentalItems = 'Enter how many you need of at least one item.';
    rentalChosen.forEach((line) => {
      const free = avail[line.itemId];
      if (free && line.qty > free.left) e[`rental.${line.itemId}`] = free.left ? `Only ${free.left} free on this date.` : 'Not available on this date.';
    });
    if (form.fulfilment === 'delivery') {
      if (!form.venueName.trim()) e.venueName = 'Enter the place name.';
      if (!form.venueAddress.trim()) e.venueAddress = 'Enter the delivery address.';
      if (!form.city.trim()) e.city = 'Enter the city.';
    }
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
      scrollTo(sectionForField(firstField));
      setFormError(`Please fix ${Object.keys(found).length === 1 ? 'the highlighted field' : `the ${Object.keys(found).length} highlighted fields`} before submitting.`);
      return;
    }
    setBusy(true);
    try {
      // Catering only carries no menu, and only by-the-piece charges carry a count.
      // A rental sends the items it asks for instead.
      const created = await reservationApi.createReservation(
        user.id,
        rental
          ? { ...form, rentalItems: rentalChosen.map(({ itemId, qty }) => ({ itemId, qty })) }
          : {
              ...form,
              guests: Number(form.guests),
              menu: buffet ? form.menu : {},
              addonQty: Object.fromEntries(Object.entries(form.addonQty).map(([id, many]) => [id, Number(many)]))
            }
      );
      clearDraft(user.id);
      clearIntent();
      notify(`Reservation ${created.ref} sent. We will reply with your quotation within 24 hours.`);
      navigate('/portal', { replace: true });
    } catch (error) {
      setBusy(false);
      if (error.meta && error.meta.field) {
        setErrors((e) => ({ ...e, [error.meta.field]: error.message }));
        scrollTo(sectionForField(error.meta.field));
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
  const sectionHasError = (key) => Object.keys(errors).some((f) => sectionForField(f) === key);
  // Every category has its dish (a Catering only booking has no menu to fill in)
  const menuComplete = DISH_CATEGORIES.every(({ key }) => (form.menu[key] || '').trim().length >= 2);
  // Which sections are complete (shows a green tick in the section nav).
  // Additional charges are optional, so that section is ticked only once at least one is chosen.
  const sectionDone = {
    details: form.eventName && form.occasion && form.date && form.startTime && (rental || form.guests),
    service: Boolean(form.serviceType),
    package: Boolean(pkg),
    items: rentalChosen.length > 0,
    food: menuComplete,
    venue: rental && !delivered ? true : form.venueName && form.venueAddress && form.city,
    addons: chosenAddons.length > 0,
    review: false
  };
  // The menu section is hidden for Catering only, so it drops out of the nav and the numbering.
  // A rental shows its items instead of the package, menu and additional charges.
  const sections = SECTIONS.filter(([key]) => (rental ? !['package', 'food', 'addons'].includes(key) : key !== 'items' && (key !== 'food' || buffet))).map(([key, label, short]) => [
    key,
    rental && key === 'venue' ? 'Pick up or delivery' : label,
    rental && key === 'venue' ? 'Pick-up / delivery' : short
  ]);
  // A section's number on the page, which shifts when the menu section is hidden
  const sectionNo = (key) => sections.findIndex(([k]) => k === key) + 1;

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

      {/* Phone / tablet: section chips (1o), labelled with each section's short name.
          A finished section shows a tick instead of its number, like the desktop list. */}
      <Box ref={chipBar} className="tm-scroll" sx={{ display: { xs: 'flex', lg: 'none' }, position: 'sticky', top: tokens.headerHeight, zIndex: 5, gap: 0.75, overflowX: 'auto', mx: { xs: -1.5, sm: -2.5, md: -3 }, px: { xs: 1.5, sm: 2.5, md: 3 }, py: 1, mb: 2, backgroundColor: tokens.shellScrim, backdropFilter: 'blur(10px)' }}>
        {sections.map(([key, , short], i) => (
          <ButtonBase key={key} data-section={key} onClick={() => scrollTo(key)} aria-current={active === key ? 'true' : undefined} sx={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.5, py: 0.75, borderRadius: 999, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: active === key ? tokens.onGold : sectionHasError(key) ? tokens.dangerSoft : tokens.textOnDarkSoft, backgroundColor: active === key ? tokens.gold : tokens.shellInset, border: `1px solid ${sectionHasError(key) ? 'rgba(239,68,68,0.5)' : 'transparent'}`, '@media (pointer: coarse)': { py: 1 } }}>
            {sectionDone[key] ? <CheckCircleRoundedIcon sx={{ fontSize: 15, color: active === key ? tokens.onGold : tokens.green }} /> : <span>{i + 1}</span>}
            {short}
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
            {sections.map(([key, label], i) => (
              <ButtonBase key={key} onClick={() => scrollTo(key)} aria-current={active === key ? 'true' : undefined} sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 1.25, fontFamily: 'inherit', fontSize: 13.5, fontWeight: active === key ? 700 : 500, textAlign: 'left', color: active === key ? tokens.goldText : sectionHasError(key) ? tokens.dangerSoft : tokens.textOnDarkSoft, backgroundColor: active === key ? 'rgba(197,160,89,0.14)' : 'transparent', borderLeft: `3px solid ${active === key ? tokens.gold : 'transparent'}` }}>
                {sectionDone[key] ? <CheckCircleRoundedIcon sx={{ fontSize: 16, color: tokens.green }} /> : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, opacity: 0.5 }} />}
                {i + 1} · {label}
              </ButtonBase>
            ))}
          </Box>

          {/* ============ Middle: the form ============ */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

            <Section id="details" index={sectionNo('details')} title="Event details" subtitle={rental ? 'Tell us what the items are for and when you need them' : 'Tell us about the celebration'}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormField id="f-eventName" label="Event name" required value={form.eventName} onChange={(e) => update({ eventName: e.target.value })} error={errors.eventName} placeholder="e.g. Santos–Reyes Wedding Reception" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 80 }} />
                <SelectField id="f-occasion" label="Occasion" required value={form.occasion} onChange={(e) => update({ occasion: e.target.value })} options={OCCASIONS} placeholder="Select an occasion" error={errors.occasion} sx={{ gridColumn: { sm: '1 / -1' } }} />
                {/* Calendar always open across the full row; tapping a date picks it and lists the times already booked */}
                <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                  {/* A rental takes no event slot, so only too-soon and blocked days are greyed out */}
                  <DateField id="f-date" label={rental ? 'Date you need the items' : 'Event date'} required inline rental={rental} value={form.date} onChange={(v) => update({ date: v })} error={errors.date} />
                </Box>
                <TimeField id="f-startTime" label={rental ? (delivered ? 'Delivery time' : 'Pick-up time') : 'Start time'} required value={form.startTime} onChange={(v) => update({ startTime: v })} error={errors.startTime} min={RULES.earliestStart} max={RULES.latestStart} step={30} />
                {/* A rental has no guest count: the customer says how many of each item instead */}
                {!rental && (
                  <FormField id="f-guests" label="Guest count" required value={form.guests} onChange={(e) => updateGuests(e.target.value)} error={errors.guests} hint={pkg ? `${pkg.name} covers ${pkg.guests} guests` : `Between ${RULES.minGuests} and ${RULES.maxGuests} guests`} inputProps={{ inputMode: 'numeric', maxLength: String(RULES.maxGuests).length }} />
                )}
              </Box>
            </Section>

            {/* Asked before the package, because it decides whether there is a menu to fill in and
                how the price is worked out. Every package can be booked either way. */}
            <Section id="service" index={sectionNo('service')} title="What you are booking" subtitle="This decides whether we cook for you." error={errors.serviceType}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: rentalPkg ? 'repeat(3, 1fr)' : '1fr 1fr' }, gap: 1.5 }}>
                {[
                  ['Buffet and Catering', 'We cook your food', `One pork, chicken, fish and vegetable dish, with water and juice. Charged ${peso(data.pricePerPlate)} per person.`],
                  ['Catering only', 'Equipment and setup only', 'Tables, chairs, linens, food warmers and tableware. You provide the food, and there is no per-person charge.'],
                  // Only while the admin shows the Equipment Rental package
                  ...(rentalPkg ? [[RENTAL_SERVICE, 'Rent items only', `Pick the tables, chairs, linens, warmers or decor you need, priced per piece. Pick up in ${RENTAL.pickupAddress} or have them delivered.`]] : [])
                ].map(([value, heading, description]) => {
                  const selected = form.serviceType === value;
                  return (
                    <ButtonBase key={value} onClick={() => chooseService(value)} aria-pressed={selected} sx={{ display: 'block', p: 2, textAlign: 'left', borderRadius: 2, fontFamily: 'inherit', border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight, transition: 'border-color 0.15s ease', '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{value}</Typography>
                        {selected ? <CheckCircleRoundedIcon sx={{ color: tokens.ink }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.textSecondary }}>{heading}</Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>{description}</Typography>
                    </ButtonBase>
                  );
                })}
              </Box>
              {/* Our buffet is served plated, which customers often ask about before booking */}
              {buffet && (
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Our buffet is served plated by our team. The {peso(data.pricePerPlate)} per person covers the four dishes, water and juice for every guest.
                </AlertBanner>
              )}
            </Section>

            {!rental && (
            <Section id="package" index={sectionNo('package')} title="Package" subtitle="Any package works for any occasion. Pick the one that covers your guest count." error={errors.packageId}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                {packages.map((p) => {
                  const selected = p.id === form.packageId;
                  // Guest count turns red when it is above what this package covers
                  const fits = !form.guests || Number(form.guests) <= p.guests;
                  return (
                    <ButtonBase key={p.id} onClick={() => update({ packageId: p.id })} aria-pressed={selected} sx={{ display: 'block', p: 2, textAlign: 'left', borderRadius: 2, fontFamily: 'inherit', border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight, transition: 'border-color 0.15s ease', '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{p.name}</Typography>
                        {selected ? <CheckCircleRoundedIcon sx={{ color: tokens.ink }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
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
                    {buffet ? 'Your food is cooked by us and charged per person on top of this package.' : 'Booked as catering only: the equipment above, with no food.'}
                  </Typography>
                </Box>
              )}
              {overBy > 0 && (
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Your {form.guests} guests are {overBy} more than {pkg.name} covers. You can still book it; our team may add charges for the extra guests in your quotation.
                </AlertBanner>
              )}
            </Section>
            )}

            {/* Equipment rental: how many of each item, grouped like the inventory, with each item's
                availability on the chosen date */}
            {rental && (
              <Section id="items" index={sectionNo('items')} title="Items to rent" subtitle="Type how many you need of each item. Prices are per piece for your whole rental." error={errors.rentalItems}>
                {!form.date && (
                  <AlertBanner tone="info" sx={{ mb: 2 }}>
                    Choose your date above to see what is available that day.
                  </AlertBanner>
                )}
                {INVENTORY_CATEGORIES.filter((category) => data.rentals.some((i) => i.category === category)).map((category) => (
                  <Box key={category} sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: tokens.textMuted, mb: 1 }}>{category}</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {data.rentals
                        .filter((i) => i.category === category)
                        .map((item) => {
                          const qty = form.rentalQty[item.id] || '';
                          const on = Number(qty) > 0;
                          const free = avail[item.id] && AVAILABILITY[avail[item.id].status];
                          return (
                            <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 104px', gap: 1.25, alignItems: 'start', p: 1.25, borderRadius: 1.5, border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`, backgroundColor: on ? 'rgba(197,160,89,0.08)' : '#fff' }}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{item.name}</Typography>
                                <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                                  {peso(item.price)} per piece{on ? ` · ${peso(item.price * Number(qty))}` : ''}
                                </Typography>
                                <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>
                                  Damage fee {peso(item.damageFee)} per piece
                                  {free && (
                                    <Box component="span" sx={{ ml: 1, fontWeight: 700, color: free.color }}>
                                      · {free.label}
                                    </Box>
                                  )}
                                </Typography>
                              </Box>
                              <FormField
                                id={`f-rent-${item.id}`}
                                value={qty}
                                onChange={(e) => updateRentalQty(item.id, e.target.value)}
                                error={errors[`rental.${item.id}`]}
                                placeholder="0"
                                inputProps={{ inputMode: 'numeric', maxLength: String(RENTAL.maxQty).length, 'aria-label': `How many ${item.name}` }}
                              />
                            </Box>
                          );
                        })}
                    </Box>
                  </Box>
                ))}
                <AlertBanner tone="info">Items that come back damaged or missing are charged at the damage fee shown for each item.</AlertBanner>
              </Section>
            )}

            {/* Only for a buffet: one dish from each category, and water and juice for everyone */}
            {buffet && (
              <Section id="food" index={sectionNo('food')} title="Your menu" subtitle={`Write what you would like for each part of the menu. ${peso(data.pricePerPlate)} per person covers all of it.`}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  {DISH_CATEGORIES.map(({ key, label }) => {
                    // The admin's dish list is offered as autocomplete, but anything can be typed,
                    // so a customer who wants two pork dishes just writes both on the pork line.
                    const suggestions = dishesIn(key);
                    return (
                      <Box key={key} sx={{ minWidth: 0 }}>
                        <FormField
                          id={`f-dish-${key}`}
                          label={label}
                          required
                          value={form.menu[key] || ''}
                          onChange={(e) => setDish(key, e.target.value)}
                          error={errors[`menu.${key}`]}
                          placeholder={suggestions.length ? `e.g. ${suggestions[0].name}` : `Your ${label.toLowerCase()}`}
                          hint={suggestions.length ? `We often cook: ${suggestions.slice(0, 4).map((d) => d.name).join(', ')}` : undefined}
                          inputProps={{ maxLength: MENU_LINE_MAX, list: `dishes-${key}`, autoComplete: 'off' }}
                        />
                        {/* Native autocomplete: suggests, never restricts */}
                        <Box component="datalist" id={`dishes-${key}`}>
                          {suggestions.map((d) => (
                            <option key={d.id} value={d.name} />
                          ))}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Write it however you like. You can ask for more than one dish on a line, for example "Lechon kawali and pork barbecue" for your pork.
                </AlertBanner>
                {/* Fixed for every buffet, so it is shown rather than asked */}
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.25 }}>Drinks</Typography>
                  <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{BUFFET_DRINKS.join(' and ')} for every guest, included in the price per person.</Typography>
                </Box>
                <FormField id="f-foodNotes" label="Anything we should know about the food" optional multiline minRows={3} value={form.foodNotes} onChange={(e) => update({ foodNotes: e.target.value })} placeholder="Allergies, a vegetarian portion, softer food for elderly guests, serving time…" hint="This does not change the price. Our kitchen reads it before the event." inputProps={{ maxLength: 500 }} sx={{ mt: 2 }} />
              </Section>
            )}

            {rental ? (
              <Section id="venue" index={sectionNo('venue')} title="Pick up or delivery" error={errors.fulfilment}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  {[
                    ['pickup', 'Pick up', `Free. Collect the items at ${RENTAL.pickupAddress}.`],
                    ['delivery', 'Delivery', `${peso(RENTAL.deliveryFee)} standard fee. A large order may be quoted a different delivery fee.`]
                  ].map(([value, heading, description]) => {
                    const selected = form.fulfilment === value;
                    return (
                      <ButtonBase key={value} onClick={() => update({ fulfilment: value })} aria-pressed={selected} sx={{ display: 'block', p: 2, textAlign: 'left', borderRadius: 2, fontFamily: 'inherit', border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight, '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{heading}</Typography>
                          {selected ? <CheckCircleRoundedIcon sx={{ color: tokens.ink }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
                        </Box>
                        <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>{description}</Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
                {/* Where to deliver: the same fields as an event venue */}
                {delivered && (
                  <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <FormField id="f-venueName" label="Place name" required value={form.venueName} onChange={(e) => update({ venueName: e.target.value })} error={errors.venueName} placeholder="e.g. Santos Residence" />
                    <FormField id="f-venueAddress" label="Delivery address" required value={form.venueAddress} onChange={(e) => update({ venueAddress: e.target.value })} error={errors.venueAddress} placeholder="Street, barangay" />
                    <FormField id="f-city" label="City" required value={form.city} onChange={(e) => update({ city: e.target.value })} error={errors.city} placeholder="e.g. Lipa City" />
                    <FormField id="f-accessNotes" label="Notes for the delivery" optional multiline minRows={3} value={form.accessNotes} onChange={(e) => update({ accessNotes: e.target.value })} placeholder="Landmark, gate, who receives the items…" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 500 }} />
                  </Box>
                )}
              </Section>
            ) : (
            <Section id="venue" index={sectionNo('venue')} title="Venue and logistics">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormField id="f-venueName" label="Venue name" required value={form.venueName} onChange={(e) => update({ venueName: e.target.value })} error={errors.venueName} placeholder="e.g. The Glass Garden" />
                <FormField id="f-venueAddress" label="Venue address" required value={form.venueAddress} onChange={(e) => update({ venueAddress: e.target.value })} error={errors.venueAddress} placeholder="Street, barangay" />
                <FormField id="f-city" label="City" required value={form.city} onChange={(e) => update({ city: e.target.value })} error={errors.city} placeholder="e.g. Pasig City" />
                <FormField id="f-accessNotes" label="Access notes" optional multiline minRows={3} value={form.accessNotes} onChange={(e) => update({ accessNotes: e.target.value })} placeholder="Gate, parking, elevator, loading area, setup time restrictions…" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 500 }} />
              </Box>
            </Section>
            )}

            {!rental && (
            <Section id="addons" index={sectionNo('addons')} title="Additional charges" subtitle="Optional. Tick what you need and we price it in your quotation.">
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
                        {/* Charges counted by the piece ask how many; the admin then prices one of them */}
                        {a.hasQuantity && on && (
                          <FormField
                            id={`f-qty-${a.id}`}
                            label="How many do you need?"
                            value={form.addonQty[a.id] || ''}
                            onChange={(e) => updateAddonQty(a.id, e.target.value)}
                            error={errors[`addonQty.${a.id}`]}
                            inputProps={{ inputMode: 'numeric', maxLength: 2, 'aria-label': `How many ${a.name}` }}
                            sx={{ mt: 1, maxWidth: 150 }}
                          />
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Section>
            )}

            <Section id="review" index={sectionNo('review')} title="Review and submit">
              {rental ? <RentalQuoteLines quote={quote} delivered={delivered} /> : <QuoteLines quote={quote} pkg={pkg} serviceType={form.serviceType} addons={chosenAddons} addonQty={form.addonQty} />}
              <AlertBanner tone="info" sx={{ mt: 2 }}>
                {rental
                  ? 'This is a request, not a confirmed rental. We check the items and send your quotation within 24 hours.'
                  : 'This is a request, not a confirmed booking. We review it and send your quotation with the additional charges priced within 24 hours.'}
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
              {(rental
                ? [
                    ['Booking', form.serviceType],
                    ['Date', form.date ? formatDate(form.date) : '—'],
                    ['Items', rentalChosen.length ? `${rentalChosen.reduce((sum, line) => sum + line.qty, 0)} pcs` : '—'],
                    ['Pick up or delivery', delivered ? 'Delivery' : 'Pick up']
                  ]
                : [
                    ['Booking', form.serviceType],
                    ['Date', form.date ? formatDate(form.date) : '—'],
                    ['Guests', form.guests || '—'],
                    ['Package', pkg ? pkg.name : '—'],
                    // Only a buffet has a menu to report on
                    ...(buffet ? [['Menu', menuComplete ? 'Chosen' : '—']] : []),
                    ['Additional charges', chosenAddons.length || 'None']
                  ]
              ).map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{value}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              {/* The package price plus, for a buffet, the food: both are known now, so this is a real figure */}
              <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: tokens.textMuted }}>{rental ? 'Rental total' : 'Starting total'}</Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 800 }}>{pkg && (!rental || rentalChosen.length) ? peso(knownTotal) : '—'}</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                {rental
                  ? rentalChosen.length
                    ? `Items ${peso(quote.rental)}${delivered ? ` + delivery ${peso(quote.deliveryFee)}` : ', picked up for free'}.`
                    : 'Type how many you need of each item to see your total'
                  : !pkg
                  ? 'Choose a package to see your total'
                  : buffet && quote.plates
                    ? `Package ${peso(quote.packageTotal)} + buffet for ${quote.plates} at ${peso(quote.pricePerPlate)} each. Additional charges are priced in your quotation.`
                    : buffet
                      ? 'Enter your guest count to see the buffet price'
                      : 'Catering only, so there is no per-person charge. Additional charges are priced in your quotation.'}
              </Typography>
              <BusyButton fullWidth size="large" busy={busy} onClick={submit} sx={{ mt: 2 }}>
                Submit request
              </BusyButton>
            </DashCard>
          </Box>
        </Box>
      )}

      {/* Phone / tablet sticky price bar (1o), sitting right on top of the phone tab bar
          (--tm-bottom-nav is its height, set by PortalShell; 0px where there is no tab bar) */}
      {data && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--tm-bottom-nav, 0px)', zIndex: 1090, display: { xs: 'flex', lg: 'none' }, alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, backgroundColor: '#fff', borderTop: `1px solid ${tokens.cardLightBorder}`, boxShadow: '0 -10px 30px -12px rgba(0,0,0,0.4)' }}>
          <Box>
            <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>{rental ? 'Rental total' : buffet && quote.plates ? `Package + buffet for ${quote.plates}` : 'Starting total'}</Typography>
            <Typography sx={{ fontSize: 19, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1 }}>{rental ? (rentalChosen.length ? peso(knownTotal) : 'Pick your items') : pkg ? peso(knownTotal) : 'Pick a package'}</Typography>
          </Box>
          <BusyButton busy={busy} onClick={submit} sx={{ px: 3, bgcolor: tokens.ink, color: tokens.onInk, '&:hover': { bgcolor: tokens.inkHover } }}>
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

/**
 * Price breakdown before the quotation. The package price and, for a buffet, the food are both
 * known here, because a buffet is charged per person. Only the additional charges are still
 * "To be quoted", so the starting total is what the customer can already count on.
 */
function QuoteLines({ quote, pkg, serviceType, addons, addonQty }) {
  const rows = [
    [pkg ? `Package · ${pkg.name}` : 'Package', pkg ? peso(quote.packageTotal) : '—'],
    // A buffet line only once the guest count is in; catering only never has one
    ...(includesFood(serviceType)
      ? [[quote.plates ? `Buffet · ${quote.plates} × ${peso(quote.pricePerPlate)}` : 'Buffet · enter your guest count', quote.plates ? peso(quote.food) : '—']]
      : []),
    ...addons.map((a) => [a.hasQuantity ? `${a.name} × ${Number(addonQty[a.id]) || 1}` : a.name, 'To be quoted'])
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
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{pkg ? peso(quote.packageTotal + quote.food) : '—'}</Typography>
      </Box>
    </Box>
  );
}

/**
 * Price breakdown of an equipment rental: one line per item (how many x the price per piece), then
 * the delivery fee or free pick-up. Every price is known, so the total is what the quotation will
 * show unless the admin sets a different delivery fee for a large order.
 */
function RentalQuoteLines({ quote, delivered }) {
  const rows = [
    ...quote.rentalItems.map((line) => [`${line.name} · ${line.qty} × ${peso(line.price)}`, peso(line.total)]),
    [delivered ? 'Delivery (standard fee)' : 'Pick up', delivered ? peso(quote.deliveryFee) : 'Free']
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {quote.rentalItems.length === 0 && <Typography sx={{ px: 2, py: 1.25, fontSize: 13.5, color: tokens.textSecondary, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>No items yet</Typography>}
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{label}</Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.5, backgroundColor: tokens.surfaceSubtle }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Rental total</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{quote.rentalItems.length ? peso(quote.net) : '—'}</Typography>
      </Box>
    </Box>
  );
}
