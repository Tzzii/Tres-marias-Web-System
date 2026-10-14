import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
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
  EndTimeField,
  EquipmentPhoto,
  ErrorState,
  FormField,
  INVENTORY_CATEGORIES,
  ListSkeleton,
  MenuPicker,
  DessertFields,
  DESSERT_ADDON_ID,
  menuProblem,
  buffetDrinks,
  dessertSummary,
  OCCASIONS,
  OCCASION_OTHER,
  OCCASION_OTHER_RANGE,
  PageHeader,
  RENTAL,
  RENTAL_SERVICE,
  RULES,
  SERVICE_TYPES,
  SelectField,
  StylingFields,
  StylingSummary,
  TimeField,
  addonPriceMap,
  bookingOccasion,
  calendarApi,
  catalogApi,
  cleanStyling,
  computeQuote,
  decorReminders,
  endTimeProblem,
  eventHours,
  flattenAddons,
  formatClock,
  formatDate,
  formatBookingItem,
  formatEventTime,
  includesFood,
  isRental,
  isRentalPackage,
  packageItemsFor,
  peso,
  reservationApi,
  shiftEndTime,
  stylingEmpty,
  stylingProblem,
  themeLabel,
  titleCase,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { clearDraft, clearIntent, readDraft, readIntent, saveDraft } from '../../lib/booking.js';
import { cleanDraftReferencePhoto } from '@tm/shared/domain/referencePhoto.js';

const SECTIONS = [
  ['details', 'Event Details', 'Event'],
  ['service', 'What You Are Booking', 'Service'],
  ['package', 'Package', 'Package'],
  ['styling', 'Theme and Colors', 'Styling'],
  ['items', 'Items to Rent', 'Items'],
  ['food', 'Your Menu', 'Menu'],
  ['venue', 'Venue and Logistics', 'Venue'],
  ['addons', 'Additional Charges', 'Add-ons'],
  ['review', 'Review and Submit', 'Review']
];

const FIELD_SECTION = {
  eventName: 'details',
  occasion: 'details',
  occasionOther: 'details',
  date: 'details',
  startTime: 'details',
  endTime: 'details',
  agreeTerms: 'review',
  guests: 'details',
  serviceType: 'service',
  packageId: 'package',
  rentalItems: 'items',
  foodNotes: 'food',
  fulfilment: 'venue',
  venueName: 'venue',
  venueAddress: 'venue',
  city: 'venue'
};

const sectionForField = (field) => {
  if (field.startsWith('menu.dessert.')) return 'addons';
  if (field.startsWith('menu.')) return 'food';
  if (field.startsWith('styling.')) return 'styling';
  if (field.startsWith('addonQty.')) return 'addons';
  if (field.startsWith('rental.')) return 'items';
  return FIELD_SECTION[field] || 'details';
};

const hasSizes = (addon) => Boolean(addon && addon.sizes && addon.sizes.length);

const lowestPackagePrice = (addon) => {
  const prices = addon.sizes.map((s) => s.price).filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : null;
};

const EMPTY_STYLING = { theme: '', themeOther: '', colors: [], notes: '' };
const EMPTY = {
  eventName: '',
  occasion: '',
  occasionOther: '',
  date: '',
  startTime: '18:00',
  endTime: '',
  guests: '',
  serviceType: '',
  packageId: '',
  menu: {},
  foodNotes: '',
  styling: EMPTY_STYLING,
  referencePhoto: null,
  venueName: '',
  venueAddress: '',
  city: '',
  accessNotes: '',
  addonIds: [],
  addonQty: {},
  fulfilment: 'pickup',
  rentalQty: {}
};

const FORM_COLUMNS = {
  gridTemplateColumns: 'minmax(0, 1fr)',
  '@container booking-form (min-width: 560px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
};
const SUMMARY_LAYOUT = '@container portal-content (min-width: 980px)';
const WIDE_LAYOUT = '@container portal-content (min-width: 1280px)';

const draftStyling = (value) => ({ ...EMPTY_STYLING, ...(cleanStyling(value) || {}) });

const wordList = (words) =>
  words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];

const DATES_LOADING = 'The available dates are still loading. Please try again in a moment.';

const AVAILABILITY = {
  available: { label: (left) => `${left} available`, color: '#047857' },
  limited: { label: (left) => `Only ${left} left`, color: '#b45309' },
  out: { label: () => 'None left on this date', color: '#b91c1c' }
};

export default function BookEventPage() {
  useDocumentTitle('Book an Event');
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const catalog = useResource(() => catalogApi.getCatalog(), [], { live: false });

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [active, setActive] = useState('details');
  const chipBar = useRef(null);
  const touched = useRef(false);
  const initialised = useRef(false);
  const occasionBox = useRef(null);
  const justPickedOther = useRef(false);

  useEffect(() => {
    if (!catalog.data || initialised.current) return;
    initialised.current = true;
    const draft = readDraft(user.id);
    const hasDraft = Boolean(draft && draft.form);
    const intent = readIntent();
    const intentIsNewer = Boolean(intent && (!hasDraft || !draft.savedAt || intent.savedAt > draft.savedAt));

    const base = hasDraft
      ? { ...EMPTY, ...Object.fromEntries(Object.entries(draft.form).filter(([key]) => key in EMPTY)) }
      : { ...EMPTY };
    base.styling = draftStyling(base.styling);
    base.referencePhoto = cleanDraftReferencePhoto(base.referencePhoto);
    const picks = intentIsNewer ? intent : {};
    const pkg = catalog.data.packages.find((p) => p.slug === (params.get('package') || picks.packageSlug));
    const serviceFor =
      pkg && isRentalPackage(pkg)
        ? { serviceType: RENTAL_SERVICE }
        : pkg && isRental(base.serviceType)
          ? { serviceType: EMPTY.serviceType }
          : {};
    setForm({
      ...base,
      ...(picks.occasion
        ? { occasion: picks.occasion, ...(picks.occasion === OCCASION_OTHER ? {} : { occasionOther: '' }) }
        : {}),
      ...(picks.startTime ? { startTime: picks.startTime } : {}),
      ...(picks.endTime ? { endTime: picks.endTime } : {}),
      ...(picks.guests ? { guests: String(picks.guests) } : {}),
      ...(pkg ? { packageId: pkg.id, ...serviceFor } : {}),
      ...(params.get('date') || picks.date ? { date: params.get('date') || picks.date } : {})
    });
    if (hasDraft) setSavedAt(draft.savedAt);
  }, [catalog.data, user.id, params]);

  useEffect(() => {
    if (form.occasion === OCCASION_OTHER && justPickedOther.current && occasionBox.current) occasionBox.current.focus();
    justPickedOther.current = false;
  }, [form.occasion]);

  useEffect(() => {
    if (!touched.current) return undefined;
    const timer = setTimeout(() => {
      const saved = saveDraft(user.id, form);
      setDraftSaveFailed(!saved);
      if (saved) setSavedAt(Date.now());
    }, 700);
    return () => clearTimeout(timer);
  }, [form, user.id]);

  useEffect(() => {
    if (!catalog.data) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('sec-', ''));
      },
      { rootMargin: '-90px 0px -55% 0px' }
    );
    SECTIONS.forEach(([key]) => {
      const el = document.getElementById(`sec-${key}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [catalog.data, form.serviceType]);

  useEffect(() => {
    const bar = chipBar.current;
    const chip = bar && bar.querySelector(`[data-section="${active}"]`);
    if (!chip || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  const data = catalog.data;
  const pkg = data ? data.packages.find((p) => p.id === form.packageId) : null;
  const rentalPkg = data ? data.packages.find(isRentalPackage) || null : null;
  const packages = data ? data.packages.filter((p) => !isRentalPackage(p)) : [];
  const rental = isRental(form.serviceType);
  const buffet = includesFood(form.serviceType);
  const addonById = data ? Object.fromEntries(flattenAddons(data.addons).map((a) => [a.id, a])) : {};
  const bookedAddonIds = rental
    ? []
    : form.addonIds.flatMap((id) => {
        const a = addonById[id];
        if (!a) return [];
        return hasSizes(a) ? a.sizes.filter((s) => Number(form.addonQty[s.id]) > 0).map((s) => s.id) : [id];
      });
  const chosenAddons = bookedAddonIds.map((id) => addonById[id]);
  const rentalChosen =
    data && rental
      ? data.rentals
          .filter((i) => Number(form.rentalQty[i.id]) > 0)
          .map((i) => ({ itemId: i.id, name: i.name, qty: Number(form.rentalQty[i.id]), price: i.price }))
      : [];
  const delivered = rental && form.fulfilment === 'delivery';
  const styling = rental ? null : cleanStyling(form.styling);
  const reminders = data && !rental ? decorReminders(form.styling.notes, data.addons, form.addonIds) : [];
  const quote = computeQuote({
    pkg,
    serviceType: form.serviceType,
    guests: rental ? 0 : Number(form.guests) || 0,
    pricePerPlate: data ? data.pricePerPlate : 0,
    rentalItems: rentalChosen,
    deliveryFee: delivered ? RENTAL.deliveryFee : 0,
    addonIds: bookedAddonIds,
    addonQty: form.addonQty,
    addonPrices: addonPriceMap(chosenAddons)
  });
  const knownTotal = quote.net;
  const packageItems = pkg && !rental ? packageItemsFor(pkg, Number(form.guests) || 0) : [];
  const extraGuests = rental ? 0 : quote.extraGuests;
  const extraNote = extraGuests ? ` + equipment for ${extraGuests} extra guests (to be quoted)` : '';
  const plusQuoted = extraGuests ? ' + quoted' : '';
  const addonNote = quote.addons ? ` + additional charges ${peso(quote.addons)}` : '';
  const quotedNote = chosenAddons.some((a) => !a.price)
    ? ' Charges marked "To be quoted" are priced in your quotation.'
    : '';

  const tracksStock = Boolean(data) && flattenAddons(data.addons).some((a) => a.inventoryItemId);
  const [avail, setAvail] = useState({});
  useEffect(() => {
    if (!(rental || tracksStock) || !form.date) {
      setAvail({});
      return undefined;
    }
    let live = true;
    reservationApi
      .getRentalAvailability(form.date)
      .then((next) => live && setAvail(next))
      .catch(() => live && setAvail({}));
    return () => {
      live = false;
    };
  }, [rental, tracksStock, form.date]);
  const leftFor = (a) =>
    a.inventoryItemId && form.date && avail[a.inventoryItemId] ? avail[a.inventoryItemId].left : null;
  const stockError = (itemId) => {
    const free = avail[itemId];
    const qty = Number(form.rentalQty[itemId]) || 0;
    if (!free || !qty || qty <= free.left) return '';
    return free.left ? `Only ${free.left} available` : 'None available';
  };

  const update = (patch) => {
    touched.current = true;
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  const pickOccasion = (value) => {
    justPickedOther.current = value === OCCASION_OTHER;
    update({ occasion: value, ...(value === OCCASION_OTHER ? {} : { occasionOther: '' }) });
  };

  const updateStyling = (patch) => {
    touched.current = true;
    setForm((f) => ({ ...f, styling: { ...f.styling, ...patch } }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[`styling.${k}`]);
      if ('theme' in patch) delete next['styling.themeOther'];
      return next;
    });
  };

  const updateReferencePhoto = (photo) => {
    update({ referencePhoto: photo });
    setErrors((current) => {
      const next = { ...current };
      delete next['styling.referencePhoto'];
      return next;
    });
  };

  const chooseService = (value) => {
    if (isRental(value)) update({ serviceType: value, packageId: rentalPkg.id });
    else update({ serviceType: value, packageId: pkg && isRentalPackage(pkg) ? '' : form.packageId });
  };

  const updateRentalQty = (id, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RENTAL.maxQty) return;
    update({ rentalQty: { ...form.rentalQty, [id]: digits } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`rental.${id}`];
      delete next.rentalItems;
      return next;
    });
  };

  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return;
    update({ guests: digits });
  };

  const toggleAddon = (id) => {
    const charge = addonById[id];
    const on = form.addonIds.includes(id);
    const qty = { ...form.addonQty };
    if (on) {
      delete qty[id];
      if (hasSizes(charge)) charge.sizes.forEach((s) => delete qty[s.id]);
    } else if (!hasSizes(charge)) qty[id] = '1';
    update({ addonIds: on ? form.addonIds.filter((a) => a !== id) : [...form.addonIds, id], addonQty: qty });
  };

  const updateAddonQty = (id, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    update({ addonQty: { ...form.addonQty, [id]: digits } });
    const parentId = addonById[id] && addonById[id].parentId;
    setErrors((e) => {
      const next = { ...e };
      delete next[`addonQty.${id}`];
      if (parentId) delete next[`addonQty.${parentId}`];
      return next;
    });
  };

  const pickPackage = (charge, id) => {
    const qty = { ...form.addonQty };
    charge.sizes.forEach((s) => delete qty[s.id]);
    qty[id] = '1';
    update({ addonQty: qty });
    setErrors((e) => {
      const next = { ...e };
      delete next[`addonQty.${charge.id}`];
      charge.sizes.forEach((s) => delete next[`addonQty.${s.id}`]);
      return next;
    });
  };

  const setDish = (category, text) => {
    update({ menu: { ...form.menu, [category]: text } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`menu.${category}`];
      delete next['menu.total'];
      if (category === 'dessert') {
        delete next['menu.dessert.name'];
        delete next['menu.dessert.description'];
      }
      return next;
    });
  };

  const scrollTo = (key) => {
    const el = document.getElementById(`sec-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const validate = () => {
    const e = {};
    if (form.eventName.trim().length < 3) e.eventName = 'Give your event a name (at least 3 characters).';
    const occasionCheck = bookingOccasion(form.occasion, form.occasionOther).problem;
    if (occasionCheck) e[occasionCheck.field] = occasionCheck.message;
    if (!agreed) e.agreeTerms = 'Please read and agree to the Terms of Service before sending your request.';
    if (rental) return { ...e, ...validateRental() };
    if (!form.date) e.date = 'Choose your event date.';
    else if (calendarApi.availabilitySnapshot().loading) e.date = DATES_LOADING;
    else {
      const reason = calendarApi.dateUnavailableReason(form.date, calendarApi.availabilitySnapshot());
      if (reason) e.date = `This date is not available (${reason.toLowerCase()}).`;
    }
    if (!form.startTime) e.startTime = 'Choose a start time.';
    else if (form.date && !e.date) {
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, calendarApi.availabilitySnapshot());
      if (reason) e.startTime = `${reason}.`;
    }
    if (!form.endTime) e.endTime = 'Choose an end time.';
    else if (endTimeProblem(form.startTime, form.endTime))
      e.endTime = `${endTimeProblem(form.startTime, form.endTime)}.`;
    else if (form.date && !e.date && !e.startTime) {
      const reason = calendarApi.timeUnavailableReason(
        form.date,
        form.startTime,
        calendarApi.availabilitySnapshot(),
        eventHours(form.startTime, form.endTime)
      );
      if (reason) e.endTime = `${reason}.`;
    }
    const guests = Number(form.guests);
    if (!form.guests) e.guests = 'Enter your guest count.';
    else if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests)
      e.guests = `Between ${RULES.minGuests} and ${RULES.maxGuests} guests.`;
    if (!SERVICE_TYPES.includes(form.serviceType)) e.serviceType = 'Choose what you are booking.';
    if (!pkg) e.packageId = 'Choose a package.';
    const stylingCheck = stylingProblem(styling);
    if (stylingCheck) e[stylingCheck.field] = stylingCheck.message;
    const menuCheck = menuProblem(form.menu, { buffet, dessert: bookedAddonIds.includes(DESSERT_ADDON_ID) });
    if (menuCheck) e[menuCheck.field] = menuCheck.message;
    form.addonIds.forEach((id) => {
      const charge = addonById[id];
      if (hasSizes(charge) && !charge.sizes.some((s) => Number(form.addonQty[s.id]) > 0)) {
        e[`addonQty.${id}`] = charge.hasPackages
          ? 'Choose one of the packages.'
          : 'Enter how many for at least one size.';
      }
    });
    chosenAddons.forEach((a) => {
      if (!a.hasQuantity) return;
      const many = Number(form.addonQty[a.id]);
      if (!Number.isInteger(many) || many < 1 || many > 99) e[`addonQty.${a.id}`] = 'Enter 1 to 99.';
    });
    chosenAddons.forEach((a) => {
      const left = leftFor(a);
      const many = a.hasQuantity ? Number(form.addonQty[a.id]) : 1;
      if (!e[`addonQty.${a.id}`] && left !== null && many > left)
        e[`addonQty.${a.id}`] = left ? `Only ${left} left on this date.` : 'Fully booked on this date.';
    });
    if (!form.venueName.trim()) e.venueName = 'Enter the venue name.';
    if (!form.venueAddress.trim()) e.venueAddress = 'Enter the venue address.';
    if (!form.city.trim()) e.city = 'Enter the city.';
    return e;
  };

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
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, {
        ...calendarApi.availabilitySnapshot(),
        events: []
      });
      if (reason) e.startTime = `${reason}.`;
    }
    if (!rentalChosen.length) e.rentalItems = 'Enter how many you need of at least one item.';
    rentalChosen.forEach((line) => {
      const free = avail[line.itemId];
      if (free && line.qty > free.left)
        e[`rental.${line.itemId}`] = free.left ? `Only ${free.left} free on this date.` : 'Not available on this date.';
    });
    if (form.fulfilment === 'delivery') {
      if (!form.venueName.trim()) e.venueName = 'Enter the place name.';
      if (!form.venueAddress.trim()) e.venueAddress = 'Enter the delivery address.';
      if (!form.city.trim()) e.city = 'Enter the city.';
    }
    return e;
  };

  const submit = async () => {
    if (busy || photoBusy) return;
    const found = validate();
    setErrors(found);
    setFormError('');
    const firstField = Object.keys(found).sort(
      (a, b) =>
        SECTIONS.findIndex(([key]) => key === sectionForField(a)) -
        SECTIONS.findIndex(([key]) => key === sectionForField(b))
    )[0];
    if (firstField) {
      scrollTo(sectionForField(firstField));
      setFormError(
        `Please fix ${Object.keys(found).length === 1 ? 'the highlighted field' : `the ${Object.keys(found).length} highlighted fields`} before submitting.`
      );
      return;
    }
    setBusy(true);
    try {
      const created = await reservationApi.createReservation(
        user.id,
        rental
          ? {
              ...form,
              endTime: undefined,
              styling: undefined,
              referencePhoto: null,
              agreeTerms: agreed,
              rentalItems: rentalChosen.map(({ itemId, qty }) => ({ itemId, qty }))
            }
          : {
              ...form,
              agreeTerms: agreed,
              guests: Number(form.guests),
              menu: form.menu,
              styling,
              addonIds: bookedAddonIds,
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

  const saveAndExit = () => {
    if (!saveDraft(user.id, form)) {
      notify(
        'Your draft could not be saved. Free some browser storage or remove the reference photo and try again.',
        'error'
      );
      return;
    }
    notify('Draft saved. You can finish it any time from your dashboard.', 'info');
    navigate('/portal');
  };

  const discard = () => {
    clearDraft(user.id);
    clearIntent();
    initialised.current = false;
    touched.current = false;
    setSavedAt(null);
    setDraftSaveFailed(false);
    setErrors({});
    setForm(EMPTY);
    setAgreed(false);
    catalog.reload();
  };

  if (catalog.error)
    return (
      <DashCard>
        <ErrorState error={catalog.error} onRetry={catalog.reload} />
      </DashCard>
    );

  const sectionHasError = (key) => Object.keys(errors).some((f) => sectionForField(f) === key);
  const menuComplete = !menuProblem(form.menu);
  const sectionDone = {
    details:
      form.eventName &&
      !bookingOccasion(form.occasion, form.occasionOther).problem &&
      form.date &&
      form.startTime &&
      (rental || (form.endTime && form.guests)),
    service: Boolean(form.serviceType),
    package: Boolean(pkg),
    styling: (!stylingEmpty(styling) || Boolean(form.referencePhoto)) && !stylingProblem(styling),
    items: rentalChosen.length > 0,
    food: menuComplete,
    venue: rental && !delivered ? true : form.venueName && form.venueAddress && form.city,
    addons: chosenAddons.length > 0,
    review: false
  };
  const sections = SECTIONS.filter(([key]) =>
    rental ? !['package', 'styling', 'food', 'addons'].includes(key) : key !== 'items' && (key !== 'food' || buffet)
  ).map(([key, label, short]) => [
    key,
    rental && key === 'venue' ? 'Pick Up or Delivery' : label,
    rental && key === 'venue' ? 'Pick-up / delivery' : short
  ]);
  const sectionNo = (key) => sections.findIndex(([k]) => k === key) + 1;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'My Reservations', to: '/portal/reservations' }, { label: 'Book an Event' }]}
        title="Book an Event"
        chip={
          !draftSaveFailed &&
          savedAt && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: 12.5,
                color: tokens.textOnDarkSoft
              }}
            >
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

      {draftSaveFailed && (
        <AlertBanner tone="warning" sx={{ mb: 2 }}>
          Your latest changes could not be saved as a draft. Free some browser storage or remove the reference photo and
          try again before leaving this page.
        </AlertBanner>
      )}

      <Box
        ref={chipBar}
        className="tm-scroll"
        sx={{
          display: 'flex',
          [WIDE_LAYOUT]: { display: 'none' },
          position: 'sticky',
          top: tokens.headerHeight,
          zIndex: 5,
          gap: 0.75,
          overflowX: 'auto',
          py: 1,
          mb: 2,
          backgroundColor: tokens.shellScrim,
          backdropFilter: 'blur(10px)'
        }}
      >
        {sections.map(([key, , short], i) => (
          <ButtonBase
            key={key}
            data-section={key}
            onClick={() => scrollTo(key)}
            aria-current={active === key ? 'true' : undefined}
            sx={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.6,
              px: 1.5,
              py: 0.75,
              borderRadius: 999,
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: active === key ? tokens.onGold : sectionHasError(key) ? tokens.dangerSoft : tokens.textOnDarkSoft,
              backgroundColor: active === key ? tokens.gold : tokens.shellInset,
              border: `1px solid ${sectionHasError(key) ? 'rgba(239,68,68,0.5)' : 'transparent'}`,
              '@media (pointer: coarse)': { py: 1 }
            }}
          >
            {sectionDone[key] ? (
              <CheckCircleRoundedIcon sx={{ fontSize: 15, color: active === key ? tokens.onGold : tokens.green }} />
            ) : (
              <span>{i + 1}</span>
            )}
            {short}
          </ButtonBase>
        ))}
      </Box>

      {!data ? (
        <DashCard>
          <ListSkeleton rows={8} height={52} />
        </DashCard>
      ) : (
        <Box
          className="booking-layout"
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            [SUMMARY_LAYOUT]: { gridTemplateColumns: 'minmax(0, 1fr) 288px', pb: 0 },
            [WIDE_LAYOUT]: { gridTemplateColumns: '180px minmax(0, 1fr) 288px' },
            gap: { xs: 2, md: 2.5 },
            alignItems: 'start',
            pb: '140px'
          }}
        >
          <Box
            component="nav"
            aria-label="Form sections"
            sx={{
              display: 'none',
              [WIDE_LAYOUT]: { display: 'block' },
              position: 'sticky',
              top: tokens.headerHeight + 24
            }}
          >
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textOnDarkMuted, mb: 1, px: 1.5 }}>
              On This Page
            </Typography>
            {sections.map(([key, label], i) => (
              <ButtonBase
                key={key}
                onClick={() => scrollTo(key)}
                aria-current={active === key ? 'true' : undefined}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 1.25,
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  fontWeight: active === key ? 700 : 500,
                  textAlign: 'left',
                  color:
                    active === key ? tokens.goldText : sectionHasError(key) ? tokens.dangerSoft : tokens.textOnDarkSoft,
                  backgroundColor: active === key ? 'rgba(197,160,89,0.14)' : 'transparent',
                  borderLeft: `3px solid ${active === key ? tokens.gold : 'transparent'}`
                }}
              >
                {sectionDone[key] ? (
                  <CheckCircleRoundedIcon sx={{ fontSize: 16, color: tokens.green }} />
                ) : (
                  <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, opacity: 0.5 }} />
                )}
                {i + 1} · {label}
              </ButtonBase>
            ))}
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 2, md: 2.5 },
              minWidth: 0,
              containerType: 'inline-size',
              containerName: 'booking-form'
            }}
          >
            {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

            <Section
              id="details"
              index={sectionNo('details')}
              title="Event Details"
              subtitle={
                rental ? 'Tell us what the items are for and when you need them' : 'Tell us about the celebration'
              }
            >
              <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 2 }}>
                <FormField
                  id="f-eventName"
                  label="Event name"
                  required
                  value={form.eventName}
                  onChange={(e) => update({ eventName: e.target.value })}
                  error={errors.eventName}
                  placeholder="e.g. Santos–Reyes Wedding Reception"
                  sx={{ gridColumn: { sm: '1 / -1' } }}
                  inputProps={{ maxLength: 80 }}
                />
                <SelectField
                  id="f-occasion"
                  label="Occasion"
                  required
                  value={form.occasion}
                  onChange={(e) => pickOccasion(e.target.value)}
                  options={OCCASIONS}
                  placeholder="Select an occasion"
                  error={errors.occasion}
                  sx={{ gridColumn: { sm: '1 / -1' } }}
                />
                {form.occasion === OCCASION_OTHER && (
                  <FormField
                    ref={occasionBox}
                    id="f-occasionOther"
                    label="Your occasion"
                    required
                    value={form.occasionOther}
                    onChange={(e) => update({ occasionOther: e.target.value })}
                    error={errors.occasionOther}
                    placeholder="e.g. Baby Shower, Despedida, Housewarming"
                    inputProps={{ maxLength: OCCASION_OTHER_RANGE.max }}
                    sx={{ gridColumn: { sm: '1 / -1' } }}
                  />
                )}
                <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                  <DateField
                    id="f-date"
                    label={rental ? 'Date you need the items' : 'Event date'}
                    required
                    inline
                    rental={rental}
                    value={form.date}
                    onChange={(v) => update({ date: v })}
                    error={errors.date}
                  />
                </Box>
                <TimeField
                  id="f-startTime"
                  label={rental ? (delivered ? 'Delivery time' : 'Pick-up time') : 'Start time'}
                  required
                  value={form.startTime}
                  onChange={(v) =>
                    update({
                      startTime: v,
                      ...(form.endTime ? { endTime: shiftEndTime(form.startTime, form.endTime, v) } : {})
                    })
                  }
                  error={errors.startTime}
                  min={RULES.earliestStart}
                  max={RULES.latestStart}
                  step={30}
                />
                {!rental && (
                  <EndTimeField
                    id="f-endTime"
                    required
                    startTime={form.startTime}
                    value={form.endTime}
                    onChange={(v) => update({ endTime: v })}
                    error={errors.endTime}
                    hint={`Events run ${RULES.minEventHours} to ${RULES.maxEventHours} hours.`}
                  />
                )}
                {!rental && (
                  <FormField
                    id="f-guests"
                    label="Guest count"
                    required
                    value={form.guests}
                    onChange={(e) => updateGuests(e.target.value)}
                    error={errors.guests}
                    hint={
                      pkg
                        ? `Default for ${pkg.name}: ${pkg.guests} guests${extraGuests ? `. The package grows to your ${form.guests} guests; the ${extraGuests} extra are priced in your quotation.` : ''}`
                        : `Between ${RULES.minGuests} and ${RULES.maxGuests} guests`
                    }
                    inputProps={{ inputMode: 'numeric', maxLength: String(RULES.maxGuests).length }}
                  />
                )}
              </Box>
            </Section>

            <Section
              id="service"
              index={sectionNo('service')}
              title="What You Are Booking"
              subtitle="This decides whether we cook for you."
              error={errors.serviceType}
            >
              <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 1.5 }}>
                {[
                  [
                    'Buffet and Catering',
                    'We cook your food',
                    `Four dishes, with up to two per category, and ${BUFFET_DRINKS.toLowerCase()}. Charged ${peso(data.pricePerPlate)} per person.`
                  ],
                  [
                    'Catering only',
                    'Equipment and setup only',
                    'Tables, chairs, linens, food warmers and tableware. You provide the food, and there is no per-person charge.'
                  ],
                  ...(rentalPkg
                    ? [
                        [
                          RENTAL_SERVICE,
                          'Rent items only',
                          `Pick the tables, chairs, linens, warmers or decor you need, priced per piece. Pick up in ${RENTAL.pickupAddress} or have them delivered.`
                        ]
                      ]
                    : [])
                ].map(([value, heading, description]) => {
                  const selected = form.serviceType === value;
                  return (
                    <ButtonBase
                      key={value}
                      onClick={() => chooseService(value)}
                      aria-pressed={selected}
                      sx={{
                        display: 'block',
                        p: 2,
                        textAlign: 'left',
                        borderRadius: 2,
                        fontFamily: 'inherit',
                        border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`,
                        backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight,
                        transition: 'border-color 0.15s ease',
                        '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder }
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>
                          {value}
                        </Typography>
                        {selected ? (
                          <CheckCircleRoundedIcon sx={{ color: tokens.ink }} />
                        ) : (
                          <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.textSecondary }}>
                        {heading}
                      </Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>
                        {description}
                      </Typography>
                    </ButtonBase>
                  );
                })}
              </Box>
              {buffet && (
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Our buffet is served plated by our team. The {peso(data.pricePerPlate)} per person covers the four
                  dishes and {BUFFET_DRINKS.toLowerCase()} for every guest.
                </AlertBanner>
              )}
            </Section>

            {!rental && (
              <Section
                id="package"
                index={sectionNo('package')}
                title="Package"
                subtitle="Any package works for any occasion. Each one shows its default guest count, so pick the one closest to yours."
                error={errors.packageId}
              >
                <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 1.5 }}>
                  {packages.map((p) => {
                    const selected = p.id === form.packageId;
                    return (
                      <ButtonBase
                        key={p.id}
                        onClick={() => update({ packageId: p.id })}
                        aria-pressed={selected}
                        sx={{
                          display: 'block',
                          p: 2,
                          textAlign: 'left',
                          borderRadius: 2,
                          fontFamily: 'inherit',
                          border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`,
                          backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight,
                          transition: 'border-color 0.15s ease',
                          '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder }
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>
                            {p.name}
                          </Typography>
                          {selected ? (
                            <CheckCircleRoundedIcon sx={{ color: tokens.ink }} />
                          ) : (
                            <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{p.description}</Typography>
                        <Box
                          onClick={(e) => e.stopPropagation()}
                          sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', gap: 1 }}
                        >
                          <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
                            Default: {p.guests} guests
                          </Typography>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>
                            {peso(p.price)}
                          </Typography>
                        </Box>
                      </ButtonBase>
                    );
                  })}
                </Box>
                {pkg && (
                  <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>
                      {pkg.name} includes{extraGuests ? ` for your ${form.guests} guests` : ''}
                    </Typography>
                    {extraGuests > 0 && (
                      <Typography sx={{ mb: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.goldDark }}>
                        Adjusted from {pkg.guests} to your {form.guests} guests. We confirm the items marked "to
                        confirm" and price the equipment for your {extraGuests} extra guests in your quotation.
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.textSecondary }}>
                      {packageItems.map((item, i) => (
                        <Fragment key={`${item.name}-${i}`}>
                          {i > 0 && ' · '}
                          {item.toConfirm ? (
                            <Box component="span" sx={{ color: tokens.goldDark }}>
                              {formatBookingItem(item)}
                            </Box>
                          ) : item.qty !== item.defaultQty ? (
                            <>
                              <Box component="b" sx={{ color: tokens.textPrimary }}>
                                {item.qty}
                              </Box>{' '}
                              {item.name}
                            </>
                          ) : (
                            formatBookingItem(item)
                          )}
                        </Fragment>
                      ))}
                    </Typography>
                    {form.serviceType && (
                      <Typography sx={{ mt: 0.75, fontSize: 12.5, color: tokens.textSecondary }}>
                        {buffet
                          ? 'Your food is cooked by us and charged per person on top of this package.'
                          : 'Booked as catering only: the equipment above, with no food.'}
                      </Typography>
                    )}
                  </Box>
                )}
              </Section>
            )}

            {!rental && (
              <Section
                id="styling"
                index={sectionNo('styling')}
                title="Theme and Colors"
                subtitle="Optional. Tell us the look you want so our team sets up your tables, linens and backdrop to match."
              >
                <StylingFields
                  idPrefix="f-styling"
                  value={form.styling}
                  onChange={updateStyling}
                  occasion={form.occasion}
                  errors={errors}
                  forCustomer
                  referencePhoto={form.referencePhoto}
                  onPhotoBusyChange={setPhotoBusy}
                  onReferencePhotoChange={updateReferencePhoto}
                >
                  {reminders.length > 0 && (
                    <AlertBanner tone="info" sx={{ mt: 1.5 }}>
                      You mentioned {wordList(reminders.map((r) => r.word))}. {wordList(reminders.map((r) => r.name))}{' '}
                      {reminders.length === 1 ? 'is an additional charge' : 'are additional charges'}: tick{' '}
                      {reminders.length === 1 ? 'it' : 'them'} under Additional Charges if you want us to provide{' '}
                      {reminders.length === 1 ? 'it' : 'them'}.
                      <Box sx={{ mt: 0.5 }}>
                        <Button
                          size="small"
                          onClick={() => scrollTo('addons')}
                          sx={{ px: 0, minWidth: 0, fontWeight: 700 }}
                        >
                          Go to Additional Charges
                        </Button>
                      </Box>
                    </AlertBanner>
                  )}
                </StylingFields>
              </Section>
            )}

            {rental && (
              <Section
                id="items"
                index={sectionNo('items')}
                title="Items to Rent"
                subtitle="Type how many you need of each item. Prices are per piece for your whole rental."
                error={errors.rentalItems}
              >
                {!form.date && (
                  <AlertBanner tone="info" sx={{ mb: 2 }}>
                    Choose your date above to see what is available that day.
                  </AlertBanner>
                )}
                {INVENTORY_CATEGORIES.filter((category) => data.rentals.some((i) => i.category === category)).map(
                  (category) => (
                    <Box key={category} sx={{ mb: 2 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textMuted, mb: 1 }}>
                        {titleCase(category)}
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {data.rentals
                          .filter((i) => i.category === category)
                          .map((item) => {
                            const qty = form.rentalQty[item.id] || '';
                            const on = Number(qty) > 0;
                            const free = avail[item.id] && AVAILABILITY[avail[item.id].status];
                            const left = avail[item.id] ? avail[item.id].left : null;
                            const tooMany = stockError(item.id);
                            return (
                              <Box
                                key={item.id}
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: { xs: 'minmax(0, 1fr) 80px', sm: 'minmax(0, 1fr) 104px' },
                                  gap: 1.25,
                                  alignItems: 'start',
                                  p: 1.25,
                                  borderRadius: 1.5,
                                  border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`,
                                  backgroundColor: on ? 'rgba(197,160,89,0.08)' : '#fff'
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 1.25,
                                    minWidth: 0,
                                    flexDirection: { xs: 'column', sm: 'row' }
                                  }}
                                >
                                  <Box sx={{ width: { xs: 88, sm: 96 }, flexShrink: 0 }}>
                                    <EquipmentPhoto item={item} compact height={88} />
                                  </Box>
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{item.name}</Typography>
                                    <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                                      {peso(item.price)} per piece{on ? ` · ${peso(item.price * Number(qty))}` : ''}
                                    </Typography>
                                    <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>
                                      Damage fee {peso(item.damageFee)} per piece
                                    </Typography>
                                    <Typography
                                      sx={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: free ? free.color : tokens.textMuted
                                      }}
                                    >
                                      {free
                                        ? free.label(left)
                                        : form.date
                                          ? 'Checking how many are free…'
                                          : 'Choose a date to see how many are free'}
                                    </Typography>
                                  </Box>
                                </Box>
                                <FormField
                                  id={`f-rent-${item.id}`}
                                  value={qty}
                                  onChange={(e) => updateRentalQty(item.id, e.target.value)}
                                  error={errors[`rental.${item.id}`] || tooMany}
                                  placeholder="0"
                                  disabled={left === 0 && !qty}
                                  inputProps={{
                                    inputMode: 'numeric',
                                    maxLength: String(RENTAL.maxQty).length,
                                    'aria-label': `How many ${item.name}`
                                  }}
                                />
                              </Box>
                            );
                          })}
                      </Box>
                    </Box>
                  )
                )}
                <AlertBanner tone="info">
                  Items that come back damaged or missing are charged at the damage fee shown for each item.
                </AlertBanner>
              </Section>
            )}

            {buffet && (
              <Section
                id="food"
                index={sectionNo('food')}
                title="Your Menu"
                subtitle={`Pick exactly 4 dishes, with up to 2 from any category, or add your own dish. ${peso(data.pricePerPlate)} per person covers all of it.`}
              >
                <MenuPicker
                  idPrefix="f-dish"
                  menu={form.menu}
                  dishes={data.dishes}
                  onChange={setDish}
                  errors={errors}
                  required
                />
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  For a dish not on the list, use Add other dish and enter one dish per box. Dessert is selected
                  separately under Additional Charges.
                </AlertBanner>
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.25 }}>Drinks</Typography>
                  <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                    Unlimited water is included. Tell us which juice you prefer; we will confirm availability.
                  </Typography>
                </Box>
                <FormField
                  id="f-juice"
                  label="Preferred juice"
                  optional
                  value={form.menu.juice || ''}
                  onChange={(e) => setDish('juice', e.target.value)}
                  error={errors['menu.juice']}
                  placeholder="e.g. Orange, pineapple, or iced tea"
                  inputProps={{ maxLength: 120 }}
                  sx={{ mt: 2 }}
                />
                <FormField
                  id="f-foodNotes"
                  label="Anything we should know about the food"
                  optional
                  multiline
                  minRows={3}
                  value={form.foodNotes}
                  onChange={(e) => update({ foodNotes: e.target.value })}
                  placeholder="Allergies, a vegetarian portion, softer food for elderly guests, serving time…"
                  hint="This does not change the price. Our kitchen reads it before the event."
                  inputProps={{ maxLength: 500 }}
                  sx={{ mt: 2 }}
                />
              </Section>
            )}

            {rental ? (
              <Section id="venue" index={sectionNo('venue')} title="Pick Up or Delivery" error={errors.fulfilment}>
                <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 1.5 }}>
                  {[
                    ['pickup', 'Pick up', `Free. Collect the items at ${RENTAL.pickupAddress}.`],
                    [
                      'delivery',
                      'Delivery',
                      `${peso(RENTAL.deliveryFee)} standard fee. A large order may be quoted a different delivery fee.`
                    ]
                  ].map(([value, heading, description]) => {
                    const selected = form.fulfilment === value;
                    return (
                      <ButtonBase
                        key={value}
                        onClick={() => update({ fulfilment: value })}
                        aria-pressed={selected}
                        sx={{
                          display: 'block',
                          p: 2,
                          textAlign: 'left',
                          borderRadius: 2,
                          fontFamily: 'inherit',
                          border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`,
                          backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight,
                          '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder }
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>
                            {heading}
                          </Typography>
                          {selected ? (
                            <CheckCircleRoundedIcon sx={{ color: tokens.ink }} />
                          ) : (
                            <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />
                          )}
                        </Box>
                        <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>
                          {description}
                        </Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
                {delivered && (
                  <Box sx={{ mt: 2, display: 'grid', ...FORM_COLUMNS, gap: 2 }}>
                    <FormField
                      id="f-venueName"
                      label="Place name"
                      required
                      value={form.venueName}
                      onChange={(e) => update({ venueName: e.target.value })}
                      error={errors.venueName}
                      placeholder="e.g. Santos Residence"
                    />
                    <FormField
                      id="f-venueAddress"
                      label="Delivery address"
                      required
                      value={form.venueAddress}
                      onChange={(e) => update({ venueAddress: e.target.value })}
                      error={errors.venueAddress}
                      placeholder="Street, barangay"
                    />
                    <FormField
                      id="f-city"
                      label="City"
                      required
                      value={form.city}
                      onChange={(e) => update({ city: e.target.value })}
                      error={errors.city}
                      placeholder="e.g. Lipa City"
                    />
                    <FormField
                      id="f-accessNotes"
                      label="Notes for the delivery"
                      optional
                      multiline
                      minRows={3}
                      value={form.accessNotes}
                      onChange={(e) => update({ accessNotes: e.target.value })}
                      placeholder="Landmark, gate, who receives the items…"
                      sx={{ gridColumn: { sm: '1 / -1' } }}
                      inputProps={{ maxLength: 500 }}
                    />
                  </Box>
                )}
              </Section>
            ) : (
              <Section id="venue" index={sectionNo('venue')} title="Venue and Logistics">
                <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 2 }}>
                  <FormField
                    id="f-venueName"
                    label="Venue name"
                    required
                    value={form.venueName}
                    onChange={(e) => update({ venueName: e.target.value })}
                    error={errors.venueName}
                    placeholder="e.g. The Glass Garden"
                  />
                  <FormField
                    id="f-venueAddress"
                    label="Venue address"
                    required
                    value={form.venueAddress}
                    onChange={(e) => update({ venueAddress: e.target.value })}
                    error={errors.venueAddress}
                    placeholder="Street, barangay"
                  />
                  <FormField
                    id="f-city"
                    label="City"
                    required
                    value={form.city}
                    onChange={(e) => update({ city: e.target.value })}
                    error={errors.city}
                    placeholder="e.g. Pasig City"
                  />
                  <FormField
                    id="f-accessNotes"
                    label="Access notes"
                    optional
                    multiline
                    minRows={3}
                    value={form.accessNotes}
                    onChange={(e) => update({ accessNotes: e.target.value })}
                    placeholder="Gate, parking, elevator, loading area, setup time restrictions…"
                    sx={{ gridColumn: { sm: '1 / -1' } }}
                    inputProps={{ maxLength: 500 }}
                  />
                </Box>
              </Section>
            )}

            {!rental && (
              <Section
                id="addons"
                index={sectionNo('addons')}
                title="Additional Charges"
                subtitle="Optional. Tick what you need. A charge marked Quoted is priced in your quotation."
              >
                {[
                  { key: 'plain', list: data.addons.filter((a) => !a.hasPackages) },
                  {
                    key: 'packages',
                    list: data.addons.filter((a) => a.hasPackages),
                    title: 'Additional Charges With Packages',
                    hint: 'Tick one, then pick the package you want.'
                  }
                ]
                  .filter((group) => group.list.length)
                  .map((group, groupIndex) => (
                    <Box key={group.key} sx={groupIndex ? { mt: 2.5 } : undefined}>
                      {group.title && (
                        <Box sx={{ mb: 1.25 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
                            {group.title}
                          </Typography>
                          <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{group.hint}</Typography>
                        </Box>
                      )}
                      <Box
                        sx={{
                          display: 'grid',
                          alignItems: 'start',
                          gridTemplateColumns:
                            group.key === 'packages'
                              ? 'minmax(0, 1fr)'
                              : { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
                          gap: 1.25
                        }}
                      >
                        {group.list.map((a) => {
                          const on = form.addonIds.includes(a.id);
                          const sized = hasSizes(a) && !a.hasPackages;
                          const packaged = hasSizes(a) && a.hasPackages;
                          const from = packaged ? lowestPackagePrice(a) : null;
                          return (
                            <Box
                              key={a.id}
                              onClick={(e) => {
                                if (
                                  !e.target.closest(
                                    'button,input,textarea,label,[role=combobox],[role=radio],[role=option],[role=listbox],.MuiCheckbox-root,.MuiFormControl-root'
                                  )
                                )
                                  toggleAddon(a.id);
                              }}
                              sx={{
                                display: 'flex',
                                gap: 1,
                                p: 1.5,
                                borderRadius: 1.5,
                                cursor: 'pointer',
                                border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`,
                                backgroundColor: on ? 'rgba(197,160,89,0.08)' : '#fff'
                              }}
                            >
                              <Checkbox
                                inputProps={{ 'aria-label': a.name }}
                                checked={on}
                                onChange={() => toggleAddon(a.id)}
                                size="small"
                                sx={{ p: 0.25, alignSelf: 'flex-start' }}
                              />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                  <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{a.name}</Typography>
                                  <Typography
                                    sx={{
                                      fontSize: 12,
                                      fontWeight: 600,
                                      whiteSpace: 'nowrap',
                                      color: (packaged ? from : a.price && !sized)
                                        ? tokens.textPrimary
                                        : tokens.textMuted
                                    }}
                                  >
                                    {sized
                                      ? 'By size'
                                      : packaged
                                        ? from
                                          ? `From ${peso(from)}`
                                          : 'Quoted'
                                        : a.price
                                          ? `${peso(a.price)}${a.hasQuantity ? ' each' : ''}`
                                          : 'Quoted'}
                                  </Typography>
                                </Box>
                                <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                                  {a.description}
                                </Typography>
                                {a.id === DESSERT_ADDON_ID && on && (
                                  <Box onClick={(e) => e.stopPropagation()} sx={{ mt: 1.5 }}>
                                    <DessertFields
                                      idPrefix="f-dessert"
                                      value={form.menu.dessert}
                                      onChange={(value) => setDish('dessert', value)}
                                      errors={errors}
                                    />
                                  </Box>
                                )}
                                {a.hasQuantity && on && (
                                  <FormField
                                    id={`f-qty-${a.id}`}
                                    label="Quantity"
                                    value={form.addonQty[a.id] || ''}
                                    onChange={(e) => updateAddonQty(a.id, e.target.value)}
                                    error={errors[`addonQty.${a.id}`]}
                                    inputProps={{
                                      inputMode: 'numeric',
                                      maxLength: 2,
                                      'aria-label': `How many ${a.name}`
                                    }}
                                    sx={{ mt: 1, maxWidth: 150 }}
                                  />
                                )}
                                {sized && on && (
                                  <Box
                                    onClick={(e) => e.stopPropagation()}
                                    sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'default' }}
                                  >
                                    {a.sizes.map((s) => {
                                      const left = leftFor(s);
                                      return (
                                        <Box
                                          key={s.id}
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            gap: 1.5
                                          }}
                                        >
                                          <Box sx={{ minWidth: 0, pt: 3 }}>
                                            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{s.size}</Typography>
                                            <Typography
                                              sx={{
                                                fontSize: 12,
                                                color: s.price ? tokens.textSecondary : tokens.textMuted
                                              }}
                                            >
                                              {s.price ? `${peso(s.price)} each` : 'Quoted'}
                                            </Typography>
                                            {left !== null && (
                                              <Typography
                                                sx={{
                                                  fontSize: 11.5,
                                                  fontWeight: left ? 400 : 600,
                                                  color: left ? tokens.textMuted : tokens.redPress
                                                }}
                                              >
                                                {left ? `${left} left on this date` : 'Fully booked on this date'}
                                              </Typography>
                                            )}
                                          </Box>
                                          <FormField
                                            id={`f-qty-${s.id}`}
                                            label="Quantity"
                                            value={form.addonQty[s.id] || ''}
                                            onChange={(e) => updateAddonQty(s.id, e.target.value)}
                                            error={errors[`addonQty.${s.id}`]}
                                            disabled={left === 0}
                                            inputProps={{
                                              inputMode: 'numeric',
                                              maxLength: 2,
                                              'aria-label': `How many ${s.name}`
                                            }}
                                            sx={{ maxWidth: 130 }}
                                          />
                                        </Box>
                                      );
                                    })}
                                    {errors[`addonQty.${a.id}`] && (
                                      <Typography role="alert" sx={{ fontSize: 12, color: tokens.redPress }}>
                                        {errors[`addonQty.${a.id}`]}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                                {packaged && on && (
                                  <Box
                                    role="radiogroup"
                                    aria-label={`${a.name} package`}
                                    sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'default' }}
                                  >
                                    {a.sizes.map((s) => {
                                      const picked = Number(form.addonQty[s.id]) > 0;
                                      const left = leftFor(s);
                                      return (
                                        <ButtonBase
                                          key={s.id}
                                          role="radio"
                                          aria-checked={picked}
                                          disabled={left === 0 && !picked}
                                          onClick={() => pickPackage(a, s.id)}
                                          sx={{
                                            display: 'block',
                                            width: '100%',
                                            p: 1.25,
                                            textAlign: 'left',
                                            borderRadius: 1.5,
                                            fontFamily: 'inherit',
                                            border: `1.5px solid ${picked ? tokens.ink : tokens.cardLightBorder}`,
                                            backgroundColor: picked ? tokens.surfaceSubtle : tokens.cardLight,
                                            transition: 'border-color 0.15s ease',
                                            '&:hover': { borderColor: picked ? tokens.ink : tokens.placeholder },
                                            '&.Mui-disabled': { opacity: 0.55 }
                                          }}
                                        >
                                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {picked ? (
                                              <CheckCircleRoundedIcon sx={{ fontSize: 18, color: tokens.ink }} />
                                            ) : (
                                              <RadioButtonUncheckedRoundedIcon
                                                sx={{ fontSize: 18, color: tokens.borderInput }}
                                              />
                                            )}
                                            <Typography
                                              component="span"
                                              sx={{ flex: 1, fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}
                                            >
                                              {s.size}
                                            </Typography>
                                            <Typography
                                              component="span"
                                              sx={{
                                                fontSize: 12.5,
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                color: s.price ? tokens.textPrimary : tokens.textMuted
                                              }}
                                            >
                                              {s.price ? peso(s.price) : 'Quoted'}
                                            </Typography>
                                          </Box>
                                          {s.description
                                            .split('\n')
                                            .map((line) => line.trim())
                                            .filter(Boolean)
                                            .map((line, i) => (
                                              <Typography
                                                key={i}
                                                component="span"
                                                sx={{
                                                  display: 'block',
                                                  position: 'relative',
                                                  pl: 3.25,
                                                  fontSize: 12,
                                                  lineHeight: 1.55,
                                                  color: tokens.textSecondary,
                                                  '&::before': { content: '"•"', position: 'absolute', left: 14 }
                                                }}
                                              >
                                                {line}
                                              </Typography>
                                            ))}
                                          {left !== null && (
                                            <Typography
                                              component="span"
                                              sx={{
                                                display: 'block',
                                                pl: 3.25,
                                                fontSize: 11.5,
                                                fontWeight: left ? 400 : 600,
                                                color: left ? tokens.textMuted : tokens.redPress
                                              }}
                                            >
                                              {left ? `${left} left on this date` : 'Fully booked on this date'}
                                            </Typography>
                                          )}
                                          {errors[`addonQty.${s.id}`] && (
                                            <Typography
                                              component="span"
                                              role="alert"
                                              sx={{ display: 'block', pl: 3.25, fontSize: 12, color: tokens.redPress }}
                                            >
                                              {errors[`addonQty.${s.id}`]}
                                            </Typography>
                                          )}
                                        </ButtonBase>
                                      );
                                    })}
                                    {errors[`addonQty.${a.id}`] && (
                                      <Typography role="alert" sx={{ fontSize: 12, color: tokens.redPress }}>
                                        {errors[`addonQty.${a.id}`]}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  ))}
              </Section>
            )}

            <Section id="review" index={sectionNo('review')} title="Review and Submit">
              {!rental && buffet && <Typography sx={{ mb: 1, fontSize: 13 }}>{buffetDrinks(form.menu)}</Typography>}
              {!rental && bookedAddonIds.includes(DESSERT_ADDON_ID) && (
                <Typography sx={{ mb: 1, fontSize: 13 }}>
                  Dessert: {dessertSummary(form.menu) || 'Choose a dessert in Additional Charges'} · additional charge
                </Typography>
              )}
              {rental ? (
                <RentalQuoteLines quote={quote} delivered={delivered} />
              ) : (
                <QuoteLines
                  quote={quote}
                  pkg={pkg}
                  serviceType={form.serviceType}
                  addons={chosenAddons}
                  addonQty={form.addonQty}
                />
              )}
              {!rental && (!stylingEmpty(styling) || form.referencePhoto) && (
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Theme and Colors</Typography>
                  <StylingSummary styling={styling} referencePhoto={form.referencePhoto} compact />
                </Box>
              )}
              <AlertBanner tone="info" sx={{ mt: 2 }}>
                {rental
                  ? 'This is a request, not a confirmed rental. We check the items and send your quotation within 24 hours; accepting it approves your rental.'
                  : `This is a request, not a confirmed booking. We review it and send your quotation with the additional charges${extraGuests ? ` and the equipment for your ${extraGuests} extra guests` : ''} priced within 24 hours; accepting it approves your reservation.`}
              </AlertBanner>
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  sx={{ alignItems: 'flex-start', mr: 0 }}
                  control={
                    <Checkbox
                      id="f-agreeTerms"
                      size="small"
                      checked={agreed}
                      onChange={(e) => {
                        setAgreed(e.target.checked);
                        setErrors((er) => ({ ...er, agreeTerms: '' }));
                      }}
                      sx={{ mt: -0.5 }}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: tokens.textSecondary }}>
                      I have read and agree to the{' '}
                      <Link
                        href="/terms"
                        target="_blank"
                        rel="noopener"
                        sx={{ fontWeight: 600, color: tokens.goldDark }}
                      >
                        Terms of Service
                      </Link>
                      , including the payment, cancellation and refund rules, and the{' '}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener"
                        sx={{ fontWeight: 600, color: tokens.goldDark }}
                      >
                        Privacy Policy
                      </Link>
                      .
                    </Typography>
                  }
                />
                {errors.agreeTerms && (
                  <Typography role="alert" sx={{ mt: 0.5, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>
                    {errors.agreeTerms}
                  </Typography>
                )}
              </Box>
            </Section>
          </Box>

          <Box
            sx={{
              minWidth: 0,
              [SUMMARY_LAYOUT]: { position: 'sticky', top: tokens.headerHeight + 24 },
              '@media (max-height: 799px)': { position: 'static' }
            }}
          >
            <DashCard>
              <CardTitle>Your Reservation</CardTitle>
              {(rental
                ? [
                    ['Booking', form.serviceType],
                    ['Date', form.date ? formatDate(form.date) : '—'],
                    [
                      'Items',
                      rentalChosen.length ? `${rentalChosen.reduce((sum, line) => sum + line.qty, 0)} pcs` : '—'
                    ],
                    ['Pick up or delivery', delivered ? 'Delivery' : 'Pick up']
                  ]
                : [
                    ['Booking', form.serviceType || '—'],
                    ['Date', form.date ? formatDate(form.date) : '—'],
                    ['Time', form.startTime && form.endTime ? formatEventTime(form) : '—'],
                    ['Guests', form.guests ? `${form.guests}${extraGuests ? ` (${extraGuests} extra)` : ''}` : '—'],
                    ['Package', pkg ? pkg.name : '—'],
                    ['Theme', (styling && themeLabel(styling)) || '—'],
                    ['Colors', styling && styling.colors.length ? `${styling.colors.length} chosen` : '—'],
                    ...(buffet ? [['Menu', menuComplete ? 'Chosen' : '—']] : []),
                    ['Additional charges', chosenAddons.length || 'None']
                  ]
              ).map(([label, value]) => (
                <Box
                  key={label}
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    columnGap: 1.5,
                    rowGap: 0.25,
                    py: 0.75
                  }}
                >
                  <Typography sx={{ minWidth: 0, fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
                  <Typography
                    sx={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere', fontSize: 13, fontWeight: 700 }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textMuted }}>
                {rental ? 'Rental total' : 'Starting total'}
              </Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 800, overflowWrap: 'anywhere' }}>
                {pkg && (!rental || rentalChosen.length) ? peso(knownTotal) : '—'}
                {pkg && plusQuoted && (
                  <Box component="span" sx={{ fontSize: 15, fontWeight: 700, color: tokens.textSecondary }}>
                    {plusQuoted}
                  </Box>
                )}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                {rental
                  ? rentalChosen.length
                    ? `Items ${peso(quote.rental)}${delivered ? ` + delivery ${peso(quote.deliveryFee)}` : ', picked up for free'}.`
                    : 'Type how many you need of each item to see your total'
                  : !pkg
                    ? 'Choose a package to see your total'
                    : !form.serviceType
                      ? `Package ${peso(quote.packageTotal)}${extraNote}${addonNote}. Choose what you are booking to finish your total.${quotedNote}`
                      : buffet && quote.plates
                        ? `Package ${peso(quote.packageTotal)}${extraNote} + buffet for ${quote.plates} at ${peso(quote.pricePerPlate)} each${addonNote}.${quotedNote}`
                        : buffet
                          ? 'Enter your guest count to see the buffet price'
                          : `Package ${peso(quote.packageTotal)}${extraNote}${addonNote}. Catering only, so there is no per-person charge.${quotedNote}`}
              </Typography>
              <BusyButton
                fullWidth
                size="large"
                busy={busy}
                disabled={photoBusy}
                onClick={submit}
                sx={{ mt: 2, display: 'none', [SUMMARY_LAYOUT]: { display: 'inline-flex' } }}
              >
                Submit request
              </BusyButton>
              <Button
                fullWidth
                size="large"
                variant="outlined"
                onClick={saveAndExit}
                disabled={busy || photoBusy}
                sx={{ mt: 1, display: 'none', [SUMMARY_LAYOUT]: { display: 'inline-flex' } }}
              >
                Save as draft
              </Button>
            </DashCard>
          </Box>
        </Box>
      )}

      {data && (
        <Box
          className="booking-actions"
          sx={{
            position: 'fixed',
            left: 'var(--tm-sidebar-offset, 0px)',
            right: 0,
            bottom: 'var(--tm-bottom-nav, 0px)',
            zIndex: 1090,
            display: 'flex',
            [SUMMARY_LAYOUT]: { display: 'none' },
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: { xs: 1, sm: 2 },
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            backgroundColor: tokens.cardLight,
            color: tokens.textPrimary,
            borderTop: `1px solid ${tokens.cardLightBorder}`,
            boxShadow: '0 -10px 30px -12px rgba(0,0,0,0.4)'
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 11, color: tokens.textMuted }}>
              {rental
                ? 'Rental total'
                : buffet && quote.plates
                  ? `Package + buffet for ${quote.plates}`
                  : 'Starting total'}
            </Typography>
            <Typography
              sx={{
                fontSize: 19,
                fontWeight: 800,
                color: tokens.textPrimary,
                lineHeight: 1.1,
                overflowWrap: 'anywhere'
              }}
            >
              {rental
                ? rentalChosen.length
                  ? peso(knownTotal)
                  : 'Pick your items'
                : pkg
                  ? `${peso(knownTotal)}${plusQuoted}`
                  : 'Pick a package'}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              maxWidth: '100%',
              '@media (max-width: 399px)': { width: '100%', '& > button': { flex: 1, minWidth: 0 } }
            }}
          >
            <Button
              variant="outlined"
              onClick={saveAndExit}
              disabled={busy || photoBusy}
              sx={{ px: { xs: 1.5, sm: 2.5 }, whiteSpace: 'nowrap' }}
            >
              Save draft
            </Button>
            <BusyButton
              busy={busy}
              disabled={photoBusy}
              onClick={submit}
              sx={{
                px: { xs: 2, sm: 3 },
                whiteSpace: 'nowrap',
                bgcolor: tokens.ink,
                color: tokens.onInk,
                '&:hover': { bgcolor: tokens.inkHover }
              }}
            >
              Submit request
            </BusyButton>
          </Box>
        </Box>
      )}
    </>
  );
}

function Section({ id, index, title, subtitle, error, children }) {
  return (
    <DashCard
      component="section"
      id={`sec-${id}`}
      aria-labelledby={`sec-${id}-title`}
      sx={{ scrollMarginTop: `${tokens.headerHeight + 64}px`, ...(error && { borderColor: tokens.red }) }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography id={`sec-${id}-title`} component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>
          {index} · {title}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.25, fontSize: 13, color: tokens.textSecondary }}>{subtitle}</Typography>}
        {error && (
          <Typography role="alert" sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>
            {error}
          </Typography>
        )}
      </Box>
      {children}
    </DashCard>
  );
}

function QuoteLines({ quote, pkg, serviceType, addons, addonQty }) {
  const rows = [
    [pkg ? `Package · ${pkg.name}` : 'Package', pkg ? peso(quote.packageTotal) : '—'],
    ...(quote.extraGuests ? [[`Extra ${quote.extraGuests} guests (equipment)`, 'To be quoted']] : []),
    ...(includesFood(serviceType)
      ? [
          [
            quote.plates
              ? `Buffet · ${quote.plates} × ${peso(quote.pricePerPlate)}`
              : 'Buffet · enter your guest count',
            quote.plates ? peso(quote.food) : '—'
          ]
        ]
      : []),
    ...addons.map((a) => [
      a.hasQuantity ? `${a.name} × ${Number(addonQty[a.id]) || 1}` : a.name,
      a.price ? peso(quote.addonTotals[a.id]) : 'To be quoted'
    ])
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {rows.map(([label, value]) => (
        <Box
          key={label}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            columnGap: 2,
            rowGap: 0.5,
            px: 2,
            py: 1.25,
            borderBottom: `1px solid ${tokens.cardLightBorder}`
          }}
        >
          <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 13.5, color: tokens.textSecondary }}>
            {label}
          </Typography>
          <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 13.5, fontWeight: 600 }}>
            {value}
          </Typography>
        </Box>
      ))}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          columnGap: 2,
          rowGap: 0.5,
          px: 2,
          py: 1.5,
          backgroundColor: tokens.surfaceSubtle
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Starting total</Typography>
        <Typography sx={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 16, fontWeight: 800 }}>
          {pkg ? `${peso(quote.net)}${quote.extraGuests ? ' + quoted' : ''}` : '—'}
        </Typography>
      </Box>
    </Box>
  );
}

function RentalQuoteLines({ quote, delivered }) {
  const rows = [
    ...quote.rentalItems.map((line) => [`${line.name} · ${line.qty} × ${peso(line.price)}`, peso(line.total)]),
    [delivered ? 'Delivery (standard fee)' : 'Pick up', delivered ? peso(quote.deliveryFee) : 'Free']
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {quote.rentalItems.length === 0 && (
        <Typography
          sx={{
            px: 2,
            py: 1.25,
            fontSize: 13.5,
            color: tokens.textSecondary,
            borderBottom: `1px solid ${tokens.cardLightBorder}`
          }}
        >
          No items yet
        </Typography>
      )}
      {rows.map(([label, value]) => (
        <Box
          key={label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            px: 2,
            py: 1.25,
            borderBottom: `1px solid ${tokens.cardLightBorder}`
          }}
        >
          <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{label}</Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</Typography>
        </Box>
      ))}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          px: 2,
          py: 1.5,
          backgroundColor: tokens.surfaceSubtle
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Rental total</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
          {quote.rentalItems.length ? peso(quote.net) : '—'}
        </Typography>
      </Box>
    </Box>
  );
}
